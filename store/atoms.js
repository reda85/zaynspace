import { atom } from 'jotai'

export const projectsAtom = atom([])
export const selectedProjectAtom = atom(null)
export const plansAtom = atom([])
export const selectedPlanAtom = atom(null)
export const pinsAtom = atom([])
export const selectedPinAtom = atom(null)
export const sessionAtom = atom(null);
export const loggedInUserAtom = atom(null);
export const categoriesAtom = atom([]);
export const statusesAtom = atom([]);
export const membersAtom = atom([]);
export const isOnlineAtom = atom(true);
export const selectedOrganizationAtom = atom(null);
export const MetaPinAtom = atom({
  id: null,
  x: 0,
  y: 0,
})
export const PhotoPlanPositionAtom = atom(null); // { photoKey, x, y } | null