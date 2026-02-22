const DEFAULTS = {
  enabled: true,
  holdSeconds: 10,
  eyeOpenThreshold: 0.35, // 0..1 (heuristic via EAR proxy)
  maxYawDegrees: 20,      // how front-facing the head must be
  actionMode: "both"
};

async function load() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  document.getElementById('toggleEnabled').checked = cfg.enabled;
  document.getElementById('holdSeconds').value = cfg.holdSeconds;
  document.getElementById('eyeOpenThreshold').value = cfg.eyeOpenThreshold;
  document.getElementById('maxYawDegrees').value = cfg.maxYawDegrees;
  document.getElementById('actionMode').value = cfg.actionMode;
}

async function save() {
  const cfg = {
    enabled: document.getElementById('toggleEnabled').checked,
    holdSeconds: Number(document.getElementById('holdSeconds').value),
    eyeOpenThreshold: Number(document.getElementById('eyeOpenThreshold').value),
    maxYawDegrees: Number(document.getElementById('maxYawDegrees').value),
    actionMode: document.getElementById('actionMode').value
  };
  await chrome.storage.sync.set(cfg);
  // Tell background to (re)start/stop
  chrome.runtime.sendMessage({ type: 'CFG_UPDATED' });
}

document.getElementById('save').addEventListener('click', save);

document.getElementById('test').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'PG_TRIGGER' });
  }
});

load();
