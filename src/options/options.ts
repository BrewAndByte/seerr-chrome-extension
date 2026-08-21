import { getConfig, originPatternFor, setConfig, validateSeerrUrl } from "../lib/config.js";
import { testConnection } from "../lib/seerr-api.js";

const urlInput = document.getElementById("seerr-url") as HTMLInputElement;
const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;
const form = document.getElementById("config-form") as HTMLFormElement;
const testBtn = document.getElementById("test-btn") as HTMLButtonElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const statusEl = document.getElementById("status-msg") as HTMLParagraphElement;

function showStatus(kind: "success" | "error" | "info", message: string): void {
  statusEl.textContent = message;
  statusEl.className = `status visible ${kind}`;
}

async function loadSaved(): Promise<void> {
  const config = await getConfig();
  if (config) {
    urlInput.value = config.seerrUrl;
    apiKeyInput.value = config.apiKey;
  }
}

async function requestOriginPermission(seerrUrl: string): Promise<boolean> {
  const pattern = originPatternFor(seerrUrl);
  const alreadyGranted = await chrome.permissions.contains({ origins: [pattern] });
  if (alreadyGranted) return true;
  return chrome.permissions.request({ origins: [pattern] });
}

async function handleTest(): Promise<void> {
  const validation = validateSeerrUrl(urlInput.value);
  if (!validation.ok) {
    showStatus("error", validation.error ?? "Invalid URL.");
    return;
  }

  testBtn.disabled = true;
  showStatus("info", "Testing connection…");

  try {
    const granted = await requestOriginPermission(validation.normalized);
    if (!granted) {
      showStatus(
        "error",
        "Permission to contact that address was denied, so the connection couldn't be tested."
      );
      return;
    }

    const result = await testConnection({
      seerrUrl: validation.normalized,
      apiKey: apiKeyInput.value.trim(),
    });
    showStatus(result.ok ? "success" : "error", result.message);
  } catch {
    showStatus("error", "Something went wrong while testing the connection.");
  } finally {
    testBtn.disabled = false;
  }
}

async function handleSave(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  const validation = validateSeerrUrl(urlInput.value);
  if (!validation.ok) {
    showStatus("error", validation.error ?? "Invalid URL.");
    return;
  }

  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showStatus("error", "Enter your Seerr API key (Settings → General → API Key in Seerr).");
    return;
  }

  saveBtn.disabled = true;
  try {
    const granted = await requestOriginPermission(validation.normalized);
    if (!granted) {
      showStatus(
        "error",
        "Permission to contact that address was denied. The extension can't reach Seerr without it."
      );
      return;
    }

    await setConfig({ seerrUrl: validation.normalized, apiKey });
    urlInput.value = validation.normalized;
    showStatus("success", "Saved.");
  } finally {
    saveBtn.disabled = false;
  }
}

form.addEventListener("submit", (e) => void handleSave(e));
testBtn.addEventListener("click", () => void handleTest());
void loadSaved();
