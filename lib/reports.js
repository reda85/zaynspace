// Rapports d'un projet : historique, période couverte, choix des éléments par
// type de rapport, téléchargement et partage du PDF. Mêmes règles que le web
// (zyn lib/data/reports.js).
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { backendFetch } from './api';
import { REPORT_KINDS } from './reportKinds';
import { supabase } from './supabase';

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
/** Date locale « AAAA-MM-JJ ». */
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso, n) => isoDay(new Date(new Date(`${iso}T12:00:00`).getTime() + n * DAY));
const dayOf = (v) => (!v ? null : /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : isoDay(new Date(v)));

export const fmtDay = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR') : '');
export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function periodLabel(p) {
  if (!p?.start && !p?.end) return 'Tout le projet';
  if (p.start && p.end) return p.start === p.end ? `Le ${fmtDay(p.start)}` : `Du ${fmtDay(p.start)} au ${fmtDay(p.end)}`;
  return p.start ? `Depuis le ${fmtDay(p.start)}` : `Jusqu'au ${fmtDay(p.end)}`;
}

// ── Périodes ─────────────────────────────────────────────────────────────────
export const PERIOD_PRESETS = [
  { value: 'since-last', label: 'Depuis le dernier rapport' },
  { value: 'today', label: "Aujourd'hui" },
  { value: '7d', label: '7 derniers jours' },
  { value: '30d', label: '30 derniers jours' },
  { value: 'month', label: 'Ce mois-ci' },
  { value: 'all', label: 'Tout le projet' },
  { value: 'custom', label: 'Dates précises' },
];

export const defaultPreset = (kind, lastReport) =>
  kind === 'visite' ? (lastReport ? 'since-last' : '7d') : 'all';

export function resolvePeriod(preset, { lastReport, custom } = {}) {
  const today = isoDay();
  switch (preset) {
    case 'since-last': return lastReport ? { start: dayOf(lastReport.created_at), end: today } : null;
    case 'today': return { start: today, end: today };
    case '7d': return { start: addDays(today, -6), end: today };
    case '30d': return { start: addDays(today, -29), end: today };
    case 'month': return { start: `${today.slice(0, 8)}01`, end: today };
    case 'custom': return custom?.start || custom?.end ? { start: custom.start || null, end: custom.end || null } : null;
    default: return null;
  }
}

// ── Éléments concernés ───────────────────────────────────────────────────────
export async function fetchReportCandidates(projectId) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('pdf_pins')
      .select('id,type,created_at,date_debut,due_date,pin_number')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('pin_number', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/**
 * Réserves et observations constatées pendant la période ; tâches actives
 * pendant la période. Sans période, tous les éléments de la nature du rapport.
 */
export function itemsForReport(pins, kind, period) {
  const type = REPORT_KINDS[kind]?.pinType;
  const start = period?.start ?? null;
  const end = period?.end ?? null;
  return pins
    .filter((p) => !type || (p.type || 'reserve') === type)
    .filter((p) => {
      if (!start && !end) return true;
      if (kind === 'avancement') {
        const s = dayOf(p.date_debut) ?? dayOf(p.due_date);
        const e = dayOf(p.due_date) ?? s;
        if (!s) return false;
        return (!end || s <= end) && (!start || e >= start);
      }
      const d = dayOf(p.created_at);
      return (!start || d >= start) && (!end || d <= end);
    })
    .map((p) => p.id);
}

// ── Historique ───────────────────────────────────────────────────────────────
export async function fetchReports(projectId) {
  const { data, error } = await supabase
    .from('reports')
    .select('id,kind,title,file_name,file_size,item_count,period_start,period_end,created_at,members:created_by(name)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export function lastReportByKind(reports) {
  const out = {};
  for (const r of reports) out[r.kind] ??= r;
  return out;
}

async function backendJson(path, init) {
  const response = await backendFetch(path, { headers: { Accept: 'application/json' }, ...init });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!response.ok) throw new Error(json?.error || `Erreur ${response.status}`);
  return json;
}

export const reportDownload = (id) => backendJson(`/api/reports/${id}/download`);
export const deleteReport = (id) => backendJson(`/api/reports/${id}`, { method: 'DELETE' });

export const fmtSize = (bytes) =>
  bytes == null ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;

/**
 * Télécharge le PDF dans les documents de l'app puis ouvre le partage
 * (téléchargement natif en flux : rien ne passe par la mémoire JS).
 */
export async function downloadAndShare(downloadUrl, fileName) {
  const name = (fileName || `Rapport_${isoDay()}.pdf`).replace(/[/\\]/g, '_');
  const fileUri = FileSystem.documentDirectory + name;
  const result = await FileSystem.downloadAsync(downloadUrl, fileUri);
  if (result.status !== 200) throw new Error(`Téléchargement échoué (HTTP ${result.status})`);
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists || info.size === 0) throw new Error("Le fichier n'a pas été enregistré correctement.");
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', dialogTitle: 'Partager le rapport PDF', UTI: 'com.adobe.pdf' });
  } else {
    Alert.alert('Rapport enregistré', name);
  }
  return fileUri;
}
