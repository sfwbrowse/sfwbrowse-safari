/**
 * SFWbrowse - Options & Settings Controller
 */

import { getSetting, setSetting } from "./storage.js";
import { COOKIE_RULES } from "./rules-data.js";
import { normalizeHostname } from "./site-settings.js";
import { updateDynamicBlocklist } from "./blocklist.js";

const DEFAULT_CONFIG = {
  enabled: true,
  features: {
    cookiesMode: true,
    blocklist: true,
    safeSearch: true,
    storageLock: true,
  },
  overrides: {},
  customBlocklist: [],
  cookieRulesConfig: {},
};

let toastTimeout;
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

async function loadOptions() {
  const enabled = await getSetting("enabled", DEFAULT_CONFIG.enabled);
  const features = await getSetting("features", DEFAULT_CONFIG.features);
  const customBlocklist = await getSetting("customBlocklist", DEFAULT_CONFIG.customBlocklist);
  const cookieRulesConfig = await getSetting("cookieRulesConfig", DEFAULT_CONFIG.cookieRulesConfig);

  // 1. Master Toggle
  const masterToggle = document.getElementById("master-toggle");
  const masterStatus = document.getElementById("master-status");
  if (masterToggle) {
    masterToggle.checked = enabled;
    if (masterStatus) {
      masterStatus.textContent = enabled ? "Enabled" : "Disabled";
      masterStatus.className = `status-label ${enabled ? "" : "disabled"}`;
    }
  }

  // 2. Feature Flags
  const featCookies = document.getElementById("feat-cookies");
  if (featCookies) featCookies.checked = features.cookiesMode ?? true;

  const featBlocklist = document.getElementById("feat-blocklist");
  if (featBlocklist) featBlocklist.checked = features.blocklist ?? true;

  const featSafeSearch = document.getElementById("feat-safesearch");
  if (featSafeSearch) featSafeSearch.checked = features.safeSearch ?? true;

  const featStorageLock = document.getElementById("feat-storagelock");
  if (featStorageLock) featStorageLock.checked = features.storageLock ?? true;

  // 3. Render Supported Cookie Rules
  renderCookieRules(cookieRulesConfig);

  // 4. Render Custom Blocklist
  renderCustomBlocklist(customBlocklist);
}

function renderCookieRules(rulesConfig) {
  const container = document.getElementById("cookie-rules-list");
  if (!container) return;
  container.innerHTML = "";

  for (const rule of COOKIE_RULES) {
    const isRuleActive = rulesConfig[rule.id] !== false;

    const item = document.createElement("div");
    item.className = "rule-item";

    const info = document.createElement("div");
    info.className = "rule-info";
    info.innerHTML = `<strong>${rule.name}</strong><p>${rule.domains.join(", ")}</p>`;

    const switchLabel = document.createElement("label");
    switchLabel.className = "switch";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isRuleActive;
    checkbox.dataset.ruleId = rule.id;

    checkbox.addEventListener("change", async (e) => {
      const active = e.target.checked;
      const currentConfig = await getSetting("cookieRulesConfig", {});
      currentConfig[rule.id] = active;
      await setSetting("cookieRulesConfig", currentConfig);
      showToast(`${rule.name} ${active ? "enabled" : "disabled"}`);
    });

    const slider = document.createElement("span");
    slider.className = "slider round";

    switchLabel.appendChild(checkbox);
    switchLabel.appendChild(slider);

    item.appendChild(info);
    item.appendChild(switchLabel);
    container.appendChild(item);
  }
}

function renderCustomBlocklist(domains) {
  const list = document.getElementById("custom-domain-list");
  if (!list) return;
  list.innerHTML = "";

  if (domains.length === 0) {
    const empty = document.createElement("li");
    empty.className = "domain-empty";
    empty.textContent = "No custom domains blocked yet. Enter a domain above to block it.";
    list.appendChild(empty);
    return;
  }

  domains.forEach((domain) => {
    const item = document.createElement("li");
    item.className = "domain-item";

    const span = document.createElement("span");
    span.textContent = domain;

    const btnRemove = document.createElement("button");
    btnRemove.className = "btn-remove";
    btnRemove.textContent = "Remove";
    btnRemove.dataset.domain = domain;

    btnRemove.addEventListener("click", async () => {
      await removeDomain(domain);
    });

    item.appendChild(span);
    item.appendChild(btnRemove);
    list.appendChild(item);
  });
}

