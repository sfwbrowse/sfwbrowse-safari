import test from "node:test";
import assert from "node:assert/strict";

function createStorageMock(initialSync = {}) {
  let syncStore = { ...initialSync };
  const changeListeners = [];

  return {
    storage: {
      sync: {
        get: async (keys) => {
          if (typeof keys === "string") return { [keys]: syncStore[keys] };
          if (keys && typeof keys === "object") {
            return Object.keys(keys).reduce((acc, k) => ({
              ...acc,
              [k]: syncStore[k] !== undefined ? syncStore[k] : keys[k],
            }), {});
          }
          return { ...syncStore };
        },
        set: async (items) => {
          const changes = {};
          for (const [k, v] of Object.entries(items)) {
            changes[k] = { oldValue: syncStore[k], newValue: v };
            syncStore[k] = v;
          }
          for (const listener of changeListeners) {
            listener(changes, "sync");
          }
        },
      },
      local: {
        get: async () => ({}),
        set: async () => {},
      },
      onChanged: {
        addListener: (fn) => changeListeners.push(fn),
      },
    },
    triggerChange: (changes, area = "sync") => {
      for (const listener of changeListeners) {
        listener(changes, area);
      }
    },
    getRawSync: () => syncStore,
  };
}

import { resetEnabledCache } from "./enabled-state.js";

async function loadFreshSiteSettingsModule() {
  resetEnabledCache();
  const cacheBuster = `?test=${Date.now()}-${Math.random()}`;
  const mod = await import(`./site-settings.js${cacheBuster}`);
  mod.resetSiteSettingsCache();
  return mod;
}

test("site-settings: normalizeHostname cleans various URL formats", async () => {
  const { normalizeHostname } = await loadFreshSiteSettingsModule();

  assert.equal(normalizeHostname("https://www.RedditP.com:443/r/funny?q=1"), "redditp.com");
  assert.equal(normalizeHostname("http://duckduckgo.com/"), "duckduckgo.com");
  assert.equal(normalizeHostname("WWW.BING.COM"), "bing.com");
  assert.equal(normalizeHostname(".teddit.net"), "teddit.net");
  assert.equal(normalizeHostname("  libreddit.kavin.rocks  "), "libreddit.kavin.rocks");
  assert.equal(normalizeHostname(""), "");
  assert.equal(normalizeHostname(null), "");
});

test("site-settings: isSiteEnabled defaults to true when global is enabled", async () => {
  const mock = createStorageMock({ enabled: true, overrides: {} });
  globalThis.chrome = mock;

  const { isSiteEnabled } = await loadFreshSiteSettingsModule();
  assert.equal(await isSiteEnabled("redditp.com"), true);
  assert.equal(await isSiteEnabled("https://duckduckgo.com"), true);
});

test("site-settings: isSiteEnabled returns false when global enabled is false", async () => {
  const mock = createStorageMock({ enabled: false, overrides: {} });
  globalThis.chrome = mock;

  const { isSiteEnabled } = await loadFreshSiteSettingsModule();
  assert.equal(await isSiteEnabled("redditp.com"), false);
});

test("site-settings: setSiteOverride allowlists a domain and isSiteEnabled returns false", async () => {
  const mock = createStorageMock({ enabled: true, overrides: {} });
  globalThis.chrome = mock;

  const { isSiteEnabled, setSiteOverride, getOverrides } = await loadFreshSiteSettingsModule();

  await setSiteOverride("https://www.redditp.com", false);
  assert.equal(await isSiteEnabled("redditp.com"), false);
  assert.equal(await isSiteEnabled("other.com"), true);

  const overrides = await getOverrides();
  assert.equal(overrides["redditp.com"], false);
});

test("site-settings: parent domain override applies to subdomain", async () => {
  const mock = createStorageMock({ enabled: true, overrides: { "example.com": false } });
  globalThis.chrome = mock;

  const { isSiteEnabled } = await loadFreshSiteSettingsModule();
  assert.equal(await isSiteEnabled("sub.example.com"), false);
  assert.equal(await isSiteEnabled("deep.sub.example.com"), false);
  assert.equal(await isSiteEnabled("other.com"), true);
});

test("site-settings: removeSiteOverride clears domain override", async () => {
  const mock = createStorageMock({ enabled: true, overrides: { "redditp.com": false } });
  globalThis.chrome = mock;

  const { isSiteEnabled, removeSiteOverride } = await loadFreshSiteSettingsModule();
  assert.equal(await isSiteEnabled("redditp.com"), false);

  await removeSiteOverride("redditp.com");
  assert.equal(await isSiteEnabled("redditp.com"), true);
});
