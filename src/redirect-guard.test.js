import test from "node:test";
import assert from "node:assert/strict";

function createTabsMock() {
  const listeners = [];
  return {
    tabs: {
      onRemoved: {
        addListener: (fn) => listeners.push(fn),
      },
    },
    triggerRemoved: (tabId) => {
      for (const listener of listeners) listener(tabId);
    },
  };
}

async function loadFreshRedirectGuardModule() {
  const cacheBuster = `?test=${Date.now()}-${Math.random()}`;
  return await import(`./redirect-guard.js${cacheBuster}`);
}

test("redirect-guard: allows initial navigation and redirects under limit", async () => {
  const { isRedirectLoop, resetRedirectGuard } = await loadFreshRedirectGuardModule();
  resetRedirectGuard();

  const tabId = 1;
  const baseTime = 100000;

  // 1st navigation -> ok
  assert.equal(isRedirectLoop(tabId, baseTime), false);
  // 2nd navigation -> ok
  assert.equal(isRedirectLoop(tabId, baseTime + 500), false);
  // 3rd navigation -> ok
  assert.equal(isRedirectLoop(tabId, baseTime + 1000), false);
  // 4th navigation within 5000ms -> LOOP DETECTED
  assert.equal(isRedirectLoop(tabId, baseTime + 1500), true);
});

test("redirect-guard: slides window and allows navigation after WINDOW_MS expires", async () => {
  const { isRedirectLoop, resetRedirectGuard, WINDOW_MS } = await loadFreshRedirectGuardModule();
  resetRedirectGuard();

  const tabId = 2;
  const baseTime = 200000;

  assert.equal(isRedirectLoop(tabId, baseTime), false);
  assert.equal(isRedirectLoop(tabId, baseTime + 500), false);
  assert.equal(isRedirectLoop(tabId, baseTime + 1000), false);
  assert.equal(isRedirectLoop(tabId, baseTime + 1500), true);

  // Advance time past WINDOW_MS (e.g. baseTime + 6000)
  assert.equal(isRedirectLoop(tabId, baseTime + WINDOW_MS + 2000), false);
});

test("redirect-guard: isolates history per tabId", async () => {
  const { isRedirectLoop, resetRedirectGuard } = await loadFreshRedirectGuardModule();
  resetRedirectGuard();

  const tab1 = 10;
  const tab2 = 20;
  const baseTime = 300000;

  assert.equal(isRedirectLoop(tab1, baseTime), false);
  assert.equal(isRedirectLoop(tab1, baseTime + 100), false);
  assert.equal(isRedirectLoop(tab1, baseTime + 200), false);
  assert.equal(isRedirectLoop(tab1, baseTime + 300), true);

  // Tab 2 should be completely independent
  assert.equal(isRedirectLoop(tab2, baseTime + 400), false);
});

test("redirect-guard: cleanupTabHistory removes tab tracking", async () => {
  const { isRedirectLoop, cleanupTabHistory, resetRedirectGuard } = await loadFreshRedirectGuardModule();
  resetRedirectGuard();

  const tabId = 3;
  const baseTime = 400000;

  assert.equal(isRedirectLoop(tabId, baseTime), false);
  assert.equal(isRedirectLoop(tabId, baseTime + 100), false);
  assert.equal(isRedirectLoop(tabId, baseTime + 200), false);
  assert.equal(isRedirectLoop(tabId, baseTime + 300), true);

  // Clean up tab
  cleanupTabHistory(tabId);

  // Should start fresh
  assert.equal(isRedirectLoop(tabId, baseTime + 400), false);
});

test("redirect-guard: cleans up history on chrome.tabs.onRemoved event", async () => {
  const mock = createTabsMock();
  globalThis.chrome = mock;

  const { isRedirectLoop, resetRedirectGuard } = await loadFreshRedirectGuardModule();
  resetRedirectGuard();

  const tabId = 4;
  const baseTime = 500000;

  assert.equal(isRedirectLoop(tabId, baseTime), false);
  assert.equal(isRedirectLoop(tabId, baseTime + 100), false);
  assert.equal(isRedirectLoop(tabId, baseTime + 200), false);
  assert.equal(isRedirectLoop(tabId, baseTime + 300), true);

  // Trigger tab removal event
  mock.triggerRemoved(tabId);

  // Tab should be reset
  assert.equal(isRedirectLoop(tabId, baseTime + 400), false);
});

test("redirect-guard: gracefully ignores invalid tab IDs", async () => {
  const { isRedirectLoop } = await loadFreshRedirectGuardModule();
  assert.equal(isRedirectLoop(-1), false);
  assert.equal(isRedirectLoop(undefined), false);
  assert.equal(isRedirectLoop(null), false);
});
