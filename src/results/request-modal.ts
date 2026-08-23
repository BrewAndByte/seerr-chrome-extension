import { getServers, getTvSeasons, submitRequest } from "../lib/seerr-api.js";
import {
  MediaStatus,
  SeerrError,
  type DisplayResult,
  type SeerrConfig,
  type SeerrSeason,
  type SeerrServer,
} from "../lib/types.js";

const DOWNLOAD_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16.5v1.5A2.25 2.25 0 0 0 5.25 20.25h13.5A2.25 2.25 0 0 0 21 18v-1.5" /><path d="M7.5 12 12 16.5 16.5 12" /><path d="M12 3v13.5" /></svg>';

function friendlyMessage(err: unknown): string {
  if (err instanceof SeerrError) return err.message;
  return "Something went wrong while submitting the request.";
}

/**
 * Opens a Seerr-style confirmation modal for requesting `result`. Mirrors Seerr's own
 * RequestModal: title/poster header, a season picker for TV, Cancel/Request actions.
 * Calls `onRequested` with the resulting status once the request succeeds.
 */
export function openRequestModal(
  config: SeerrConfig,
  result: DisplayResult,
  onRequested: (status: MediaStatus) => void
): void {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";

  const dialog = document.createElement("div");
  dialog.className = "modal-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "request-modal-title");

  const header = document.createElement("div");
  header.className = "modal-header";

  if (result.posterUrl) {
    const poster = document.createElement("img");
    poster.className = "modal-poster";
    poster.src = result.posterUrl;
    poster.alt = "";
    header.appendChild(poster);
  }

  const heading = document.createElement("div");
  heading.className = "modal-heading";
  const title = document.createElement("h2");
  title.id = "request-modal-title";
  title.textContent = result.mediaType === "movie" ? "Request Movie" : "Request Series";
  const subtitle = document.createElement("p");
  subtitle.className = "modal-subtitle";
  subtitle.textContent = result.year ? `${result.title} (${result.year})` : result.title;
  heading.appendChild(title);
  heading.appendChild(subtitle);
  header.appendChild(heading);

  const body = document.createElement("div");
  body.className = "modal-body";

  // Reserved up front so the server picker (populated async, once getServers resolves) always
  // lands in the same spot regardless of how the movie/tv content below finishes loading.
  const serverField = document.createElement("div");
  serverField.className = "modal-field";
  serverField.hidden = true;
  body.appendChild(serverField);

  const errorBox = document.createElement("div");
  errorBox.className = "modal-error";
  errorBox.hidden = true;

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "modal-btn cancel";
  cancelBtn.textContent = "Cancel";
  const requestBtn = document.createElement("button");
  requestBtn.type = "button";
  requestBtn.className = "modal-btn primary";
  requestBtn.innerHTML = `${DOWNLOAD_ICON}<span>Request</span>`;
  actions.appendChild(cancelBtn);
  actions.appendChild(requestBtn);

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(errorBox);
  dialog.appendChild(actions);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  document.body.classList.add("modal-open");

  function close(): void {
    document.removeEventListener("keydown", onKeydown);
    document.body.classList.remove("modal-open");
    backdrop.remove();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", onKeydown);
  cancelBtn.addEventListener("click", close);

  function showError(message: string): void {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function setSubmitting(submitting: boolean): void {
    requestBtn.disabled = submitting;
    cancelBtn.disabled = submitting;
    requestBtn.innerHTML = submitting
      ? "Requesting…"
      : `${DOWNLOAD_ICON}<span>Request</span>`;
  }

  // Which server (Radarr/Sonarr instance) to target, if the picker below ends up shown.
  // Stays undefined when there's nothing to choose from, so the request is sent exactly as
  // before (no serverId) and Seerr falls back to its own default server.
  let selectedServerId: number | undefined;

  function renderServerPicker(servers: SeerrServer[]): void {
    // Seerr itself only shows this picker when there's more than one (non-4K) server to
    // choose from; with 0 or 1, submit exactly as today.
    if (servers.length <= 1) return;

    // servers.length > 1 was already checked above, so there's always a first element.
    const defaultServer = servers.find((s) => s.isDefault) ?? servers[0]!;
    selectedServerId = defaultServer.id;

    const label = document.createElement("label");
    label.className = "modal-label";
    label.textContent = "Destination Server";
    label.htmlFor = "request-modal-server";

    const select = document.createElement("select");
    select.id = "request-modal-server";
    select.className = "modal-select";
    for (const server of servers) {
      const option = document.createElement("option");
      option.value = String(server.id);
      option.textContent = server.isDefault ? `${server.name} (Default)` : server.name;
      if (server.id === defaultServer.id) option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener("change", () => {
      selectedServerId = Number(select.value);
    });

    serverField.appendChild(label);
    serverField.appendChild(select);
    serverField.hidden = false;
  }

  // Fetch alongside getTvSeasons (for tv) rather than after it, so the picker doesn't add
  // extra latency before the modal is interactive. Failures here are non-essential -- fall
  // back silently to "no picker, no serverId", the same as today.
  getServers(config, result.mediaType)
    .then(renderServerPicker)
    .catch(() => {});

  async function doSubmit(seasons?: number[]): Promise<void> {
    setSubmitting(true);
    errorBox.hidden = true;
    try {
      await submitRequest(config, {
        mediaId: result.id,
        mediaType: result.mediaType,
        ...(seasons ? { seasons } : {}),
        ...(selectedServerId !== undefined ? { serverId: selectedServerId } : {}),
      });
      onRequested(MediaStatus.PENDING);
      close();
    } catch (err) {
      showError(friendlyMessage(err));
      setSubmitting(false);
    }
  }

  if (result.mediaType === "movie") {
    const overview = document.createElement("p");
    overview.className = "modal-overview";
    overview.textContent = result.overview;
    body.appendChild(overview);

    requestBtn.addEventListener("click", () => void doSubmit());
    return;
  }

  // TV: fetch the season list before letting the user pick any.
  requestBtn.disabled = true;
  requestBtn.innerHTML = `${DOWNLOAD_ICON}<span>Select Season(s)</span>`;

  const loading = document.createElement("p");
  loading.className = "modal-loading";
  loading.textContent = "Loading seasons…";
  body.appendChild(loading);

  const selected = new Set<number>();

  function updateRequestLabel(): void {
    requestBtn.disabled = selected.size === 0;
    requestBtn.innerHTML =
      selected.size === 0
        ? `${DOWNLOAD_ICON}<span>Select Season(s)</span>`
        : `${DOWNLOAD_ICON}<span>Request ${selected.size} Season${selected.size === 1 ? "" : "s"}</span>`;
  }

  getTvSeasons(config, result.id)
    .then((seasons) => {
      loading.remove();
      if (seasons.length === 0) {
        showError("Seerr didn't return any requestable seasons for this show.");
        return;
      }
      const tableWrap = document.createElement("div");
      tableWrap.className = "season-table-wrap";
      tableWrap.appendChild(buildSeasonTable(seasons, selected, updateRequestLabel));
      body.appendChild(tableWrap);
      requestBtn.addEventListener("click", () => void doSubmit([...selected].sort((a, b) => a - b)));
    })
    .catch((err) => {
      loading.remove();
      showError(friendlyMessage(err));
    });
}

function buildSeasonTable(
  seasons: SeerrSeason[],
  selected: Set<number>,
  onChange: () => void
): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "season-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th class="season-check-col"></th>
      <th>Season</th>
      <th>Episodes</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  const rowCheckboxes: HTMLInputElement[] = [];

  for (const season of seasons) {
    const row = document.createElement("tr");

    const checkCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selected.add(season.seasonNumber);
      else selected.delete(season.seasonNumber);
      onChange();
    });
    rowCheckboxes.push(checkbox);
    checkCell.appendChild(checkbox);

    const nameCell = document.createElement("td");
    nameCell.textContent = season.name?.trim() || `Season ${season.seasonNumber}`;

    const episodesCell = document.createElement("td");
    episodesCell.textContent = String(season.episodeCount);

    row.appendChild(checkCell);
    row.appendChild(nameCell);
    row.appendChild(episodesCell);
    tbody.appendChild(row);
  }

  table.appendChild(tbody);

  const selectAll = document.createElement("input");
  selectAll.type = "checkbox";
  selectAll.title = "Select all seasons";
  selectAll.addEventListener("change", () => {
    for (const checkbox of rowCheckboxes) checkbox.checked = selectAll.checked;
    selected.clear();
    if (selectAll.checked) {
      for (const season of seasons) selected.add(season.seasonNumber);
    }
    onChange();
  });
  thead.querySelector(".season-check-col")?.appendChild(selectAll);

  return table;
}
