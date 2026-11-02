// A single-click action. No popup, page-wide permissions, analytics, or network requests.
// Chromium runs a service worker; Firefox and some Safari builds run scripts
// from background.scripts. Both load the same code without bundling.
if (typeof importScripts === "function") importScripts("unread-icon.js");
const STORE_KEY = "markedTabs";
const DEFAULT_AUTO_CLEAR_SECONDS = 1;

// Prevent concurrent tabs, auto-clear messages and navigation from overwriting
// each other's shared chrome.storage.session object.
let mutationQueue = Promise.resolve();
function serializeMutation(action) {
  const result = mutationQueue.then(action);
  mutationQueue = result.catch((error) => {
    console.error("Unread state mutation failed", error);
  });
  return result;
}

async function readStates() {
  const result = await chrome.storage.session.get(STORE_KEY);
  return result[STORE_KEY] || {};
}

const GREEN_ICON = {
  16: "/assets/icons/green-dot-16.png",
  32: "/assets/icons/green-dot-32.png"
};
const YELLOW_ICON = {
  16: "/assets/icons/dot-16.png",
  32: "/assets/icons/dot-32.png"
};

async function setActionState(tabId, marked) {
  await chrome.action.setIcon({ tabId, path: marked ? YELLOW_ICON : GREEN_ICON });
  await chrome.action.setTitle({ tabId, title: marked ? "Mark as read" : "Mark as unread" });
}

async function markedIconFor() {
  // Render the original full-size unread icon, exactly as Chat Dinger does.
  // Compositing an icon on top of a site's favicon makes the mark appear
  // smaller at the 16 px tab size. Unmarking restores the site's original icon.
  return UNREAD_ICON_DATA;
}

async function inject(tabId, marked, state = {}) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/content.js"]
  });
  await chrome.tabs.sendMessage(tabId, {
    type: "setUnreadMark", marked,
    icon: state.icon || "",
    markId: state.markId || "",
    autoClearSeconds: state.autoClearSeconds ?? DEFAULT_AUTO_CLEAR_SECONDS
  });
}

async function toggleTab(tab) {
  if (!tab.id) return;
  const key = String(tab.id);
  try {
    const states = await readStates();
    const current = states[key];
    const url = tab.url || "";
    const turningOn = !(current && current.url === url);
    const autoClearSeconds = (await chrome.storage.sync.get({
      autoClearSeconds: DEFAULT_AUTO_CLEAR_SECONDS
    })).autoClearSeconds;
    const nextState = turningOn ? {
      url,
      icon: await markedIconFor(),
      markId: crypto.randomUUID(),
      fallback: true,
      hasLeft: false,
      autoClearSeconds: [0, 1, 2, 5, -1].includes(autoClearSeconds)
        ? autoClearSeconds : DEFAULT_AUTO_CLEAR_SECONDS
    } : {};

    if (turningOn && /^(https?:|file:)/i.test(url)) {
      try {
        await inject(tab.id, true, nextState);
        nextState.fallback = false;
      } catch {
        // The local-file permission may be disabled, or Edge may host this
        // tab in a protected PDF viewer. The toolbar can still mark the tab.
      }
    } else if (!turningOn && current && !current.fallback) {
      try { await inject(tab.id, false); } catch { /* page no longer injectable */ }
    }

    if (turningOn) states[key] = nextState;
    else delete states[key];
    await chrome.storage.session.set({ [STORE_KEY]: states });
    await setActionState(tab.id, turningOn);
  } catch (error) {
    console.error("Unable to toggle unread mark", error);
  }
}

// Serialize rapid repeated clicks on the same tab so the second click cancels
// the first instead of reading stale state while the first icon is rendering.
const pendingClicks = new Map();
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  const prior = pendingClicks.get(tab.id) || Promise.resolve();
  const current = prior.then(() => serializeMutation(() => toggleTab(tab)));
  pendingClicks.set(tab.id, current);
  void current.finally(() => {
    if (pendingClicks.get(tab.id) === current) pendingClicks.delete(tab.id);
  });
});

// Show the existing settings page once after the first installation.
// Users installing from a browser store may never visit the GitHub README.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== "install") return;
  if (typeof chrome.runtime.openOptionsPage !== "function") return;
  void chrome.runtime.openOptionsPage().catch((error) => {
    console.warn("Could not open first-run guide", error);
  });
});

chrome.tabs.onUpdated.addListener((tabId, info) => serializeMutation(async () => {
  const key = String(tabId);
  const states = await readStates();
  const state = states[key];
  if (!state) return;

  if (info.url && info.url !== state.url) {
    delete states[key];
    await chrome.storage.session.set({ [STORE_KEY]: states });
    await setActionState(tabId, false);
    // A history.pushState() navigation keeps the document and its favicon.
    // Explicitly restore it; a full navigation may already have discarded it.
    try { await inject(tabId, false); } catch { /* document was replaced */ }
  } else if (info.status === "complete") {
    try {
      await setActionState(tabId, true);
      if (!state.fallback) await inject(tabId, true, state);
    } catch (error) {
      console.warn("Could not restore unread mark after reload", error);
    }
  }
}));

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "autoClearUnread" || !sender.tab?.id) return;
  void serializeMutation(async () => {
    const tabId = sender.tab.id;
    const states = await readStates();
    const state = states[String(tabId)];
    if (!state || state.markId !== message.markId || state.url !== sender.tab.url) return;
    try { await inject(tabId, false); } catch { /* page no longer injectable */ }
    delete states[String(tabId)];
    await chrome.storage.session.set({ [STORE_KEY]: states });
    await setActionState(tabId, false);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => serializeMutation(async () => {
  const states = await readStates();
  delete states[String(tabId)];
  await chrome.storage.session.set({ [STORE_KEY]: states });
}));

// Protected tabs (such as the built-in PDF viewer) cannot run a content script.
// Track their return in the background so the toolbar-only mark still clears.
let fallbackTimer = null;
async function focusFallbackTab(tabId) {
  if (fallbackTimer) clearTimeout(fallbackTimer);
  fallbackTimer = null;
  const states = await readStates();
  let changed = false;
  for (const [id, state] of Object.entries(states)) {
    if (state.fallback && Number(id) !== tabId && !state.hasLeft) {
      state.hasLeft = true;
      changed = true;
    }
  }
  if (changed) await chrome.storage.session.set({ [STORE_KEY]: states });
  const current = states[String(tabId)];
  if (!current?.fallback || !current.hasLeft || current.autoClearSeconds < 0) return;
  const clear = () => void serializeMutation(async () => {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const latest = await readStates();
    if (!tab?.active || latest[String(tabId)]?.markId !== current.markId) return;
    delete latest[String(tabId)];
    await chrome.storage.session.set({ [STORE_KEY]: latest });
    await setActionState(tabId, false);
  });
  if (current.autoClearSeconds === 0) clear();
  else fallbackTimer = setTimeout(clear, current.autoClearSeconds * 1000);
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void serializeMutation(() => focusFallbackTab(tabId));
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  void serializeMutation(async () => {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab?.id) await focusFallbackTab(tab.id);
  });
});
