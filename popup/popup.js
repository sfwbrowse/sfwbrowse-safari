/**
 * SFWbrowse - Action Popup Controller
 */

import { getSetting, setSetting } from "./storage.js";

let currentDomain = "";

function normalizeHostname(input) {
  if (!input || typeof input !== "string") return "";
  let cleaned = input.trim().toLowerCase();
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
    try {
      cleaned = new URL(cleaned).hostname;
    } catch {
      cleaned = cleaned.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    }
  } else {
    cleaned = cleaned.split("/")[0].split("?")[0].split("#")[0];
  }
  return cleaned.replace(/:\d+$/, "").replace(/^\.+/, "").replace(/^www\./, "");
}

async function updateUI() {
  const enabled = await getSetting("enabled", true);
  const overrides = await getSetting("overrides", {});

  // Update Master Toggle
  const masterToggle = document.getElementById("popup-master-toggle");
  if (masterToggle) masterToggle.checked = enabled;

  // Update Shield Icon & Status Text
  const shield = document.getElementById("shield-icon");
  const statusText = document.getElementById("status-text");
  const statusDesc = document.getElementById("status-desc");

  if (!enabled) {
    if (shield) shield.className = "shield-svg disabled";
    if (statusText) {
      statusText.textContent = "Protection Disabled";
      statusText.className = "status-indicator disabled";
    }
    if (statusDesc) statusDesc.textContent = "Safe browsing filters temporarily paused";
  } else {
    if (shield) shield.className = "shield-svg active";
    if (statusText) {
      statusText.textContent = "Protection Active";
      statusText.className = "status-indicator";
    }
    if (statusDesc) statusDesc.textContent = "Zero telemetry & strict SafeSearch enforced";
  }

  // Update Site Toggle
  const siteDomainEl = document.getElementById("current-hostname");
  const btnSiteToggle = document.getElementById("btn-toggle-site");

  if (currentDomain && currentDomain.includes(".")) {
    if (siteDomainEl) siteDomainEl.textContent = currentDomain;
    if (btnSiteToggle) {
      btnSiteToggle.disabled = false;
      const isBypassed = overrides[currentDomain] === false;
      if (isBypassed) {
        btnSiteToggle.textContent = "Enable for Site";
        btnSiteToggle.className = "btn btn-outline bypassed";
      } else {
        btnSiteToggle.textContent = "Allowlist Site";
        btnSiteToggle.className = "btn btn-outline";
      }
    }
  } else {
    if (siteDomainEl) siteDomainEl.textContent = "System / New Tab";
    if (btnSiteToggle) {
      btnSiteToggle.disabled = true;
      btnSiteToggle.textContent = "Allowlist Site";
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Query active tab
  if (typeof chrome !== "undefined" && chrome.tabs?.query) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0 && tabs[0].url) {
        const url = tabs[0].url;
        if (url.startsWith("http://") || url.startsWith("https://")) {
          currentDomain = normalizeHostname(url);
        }
      }
    } catch (err) {
      console.debug("[SFWbrowse] Failed to query active tab:", err);
    }
  }

  await updateUI();

  // Master Toggle change listener
  const masterToggle = document.getElementById("popup-master-toggle");
  if (masterToggle) {
    masterToggle.addEventListener("change", async (e) => {
      const nextState = e.target.checked;
      await setSetting("enabled", nextState);
      await updateUI();
    });
  }

  // Site Toggle click listener
  const btnSiteToggle = document.getElementById("btn-toggle-site");
  if (btnSiteToggle) {
    btnSiteToggle.addEventListener("click", async () => {
      if (!currentDomain) return;
      const overrides = await getSetting("overrides", {});
      const currentlyBypassed = overrides[currentDomain] === false;
      if (currentlyBypassed) {
        delete overrides[currentDomain];
      } else {
        overrides[currentDomain] = false;
      }
      await setSetting("overrides", overrides);
      await updateUI();
    });
  }

  // Open Options page
  const btnOptions = document.getElementById("btn-open-options");
  if (btnOptions) {
    btnOptions.addEventListener("click", () => {
      if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open("../options/options.html");
      }
    });
  }

  // Storage listener for reactive updates
  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" || area === "local") {
        if (changes.enabled || changes.overrides) {
          updateUI();
        }
      }
    });
  }
});
