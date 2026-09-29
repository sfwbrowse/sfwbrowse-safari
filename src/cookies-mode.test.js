import test from "node:test";
import assert from "node:assert/strict";
import { resetEnabledCache } from "./enabled-state.js";
import { resetSiteSettingsCache } from "./site-settings.js";

function createMockEnvironment(initialCookies = [], initialSync = {}) {
  const jar = new Map();
  const cookieListeners = [];
  let syncStore = { enabled: true, overrides: {}, cookieRulesConfig: {}, ...initialSync };
  const storageListeners = [];

  const keyFor = (domain, name) => `${(domain || "").replace(/^\./, "").toLowerCase()}:${name}`;

  for (const c of initialCookies) {
    jar.set(keyFor(c.domain, c.name), { ...c });
  }

  const mock = {
    cookies: {
      get: async ({ url, name }) => {
        const hostname = new URL(url).hostname;
        const key = keyFor(hostname, name);
        if (jar.has(key)) return { ...jar.get(key) };
        // Check with leading dot or parent domains
        for (const [k, v] of jar.entries()) {
          const [d, n] = k.split(":");
          if (n === name && (hostname === d || hostname.endsWith("." + d))) {
            return { ...v };
          }
        }
        return null;
      },
      getAll: async () => Array.from(jar.values()),
      set: async (details) => {
        const domain = details.domain || new URL(details.url).hostname;
        const cookie = {
          name: details.name,
          value: String(details.value),
          domain,
          path: details.path || "/",
          secure: Boolean(details.secure),
        };
        jar.set(keyFor(domain, details.name), cookie);
        for (const listener of cookieListeners) {
          listener({ removed: false, cookie, cause: "explicit" });
        }
        return cookie;
      },
      remove: async ({ url, name }) => {
        const hostname = new URL(url).hostname;
        const key = keyFor(hostname, name);
        const existing = jar.get(key);
        if (existing) {
          jar.delete(key);
          for (const listener of cookieListeners) {
            listener({ removed: true, cookie: existing });
          }
        }
      },
      onChanged: {
        addListener: (fn) => cookieListeners.push(fn),
      },
    },
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
          for (const listener of storageListeners) {
            listener(changes, "sync");
          }
        },
      },
      local: {
        get: async () => ({}),
        set: async () => {},
      },
      onChanged: {
        addListener: (fn) => storageListeners.push(fn),
      },
    },
    triggerCookieChange: (cookie, removed = false) => {
      for (const listener of cookieListeners) {
        listener({ removed, cookie, cause: "explicit" });
      }
    },
    getCookie: (domain, name) => jar.get(keyFor(domain, name)),
    getJar: () => Array.from(jar.values()),
  };

  return mock;
}

async function loadFreshCookiesModule() {
  resetEnabledCache();
  resetSiteSettingsCache();
  const cacheBuster = `?test=${Date.now()}-${Math.random()}`;
  return await import(`./cookies-mode.js${cacheBuster}`);
}

test("cookies-mode: sets safe cookie when missing", async () => {
  const mock = createMockEnvironment();
  globalThis.chrome = mock;

  const { enforceCookieRule } = await loadFreshCookiesModule();

  const redditpRule = {
    id: "redditp",
    name: "RedditP",
    domains: ["redditp.com"],
    targetUrl: "https://www.redditp.com/",
    cookies: [
      { name: "nsfwCookie", value: "false", domain: ".redditp.com", path: "/" },
    ],
  };

  await enforceCookieRule(redditpRule);

  const cookie = mock.getCookie("redditp.com", "nsfwCookie");
  assert.ok(cookie);
  assert.equal(cookie.value, "false");
});

