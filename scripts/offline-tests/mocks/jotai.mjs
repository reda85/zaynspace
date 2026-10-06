export const atom = (init) => (typeof init === 'function' ? { read: init } : { init });
const values = new Map();
const store = {
  get(a) { if (a.read) return a.read((x) => store.get(x)); return values.has(a) ? values.get(a) : a.init; },
  set(a, v) { values.set(a, typeof v === 'function' ? v(store.get(a)) : v); },
};
export const getDefaultStore = () => store;
