// Simulation du parcours hors ligne complet, avec un faux système de fichiers
// et un faux serveur Supabase (mocks/).
import assert from 'node:assert/strict';
const off = await import('../../lib/offline/index.js');
const tiles = await import('../../lib/offline/tiles.js');
const fsm = await import('./mocks/fs.mjs');
const sb = await import('./mocks/supabase.mjs');
const { getDefaultStore } = await import('./mocks/jotai.mjs');
const store = getDefaultStore();
let n = 0; const ok = (name) => console.log('PASS', ++n, name);
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const pending = () => store.get(off.outboxCountAtom);

off.startSync();
await tick();

// ── 1. cached reads through the real file storage ──
let r = await off.cachedSelect('pins-plan-L1', async () => ({ data: [{ id: 'S1', name: 'server pin', plan_id: 'L1', project_id: 'P' }], error: null }));
assert.equal(r.fromCache, false);
off.setOnline(false);
r = await off.cachedSelect('pins-plan-L1', async () => { throw new Error('no network call offline'); });
assert.equal(r.data[0].id, 'S1'); assert.equal(r.fromCache, true);
ok('read falls back to the copy saved on the device');

// a plan never opened online still shows its pins from the project lists
off.setOnline(true);
await off.cachedSelect('pins-tasks-P', async () => ({ data: [{ id: 'S1', plan_id: 'L1', project_id: 'P' }, { id: 'S9', plan_id: 'L9', project_id: 'P', name: 'on another plan' }], error: null }));
off.setOnline(false);
assert.equal((await off.cachedSelect('pins-plan-L9', async () => ({}))).error.offline, true);
let local = await off.cachedPlanPins('L9', 'P');
assert.deepEqual(local.pins.map((p) => p.id), ['S9']);
assert.equal(await off.cachedPlanPins('L9', 'OTHER'), null);
ok('offline: a plan never opened online gets its pins from the project list');

// ── 2. offline: create pin, edit it, attach a photo, edit an existing pin ──
sb.db.pdf_pins.set('S1', { id: 'S1', name: 'server pin', status_id: 'open' });
const row = { id: 'NEW', x: 0.4, y: 0.6, name: '', project_id: 'P', plan_id: 'L1', pdf_name: 'RDC', created_by: 'm1', photoUris: [] };
let res = await off.runOrQueue('pin.insert', { row }, async () => { throw new Error('must not run while offline'); });
assert.equal(res.queued, true);
res = await off.runOrQueue('pin.update', { id: 'NEW', patch: { name: 'Fissure mur', status_id: 'open' } }, async () => { throw new Error('x'); });
assert.equal(res.queued, true);
await off.savePendingPhotoFile('drawing_1.jpg', 'BASE64DATA');
await off.savePendingPhotoFile('thumb_drawing_1.jpg', 'THUMB');
await off.queue('photo.upload', { id: 'PH1', file: 'drawing_1.jpg', thumbFile: 'thumb_drawing_1.jpg', pin_id: 'NEW', project_id: 'P', description: 'vue nord', date: '2026-10-07T00:00:00Z', sender_id: 'm1' });
await off.runOrQueue('pin.update', { id: 'S1', patch: { status_id: 'done', updated_at: 't' } }, async () => { throw new Error('x'); });
await tick();
assert.deepEqual(pending(), { pending: 3, failed: 0 }); // insert (with merged edit), photo, update S1
assert.equal(sb.calls.length, 0);
ok('offline: pin creation, edit, photo and status change are queued, nothing sent');

// what the screens show while offline
let shown = off.withPendingPins(r.data, { planId: 'L1' });
assert.deepEqual(shown.map((p) => [p.id, p.name, p.status_id, Boolean(p._pending)]), [['S1', 'server pin', 'done', true], ['NEW', 'Fissure mur', 'open', true]]);
assert.deepEqual(off.pendingPhotos('NEW').map((p) => p.uri), ['file:///doc/offline/photos/drawing_1.jpg']);
ok('offline: lists show the pending pin, its edit, and the waiting photo');

// ── 3. app killed and restarted offline: queue is read back from disk ──
const stored = JSON.parse(fsm.files.get('file:///doc/offline/data/outbox.json'));
assert.equal(stored.length, 3); assert.equal(stored[0].payload.row.name, 'Fissure mur');
ok('queue is written to disk (survives the app being closed)');

// ── 4. network returns but drops again mid-sync ──
sb.net.down = true; off.setOnline(true); await tick(60);
assert.equal(sb.calls.length, 0); assert.deepEqual(pending(), { pending: 3, failed: 0 });
ok('NetInfo says online but requests fail: nothing lost, order kept');