async function addDomain(rawInput) {
  const domain = normalizeHostname(rawInput);
  if (!domain || !domain.includes(".")) {
    showToast("Please enter a valid domain (e.g. example.com)");
    return;
  }

  const current = await getSetting("customBlocklist", []);
  if (current.includes(domain)) {
    showToast(`${domain} is already in the blocklist`);
    return;
  }

  const updated = [...current, domain].sort();
  await setSetting("customBlocklist", updated);
  await updateDynamicBlocklist(updated);
  renderCustomBlocklist(updated);

  const input = document.getElementById("input-domain");
  if (input) input.value = "";
  showToast(`Blocked ${domain}`);
}

async function removeDomain(domain) {
  const current = await getSetting("customBlocklist", []);
  const updated = current.filter((d) => d !== domain);
  await setSetting("customBlocklist", updated);
  await updateDynamicBlocklist(updated);
  renderCustomBlocklist(updated);
  showToast(`Removed ${domain}`);
}

document.addEventListener("DOMContentLoaded", () => {
  loadOptions();

  // Master Toggle listener
  const masterToggle = document.getElementById("master-toggle");
  if (masterToggle) {
    masterToggle.addEventListener("change", async (e) => {
      const active = e.target.checked;
      await setSetting("enabled", active);
      const masterStatus = document.getElementById("master-status");
      if (masterStatus) {
        masterStatus.textContent = active ? "Enabled" : "Disabled";
        masterStatus.className = `status-label ${active ? "" : "disabled"}`;
      }
      showToast(`SFWbrowse ${active ? "enabled" : "disabled"}`);
    });
  }

  // Feature Flag listeners
  const bindFeatureToggle = (elementId, featureKey, label) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.addEventListener("change", async (e) => {
      const active = e.target.checked;
      const features = await getSetting("features", { ...DEFAULT_CONFIG.features });
      features[featureKey] = active;
      await setSetting("features", features);
      showToast(`${label} ${active ? "enabled" : "disabled"}`);
    });
  };

  bindFeatureToggle("feat-cookies", "cookiesMode", "Cookies Mode");
  bindFeatureToggle("feat-blocklist", "blocklist", "Domain Blocklist");
  bindFeatureToggle("feat-safesearch", "safeSearch", "SafeSearch Rewriter");
  bindFeatureToggle("feat-storagelock", "storageLock", "Storage Guard");

  // Add Domain listener
  const btnAddDomain = document.getElementById("btn-add-domain");
  const inputDomain = document.getElementById("input-domain");
  if (btnAddDomain && inputDomain) {
    btnAddDomain.addEventListener("click", () => addDomain(inputDomain.value));
    inputDomain.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addDomain(inputDomain.value);
    });
  }

  // Reset to Defaults
  const btnReset = document.getElementById("btn-reset");
  if (btnReset) {
    btnReset.addEventListener("click", async () => {
      await setSetting("enabled", DEFAULT_CONFIG.enabled);
      await setSetting("features", DEFAULT_CONFIG.features);
      await setSetting("overrides", DEFAULT_CONFIG.overrides);
      await setSetting("customBlocklist", DEFAULT_CONFIG.customBlocklist);
      await setSetting("cookieRulesConfig", DEFAULT_CONFIG.cookieRulesConfig);
      await updateDynamicBlocklist([]);
      await loadOptions();
      showToast("Reset to factory defaults");
    });
  }

  // Storage onChanged listener for cross-context synchronization
  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync" || areaName === "local") {
        if (changes.enabled || changes.features || changes.customBlocklist || changes.cookieRulesConfig) {
          loadOptions();
        }
      }
    });
  }
});
