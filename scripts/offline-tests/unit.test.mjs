// Tests unitaires des modules purs de lib/offline.
import assert from 'node:assert/strict';
import { isNetworkError } from '../../lib/offline/errors.js';
import { createCache } from '../../lib/offline/cache.js';
import { createOutbox } from '../../lib/offline/outbox.js';
import { overlayPins, pendingPhotosForPin, countPending, rememberSent, pinsForPlanFromCaches } from '../../lib/offline/pending.js';

const memStorage = () => { const m = new Map(); return { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), set: async (k, v) => { m.set(k, JSON.stringify(v)); }, remove: async (k) => { m.delete(k); }, _m: m }; };
const netErr = () => new TypeError('Network request failed');
let n = 0; const ok = (name) => console.log('PASS', ++n, name);

// errors
assert.equal(isNetworkError(netErr()), true);
assert.equal(isNetworkError({ message: 'TypeError: Network request failed' }), true);
assert.equal(isNetworkError({ name: 'AuthRetryableFetchError', status: 0, message: 'x' }), true);
assert.equal(isNetworkError({ code: '42501', message: 'new row violates row-level security policy' }), false);
assert.equal(isNetworkError({ code: 'PGRST116', message: 'no rows' }), false);
assert.equal(isNetworkError({ statusCode: '409', message: 'The resource already exists' }), false);
assert.equal(isNetworkError({ status: 503, message: 'Service Unavailable' }), true);
assert.equal(isNetworkError({ message: 'Aucune ligne mise à jour' }), false);
assert.equal(isNetworkError(null), false);
for (const c of ['PGRST002', 'PGRST301', '57014', '08006', '53300', '40001']) assert.equal(isNetworkError({ code: c, message: 'x' }), true, c);
for (const c of ['23503', '23505', 'PGRST204', '42703', '22P02']) assert.equal(isNetworkError({ code: c, message: 'x' }), false, c);
ok('error classification');

// cache
{
  let online = true; const storage = memStorage();
  let clock = 1000; const cache = createCache({ storage, isOnline: () => online, now: () => clock });
  let r = await cache.cachedSelect('k', async () => ({ data: [1, 2], error: null }));
  assert.deepEqual(r, { data: [1, 2], error: null, fromCache: false, cachedAt: null });
  online = false;
  r = await cache.cachedSelect('k', async () => { throw new Error('must not run offline'); });
  assert.deepEqual(r.data, [1, 2]); assert.equal(r.fromCache, true); assert.equal(r.error, null); assert.equal(r.cachedAt, 1000);
  r = await cache.cachedSelect('missing', async () => ({ data: 1 }));
  assert.equal(r.data, null); assert.ok(r.error?.offline);
  online = true; // NetInfo says online but request fails
  r = await cache.cachedSelect('k', async () => ({ data: null, error: { message: 'Network request failed' } }));
  assert.deepEqual(r.data, [1, 2]); assert.equal(r.fromCache, true);
  r = await cache.cachedSelect('k', async () => { throw netErr(); });
  assert.deepEqual(r.data, [1, 2]);
  r = await cache.cachedSelect('k', async () => ({ data: null, error: { code: '42501', message: 'denied' } }));
  assert.equal(r.data, null); assert.equal(r.error.code, '42501'); assert.equal(r.fromCache, false);
  assert.deepEqual(await cache.read('k'), [1, 2], 'a server refusal must not erase the cache');
  r = await cache.cachedSelect('never', async () => ({ data: null, error: { message: 'Network request failed' } }));
  assert.equal(r.data, null); assert.equal(r.error.offline, true, 'network failure without a copy is flagged offline even when NetInfo says online');
  r = await cache.cachedSelect('never2', async () => { throw new TypeError('Network request failed'); });
  assert.equal(r.error.offline, true);
  r = await cache.cachedSelect('k', async () => ({ data: [], error: null }));
  assert.deepEqual(await cache.read('k'), [], 'an empty list is a valid answer and replaces the cache');
  assert.equal(await cache.read('nothing'), null);
  ok('cache: online, offline, flaky network, server refusal');
}