sb.net.down = false; await off.syncNow(); await tick();
assert.deepEqual(sb.calls.map((c) => c[0] + ':' + c[1]), ['pdf_pins:upsert', 'storage:upload', 'storage:upload', 'pins_photos:upsert', 'pdf_pins:update']);
assert.deepEqual(Object.keys(sb.calls[0][2][0]).includes('photoUris'), false, 'client-only fields are not sent');
assert.equal(sb.db.pdf_pins.get('NEW').name, 'Fissure mur');
assert.equal(sb.db.pins_photos.get('PH1').public_url, 'https://cdn/pinphotos/P/drawing_1.jpg');
assert.equal(sb.db.pins_photos.get('PH1').thumb_url, 'https://cdn/pinphotos/P/thumb_drawing_1.jpg');
assert.equal(sb.db.pdf_pins.get('S1').status_id, 'done');
assert.deepEqual(pending(), { pending: 0, failed: 0 });
assert.equal(fsm.files.has('file:///doc/offline/photos/drawing_1.jpg'), false, 'local photo removed once sent');
assert.equal(store.get(off.syncTickAtom), 1);
ok('back online: pin created first, then its photo, then the other edit; local files cleaned');

off.setOnline(false);
r = await off.cachedSelect('pins-plan-L1', async () => { throw new Error('offline'); });
shown = off.withPendingPins(r.data, { planId: 'L1' }, r.cachedAt);
assert.deepEqual(shown.map((p) => [p.id, p.name, p.status_id, p._pending]), [['S1', 'server pin', 'done', undefined], ['NEW', 'Fissure mur', 'open', undefined]]);
off.setOnline(true);
ok('after the sync, the older copy on the device still shows the created pin and the edit');

// ── 5. online path runs directly; a server refusal is surfaced, not queued ──
sb.calls.length = 0;
let ran = false;
res = await off.runOrQueue('pin.update', { id: 'S1', patch: { name: 'x' } }, async () => { ran = true; });
assert.deepEqual([res.queued, ran], [false, true]);
await assert.rejects(off.runOrQueue('pin.update', { id: 'S1', patch: { name: 'y' } }, async () => { throw { code: '42501', message: 'denied' }; }));
assert.deepEqual(pending(), { pending: 0, failed: 0 });
ok('online: direct save; a refusal is raised to the screen and not queued');

// request fails for network reasons while NetInfo still says online → queued then sent
res = await off.runOrQueue('pin.update', { id: 'S1', patch: { note: 'tunnel' } }, async () => { throw new TypeError('Network request failed'); });
assert.equal(res.queued, true); await tick(40);
assert.equal(sb.db.pdf_pins.get('S1').note, 'tunnel'); assert.deepEqual(pending(), { pending: 0, failed: 0 });
ok('flaky network: the failed save is queued and sent right after');

// ── 6. photo retried after a lost response does not duplicate; missing file / deleted pin are set aside ──
off.setOnline(false);
await off.savePendingPhotoFile('d2.jpg', 'B2');
sb.db.objects.add('pinphotos/P/d2.jpg'); // the upload had actually succeeded earlier
await off.queue('photo.upload', { id: 'PH2', file: 'd2.jpg', thumbFile: null, pin_id: 'NEW', project_id: 'P', date: 'd' });
await off.queue('photo.upload', { id: 'PH3', file: 'gone.jpg', thumbFile: null, pin_id: 'NEW', project_id: 'P', date: 'd' });
await off.queue('pin.update', { id: 'DELETED', patch: { name: 'z' } });
await off.queue('pin.update', { id: 'S1', patch: { name: 'last' } });
off.setOnline(true); await tick(60);
assert.ok(sb.db.pins_photos.has('PH2'));
assert.equal(sb.db.pdf_pins.get('S1').name, 'last');
assert.deepEqual(pending(), { pending: 0, failed: 2 });
const failed = store.get(off.outboxOpsAtom);
assert.match(failed[0].lastError, /introuvable/); assert.match(failed[1].lastError, /introuvable|refus/);
ok('already-uploaded file is accepted; missing photo and deleted pin are set aside without blocking the rest');
for (const o of failed) await off.outbox.discard(o.id);