test("cookies-mode: corrects tampered unsafe cookie value", async () => {
  const initial = [
    { domain: ".redditp.com", name: "nsfwCookie", value: "true", path: "/" },
  ];
  const mock = createMockEnvironment(initial);
  globalThis.chrome = mock;

  const { enforceCookieRule } = await loadFreshCookiesModule();

  const redditpRule = {
    id: "redditp",
    name: "RedditP",
    domains: ["redditp.com"],
    targetUrl: "https://www.redditp.com/",
    cookies: [
      { name: "nsfwCookie", value: "false", domain: ".redditp.com", path: "/" },
    ],
  };

  await enforceCookieRule(redditpRule);

  const cookie = mock.getCookie("redditp.com", "nsfwCookie");
  assert.equal(cookie.value, "false");
});

test("cookies-mode: respects global enabled = false", async () => {
  const mock = createMockEnvironment([], { enabled: false });
  globalThis.chrome = mock;

  const { enforceCookieRule } = await loadFreshCookiesModule();

  const rule = {
    id: "redditp",
    domains: ["redditp.com"],
    targetUrl: "https://www.redditp.com/",
    cookies: [{ name: "nsfwCookie", value: "false", domain: ".redditp.com" }],
  };

  await enforceCookieRule(rule);
  assert.equal(mock.getCookie("redditp.com", "nsfwCookie"), undefined);
});

test("cookies-mode: respects site allowlist override", async () => {
  const mock = createMockEnvironment([], { overrides: { "redditp.com": false } });
  globalThis.chrome = mock;

  const { enforceCookieRule } = await loadFreshCookiesModule();

  const rule = {
    id: "redditp",
    domains: ["redditp.com"],
    targetUrl: "https://www.redditp.com/",
    cookies: [{ name: "nsfwCookie", value: "false", domain: ".redditp.com" }],
  };

  await enforceCookieRule(rule);
  assert.equal(mock.getCookie("redditp.com", "nsfwCookie"), undefined);
});

test("cookies-mode: respects per-rule toggle in cookieRulesConfig", async () => {
  const mock = createMockEnvironment([], { cookieRulesConfig: { redditp: false } });
  globalThis.chrome = mock;

  const { enforceCookieRule } = await loadFreshCookiesModule();

  const rule = {
    id: "redditp",
    domains: ["redditp.com"],
    targetUrl: "https://www.redditp.com/",
    cookies: [{ name: "nsfwCookie", value: "false", domain: ".redditp.com" }],
  };

  await enforceCookieRule(rule);
  assert.equal(mock.getCookie("redditp.com", "nsfwCookie"), undefined);
});

test("cookies-mode: setupCookieWatcher automatically heals deleted safety cookie", async () => {
  const initial = [
    { domain: ".redditp.com", name: "nsfwCookie", value: "false", path: "/" },
  ];
  const mock = createMockEnvironment(initial);
  globalThis.chrome = mock;

  const { setupCookieWatcher } = await loadFreshCookiesModule();
  setupCookieWatcher();

  // Simulate user / script deleting cookie
  mock.triggerCookieChange(
    { domain: ".redditp.com", name: "nsfwCookie", value: "false", path: "/" },
    true // removed
  );

  // Give microtasks a cycle to resolve
  await new Promise((resolve) => setTimeout(resolve, 10));

  const restored = mock.getCookie("redditp.com", "nsfwCookie");
  assert.ok(restored);
  assert.equal(restored.value, "false");
});

test("cookies-mode: setupCookieWatcher automatically heals tampered unsafe cookie value", async () => {
  const mock = createMockEnvironment();
  globalThis.chrome = mock;

  const { setupCookieWatcher } = await loadFreshCookiesModule();
  setupCookieWatcher();

  // Simulate user setting nsfwCookie = true in devtools
  mock.triggerCookieChange(
    { domain: ".redditp.com", name: "nsfwCookie", value: "true", path: "/" },
    false // not removed, but value changed
  );

  await new Promise((resolve) => setTimeout(resolve, 10));

  const restored = mock.getCookie("redditp.com", "nsfwCookie");
  assert.ok(restored);
  assert.equal(restored.value, "false");
});
