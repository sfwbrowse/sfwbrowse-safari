import test from "node:test";
import assert from "node:assert/strict";

function createMockWindow(initialStorage = {}) {
  const store = { ...initialStorage };
  const eventListeners = {};

  class MockStorage {
    getItem(key) {
      return key in store ? store[key] : null;
    }
    setItem(key, value) {
      store[key] = String(value);
    }
    removeItem(key) {
      delete store[key];
    }
    clear() {
      for (const k of Object.keys(store)) delete store[k];
    }
    get raw() {
      return { ...store };
    }
  }

  const localStorageInstance = new MockStorage();

  return {
    Storage: MockStorage,
    localStorage: localStorageInstance,
    addEventListener: (type, fn) => {
      eventListeners[type] = eventListeners[type] || [];
      eventListeners[type].push(fn);
    },
    triggerEvent: (type, event) => {
      for (const fn of eventListeners[type] || []) {
        fn(event);
      }
    },
    getStore: () => store,
  };
}

async function loadFreshTrodditModule() {
  globalThis.__SFW_TEST__ = true;
  const cacheBuster = `?test=${Date.now()}-${Math.random()}`;
  return await import(`./content-troddit.js${cacheBuster}`);
}

test("content-troddit: Tier 1 initializes nsfw key to 'false' at document start", async () => {
  const mockWin = createMockWindow({ nsfw: "true", otherKey: "preserved" });
  const { initTrodditGuard } = await loadFreshTrodditModule();

  initTrodditGuard(mockWin);

  assert.equal(mockWin.localStorage.getItem("nsfw"), "false");
  assert.equal(mockWin.localStorage.getItem("otherKey"), "preserved");
});

test("content-troddit: Tier 2 intercepts setItem mutations and coerces nsfw to 'false'", async () => {
  const mockWin = createMockWindow();
  const { initTrodditGuard } = await loadFreshTrodditModule();

  initTrodditGuard(mockWin);

  // Attempt to set nsfw to true as string
  mockWin.localStorage.setItem("nsfw", "true");
  assert.equal(mockWin.localStorage.getItem("nsfw"), "false");

  // Attempt to set nsfw to true as boolean
  mockWin.localStorage.setItem("nsfw", true);
  assert.equal(mockWin.localStorage.getItem("nsfw"), "false");

  // Unrelated keys should operate normally
  mockWin.localStorage.setItem("theme", "dark");
  assert.equal(mockWin.localStorage.getItem("theme"), "dark");
});

test("content-troddit: Tier 3 traps cross-tab storage event tampering and reverts to 'false'", async () => {
  const mockWin = createMockWindow();
  const { initTrodditGuard } = await loadFreshTrodditModule();

  initTrodditGuard(mockWin);

  // Directly tamper backing store and trigger window storage event
  mockWin.getStore().nsfw = "true";
  mockWin.triggerEvent("storage", { key: "nsfw", newValue: "true" });

  assert.equal(mockWin.localStorage.getItem("nsfw"), "false");
});
