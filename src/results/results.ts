import { getConfig } from "../lib/config.js";
import { searchSeerr } from "../lib/seerr-api.js";
import { MediaStatus, SeerrError, type DisplayResult } from "../lib/types.js";
import { checkQuery, MAX_QUERY_LENGTH } from "../lib/text.js";

const queryHeading = document.getElementById("query-heading") as HTMLHeadingElement;
const loadingPanel = document.getElementById("loading") as HTMLDivElement;
const errorPanel = document.getElementById("error-panel") as HTMLDivElement;
const errorMessage = document.getElementById("error-message") as HTMLParagraphElement;
const errorOptionsLink = document.getElementById("error-options-link") as HTMLAnchorElement;
const emptyPanel = document.getElementById("empty-panel") as HTMLDivElement;
const resultsMeta = document.getElementById("results-meta") as HTMLDivElement;
const resultsGrid = document.getElementById("results-grid") as HTMLDivElement;
const loadMoreBtn = document.getElementById("load-more-btn") as HTMLButtonElement;

function show(el: HTMLElement, visible: boolean): void {
  el.hidden = !visible;
}

function statusLabel(status: MediaStatus | null): { text: string; cls: string } {
  switch (status) {
    case MediaStatus.AVAILABLE:
      return { text: "Available", cls: "available" };
    case MediaStatus.PARTIALLY_AVAILABLE:
      return { text: "Partially Available", cls: "available" };
    case MediaStatus.PROCESSING:
      return { text: "Processing", cls: "pending" };
    case MediaStatus.PENDING:
      return { text: "Requested", cls: "pending" };
    default:
      return { text: "Not Requested", cls: "none" };
  }
}

function buildCard(result: DisplayResult, query: string): HTMLAnchorElement {
  const card = document.createElement("a");
  card.className = "card";
  card.href = result.detailUrl;
  card.target = "_blank";
  card.rel = "noopener noreferrer";

  if (result.title.trim().toLowerCase() === query.trim().toLowerCase()) {
    card.classList.add("exact-match");
  }

  const posterWrap = document.createElement("div");
  posterWrap.className = "poster-wrap";

  if (result.posterUrl) {
    const img = document.createElement("img");
    img.src = result.posterUrl;
    img.alt = result.title;
    img.loading = "lazy";
    posterWrap.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "poster-placeholder";
    placeholder.textContent = "No poster";
    posterWrap.appendChild(placeholder);
  }

  const badge = document.createElement("span");
  badge.className = "type-badge";
  badge.textContent = result.mediaType === "movie" ? "Movie" : "TV";
  posterWrap.appendChild(badge);

  const body = document.createElement("div");
  body.className = "card-body";

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = result.title;
  body.appendChild(title);

  if (result.year) {
    const year = document.createElement("div");
    year.className = "card-year";
    year.textContent = result.year;
    body.appendChild(year);
  }

  const overview = document.createElement("div");
  overview.className = "card-overview";
  overview.textContent = result.overview;
  body.appendChild(overview);

  const { text, cls } = statusLabel(result.status);
  const pill = document.createElement("span");
  pill.className = `status-pill ${cls}`;
  pill.textContent = text;
  body.appendChild(pill);

  card.appendChild(posterWrap);
  card.appendChild(body);
  return card;
}

function friendlyMessage(err: unknown): string {
  if (err instanceof SeerrError) return err.message;
  return "Something unexpected went wrong while talking to Seerr.";
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const explicitError = params.get("error");
  const rawQuery = params.get("q") ?? "";

  if (explicitError === "empty" || (!rawQuery && explicitError)) {
    showError("No text was selected to search for.");
    return;
  }

  const check = checkQuery(rawQuery);
  if (!check.ok) {
    if (check.reason === "too_long") {
      showError(`The selected text is too long to search (limit ${MAX_QUERY_LENGTH} characters).`);
    } else {
      showError("No text was selected to search for.");
    }
    return;
  }

  const query = check.query;
  queryHeading.textContent = `"${query}"`;
  document.title = `Seerr: ${query}`;

  const config = await getConfig();
  if (!config) {
    showError("Seerr isn't configured yet.", true);
    return;
  }

  let page = 1;
  let totalPages = 1;

  try {
    const first = await searchSeerr(config, query, page);
    totalPages = first.totalPages;
    show(loadingPanel, false);

    if (first.results.length === 0) {
      show(emptyPanel, true);
      return;
    }

    renderResults(first.results, query, first.totalResults);

    loadMoreBtn.hidden = page >= totalPages;
    loadMoreBtn.addEventListener("click", async () => {
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = "Loading…";
      try {
        page += 1;
        const next = await searchSeerr(config, query, page);
        for (const result of next.results) {
          resultsGrid.appendChild(buildCard(result, query));
        }
        loadMoreBtn.hidden = page >= totalPages;
      } catch (err) {
        loadMoreBtn.hidden = true;
        showError(friendlyMessage(err));
      } finally {
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = "Load more results";
      }
    });
  } catch (err) {
    show(loadingPanel, false);
    const isAuthIssue = err instanceof SeerrError && err.kind === "unauthorized";
    showError(friendlyMessage(err), isAuthIssue);
  }
}

function renderResults(results: DisplayResult[], query: string, totalResults: number): void {
  resultsMeta.textContent = `${totalResults} result${totalResults === 1 ? "" : "s"}`;
  show(resultsMeta, true);
  for (const result of results) {
    resultsGrid.appendChild(buildCard(result, query));
  }
  show(resultsGrid, true);
}

function showError(message: string, linkToOptions = false): void {
  show(loadingPanel, false);
  errorMessage.textContent = message;
  if (linkToOptions) {
    errorOptionsLink.hidden = false;
    errorOptionsLink.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }
  show(errorPanel, true);
}

void main();
