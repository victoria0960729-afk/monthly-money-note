export const STORAGE_KEY = "lurii-budget-app-clean-v7";

export function loadLocalState(fallbackState) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...fallbackState, ...JSON.parse(raw) } : fallbackState;
  } catch {
    return fallbackState;
  }
}

export function saveLocalState(data) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}
