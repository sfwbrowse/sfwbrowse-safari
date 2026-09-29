/**
 * SFWbrowse - Blocked Screen Controller
 */

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const domain = params.get("domain") || "this website";

  const domainEl = document.getElementById("blocked-domain");
  if (domainEl) {
    domainEl.textContent = domain;
  }

  const btnBack = document.getElementById("btn-back");
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = "https://duckduckgo.com";
      }
    });
  }

  const btnOptions = document.getElementById("btn-options");
  if (btnOptions) {
    btnOptions.addEventListener("click", () => {
      if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.location.href = "options/options.html";
      }
    });
  }
});
