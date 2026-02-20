// store/discussionsAtoms.js
// Add these to your existing store/atoms.js file, or import from here.

import { atom } from 'jotai';

export const discussionGroupsAtom = atom([]);       // DiscussionGroup[]
export const activeGroupIdAtom    = atom(null);      // UUID | null
export const discussionMessagesAtom = atom({});      // { [groupId]: Message[] }
export const discussionUnreadAtom   = atom({});      // { [groupId]: number }
export const discussionLastMsgAtom  = atom({});      // { [groupId]: Message | null }