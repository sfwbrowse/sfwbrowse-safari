/**
 * SFWbrowse - Per-Domain Override & Site Settings Manager
 *
 * Manages per-hostname allowlisting / enable overrides.
 * Normalizes hostnames defensively and caches override state in memory.
 */

import { getSetting, setSetting } from "./storage.js";
import { getEnabled } from "./enabled-state.js";

let cachedOverrides;

if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if ((areaName === "sync" || areaName === "local") && changes.overrides) {
      cachedOverrides = undefined;
    }
  });
}

/**
 * Normalizes a raw URL or hostname into a clean, canonical domain key.
 *
 * @param {string} input - URL or hostname (e.g., "https://www.RedditP.com:443/r/funny")
 * @returns {string} Normalized domain (e.g., "redditp.com")
 */
export function normalizeHostname(input) {
  if (!input || typeof input !== "string") return "";

  let cleaned = input.trim().toLowerCase();

  // If input contains protocol, parse hostname via URL
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
    try {
      cleaned = new URL(cleaned).hostname;
    } catch {
      // Fallback manual regex stripping
      cleaned = cleaned.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    }
  } else {
    // Strip any path, query, or hash
    cleaned = cleaned.split("/")[0].split("?")[0].split("#")[0];
  }

  // Strip port if present
  cleaned = cleaned.replace(/:\d+$/, "");

  // Strip leading dot
  cleaned = cleaned.replace(/^\.+/, "");

  // Strip leading www.
  cleaned = cleaned.replace(/^www\./, "");

  return cleaned;
}

/**
 * Retrieves the dictionary of per-domain overrides from storage / cache.
 * @returns {Promise<Record<string, boolean>>}
 */
export async function getOverrides() {
  if (cachedOverrides === undefined) {
    cachedOverrides = await getSetting("overrides", {});
  }
  return { ...cachedOverrides };
}

/**
 * Determines whether SFWbrowse protections are enabled for a given hostname.
 *
 * Precedence:
 * 1. If global enabled is false -> false
 * 2. If domain has explicit override in overrides dictionary -> return override value
 * 3. Default -> true
 *
 * @param {string} rawHostname - Target URL or hostname
 * @returns {Promise<boolean>}
 */
export async function isSiteEnabled(rawHostname) {
  const globalEnabled = await getEnabled();
  if (!globalEnabled) return false;

  const domain = normalizeHostname(rawHostname);
  if (!domain) return true;

  const overrides = await getOverrides();

  // Exact domain match
  if (typeof overrides[domain] === "boolean") {
    return overrides[domain];
  }

  // Check parent domains (e.g. sub.example.com -> example.com)
  const parts = domain.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join(".");
    if (typeof overrides[parent] === "boolean") {
      return overrides[parent];
    }
  }

  return true;
}

/**
 * Sets an override for a specific domain.
 *
 * @param {string} rawHostname - Domain or URL to override
 * @param {boolean} enabled - true to enforce, false to whitelist/bypass
 * @returns {Promise<void>}
 */
export async function setSiteOverride(rawHostname, enabled) {
  const domain = normalizeHostname(rawHostname);
  if (!domain) return;

  const overrides = await getOverrides();
  overrides[domain] = Boolean(enabled);
  cachedOverrides = { ...overrides };
  await setSetting("overrides", overrides);
}

/**
 * Removes an override for a specific domain, reverting to default.
 *
 * @param {string} rawHostname - Domain or URL to remove
 * @returns {Promise<void>}
 */
export async function removeSiteOverride(rawHostname) {
  const domain = normalizeHostname(rawHostname);
  if (!domain) return;

  const overrides = await getOverrides();
  delete overrides[domain];
  cachedOverrides = { ...overrides };
  await setSetting("overrides", overrides);
}

/**
 * Explicitly invalidates in-memory overrides cache (for tests).
 */
export function resetSiteSettingsCache() {
  cachedOverrides = undefined;
}
