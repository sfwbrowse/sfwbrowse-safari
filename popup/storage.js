/**
 * SFWbrowse - Dual-Tier Synchronized Storage Adapter
 *
 * Implements a sync-first storage pattern with graceful fallback to chrome.storage.local
 * on network partition, quota exhaustion, or enterprise policy restriction.
 */

/**
 * Retrieves a single setting from storage.
 * Queries chrome.storage.sync first; falls back to chrome.storage.local on failure.
 *
 * @param {string} key - Setting key to retrieve
 * @param {*} defaultValue - Fallback value if setting is not defined in storage
 * @returns {Promise<*>} Resolved value or defaultValue
 */
export async function getSetting(key, defaultValue) {
  try {
    const values = await chrome.storage.sync.get({ [key]: defaultValue });
    return values[key] ?? defaultValue;
  } catch (_err) {
    try {
      const values = await chrome.storage.local.get({ [key]: defaultValue });
      return values[key] ?? defaultValue;
    } catch (_localErr) {
      return defaultValue;
    }
  }
}

/**
 * Persists a setting to storage.
 * Attempts to persist to chrome.storage.sync; automatically falls back to chrome.storage.local.
 *
 * @param {string} key - Setting key to persist
 * @param {*} value - Value to serialize and store
 * @returns {Promise<void>}
 */
export async function setSetting(key, value) {
  try {
    await chrome.storage.sync.set({ [key]: value });
  } catch (syncErr) {
    console.warn("[SFWbrowse] Sync storage failed, falling back to local:", syncErr);
    await chrome.storage.local.set({ [key]: value });
  }
}
