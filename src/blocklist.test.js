import test from "node:test";
import assert from "node:assert/strict";

function createDNRMock(initialRules = []) {
  let dynamicRules = [...initialRules];
  let storageStore = { customBlocklist: [] };

  return {
    declarativeNetRequest: {
      getDynamicRules: async () => [...dynamicRules],
      updateDynamicRules: async ({ removeRuleIds = [], addRules = [] }) => {
        dynamicRules = dynamicRules.filter((r) => !removeRuleIds.includes(r.id));
        dynamicRules.push(...addRules);
      },
    },
    storage: {
      sync: {
        get: async (keys) => {
          if (typeof keys === "string") return { [keys]: storageStore[keys] };
          if (keys && typeof keys === "object") {
            return Object.keys(keys).reduce((acc, k) => ({
              ...acc,
              [k]: storageStore[k] !== undefined ? storageStore[k] : keys[k],
            }), {});
          }
          return { ...storageStore };
        },
        set: async (items) => {
          storageStore = { ...storageStore, ...items };
        },
      },
      local: {
        get: async () => ({}),
        set: async () => {},
      },
      onChanged: {
        addListener: () => {},
      },
    },
    getDynamicRulesSnapshot: () => [...dynamicRules],
  };
}

async function loadFreshBlocklistModule() {
  const cacheBuster = `?test=${Date.now()}-${Math.random()}`;
  return await import(`./blocklist.js${cacheBuster}`);
}

test("blocklist: updateDynamicBlocklist creates redirect and block rules with non-colliding IDs", async () => {
  const mock = createDNRMock();
  globalThis.chrome = mock;

  const { updateDynamicBlocklist, DYNAMIC_RULE_START_ID } = await loadFreshBlocklistModule();

  await updateDynamicBlocklist(["badsite.com", "https://another-explicit.net/path"]);

  const rules = mock.getDynamicRulesSnapshot();
  assert.equal(rules.length, 4); // 2 rules per domain

  // Verify Domain 1 rules
  const mainFrameRule1 = rules.find((r) => r.id === DYNAMIC_RULE_START_ID);
  assert.ok(mainFrameRule1);
  assert.equal(mainFrameRule1.action.type, "redirect");
  assert.ok(mainFrameRule1.action.redirect.extensionPath.includes("badsite.com"));
  assert.deepEqual(mainFrameRule1.condition.resourceTypes, ["main_frame"]);

  const subresourceRule1 = rules.find((r) => r.id === DYNAMIC_RULE_START_ID + 1);
  assert.ok(subresourceRule1);
  assert.equal(subresourceRule1.action.type, "block");

  // Verify Domain 2 rules (normalized hostname: another-explicit.net)
  const mainFrameRule2 = rules.find((r) => r.id === DYNAMIC_RULE_START_ID + 2);
  assert.ok(mainFrameRule2);
  assert.ok(mainFrameRule2.action.redirect.extensionPath.includes("another-explicit.net"));
});

test("blocklist: updateDynamicBlocklist clears previous dynamic rules but preserves others", async () => {
  // Pre-seed an unrelated rule (e.g. ID 100 SafeSearch rule, ID 90001 session rule)
  const initial = [
    { id: 101, action: { type: "redirect" }, condition: { urlFilter: "google" } },
    { id: 2000, action: { type: "block" }, condition: { urlFilter: "oldbad" } },
    { id: 95000, action: { type: "allow" }, condition: { urlFilter: "allowed" } },
  ];
  const mock = createDNRMock(initial);
  globalThis.chrome = mock;

  const { updateDynamicBlocklist } = await loadFreshBlocklistModule();

  await updateDynamicBlocklist(["newbad.com"]);

  const rules = mock.getDynamicRulesSnapshot();
  // Should preserve ID 101 and 95000
  assert.ok(rules.some((r) => r.id === 101));
  assert.ok(rules.some((r) => r.id === 95000));
  // Old ID 2000 should be removed, new 2000 & 2001 added for newbad.com
  const newRule = rules.find((r) => r.id === 2000);
  assert.ok(newRule.action.redirect.extensionPath.includes("newbad.com"));
});

test("blocklist: addCustomBlockDomain and removeCustomBlockDomain update storage and rules", async () => {
  const mock = createDNRMock();
  globalThis.chrome = mock;

  const { addCustomBlockDomain, removeCustomBlockDomain, getCustomBlocklist } = await loadFreshBlocklistModule();

  // Add domain
  const afterAdd = await addCustomBlockDomain("www.explicit-test.com");
  assert.deepEqual(afterAdd, ["explicit-test.com"]);
  assert.deepEqual(await getCustomBlocklist(), ["explicit-test.com"]);
  assert.equal(mock.getDynamicRulesSnapshot().length, 2);

  // Remove domain
  const afterRemove = await removeCustomBlockDomain("explicit-test.com");
  assert.deepEqual(afterRemove, []);
  assert.deepEqual(await getCustomBlocklist(), []);
  assert.equal(mock.getDynamicRulesSnapshot().length, 0);
});
