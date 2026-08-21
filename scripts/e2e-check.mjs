// One-off local verification script (not part of the shipped project or the
// unit-test suite). Loads the built extension into headless Chrome via
// Puppeteer and exercises the real options + results pages against a live
// Seerr instance, to catch anything the unit tests can't (manifest errors,
// service worker startup, actual DOM rendering, a real network round trip).
import puppeteer from "puppeteer";

const SEERR_URL = process.env.SEERR_URL;
const SEERR_API_KEY = process.env.SEERR_API_KEY;
const EXT_PATH = "/app/test-dist";

if (!SEERR_URL || !SEERR_API_KEY) {
  console.error("SEERR_URL and SEERR_API_KEY env vars are required");
  process.exit(1);
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ok - ${msg}`);
}

const browser = await puppeteer.launch({
  headless: "new",
  args: [
    `--disable-extensions-except=${EXT_PATH}`,
    `--load-extension=${EXT_PATH}`,
    "--no-sandbox",
  ],
});

try {
  console.log("Waiting for the extension's service worker to start...");
  const workerTarget = await browser.waitForTarget(
    (t) => t.type() === "service_worker" && t.url().includes("background.js"),
    { timeout: 10000 }
  );
  const extensionId = new URL(workerTarget.url()).host;
  console.log(`Service worker started cleanly. Extension ID: ${extensionId}`);

  // --- Options page: save + test connection (happy path) ---
  console.log("\n[Options] happy path");
  const optionsPage = await browser.newPage();
  optionsPage.on("pageerror", (e) => console.error("  PAGE ERROR:", e));
  await optionsPage.goto(`chrome-extension://${extensionId}/options/options.html`);

  await optionsPage.type("#seerr-url", SEERR_URL);
  await optionsPage.type("#api-key", SEERR_API_KEY);
  await optionsPage.click("#test-btn");
  await optionsPage.waitForFunction(
    () => document.getElementById("status-msg").textContent !== "Testing connection…",
    { timeout: 10000 }
  );
  const testMsg = await optionsPage.$eval("#status-msg", (el) => el.textContent);
  const testIsSuccess = await optionsPage.$eval("#status-msg", (el) =>
    el.classList.contains("success")
  );
  console.log(`  message: "${testMsg}"`);
  assert(testIsSuccess, "Test Connection reports success with a valid URL + key");

  await optionsPage.click("#save-btn");
  await optionsPage.waitForFunction(
    () => document.getElementById("status-msg").textContent === "Saved.",
    { timeout: 5000 }
  );
  assert(true, "Save persists the config");

  // --- Options page: rejected key ---
  console.log("\n[Options] wrong API key");
  await optionsPage.evaluate(() => (document.getElementById("api-key").value = ""));
  await optionsPage.type("#api-key", "definitely-not-the-real-key");
  await optionsPage.click("#test-btn");
  await optionsPage.waitForFunction(
    () => document.getElementById("status-msg").textContent !== "Testing connection…",
    { timeout: 10000 }
  );
  const badKeyMsg = await optionsPage.$eval("#status-msg", (el) => el.textContent);
  const badKeyIsError = await optionsPage.$eval("#status-msg", (el) =>
    el.classList.contains("error")
  );
  console.log(`  message: "${badKeyMsg}"`);
  assert(badKeyIsError, "Test Connection reports failure with a wrong API key");
  await optionsPage.close();

  // Re-save the correct config for the results-page tests below.
  const optionsPage2 = await browser.newPage();
  await optionsPage2.goto(`chrome-extension://${extensionId}/options/options.html`);
  await optionsPage2.evaluate(() => {
    document.getElementById("seerr-url").value = "";
    document.getElementById("api-key").value = "";
  });
  await optionsPage2.type("#seerr-url", SEERR_URL);
  await optionsPage2.type("#api-key", SEERR_API_KEY);
  await optionsPage2.click("#save-btn");
  await optionsPage2.waitForFunction(
    () => document.getElementById("status-msg").textContent === "Saved.",
    { timeout: 5000 }
  );
  await optionsPage2.close();

  // --- Results page: real search against live Seerr ---
  console.log("\n[Results] search for 'Interstellar'");
  const resultsPage = await browser.newPage();
  resultsPage.on("pageerror", (e) => console.error("  PAGE ERROR:", e));
  await resultsPage.goto(
    `chrome-extension://${extensionId}/results/results.html?q=${encodeURIComponent("Interstellar")}`
  );
  await resultsPage.waitForSelector("#results-grid:not([hidden])", { timeout: 10000 });

  const cardCount = await resultsPage.$$eval(".card", (cards) => cards.length);
  assert(cardCount > 0, `renders result cards (found ${cardCount})`);

  const firstCardTitle = await resultsPage.$eval(".card .card-title", (el) => el.textContent);
  console.log(`  first card title: "${firstCardTitle}"`);
  assert(firstCardTitle === "Interstellar", "top result is the exact title match");

  const firstCardIsExact = await resultsPage.$eval(".card", (el) =>
    el.classList.contains("exact-match")
  );
  assert(firstCardIsExact, "exact match card is visually highlighted");

  const firstCardHref = await resultsPage.$eval(".card", (el) => el.getAttribute("href"));
  console.log(`  first card links to: ${firstCardHref}`);
  assert(firstCardHref.startsWith(`${SEERR_URL}/movie/`), "card links to a Seerr movie detail URL");

  const posterSrc = await resultsPage.$eval(".card .poster-wrap img", (el) => el.src);
  assert(posterSrc.startsWith("https://image.tmdb.org/"), "poster image points at TMDB's CDN");

  await resultsPage.screenshot({ path: "/app/e2e-output/e2e-screenshot-interstellar.png", fullPage: true });
  await resultsPage.close();

  // --- Results page: item that's already in the library (mediaInfo.status present) ---
  console.log("\n[Results] search for 'Iron Lung' (status pill check)");
  const libraryPage = await browser.newPage();
  libraryPage.on("pageerror", (e) => console.error("  PAGE ERROR:", e));
  await libraryPage.goto(
    `chrome-extension://${extensionId}/results/results.html?q=${encodeURIComponent("Iron Lung")}`
  );
  await libraryPage.waitForSelector("#results-grid:not([hidden])", { timeout: 10000 });
  const pillText = await libraryPage.$eval(".card .status-pill", (el) => el.textContent);
  console.log(`  status pill: "${pillText}"`);
  assert(
    ["Available", "Partially Available", "Requested", "Processing"].includes(pillText),
    "an already-known title shows a real availability status pill"
  );
  await libraryPage.screenshot({ path: "/app/e2e-output/e2e-screenshot-ironlung.png", fullPage: true });
  await libraryPage.close();

  // --- Results page: empty selection error path ---
  console.log("\n[Results] empty selection");
  const emptyPage = await browser.newPage();
  await emptyPage.goto(`chrome-extension://${extensionId}/results/results.html?error=empty`);
  await emptyPage.waitForSelector("#error-panel:not([hidden])", { timeout: 5000 });
  const emptyMsg = await emptyPage.$eval("#error-message", (el) => el.textContent);
  console.log(`  message: "${emptyMsg}"`);
  assert(emptyMsg.toLowerCase().includes("no text was selected"), "empty selection shows a plain-language error");
  await emptyPage.close();

  // --- Results page: overlong selection error path ---
  console.log("\n[Results] overlong selection");
  const longPage = await browser.newPage();
  const longText = "x".repeat(500);
  await longPage.goto(
    `chrome-extension://${extensionId}/results/results.html?q=${encodeURIComponent(longText)}`
  );
  await longPage.waitForSelector("#error-panel:not([hidden])", { timeout: 5000 });
  const longMsg = await longPage.$eval("#error-message", (el) => el.textContent);
  console.log(`  message: "${longMsg}"`);
  assert(longMsg.toLowerCase().includes("too long"), "overlong selection shows a plain-language error");
  await longPage.close();

  console.log("\nAll end-to-end checks passed.");
} finally {
  await browser.close();
}
