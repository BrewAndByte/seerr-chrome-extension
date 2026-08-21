import { checkQuery } from "../lib/text.js";

const MENU_ID = "search-seerr";

// Chrome's contextMenus API has no supported way to relabel an item with the
// live selection text before it renders (that would require a content script
// injected into every page, just to shave the label — not worth the broad
// host permission it'd require). A static label plus the real selection text
// read from `info.selectionText` in onClicked is the documented fallback.
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Search Seerr",
    contexts: ["selection"],
  });

  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;

  const check = checkQuery(info.selectionText);
  const params = new URLSearchParams();
  if (check.ok) {
    params.set("q", check.query);
  } else {
    params.set("error", check.reason ?? "empty");
  }

  chrome.tabs.create({
    url: chrome.runtime.getURL(`results/results.html?${params.toString()}`),
  });
});

// The extension has no popup, so a toolbar-icon click is a convenient
// shortcut straight to Options.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
