/**
 * SFWbrowse - Reactive Enabled State Controller
 *
 * Maintains an in-memory cache of the global extension enabled state
 * to avoid disk I/O on high-frequency navigation events.
 * Automatically invalidates on chrome.storage.onChanged.
 */

import { getSetting, setSetting } from "./storage.js";

let cachedEnabled;

if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if ((areaName === "sync" || areaName === "local") && changes.enabled) {
      cachedEnabled = undefined;
    }
  });
}

/**
 * Retrieves the global enabled state, utilizing in-memory cache when available.
 * @returns {Promise<boolean>}
 */
export async function getEnabled() {
  if (cachedEnabled === undefined) {
    cachedEnabled = await getSetting("enabled", true);
  }
  return cachedEnabled;
}

/**
 * Persists the global enabled state and updates in-memory cache.
 * @param {boolean} value
 * @returns {Promise<void>}
 */
export async function setEnabled(value) {
  cachedEnabled = Boolean(value);
  await setSetting("enabled", cachedEnabled);
}

/**
 * Explicitly invalidates the in-memory cache (primarily used in tests).
 */
export function resetEnabledCache() {
  cachedEnabled = undefined;
}