// ── 7. tiles: download, resume, local lookup ──
const plan = { id: 'PLAN1', width: 11367, height: 5875, name: 'Sous-sol' };
const list = tiles.planTileList(plan);
// same maths as components/PdfViewerWithTiles.js renderLayer
const maxLevel = Math.ceil(Math.log2(11367)); let expected = 0;
for (let level = Math.max(0, maxLevel - 6); level <= maxLevel; level++) { const s = 2 ** (maxLevel - level); expected += Math.ceil(Math.ceil(11367 / s) / 512) * Math.ceil(Math.ceil(5875 / s) / 512); }
assert.equal(list.length, expected); assert.equal(maxLevel, 14);
let fails = 0; fsm.setFailDownload((u) => u.includes('/14/3_') && fails++ < 100);
const url = (l, c, rw) => `https://t/${l}/${c}_${rw}.jpeg`;
let prog = [];
let d = await tiles.downloadPlan(plan, url, (a, b) => prog.push([a, b]));
assert.equal(d.complete, false); assert.ok(d.failed > 0); assert.equal(d.tiles + d.failed, list.length);
assert.equal((await tiles.getOfflinePlans()).PLAN1.complete, false);
fsm.setFailDownload(() => false);
d = await tiles.downloadPlan(plan, url);
assert.equal(d.complete, true); assert.equal(d.tiles, list.length);
assert.equal((await tiles.getOfflinePlans()).PLAN1.complete, true);
assert.equal(tiles.localTileUri('PLAN1', 14, 3, 2), 'file:///doc/offline/tiles/PLAN1/14_3_2.jpeg');
assert.equal(tiles.localTileUri('PLAN1', 14, 99, 99), null);
assert.equal(tiles.localTileUri('OTHER', 14, 0, 0), null);
assert.equal([...fsm.files.keys()].filter((k) => k.endsWith('.part')).length, 0);
ok(`tiles: ${list.length} tiles for an 11367×5875 plan, interrupted download resumes, local lookup works`);

// ── photos always go through the queue: saved on the device first, then sent ──
off.setOnline(true); sb.net.down = false; await off.syncNow();
await off.savePendingPhotoFile('q1.jpg', 'Q1');
await off.savePendingPhotoFile('q2.jpg', 'Q2');
await off.queue('photo.upload', { id: 'Q1', file: 'q1.jpg', thumbFile: null, pin_id: 'NEW', project_id: 'P', date: 'd' });
await off.queue('photo.upload', { id: 'Q2', file: 'q2.jpg', thumbFile: null, pin_id: 'NEW', project_id: 'P', date: 'd' });
let seen = [];
let state = await off.waitForPhotos(['Q1', 'Q2'], { timeoutMs: 3000, onProgress: (s) => seen.push(s.waiting) });
assert.deepEqual(state, { sent: 2, waiting: 0, refused: 0 });
assert.equal(sb.db.pins_photos.has('Q1') && sb.db.pins_photos.has('Q2'), true);
assert.equal(fsm.files.has('file:///doc/offline/photos/q1.jpg'), false, 'local copy removed once sent');
// no network: nothing is lost, the wait returns at once and the photo stays queued with its file
off.setOnline(false);
await off.savePendingPhotoFile('q3.jpg', 'Q3');
await off.queue('photo.upload', { id: 'Q3', file: 'q3.jpg', thumbFile: null, pin_id: 'NEW', project_id: 'P', date: 'd' });
const t0 = Date.now();
state = await off.waitForPhotos(['Q3'], { timeoutMs: 3000 });
assert.deepEqual(state, { sent: 0, waiting: 1, refused: 0 }); assert.equal(Date.now() - t0 < 500, true);
assert.equal(fsm.files.has('file:///doc/offline/photos/q3.jpg'), true);
// network is back but slow: the wait gives up after its delay, the upload goes on
sb.net.down = true; off.setOnline(true);
state = await off.waitForPhotos(['Q3'], { timeoutMs: 700 });
assert.equal(state.waiting, 1);
sb.net.down = false; await off.syncNow();
assert.equal(sb.db.pins_photos.has('Q3'), true);
ok('photos: one path through the queue, wait reports sent / still waiting');

// ── 8. clearing offline data keeps what has not been sent ──
off.setOnline(false);
await off.queue('pin.update', { id: 'S1', patch: { note: 'keep me' } });
await off.writeCache('member-U1', { id: 'm1', name: 'Ali' });
await off.clearOfflineData();
assert.equal((await off.readCache('pins-plan-L1')), null);
assert.deepEqual(await off.readCache('member-U1'), { id: 'm1', name: 'Ali' }, 'profile kept so the app can still open offline');
assert.deepEqual(await tiles.getOfflinePlans(), {});
assert.equal((await off.outbox.list()).length, 1);
assert.equal(JSON.parse(fsm.files.get('file:///doc/offline/data/outbox.json')).length, 1);
await off.clearOfflineData({ includePending: true });
assert.equal((await off.outbox.list()).length, 0);
assert.equal([...fsm.files.keys()].filter((k) => k.startsWith('file:///doc/offline/')).length <= 1, true);
assert.equal(await off.readCache('member-U1'), null);
ok('clear: cached data removed, profile and unsent changes kept unless signing out');
console.log('ALL', n, 'PASSED');
process.exit(0);