// outbox
{
  let online = false; const storage = memStorage(); const calls = []; let failNext = null;
  const handlers = {
    'pin.insert': async (p) => { if (failNext) { const e = failNext; failNext = null; throw e; } calls.push(['insert', p.row.id, p.row.name]); },
    'pin.update': async (p) => { if (failNext) { const e = failNext; failNext = null; throw e; } calls.push(['update', p.id, p.patch]); },
    'photo.upload': async (p) => { if (failNext) { const e = failNext; failNext = null; throw e; } calls.push(['photo', p.pin_id, p.id]); },
  };
  let id = 0;
  const sentLog = [];
  const mk = () => createOutbox({ storage, handlers, isOnline: () => online, makeId: () => `op${++id}`, onSent: (op) => sentLog.push(op.type) });
  let box = mk();
  await box.enqueue('pin.insert', { row: { id: 'A', name: '', project_id: 'P', plan_id: 'L' } });
  await box.enqueue('photo.upload', { id: 'ph1', pin_id: 'A', fileUri: 'file:///1.jpg' });
  await box.enqueue('pin.update', { id: 'A', patch: { name: 'Fissure' } });      // merges into the insert
  await box.enqueue('pin.update', { id: 'B', patch: { status_id: 's1' } });
  await box.enqueue('pin.update', { id: 'B', patch: { note: 'n', status_id: 's2' } }); // merges
  let list = await box.list();
  assert.equal(list.length, 3);
  assert.equal(list[0].payload.row.name, 'Fissure');
  assert.deepEqual(list[2].payload.patch, { status_id: 's2', note: 'n' });
  assert.equal(await box.flush(), 0); assert.equal(calls.length, 0);
  ok('outbox: queue + coalescing, nothing sent offline');

  box = mk();                                    // app restarted
  assert.equal((await box.list()).length, 3);
  ok('outbox: survives restart');

  online = true; failNext = netErr();            // network drops on first op
  assert.equal(await box.flush(), 0);
  list = await box.list();
  assert.equal(list.length, 3); assert.equal(list[0].attempts, 1); assert.equal(list[0].status, 'pending');
  ok('outbox: network failure keeps order and stops');

  assert.equal(await box.flush(), 3);
  assert.deepEqual(calls.map((c) => c[0] + ':' + c[1]), ['insert:A', 'photo:A', 'update:B']);
  assert.equal((await box.list()).length, 0);
  assert.deepEqual(sentLog, ['pin.insert', 'photo.upload', 'pin.update']);
  ok('outbox: flush in creation order (pin before its photo)');

  calls.length = 0;
  await box.enqueue('pin.update', { id: 'C', patch: { name: 'x' } });
  await box.enqueue('pin.update', { id: 'D', patch: { name: 'y' } });
  failNext = { code: '42501', message: 'row-level security' };
  assert.equal(await box.flush(), 1);
  list = await box.list();
  assert.equal(list.length, 1); assert.equal(list[0].status, 'failed'); assert.equal(list[0].payload.id, 'C');
  assert.deepEqual(calls.map((c) => c[1]), ['D']);
  assert.deepEqual(countPending(list), { pending: 0, failed: 1 });
  ok('outbox: server refusal is set aside, the rest continues');

  assert.equal(await box.retryFailed(), 1);
  assert.equal((await box.list()).length, 0);
  ok('outbox: retry failed');

  // concurrent flush = single flight; enqueue during flush is picked up
  calls.length = 0; let release; const gate = new Promise((r) => { release = r; });
  handlers['pin.update'] = async (p) => { if (p.id === 'E') await gate; calls.push(['update', p.id, p.patch]); };
  await box.enqueue('pin.update', { id: 'E', patch: { name: '1' } });
  const f1 = box.flush(); const f2 = box.flush(); assert.equal(f1, f2);
  await new Promise((r) => setTimeout(r, 5));
  await box.enqueue('pin.update', { id: 'E', patch: { name: '2' } }); // E in flight → must not merge into it
  await box.enqueue('pin.update', { id: 'F', patch: { name: '3' } });
  release(); await f1;
  assert.deepEqual(calls.map((c) => c[1] + '=' + c[2].name), ['E=1', 'E=2', 'F=3']);
  ok('outbox: single flight, edits during an in-flight send are not lost');

  const events = []; const un = box.subscribe((o) => events.push(o.length));
  await box.enqueue('pin.update', { id: 'G', patch: { name: 'z' } }); online = false; await box.flush(); online = true; await box.flush(); un();
  assert.deepEqual(events, [1, 0]);
  ok('outbox: subscribers notified');
}

