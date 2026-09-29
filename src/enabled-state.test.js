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

async function loadFreshEnabledModule() {
  const cacheBuster = `?test=${Date.now()}-${Math.random()}`;
  return await import(`./enabled-state.js${cacheBuster}`);
}

test("enabled-state: defaults to true when not set in storage", async () => {
  const mock = createStorageMock();
  globalThis.chrome = mock;

  const { getEnabled } = await loadFreshEnabledModule();
  const enabled = await getEnabled();
  assert.equal(enabled, true);
});

test("enabled-state: caches value and invalidates on storage.onChanged", async () => {
  const mock = createStorageMock({ enabled: true });
  globalThis.chrome = mock;

  const { getEnabled } = await loadFreshEnabledModule();
  assert.equal(await getEnabled(), true);

  // Directly modify backing store without triggering storage API to test cache hit
  mock.getRawSync().enabled = false;
  // Should still be cached as true
  assert.equal(await getEnabled(), true);

  // Trigger storage change event to invalidate cache
  mock.triggerChange({ enabled: { oldValue: true, newValue: false } }, "sync");
  // Next read should fetch updated false value
  assert.equal(await getEnabled(), false);
});

test("enabled-state: setEnabled updates both cache and storage", async () => {
  const mock = createStorageMock();
  globalThis.chrome = mock;

  const { getEnabled, setEnabled } = await loadFreshEnabledModule();
  await setEnabled(false);

  assert.equal(mock.getRawSync().enabled, false);
  assert.equal(await getEnabled(), false);
});
