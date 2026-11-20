// Types de rapport, comme sur le web (zyn lib/data/reportKinds.js) et le
// backend (lib/reportKinds.js) : chacun ne garde qu'une nature d'élément.

export const REPORT_KINDS = {
  reserves: {
    label: 'Rapport de réserves',
    short: 'Réserves',
    pinType: 'reserve',
    title: 'RAPPORT DE RÉSERVES',
    hint: 'Réserves par lot et entreprise, avec bilan des levées.',
    displayMode: 'list',
    modes: ['list', 'table'],
    fields: { description: true, photos: true, snapshot: true, assignedTo: true, dueDate: true, category: true, status: true, startDate: false, progress: false },
  },
  visite: {
    label: 'Rapport de visite',
    short: 'Visite',
    pinType: 'observation',
    title: 'RAPPORT DE VISITE DE CHANTIER',
    hint: 'Observations : photos, description et localisation.',
    displayMode: 'visite',
    modes: ['visite', 'localizedPhotos', 'photoGallery'],
    fields: { description: true, photos: true, snapshot: true, assignedTo: false, dueDate: false, category: false, status: false, startDate: false, progress: false },
  },
  avancement: {
    label: "Rapport d'avancement",
    short: 'Avancement',
    pinType: 'tache',
    title: "RAPPORT D'AVANCEMENT",
    hint: 'Synthèse, lots, retards, jalons, planning (Gantt) et tâches par lot.',
    displayMode: 'table',
    modes: ['table', 'list'],
    fields: { description: false, photos: false, snapshot: false, assignedTo: true, dueDate: true, category: true, status: true, startDate: true, progress: true },
  },
  libre: {
    label: 'Rapport libre',
    short: 'Libre',
    pinType: null,
    title: 'RAPPORT DE TÂCHES',
    hint: 'Tous les éléments sélectionnés, sans tri par nature.',
    displayMode: 'list',
    modes: ['list', 'table'],
    fields: null, // ceux du modèle choisi
  },
};

export const REPORT_KIND_KEYS = Object.keys(REPORT_KINDS);

export const DISPLAY_MODES = {
  list: { label: 'Liste détaillée', icon: 'list', hint: 'Affichage détaillé avec snapshots et photos' },
  table: { label: 'Tableau compact', icon: 'grid', hint: "Vue tableau compacte idéale pour l'impression" },
  visite: { label: 'Fiches de visite', icon: 'file-text', hint: 'Une fiche par observation : description, plan, photos' },
  localizedPhotos: { label: 'Photos localisées', icon: 'map-pin', hint: 'Chaque photo avec sa position sur le plan' },
  photoGallery: { label: 'Galerie photo', icon: 'image', hint: 'Toutes les photos en grille' },
};

/** Rapport adapté à l'onglet de la liste (nature affichée). */
export const kindForPinType = (type) =>
  REPORT_KIND_KEYS.find((k) => REPORT_KINDS[k].pinType === type) ?? 'libre';

/** Un modèle sans type (créé avant les types de rapport) sert pour tous. */
export const templateKind = (template) => template?.kind || 'libre';

// Contenu du rapport d'avancement (config.progress côté backend).
export const PROGRESS_PARTS = [
  { key: 'lots', label: 'Tableau des lots', hint: 'Dates prévues et réelles, avancement, état' },
  { key: 'attention', label: "Points d'attention", hint: 'Lots et tâches en retard' },
  { key: 'milestones', label: 'Jalons', hint: 'Atteints, dépassés, à venir' },
  { key: 'gantt', label: 'Planning (Gantt)', hint: 'Page paysage, ligne du jour' },
  { key: 'ganttTasks', label: 'Tâches dans le planning', hint: 'Sous chaque lot' },
  { key: 'details', label: 'Détail des tâches', hint: 'Par lot, en tableau ou en liste' },
  { key: 'photos', label: 'Reportage photo', hint: 'Une page par tâche : photo, plan et avancement' },
  { key: 'workforce', label: 'Effectifs de site', hint: 'Personnel présent par entreprise' },
  { key: 'conclusion', label: 'Recommandations et conclusion', hint: 'Texte libre en fin de rapport' },
  { key: 'planOverviews', label: "Vues d'ensemble des plans", hint: 'Tâches localisées sur les plans' },
];
export const DEFAULT_PROGRESS = { lots: true, attention: true, milestones: true, gantt: true, ganttTasks: true, details: true, photos: true, workforce: true, conclusion: true, planOverviews: false };

/**
 * Valeur d'un champ du rapport. Début et avancement étaient un seul champ,
 * « planning » : les anciens modèles l'ont encore et il vaut pour les deux.
 */
export function fieldValue(fields, key, fallback = true) {
  const f = fields || {};
  if (f[key] != null) return Boolean(f[key]);
  if ((key === 'startDate' || key === 'progress') && f.planning != null) return Boolean(f.planning);
  return fallback;
}

// Cartouche : préfixe du n° de document par type (« RR-012 »), comme le serveur.
export const DOC_NUMBER_PREFIX = { reserves: 'RR', visite: 'RV', avancement: 'RA', libre: 'R' };

export const REPORT_PHASES = ['ESQ', 'APS', 'APD', 'PRO', 'DCE', 'EXE', 'OPR', 'AOR', 'GPA'];

/** Cartouche du modèle : actif par défaut avec le design « Cartouches ». */
export function cartoucheOptions(config) {
  const c = config?.cartouche || {};
  return {
    enabled: c.enabled ?? config?.design === 'cartouches',
    numberPrefix: c.numberPrefix || '',
    showIdentity: c.showIdentity !== false,
    showParties: c.showParties !== false,
    showVisa: c.showVisa !== false,
  };
}

/** N° proposé : préfixe du modèle (ou du type) et n° d'ordre sur 3 chiffres. */
export function suggestedDocNumber(config, kind, seq) {
  if (!seq) return '';
  const prefix = cartoucheOptions(config).numberPrefix.trim() || DOC_NUMBER_PREFIX[kind] || 'R';
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}