// overlay
{
  const server = [{ id: 'A', name: 'a', project_id: 'P', plan_id: 'L1' }, { id: 'B', name: 'b', project_id: 'P', plan_id: 'L2' }];
  const ops = [
    { type: 'pin.insert', status: 'pending', payload: { row: { id: 'N', name: 'new', project_id: 'P', plan_id: 'L1', assigned_to: 'm1' } } },
    { type: 'pin.insert', status: 'pending', payload: { row: { id: 'A', name: 'dup', project_id: 'P', plan_id: 'L1' } } },
    { type: 'pin.update', status: 'pending', payload: { id: 'A', patch: { name: 'a2', assigned_to: 'm9' } } },
    { type: 'pin.update', status: 'pending', payload: { id: 'N', patch: { note: 'later' } } },
    { type: 'pin.update', status: 'failed', payload: { id: 'B', patch: { deleted_at: 'now' } } },
    { type: 'photo.upload', status: 'pending', payload: { id: 'ph', pin_id: 'N', fileUri: 'file:///x.jpg' } },
  ];
  let out = overlayPins(server, ops, { projectId: 'P' });
  assert.deepEqual(out.map((p) => p.id), ['A', 'N']);
  assert.equal(out[0].name, 'a2'); assert.equal(out[0].assigned_to_id, 'm9'); assert.deepEqual(out[0].assigned_to, { id: 'm9' }); assert.equal(out[0]._pending, true);
  assert.equal(out[1].note, 'later');
  assert.deepEqual(overlayPins(server, ops, { planId: 'L2' }).map((p) => p.id), ['A']); // the read list is already scoped by the caller; N (plan L1) is not added
  assert.deepEqual(overlayPins(server, ops, { projectId: 'P', assignedTo: 'other' }).map((p) => p.id), ['A']);
  assert.deepEqual(overlayPins(server, [], {}), server);
  assert.equal(server[0].name, 'a', 'input not mutated');
  assert.deepEqual(pendingPhotosForPin(ops, 'N').map((p) => p.uri), ['file:///x.jpg']);
  ok('overlay: pending inserts, updates, deletes, scope, photos');

  // assignee stays an object, resolved from the member list when known
  const withMember = [{ id: 'A', assigned_to: { id: 'm1', name: 'Ali' }, project_id: 'P' }];
  const members = { m2: { id: 'm2', name: 'Sara' } };
  let o2 = overlayPins(withMember, [{ type: 'pin.update', status: 'pending', payload: { id: 'A', patch: { assigned_to: 'm2' } } }], {}, { resolveMember: (id) => members[id] });
  assert.deepEqual(o2[0].assigned_to, { id: 'm2', name: 'Sara' }); assert.equal(o2[0].assigned_to_id, 'm2');
  o2 = overlayPins(withMember, [{ type: 'pin.update', status: 'pending', payload: { id: 'A', patch: { assigned_to: 'm1' } } }]);
  assert.equal(o2[0].assigned_to.name, 'Ali');
  o2 = overlayPins(withMember, [{ type: 'pin.update', status: 'pending', payload: { id: 'A', patch: { assigned_to: null } } }]);
  assert.equal(o2[0].assigned_to, null);
  // guest scope with an object assignee on a queued insert
  o2 = overlayPins([], [{ type: 'pin.insert', status: 'pending', payload: { row: { id: 'Z', project_id: 'P', assigned_to: 'g1' } } }], { projectId: 'P', assignedTo: 'g1' });
  assert.equal(o2.length, 1);
  ok('overlay: assignee kept as a member object');

  // changes already sent are re-applied only to an older cached copy
  let recent = rememberSent([], { type: 'pin.update', payload: { id: 'A', patch: { name: 'sent name' } } }, 5000);
  recent = rememberSent(recent, { type: 'photo.upload', payload: {} }, 5001);
  recent = rememberSent(recent, { type: 'pin.insert', payload: { row: { id: 'NEW2', project_id: 'P', name: 'created' } } }, 5002);
  assert.equal(recent.length, 2);
  const copy = [{ id: 'A', name: 'old', project_id: 'P' }];
  o2 = overlayPins(copy, [], { projectId: 'P' }, { recent, cachedAt: 4000 });
  assert.deepEqual(o2.map((p) => [p.id, p.name, p._pending]), [['A', 'sent name', undefined], ['NEW2', 'created', undefined]]);
  o2 = overlayPins(copy, [], { projectId: 'P' }, { recent, cachedAt: 6000 });
  assert.deepEqual(o2.map((p) => p.name), ['old'], 'a newer copy already contains them');
  o2 = overlayPins(copy, [], { projectId: 'P' }, { recent, cachedAt: null });
  assert.deepEqual(o2.map((p) => p.name), ['old'], 'fresh server data is never overridden by sent changes');
  o2 = overlayPins(copy, [{ type: 'pin.update', status: 'pending', payload: { id: 'A', patch: { name: 'pending wins' } } }], {}, { recent, cachedAt: 4000 });
  assert.equal(o2[0].name, 'pending wins'); assert.equal(o2[0]._pending, true);
  const old = rememberSent(recent, { type: 'pin.update', payload: { id: 'B', patch: {} } }, 5000 + 8 * 24 * 3600 * 1000);
  assert.equal(old.length, 1, 'entries older than a week are dropped');
  ok('overlay: sent changes bridge a stale cached copy');
}
// pins of a plan rebuilt from the copies on the device
{
  const A = { id: 'A', plan_id: 'L1', name: 'a', x: 0.1, y: 0.1 };
  const B = { id: 'B', plan_id: 'L1', name: 'b', x: 0.2, y: 0.2 };
  const C = { id: 'C', plan_id: 'L2', name: 'c', x: 0.3, y: 0.3 };
  const T = { id: 'T', plan_id: null, name: 'task without plan' };
  // plan never opened online: only the project lists know its pins
  let r = pinsForPlanFromCaches('L1', null, [{ t: 10, v: [A, B, C, T] }, null]);
  assert.deepEqual(r.pins.map((p) => p.id), ['A', 'B']); assert.equal(r.cachedAt, 10);
  assert.deepEqual(pinsForPlanFromCaches('L2', null, [{ t: 10, v: [A, B, C, T] }]).pins.map((p) => p.id), ['C']);
  // plan opened long ago, project list is newer: new pin appears, deleted pin goes, details kept
  const planCopy = { t: 5, v: [{ ...A, name: 'old a', events: [{ id: 'e1' }] }, { id: 'GONE', plan_id: 'L1' }] };
  r = pinsForPlanFromCaches('L1', planCopy, [{ t: 10, v: [A, B, C] }]);
  assert.deepEqual(r.pins.map((p) => p.id), ['A', 'B']);
  assert.equal(r.pins[0].name, 'a'); assert.deepEqual(r.pins[0].events, [{ id: 'e1' }]); assert.equal(r.cachedAt, 10);
  // plan copy is the newest: used as is
  r = pinsForPlanFromCaches('L1', { t: 20, v: [A] }, [{ t: 10, v: [A, B] }]);
  assert.deepEqual(r.pins.map((p) => p.id), ['A']); assert.equal(r.cachedAt, 20);
  // newest of the two project lists wins
  r = pinsForPlanFromCaches('L1', null, [{ t: 10, v: [A] }, { t: 30, v: [A, B] }]);
  assert.deepEqual(r.pins.map((p) => p.id), ['A', 'B']);
  // soft-deleted rows in a project list are ignored; an empty plan is a valid answer; no copy at all → null
  assert.deepEqual(pinsForPlanFromCaches('L1', null, [{ t: 1, v: [{ ...A, deleted_at: 'x' }] }]).pins, []);
  assert.equal(pinsForPlanFromCaches('L1', null, [null, undefined]), null);
  ok('plan pins offline: rebuilt from plan + project copies, newest wins');
}
console.log('ALL', n, 'PASSED');
