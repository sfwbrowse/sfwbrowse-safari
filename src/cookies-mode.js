/**
 * SFWbrowse - Cookies Mode Engine & Auto-Repair Reconciliation Loop
 *
 * Enforces mandatory safe browsing and adult filtering cookies across supported
 * web domains and privacy frontends. Monitors chrome.cookies.onChanged to
 * instantly detect and repair any client-side tampering, deletion, or external resets.
 */

import { COOKIE_RULES } from "./rules-data.js";
import { getEnabled } from "./enabled-state.js";
import { isSiteEnabled } from "./site-settings.js";
import { getSetting } from "./storage.js";

/**
 * Enforces a single cookie rule across its defined cookie specifications.
 * Verifies global enabled state, per-site override, and per-rule toggle.
 *
 * @param {object} rule - Rule definition from COOKIE_RULES
 * @returns {Promise<void>}
 */
export async function enforceCookieRule(rule) {
  if (!rule || !rule.cookies || !rule.targetUrl) return;

  const globalEnabled = await getEnabled();
  if (!globalEnabled) return;

  const siteEnabled = await isSiteEnabled(rule.domains[0]);
  if (!siteEnabled) return;

  const rulesConfig = await getSetting("cookieRulesConfig", {});
  if (rulesConfig[rule.id] === false) return;

  for (const cookieDef of rule.cookies) {
    try {
      const existing = await chrome.cookies.get({
        url: rule.targetUrl,
        name: cookieDef.name,
      });

      if (!existing || existing.value !== cookieDef.value) {
        const expirationDays = cookieDef.expirationDays || 365;
        const expirationDate = Math.floor(Date.now() / 1000) + expirationDays * 86400;

        await chrome.cookies.set({
          url: rule.targetUrl,
          name: cookieDef.name,
          value: cookieDef.value,
          domain: cookieDef.domain || undefined,
          path: cookieDef.path || "/",
          secure: cookieDef.secure ?? true,
          sameSite: cookieDef.sameSite || "lax",
          expirationDate,
        });
      }
    } catch (err) {
      console.error(`[SFWbrowse] Failed to enforce cookie ${cookieDef.name} for ${rule.id}:`, err);
    }
  }
}

/**
 * Primes all supported cookie rules across the browser cookie jar.
 * Executed on extension installation, startup, and global toggle reactivation.
 *
 * @returns {Promise<void>}
 */
export async function enforceAllCookies() {
  const globalEnabled = await getEnabled();
  if (!globalEnabled) return;

  for (const rule of COOKIE_RULES) {
    await enforceCookieRule(rule);
  }
}

/**
 * Registers an active watcher on chrome.cookies.onChanged.
 * Immediately heals deleted or modified safety cookies on target domains.
 *
 * @returns {void}
 */
export function setupCookieWatcher() {
  if (typeof chrome === "undefined" || !chrome.cookies?.onChanged) return;

  chrome.cookies.onChanged.addListener(async ({ cookie, removed }) => {
    if (!cookie) return;

    const globalEnabled = await getEnabled();
    if (!globalEnabled) return;

    const cleanCookieDomain = (cookie.domain || "").replace(/^\./, "").toLowerCase();

    for (const rule of COOKIE_RULES) {
      const matchesDomain = rule.domains.some((d) => {
        const cleanRuleDomain = d.replace(/^\./, "").toLowerCase();
        return cleanCookieDomain === cleanRuleDomain || cleanCookieDomain.endsWith("." + cleanRuleDomain);
      });

      if (!matchesDomain) continue;

      const cookieDef = rule.cookies.find((c) => c.name === cookie.name);
      if (!cookieDef) continue;

      const siteEnabled = await isSiteEnabled(rule.domains[0]);
      if (!siteEnabled) continue;

      const rulesConfig = await getSetting("cookieRulesConfig", {});
      if (rulesConfig[rule.id] === false) continue;

      // If removed or value tampered, heal immediately
      if (removed || cookie.value !== cookieDef.value) {
        try {
          const expirationDays = cookieDef.expirationDays || 365;
          const expirationDate = Math.floor(Date.now() / 1000) + expirationDays * 86400;

          await chrome.cookies.set({
            url: rule.targetUrl,
            name: cookieDef.name,
            value: cookieDef.value,
            domain: cookieDef.domain || undefined,
            path: cookieDef.path || "/",
            secure: cookieDef.secure ?? true,
            sameSite: cookieDef.sameSite || "lax",
            expirationDate,
          });
        } catch (err) {
          console.error(`[SFWbrowse] Failed to heal cookie ${cookieDef.name} for ${rule.id}:`, err);
        }
      }
    }
  });
}
