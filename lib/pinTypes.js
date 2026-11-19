// Nature d'un élément de la liste : réserve, tâche ou observation (pdf_pins.type),
// comme sur l'application web.
import { C } from '../constants/theme';

export const PIN_TYPES = {
  reserve: { label: 'Réserve', plural: 'Réserves', bg: C.alertePale, fg: C.alerte },
  tache: { label: 'Tâche', plural: 'Tâches', bg: C.tiragePale, fg: C.tirage },
  observation: { label: 'Observation', plural: 'Obs.', bg: C.voile, fg: C.mine },
};

export const pinType = (pin) => PIN_TYPES[pin?.type] ? pin.type : 'reserve';
