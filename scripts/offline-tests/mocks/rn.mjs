export const appStateListeners = [];
export const AppState = { addEventListener: (_e, fn) => { appStateListeners.push(fn); return { remove() {} }; } };
