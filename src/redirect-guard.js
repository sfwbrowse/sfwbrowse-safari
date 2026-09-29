/**
 * SFWbrowse - Navigation Redirect & Loop Guard
 *
 * Prevents infinite redirect loops between SafeSearch query-rewritten URLs
 * and target servers that reject safe browsing parameters.
 * Uses a sliding-window algorithm per tab (MAX_REDIRECTS = 3 within WINDOW_MS = 5000ms).
 */

const redirectHistory = new Map();
export const MAX_REDIRECTS = 3;
export const WINDOW_MS = 5000;

if (typeof chrome !== "undefined" && chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    cleanupTabHistory(tabId);
  });
}

/**
 * Checks whether the current navigation event on tabId constitutes a redirect loop.
 *
 * @param {number} tabId - Browser tab identifier
 * @param {number} [now=Date.now()] - Timestamp override for deterministic testing
 * @returns {boolean} true if redirect loop is detected, false otherwise
 */
export function isRedirectLoop(tabId, now = Date.now()) {
  if (typeof tabId !== "number" || tabId < 0) {
    return false;
  }

  const history = redirectHistory.get(tabId) || [];
  const activeHistory = history.filter((time) => now - time < WINDOW_MS);

  if (activeHistory.length >= MAX_REDIRECTS) {
    return true;
  }

  activeHistory.push(now);
  redirectHistory.set(tabId, activeHistory);
  return false;
}

/**
 * Removes tab navigation history from tracking when tab is closed.
 * @param {number} tabId
 */
export function cleanupTabHistory(tabId) {
  redirectHistory.delete(tabId);
}

/**
 * Resets all tracked tab histories (primarily used in tests).
 */
export function resetRedirectGuard() {
  redirectHistory.clear();
}
