import test from "node:test";
import assert from "node:assert/strict";

/**
 * Creates an in-memory mock of chrome.storage with sync failure simulation.
 */
function createStorageMock(initialSync = {}, initialLocal = {}) {
  let syncStore = { ...initialSync };
  let localStore = { ...initialLocal };
  let shouldFailSync = false;
  const changeListeners = [];

  const createArea = (getStore, areaName) => ({
    get: async (keys) => {
      if (areaName === "sync" && shouldFailSync) {
        throw new Error("QUOTA_BYTES quota exceeded");
      }
      const store = getStore();
      if (typeof keys === "string") return { [keys]: store[keys] };
      if (Array.isArray(keys)) {
        return keys.reduce((acc, k) => ({ ...acc, [k]: store[k] }), {});
      }
      if (keys && typeof keys === "object") {
        return Object.keys(keys).reduce((acc, k) => ({
          ...acc,
          [k]: store[k] !== undefined ? store[k] : keys[k],
        }), {});
      }
      return { ...store };
    },
    set: async (items) => {
      if (areaName === "sync" && shouldFailSync) {
        throw new Error("QUOTA_BYTES quota exceeded");
      }
      const store = getStore();
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: store[k], newValue: v };
        store[k] = v;
      }
      for (const listener of changeListeners) {
        listener(changes, areaName);
      }
    },
    clear: async () => {
      const store = getStore();
      for (const k of Object.keys(store)) delete store[k];
    },
  });

  return {
    storage: {
      sync: createArea(() => syncStore, "sync"),
      local: createArea(() => localStore, "local"),
      onChanged: {
        addListener: (fn) => changeListeners.push(fn),
      },
    },
    setSyncFailure: (fail) => { shouldFailSync = fail; },
    getRawSync: () => ({ ...syncStore }),
    getRawLocal: () => ({ ...localStore }),
  };
}

async function loadFreshStorageModule() {
  const cacheBuster = `?test=${Date.now()}-${Math.random()}`;
  return await import(`./storage.js${cacheBuster}`);
}

test("storage: retrieves default value when key does not exist", async () => {
  const mock = createStorageMock();
  globalThis.chrome = mock;

  const { getSetting } = await loadFreshStorageModule();
  const value = await getSetting("missingKey", "defaultValue");
  assert.equal(value, "defaultValue");
});

test("storage: persists and retrieves value from chrome.storage.sync", async () => {
  const mock = createStorageMock();
  globalThis.chrome = mock;

  const { getSetting, setSetting } = await loadFreshStorageModule();
  await setSetting("enabled", true);

  const value = await getSetting("enabled", false);
  assert.equal(value, true);
  assert.equal(mock.getRawSync().enabled, true);
});

test("storage: gracefully falls back to chrome.storage.local on sync failure", async () => {
  const mock = createStorageMock({}, { localFallbackKey: "fromLocal" });
  mock.setSyncFailure(true);
  globalThis.chrome = mock;

  const { getSetting, setSetting } = await loadFreshStorageModule();

  // Test retrieval fallback
  const retrieved = await getSetting("localFallbackKey", "default");
  assert.equal(retrieved, "fromLocal");

  // Test persistence fallback
  await setSetting("newSetting", "persistedLocally");
  assert.equal(mock.getRawLocal().newSetting, "persistedLocally");
  assert.equal(mock.getRawSync().newSetting, undefined);
});
