// Palette et polices de la refonte, alignées sur l'application web
// (app/globals.css, variables --zs-*). Toute nouvelle couleur d'interface
// passe par ce fichier ; les couleurs de statut et de catégorie viennent de
// la base et ne sont pas concernées.

export const C = {
  papier: '#F8F8F6',      // fond des écrans
  blanc: '#FFFFFF',       // cartes, barres
  encre: '#1C1C1A',       // texte principal, boutons noirs
  encreSurvol: '#33332F',
  mine: '#5B5B56',        // texte secondaire
  mineClair: '#8A8A84',   // texte tertiaire, icônes inactives
  trait: '#B9B9B3',
  filet: '#E4E4E0',       // bordures
  filetFort: '#D3D3CE',
  voile: '#EEEEEB',       // séparateurs internes, fonds d'icône
  survol: '#F3F3F0',
  tirage: '#2C4F91',      // accent (liens, onglet actif, badges)
  tirageFonce: '#223E73',
  tirageClair: '#CDD8EA',
  tiragePale: '#EDF1F8',
  alerte: '#A8322A',
  alerteClair: '#ECC9C3',
  alertePale: '#F9ECEA',
  valide: '#2F6B4A',
  valideClair: '#C3DCCD',
  validePale: '#EBF3EE',
};

export const F = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  mono: 'GeistMono_500Medium',
};
