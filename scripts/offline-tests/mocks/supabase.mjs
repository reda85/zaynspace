// Fake Supabase recording calls; `net.down` makes every request fail like a dead network.
export const net = { down: false, refuse: null };
export const calls = [];
export const db = { pdf_pins: new Map(), pins_photos: new Map(), objects: new Set() };
const netFail = () => ({ data: null, error: { message: 'TypeError: Network request failed' } });
function table(name) {
  const q = { _op: null, _rows: null, _filters: {} };
  const exec = async () => {
    if (net.down) return netFail();
    if (net.refuse?.(name, q)) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
    calls.push([name, q._op, q._rows ?? q._patch, { ...q._filters }]);
    if (q._op === 'upsert') { for (const r of q._rows) { if (name === 'pins_photos' && !db.pdf_pins.has(r.pin_id)) return { data: null, error: { code: '23503', message: 'fk violation: pin missing' } }; db[name].set(r.id, { ...(db[name].get(r.id) ?? {}), ...r }); } return { data: q._rows, error: null }; }
    if (q._op === 'update') { const row = db[name].get(q._filters.id); if (!row) return { data: [], error: null }; Object.assign(row, q._patch); return { data: [{ id: row.id }], error: null }; }
    return { data: [], error: null };
  };
  Object.assign(q, {
    upsert(rows) { q._op = 'upsert'; q._rows = rows; return q; },
    update(patch) { q._op = 'update'; q._patch = patch; return q; },
    eq(k, v) { q._filters[k] = v; return q; },
    select() { return q; },
    then(res, rej) { return exec().then(res, rej); },
  });
  return q;
}
export const supabase = {
  from: table,
  storage: { from: (bucket) => ({
    async upload(path) { if (net.down) return { error: { message: 'Network request failed' } }; if (db.objects.has(bucket + '/' + path)) return { error: { message: 'The resource already exists', statusCode: '409' } }; db.objects.add(bucket + '/' + path); calls.push(['storage', 'upload', path]); return { error: null }; },
    getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn/${bucket}/${path}` } }),
  }) },
};
