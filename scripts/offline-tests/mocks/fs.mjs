// In-memory file system mimicking the expo-file-system legacy API used by the app.
export const documentDirectory = 'file:///doc/';
export const files = new Map(); export const dirs = new Set(['file:///doc/']);
export let failDownload = () => false; export const setFailDownload = (f) => { failDownload = f; };
const norm = (p) => p;
export async function makeDirectoryAsync(d) { let cur = ''; for (const part of d.replace('file:///', '').split('/').filter(Boolean)) { cur += part + '/'; dirs.add('file:///' + cur); } }
export async function readAsStringAsync(p) { if (!files.has(p)) throw new Error('ENOENT ' + p); return files.get(p); }
export async function writeAsStringAsync(p, v) { const d = p.slice(0, p.lastIndexOf('/') + 1); if (!dirs.has(d)) throw new Error('no dir ' + d); files.set(p, v); }
export async function deleteAsync(p, o = {}) { let found = files.delete(p); for (const k of [...files.keys()]) if (k.startsWith(p.endsWith('/') ? p : p + '/')) { files.delete(k); found = true; } for (const d of [...dirs]) if (d.startsWith(p)) { dirs.delete(d); found = true; } if (!found && !o.idempotent) throw new Error('ENOENT'); }
export async function moveAsync({ from, to }) { if (!files.has(from)) throw new Error('ENOENT move'); files.set(to, files.get(from)); files.delete(from); }
export async function getInfoAsync(p) { if (files.has(p)) return { exists: true, isDirectory: false, size: files.get(p).length }; if (dirs.has(p) || dirs.has(p + '/')) return { exists: true, isDirectory: true }; return { exists: false }; }
export async function readDirectoryAsync(d) { if (!dirs.has(d)) throw new Error('ENOENT dir'); const out = new Set(); for (const k of files.keys()) if (k.startsWith(d)) out.add(k.slice(d.length).split('/')[0]); for (const k of dirs) if (k.startsWith(d) && k !== d) out.add(k.slice(d.length).split('/')[0]); return [...out]; }
export async function downloadAsync(url, to) { if (failDownload(url)) throw new Error('Network request failed'); if (url.includes('missing')) { files.set(to, ''); return { status: 404 }; } files.set(to, 'TILE:' + url); return { status: 200 }; }
