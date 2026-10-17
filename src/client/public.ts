import {
  fetchMatches,
  MatchView,
  renderConnection,
  renderMatchList,
  renderScoreboard,
  renderTimeline,
} from "./common.js";

const list = document.getElementById("match-list")!;
const detail = document.getElementById("detail")!;
const placeholder = document.getElementById("placeholder")!;
const scoreboard = document.getElementById("scoreboard")!;
const timeline = document.getElementById("timeline")!;
const connection = document.getElementById("connection")!;
const venue = document.getElementById("venue")!;

let selectedId: number | null = null;

const view = new MatchView({
  onState: (state) => renderConnection(connection, state),
  onChange: (match, events) => {
    placeholder.hidden = true;
    detail.hidden = false;
    venue.textContent = match.venue ?? "";
    renderScoreboard(scoreboard, match);
    renderTimeline(timeline, match, events);
    refreshList();
  },
});

async function refreshList() {
  const matches = await fetchMatches();
  renderMatchList(list, matches, selectedId, select);
}

async function select(id: number) {
  selectedId = id;
  history.replaceState(null, "", `?match=${id}`);
  await view.select(id);
}

const initial = Number(new URLSearchParams(location.search).get("match")) || null;
await refreshList();
if (initial) await select(initial);
