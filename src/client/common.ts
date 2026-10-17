import type { EventDto, EventType, MatchDetailDto, MatchDto, StreamPayload } from "../shared.js";

export type ConnectionState = "connected" | "reconnecting" | "disconnected";

export const EVENT_META: Record<EventType, { label: string; icon: string }> = {
  goal: {
    label: "Gol",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8l3.5 2.5-1.3 4h-4.4l-1.3-4z" fill="currentColor"/></svg>',
  },
  foul: {
    label: "Falta",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4M6 5h12l-2.5 4L18 13H6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  },
  substitution: {
    label: "Cambio",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h14m0 0l-4-4m4 4l-4 4M20 16H6m0 0l4-4m-4 4l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
  yellow_card: {
    label: "Tarjeta amarilla",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="4" width="10" height="16" rx="1.5" fill="currentColor"/></svg>',
  },
  red_card: {
    label: "Tarjeta roja",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="4" width="10" height="16" rx="1.5" fill="currentColor"/></svg>',
  },
};

export const STATUS_LABEL = {
  scheduled: "Programado",
  live: "En juego",
  finished: "Finalizado",
} as const;

export async function fetchMatches(): Promise<MatchDto[]> {
  const res = await fetch("/api/matches");
  if (!res.ok) throw new Error("No se pudo cargar la lista de partidos");
  return res.json();
}

export async function fetchMatch(id: number): Promise<MatchDetailDto> {
  const res = await fetch(`/api/matches/${id}`);
  if (!res.ok) throw new Error("No se pudo cargar el partido");
  return res.json();
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderEvent(match: MatchDto, e: EventDto): HTMLLIElement {
  const meta = EVENT_META[e.type];
  const li = el("li", `event event-${e.type} side-${e.team}`);
  li.dataset.eventId = String(e.id);

  li.append(el("span", "event-minute", `${e.minute}'`));

  const badge = el("span", "event-badge");
  badge.innerHTML = meta.icon;
  badge.title = meta.label;
  li.append(badge);

  const body = el("div", "event-body");
  body.append(el("strong", "event-title", meta.label));
  const team = e.team === "home" ? match.homeTeam : match.awayTeam;
  const detail = [e.player, team].filter(Boolean).join(" - ");
  body.append(el("span", "event-detail", detail));
  if (e.description) body.append(el("span", "event-note", e.description));
  li.append(body);

  return li;
}

export function renderScoreboard(target: HTMLElement, match: MatchDto) {
  target.replaceChildren();
  const home = el("div", "team");
  home.append(el("span", "team-name", match.homeTeam), el("span", "team-role", "Local"));
  const away = el("div", "team");
  away.append(el("span", "team-name", match.awayTeam), el("span", "team-role", "Visitante"));

  const score = el("div", "score");
  score.append(el("span", "score-value", String(match.homeScore)), el("span", "score-sep", "-"), el("span", "score-value", String(match.awayScore)));

  const middle = el("div", "score-wrap");
  middle.append(score, el("span", `status status-${match.status}`, STATUS_LABEL[match.status]));
  target.append(home, middle, away);
}

export function renderTimeline(list: HTMLElement, match: MatchDto, events: EventDto[]) {
  list.replaceChildren();
  if (events.length === 0) {
    list.append(el("li", "empty", "Aun no hay eventos registrados."));
    return;
  }
  for (const e of events) list.append(renderEvent(match, e));
}

export function renderMatchList(
  container: HTMLElement,
  matches: MatchDto[],
  selectedId: number | null,
  onSelect: (id: number) => void,
) {
  container.replaceChildren();
  for (const m of matches) {
    const btn = el("button", "match-card");
    btn.type = "button";
    btn.dataset.matchId = String(m.id);
    if (m.id === selectedId) btn.classList.add("selected");
    btn.setAttribute("aria-pressed", String(m.id === selectedId));

    const teams = el("span", "match-card-teams");
    teams.append(el("span", undefined, m.homeTeam), el("span", undefined, m.awayTeam));
    const score = el("span", "match-card-score");
    score.append(el("span", undefined, String(m.homeScore)), el("span", undefined, String(m.awayScore)));
    const status = el("span", `status status-${m.status}`, STATUS_LABEL[m.status]);

    btn.append(teams, score, status);
    btn.addEventListener("click", () => onSelect(m.id));
    container.append(btn);
  }
}

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connected: "Conectado",
  reconnecting: "Reconectando",
  disconnected: "Desconectado",
};

export function renderConnection(target: HTMLElement, state: ConnectionState) {
  target.className = `connection connection-${state}`;
  target.textContent = CONNECTION_LABEL[state];
}

/**
 * Mantiene una unica conexion SSE para un partido. El estado se deriva de
 * readyState: CONNECTING tras un error es un intento de reconexion automatico
 * del navegador; CLOSED significa que no volvera a intentarlo.
 */
export class MatchStream {
  private source: EventSource | null = null;

  constructor(
    private readonly onState: (state: ConnectionState) => void,
    private readonly onPayload: (name: "match_event" | "match_update", data: StreamPayload) => void,
  ) {}

  open(matchId: number, lastEventId: number) {
    this.close();
    this.onState("reconnecting");
    const source = new EventSource(`/api/matches/${matchId}/events/stream?lastEventId=${lastEventId}`);
    this.source = source;

    source.onopen = () => this.onState("connected");
    source.onerror = () => {
      this.onState(source.readyState === EventSource.CLOSED ? "disconnected" : "reconnecting");
    };
    for (const name of ["match_event", "match_update"] as const) {
      source.addEventListener(name, (ev) => {
        this.onPayload(name, JSON.parse((ev as MessageEvent).data));
      });
    }
  }

  close() {
    if (!this.source) return;
    this.source.close();
    this.source = null;
    this.onState("disconnected");
  }
}

/**
 * Estado de un partido en pantalla: carga inicial por HTTP, SSE despues, y
 * deduplicacion por id para que una reconexion no repita eventos.
 */
export class MatchView {
  private stream: MatchStream;
  private token = 0;
  match: MatchDto | null = null;
  private events = new Map<number, EventDto>();

  constructor(
    private readonly hooks: {
      onState: (state: ConnectionState) => void;
      onChange: (match: MatchDto, events: EventDto[]) => void;
    },
  ) {
    this.stream = new MatchStream(hooks.onState, (name, data) => this.apply(name, data));
    window.addEventListener("pagehide", () => this.stream.close());
  }

  async select(id: number) {
    const token = ++this.token;
    this.stream.close();
    this.match = null;
    this.events.clear();

    const detail = await fetchMatch(id);
    if (token !== this.token) return;

    this.match = detail.match;
    for (const e of detail.events) this.events.set(e.id, e);
    this.emit();

    const lastId = detail.events.reduce((max, e) => Math.max(max, e.id), 0);
    this.stream.open(id, lastId);
  }

  private apply(name: "match_event" | "match_update", data: StreamPayload) {
    if (!this.match || data.match.id !== this.match.id) return;
    if (name === "match_event" && data.event) {
      if (data.event.matchId !== this.match.id) return;
      this.events.set(data.event.id, data.event);
    }
    this.match = data.match;
    this.emit();
  }

  private emit() {
    if (!this.match) return;
    const sorted = [...this.events.values()].sort(
      (a, b) => a.minute - b.minute || a.createdAt.localeCompare(b.createdAt) || a.id - b.id,
    );
    this.hooks.onChange(this.match, sorted);
  }
}
