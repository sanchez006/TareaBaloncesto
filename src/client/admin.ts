import { EVENT_TYPES, MATCH_STATUSES } from "../shared.js";
import {
  EVENT_META,
  el,
  fetchMatches,
  MatchView,
  renderConnection,
  renderMatchList,
  renderScoreboard,
  renderTimeline,
  STATUS_LABEL,
} from "./common.js";

const list = document.getElementById("match-list")!;
const panel = document.getElementById("panel")!;
const placeholder = document.getElementById("placeholder")!;
const scoreboard = document.getElementById("scoreboard")!;
const timeline = document.getElementById("timeline")!;
const connection = document.getElementById("connection")!;
const form = document.getElementById("event-form") as HTMLFormElement;
const typeSelect = document.getElementById("type") as HTMLSelectElement;
const teamSelect = document.getElementById("team") as HTMLSelectElement;
const statusSelect = document.getElementById("status") as HTMLSelectElement;
const feedback = document.getElementById("feedback")!;
const matchTitle = document.getElementById("match-title")!;

for (const t of EVENT_TYPES) typeSelect.append(new Option(EVENT_META[t].label, t));
for (const s of MATCH_STATUSES) statusSelect.append(new Option(STATUS_LABEL[s], s));

let selectedId: number | null = null;

const view = new MatchView({
  onState: (state) => renderConnection(connection, state),
  onChange: (match, events) => {
    placeholder.hidden = true;
    panel.hidden = false;
    matchTitle.textContent = `${match.homeTeam} vs ${match.awayTeam}`;
    teamSelect.options[0].text = match.homeTeam;
    teamSelect.options[1].text = match.awayTeam;
    statusSelect.value = match.status;
    renderScoreboard(scoreboard, match);
    renderTimeline(timeline, match, events);
    refreshList();
  },
});

async function refreshList() {
  renderMatchList(list, await fetchMatches(), selectedId, select);
}

async function select(id: number) {
  selectedId = id;
  clearErrors();
  await view.select(id);
}

function clearErrors() {
  feedback.textContent = "";
  feedback.className = "feedback";
  form.querySelectorAll(".field-error").forEach((n) => n.remove());
}

function showFieldErrors(details: Record<string, string[]>) {
  for (const [name, messages] of Object.entries(details)) {
    const field = form.elements.namedItem(name) as HTMLElement | null;
    field?.closest("label")?.append(el("span", "field-error", messages[0]));
  }
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!selectedId) return;
  clearErrors();

  const data = Object.fromEntries(new FormData(form).entries());
  const res = await fetch(`/api/matches/${selectedId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (res.status === 422) {
    const body = await res.json();
    feedback.textContent = "Revise los campos marcados.";
    feedback.className = "feedback error";
    showFieldErrors(body.details ?? {});
    return;
  }
  if (!res.ok) {
    feedback.textContent = "No se pudo registrar el evento.";
    feedback.className = "feedback error";
    return;
  }

  feedback.textContent = "Evento registrado.";
  feedback.className = "feedback ok";
  form.reset();
});

statusSelect.addEventListener("change", async () => {
  if (!selectedId) return;
  await fetch(`/api/matches/${selectedId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: statusSelect.value }),
  });
});

await refreshList();
