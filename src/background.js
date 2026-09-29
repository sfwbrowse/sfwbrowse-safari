/**
 * SFWbrowse - Manifest V3 Background Service Worker
 *
 * Coordinates lifecycle events, navigation hooks, cookie reconciliation,
 * dynamic blocklist synchronization, and action badge state.
 */

import { getEnabled } from "./enabled-state.js";
import { isSiteEnabled, normalizeHostname, getOverrides } from "./site-settings.js";
import { isRedirectLoop } from "./redirect-guard.js";
import { enforceAllCookies, setupCookieWatcher, enforceCookieRule } from "./cookies-mode.js";
import { syncCustomBlocklistFromStorage } from "./blocklist.js";
import { COOKIE_RULES } from "./rules-data.js";

/**
 * Updates extension action badge and icon to reflect protection state for active tab.
 *
 * @param {number} [tabId] - Active tab identifier
 * @param {string} [url] - Active tab URL
 */
export async function updateActionBadge(tabId, url) {
  if (typeof chrome === "undefined" || !chrome.action) return;

  const enabled = await getEnabled();

  if (!enabled) {
    if (tabId) {
      await chrome.action.setBadgeText({ tabId, text: "OFF" });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: "#64748b" }); // Slate Gray
      await chrome.action.setIcon({
        tabId,
        path: {
          16: "icons/icon-disabled-16.png",
          32: "icons/icon-disabled-32.png",
          48: "icons/icon-disabled-48.png",
          128: "icons/icon-disabled-128.png",
        },
      }).catch(() => {});
    }
    return;
  }

  // Global is enabled; check site override
  if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
    const domain = normalizeHostname(url);
    const overrides = await getOverrides();

    if (overrides[domain] === false) {
      if (tabId) {
        await chrome.action.setBadgeText({ tabId, text: "PASS" });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: "#3b82f6" }); // Blue
      }
      return;
    }
  }

  // Enabled and active
  if (tabId) {
    await chrome.action.setBadgeText({ tabId, text: "" });
    await chrome.action.setIcon({
      tabId,
      path: {
        16: "icons/icon-16.png",
        32: "icons/icon-32.png",
        48: "icons/icon-48.png",
        128: "icons/icon-128.png",
      },
    }).catch(() => {});
  }
}

/**
 * Extension Startup & Installation Initialization
 */
export async function initExtension() {
  console.log("[SFWbrowse] Initializing service worker...");

  // 1. Prime all cookies across supported domains
  await enforceAllCookies();

  // 2. Setup active cookie watcher
  setupCookieWatcher();

  // 3. Sync dynamic blocklist from storage
  await syncCustomBlocklistFromStorage();

  // 4. Update initial badge
  if (typeof chrome !== "undefined" && chrome.tabs?.query) {
    try {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTabs.length > 0) {
        await updateActionBadge(activeTabs[0].id, activeTabs[0].url);
      }
    } catch (_err) {
      // Ignore initial query errors
    }
  }

  console.log("[SFWbrowse] Service worker initialized successfully.");
}

// Register top-level listeners synchronously per MV3 requirements
if (typeof chrome !== "undefined") {
  // Lifecycle listeners
  chrome.runtime?.onInstalled?.addListener(() => {
    initExtension();
  });

  chrome.runtime?.onStartup?.addListener(() => {
    initExtension();
  });

  // Pre-navigation cookie priming
  if (chrome.webNavigation?.onBeforeNavigate) {
    chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
      if (details.frameId !== 0) return; // Only main frame

      const enabled = await getEnabled();
      if (!enabled) return;

      const url = details.url;
      if (!url.startsWith("http://") && !url.startsWith("https://")) return;

      const domain = normalizeHostname(url);
      const siteEnabled = await isSiteEnabled(domain);
      if (!siteEnabled) return;

      // Find matching rule and prime before request is sent
      const matchedRule = COOKIE_RULES.find((r) =>
        r.domains.some((d) => domain === d || domain.endsWith("." + d))
      );

      if (matchedRule) {
        await enforceCookieRule(matchedRule);
      }
    });
  }

  // Navigation committed: check redirect loop and update badge
  if (chrome.webNavigation?.onCommitted) {
    chrome.webNavigation.onCommitted.addListener(async (details) => {
      if (details.frameId !== 0) return;

      // Check redirect loop guard
      if (isRedirectLoop(details.tabId)) {
        console.warn(`[SFWbrowse] Redirect loop detected on tab ${details.tabId}; halting rewrites.`);
      }

      await updateActionBadge(details.tabId, details.url);
    });
  }

  // Tab activation: update badge for newly active tab
  if (chrome.tabs?.onActivated) {
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab) {
          await updateActionBadge(tab.id, tab.url);
        }
      } catch {
        // Tab may have closed before retrieval
      }
    });
  }

  // Storage changes: reactively update badge and re-enforce cookies/blocklist
  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area === "sync" || area === "local") {
        if (changes.enabled) {
          if (changes.enabled.newValue) {
            await enforceAllCookies();
          }
        }
        if (changes.customBlocklist) {
          await syncCustomBlocklistFromStorage();
        }

        // Refresh badge for active tab
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs.length > 0) {
            await updateActionBadge(tabs[0].id, tabs[0].url);
          }
        } catch {
          // Ignore
        }
      }
    });
  }
}
