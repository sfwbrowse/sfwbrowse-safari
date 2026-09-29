/**
 * SFWbrowse - Client-Side Storage Guard (Troddit & SPAs)
 *
 * Enforces and locks HTML5 localStorage content filtering flags
 * on Single Page Applications (e.g. Troddit) where adult preferences are
 * maintained in browser web storage rather than HTTP request cookies.
 *
 * Injected at run_at: "document_start" before page framework scripts initialize.
 */

/**
 * Initializes the 3-tier storage lock on the specified window context.
 *
 * @param {Window|object} targetWindow - Window context containing localStorage & Storage
 * @returns {void}
 */
export function initTrodditGuard(targetWindow = globalThis.window) {
  if (!targetWindow || !targetWindow.localStorage) return;

  const TARGET_KEY = "nsfw";
  const SAFE_VALUE = "false";

  try {
    // Tier 1: Immediately enforce safe value at document start
    if (targetWindow.localStorage.getItem(TARGET_KEY) !== SAFE_VALUE) {
      targetWindow.localStorage.setItem(TARGET_KEY, SAFE_VALUE);
    }

    // Tier 2: Intercept setter mutations from web application code
    const storageProto = targetWindow.Storage?.prototype || Object.getPrototypeOf(targetWindow.localStorage);
    if (storageProto && storageProto.setItem) {
      const originalSetItem = storageProto.setItem;
      storageProto.setItem = function (key, value) {
        if (key === TARGET_KEY && String(value).toLowerCase() !== SAFE_VALUE) {
          return originalSetItem.call(this, key, SAFE_VALUE);
        }
        return originalSetItem.call(this, key, value);
      };
    }

    // Tier 3: Guard against cross-tab storage tampering
    if (typeof targetWindow.addEventListener === "function") {
      targetWindow.addEventListener("storage", (event) => {
        if (event.key === TARGET_KEY && event.newValue !== SAFE_VALUE) {
          try {
            targetWindow.localStorage.setItem(TARGET_KEY, SAFE_VALUE);
          } catch {
            // Silently handle quota / security sandbox errors
          }
        }
      });
    }
  } catch (err) {
    // Fail silently in sandboxed iframe contexts or restricted origins
    console.debug("[SFWbrowse] Troddit storage guard initial execution error:", err);
  }
}

// Auto-run when injected directly as a browser content script
if (typeof window !== "undefined" && typeof window.localStorage !== "undefined" && !globalThis.__SFW_TEST__) {
  initTrodditGuard(window);
}
