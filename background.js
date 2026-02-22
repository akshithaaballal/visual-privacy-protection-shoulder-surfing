// background.js - Privacy Guard (Face Detection)

// Default configuration
const DEFAULTS = {
  enabled: true,
  holdSeconds: 10,
  eyeOpenThreshold: 0.35,
  maxYawDegrees: 20,
  actionMode: "both",
};

const DETECTOR_PAGE = "detector.html";
let detectorWindowId = null;

console.log("[PG] background service worker started");

// Create (or reuse) a minimized popup window that runs the detector page
async function ensureHiddenDetectorWindow() {
  if (detectorWindowId !== null) {
    try {
      const w = await chrome.windows.get(detectorWindowId);
      if (w && !w.incognito) {
        // Already have a detector window
        return;
      }
    } catch (e) {
      detectorWindowId = null;
    }
  }

  try {
    const win = await chrome.windows.create({
      url: chrome.runtime.getURL(DETECTOR_PAGE),
      type: "popup",
      width: 300,
      height: 200,
      focused: false,
    });
    detectorWindowId = win.id;
    // Minimize so it stays out of the way
    await chrome.windows.update(detectorWindowId, { state: "minimized" });
    console.log("[PG] detector window created, id =", detectorWindowId);
  } catch (err) {
    console.error("[PG] Failed to create detector window:", err);
    detectorWindowId = null;
  }
}

async function closeHiddenDetectorWindow() {
  if (detectorWindowId == null) return;
  try {
    await chrome.windows.remove(detectorWindowId);
  } catch (e) {
    // ignore
  } finally {
    detectorWindowId = null;
  }
}

// When config toggles, ensure detector window exists (if enabled) or close it
async function handleConfigChange() {
  const cfg = await chrome.storage.sync.get({ enabled: true });
  if (cfg.enabled) {
    await ensureHiddenDetectorWindow();
    chrome.runtime.sendMessage({ type: "PG_CFG_PUSH" });
  } else {
    await closeHiddenDetectorWindow();
  }
}

// Safely send blur trigger to the active tab
async function triggerActiveTab(payload) {
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) return;

    const url = tab.url || "";
    // Avoid chrome://, edge://, file://, etc.
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      console.debug("[PG] Not sending PG_TRIGGER to non-webpage:", url);
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { type: "PG_TRIGGER", payload },
      () => {
        if (chrome.runtime.lastError) {
          // This is expected on pages without our content script
          console.debug(
            "[PG] triggerActiveTab: no content script on tab:",
            chrome.runtime.lastError.message
          );
        }
      }
    );
  } catch (err) {
    console.warn("[PG] triggerActiveTab error:", err);
  }
}

// Startup / install hooks
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[PG] onInstalled");
  const cfg = await chrome.storage.sync.get({ enabled: true });
  if (cfg.enabled) {
    await ensureHiddenDetectorWindow();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[PG] onStartup");
  const cfg = await chrome.storage.sync.get({ enabled: true });
  if (cfg.enabled) {
    await ensureHiddenDetectorWindow();
  }
});

// Main message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === "GET_CFG") {
    chrome.storage.sync.get(DEFAULTS, (cfg) => {
      sendResponse(cfg);
    });
    return true; // async
  }

  if (msg.type === "CFG_UPDATED") {
    handleConfigChange();
    return;
  }

  if (msg.type === "PG_ALERT") {
    triggerActiveTab(msg.payload || {});
    return;
  }
});
