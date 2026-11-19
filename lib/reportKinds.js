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
    fields: { description: true, photos: true, snapshot: true, assignedTo: true, dueDate: true, category: true, status: true, planning: false },
  },
  visite: {
    label: 'Rapport de visite',
    short: 'Visite',
    pinType: 'observation',
    title: 'RAPPORT DE VISITE DE CHANTIER',
    hint: 'Observations : photos, description et localisation.',
    displayMode: 'visite',
    modes: ['visite', 'localizedPhotos', 'photoGallery'],
    fields: { description: true, photos: true, snapshot: true, assignedTo: false, dueDate: false, category: false, status: false, planning: false },
  },
  avancement: {
    label: "Rapport d'avancement",
    short: 'Avancement',
    pinType: 'tache',
    title: "RAPPORT D'AVANCEMENT",
    hint: 'Synthèse, lots, retards, jalons, planning (Gantt) et tâches par lot.',
    displayMode: 'table',
    modes: ['table', 'list'],
    fields: { description: false, photos: false, snapshot: false, assignedTo: true, dueDate: true, category: true, status: true, planning: true },
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
  { key: 'planOverviews', label: "Vues d'ensemble des plans", hint: 'Tâches localisées sur les plans' },
];
export const DEFAULT_PROGRESS = { lots: true, attention: true, milestones: true, gantt: true, ganttTasks: true, details: true, photos: true, planOverviews: false };
