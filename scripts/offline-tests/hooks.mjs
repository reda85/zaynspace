// Permet d'exécuter lib/offline dans Node : remplace les modules natifs par des
// doublures (mocks/) et charge les fichiers .js du dépôt comme modules ES.
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const MOCKS = { 'expo-file-system/legacy': 'fs.mjs', 'react-native': 'rn.mjs', 'jotai': 'jotai.mjs', 'base64-arraybuffer': 'b64.mjs' };
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..') + path.sep;
const inRepo = (url) => url.startsWith('file:') && fileURLToPath(url).startsWith(repo) && !url.includes('node_modules') && !fileURLToPath(url).startsWith(here);
export async function resolve(spec, ctx, next) {
  if (MOCKS[spec]) return { url: pathToFileURL(path.join(here, 'mocks', MOCKS[spec])).href, shortCircuit: true };
  if (spec.startsWith('.') && ctx.parentURL && inRepo(ctx.parentURL)) {
    const base = path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec);
    if (base.endsWith('/lib/supabase')) return { url: pathToFileURL(path.join(here, 'mocks', 'supabase.mjs')).href, shortCircuit: true };
    for (const c of [base + '.js', path.join(base, 'index.js')]) if (fs.existsSync(c)) return { url: pathToFileURL(c).href, shortCircuit: true };
  }
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (inRepo(url) && url.endsWith('.js')) return { format: 'module', source: fs.readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true };
  return next(url, ctx);
}
