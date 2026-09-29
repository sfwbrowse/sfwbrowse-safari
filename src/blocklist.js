/**
 * SFWbrowse - DeclarativeNetRequest Dynamic Blocklist Manager
 *
 * Manages runtime dynamic rules for user-configured custom domain blocklists.
 * Partitions rule IDs into 2000-89999 range to avoid collisions with static rules.
 * Redirects main_frame navigations to internal splash (blocked.html) and drops subresources.
 */

import { getSetting, setSetting } from "./storage.js";
import { normalizeHostname } from "./site-settings.js";

export const DYNAMIC_RULE_START_ID = 2000;
export const DYNAMIC_RULE_END_ID = 90000;

/**
 * Synchronizes an array of custom domains into the browser's dynamic DNR ruleset.
 *
 * @param {string[]} domainList - Array of domain strings or URLs
 * @returns {Promise<void>}
 */
export async function updateDynamicBlocklist(domainList = []) {
  if (typeof chrome === "undefined" || !chrome.declarativeNetRequest?.getDynamicRules) {
    return;
  }

  const currentRules = await chrome.declarativeNetRequest.getDynamicRules();

  // Find all existing dynamic blocklist rule IDs (2000 to 89999)
  const removeRuleIds = currentRules
    .filter((r) => r.id >= DYNAMIC_RULE_START_ID && r.id < DYNAMIC_RULE_END_ID)
    .map((r) => r.id);

  const addRules = [];
  const validDomains = Array.from(
    new Set(
      domainList
        .map((d) => normalizeHostname(d))
        .filter((d) => Boolean(d) && d.includes("."))
    )
  );

  validDomains.forEach((domain, index) => {
    const baseId = DYNAMIC_RULE_START_ID + index * 2;
    if (baseId + 1 >= DYNAMIC_RULE_END_ID) return; // Cap at max partition

    // Rule 1: Main frame navigation redirects to warning screen
    addRules.push({
      id: baseId,
      priority: 20,
      action: {
        type: "redirect",
        redirect: {
          extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}`,
        },
      },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: ["main_frame"],
      },
    });

    // Rule 2: Sub-resources (images, scripts, iframes) are blocked directly
    addRules.push({
      id: baseId + 1,
      priority: 20,
      action: {
        type: "block",
      },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: ["sub_frame", "stylesheet", "script", "image", "xmlhttprequest", "media"],
      },
    });
  });

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules,
  });
}

/**
 * Reads customBlocklist from storage and synchronizes into dynamic DNR rules.
 * @returns {Promise<string[]>}
 */
export async function syncCustomBlocklistFromStorage() {
  const domains = await getSetting("customBlocklist", []);
  await updateDynamicBlocklist(domains);
  return domains;
}

/**
 * Retrieves the user's custom blocklist from storage.
 * @returns {Promise<string[]>}
 */
export async function getCustomBlocklist() {
  return await getSetting("customBlocklist", []);
}

/**
 * Adds a domain to the custom blocklist and updates dynamic DNR rules.
 *
 * @param {string} rawDomain
 * @returns {Promise<string[]>}
 */
export async function addCustomBlockDomain(rawDomain) {
  const domain = normalizeHostname(rawDomain);
  if (!domain || !domain.includes(".")) return await getCustomBlocklist();

  const current = await getCustomBlocklist();
  if (!current.includes(domain)) {
    const updated = [...current, domain];
    await setSetting("customBlocklist", updated);
    await updateDynamicBlocklist(updated);
    return updated;
  }
  return current;
}

/**
 * Removes a domain from the custom blocklist and updates dynamic DNR rules.
 *
 * @param {string} rawDomain
 * @returns {Promise<string[]>}
 */
export async function removeCustomBlockDomain(rawDomain) {
  const domain = normalizeHostname(rawDomain);
  if (!domain) return await getCustomBlocklist();

  const current = await getCustomBlocklist();
  const updated = current.filter((d) => d !== domain);
  await setSetting("customBlocklist", updated);
  await updateDynamicBlocklist(updated);
  return updated;
}
