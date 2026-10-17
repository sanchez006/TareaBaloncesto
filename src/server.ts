import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { matchEvents, matches, type Match, type MatchEvent } from "./db/schema.js";
import {
  newEventSchema,
  statusUpdateSchema,
  type EventDto,
  type EventType,
  type MatchDto,
  type MatchStatus,
} from "./shared.js";
import { broadcast, heartbeat, send, subscribe, subscriberCount, unsubscribe } from "./sse.js";

const app = express();
app.use(express.json());

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
app.use(express.static(publicDir));

const toMatchDto = (m: Match): MatchDto => ({
  id: m.id,
  homeTeam: m.homeTeam,
  awayTeam: m.awayTeam,
  status: m.status as MatchStatus,
  homeScore: m.homeScore,
  awayScore: m.awayScore,
  venue: m.venue,
});

const toEventDto = (e: MatchEvent): EventDto => ({
  id: e.id,
  matchId: e.matchId,
  type: e.type as EventType,
  minute: e.minute,
  team: e.team as "home" | "away",
  player: e.player,
  description: e.description,
  createdAt: e.createdAt.toISOString(),
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function findMatch(id: number) {
  const [row] = await db.select().from(matches).where(eq(matches.id, id));
  return row;
}

app.get("/api/matches", async (_req, res) => {
  const rows = await db.select().from(matches).orderBy(asc(matches.id));
  res.json(rows.map(toMatchDto));
});

// Estado actual + historial. La linea de tiempo se ordena por minuto y luego
// por fecha de creacion (id como desempate estable).
app.get("/api/matches/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return void res.status(400).json({ error: "Id invalido" });
  const match = await findMatch(id);
  if (!match) return void res.status(404).json({ error: "Partido no encontrado" });

  const events = await db
    .select()
    .from(matchEvents)
    .where(eq(matchEvents.matchId, id))
    .orderBy(asc(matchEvents.minute), asc(matchEvents.createdAt), asc(matchEvents.id));

  res.json({ match: toMatchDto(match), events: events.map(toEventDto) });
});

app.post("/api/matches/:id/events", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return void res.status(400).json({ error: "Id invalido" });

  const parsed = newEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(422).json({ error: "Datos invalidos", details: parsed.error.flatten().fieldErrors });
  }
  const input = parsed.data;

  // Persistencia primero; la transmision ocurre despues del commit.
  const result = await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matches).where(eq(matches.id, id)).for("update");
    if (!match) return null;

    const [event] = await tx
      .insert(matchEvents)
      .values({ matchId: id, ...input })
      .returning();

    let updated = match;
    if (input.type === "goal") {
      const column =
        input.team === "home"
          ? { homeScore: sql`${matches.homeScore} + 1` }
          : { awayScore: sql`${matches.awayScore} + 1` };
      [updated] = await tx.update(matches).set(column).where(eq(matches.id, id)).returning();
    }
    return { event, match: updated };
  });

  if (!result) return void res.status(404).json({ error: "Partido no encontrado" });

  const payload = { match: toMatchDto(result.match), event: toEventDto(result.event) };
  broadcast(id, "match_event", payload, result.event.id);
  res.status(201).json(payload);
});

app.patch("/api/matches/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return void res.status(400).json({ error: "Id invalido" });

  const parsed = statusUpdateSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ error: "Estado invalido" });

  const [updated] = await db.update(matches).set({ status: parsed.data.status }).where(eq(matches.id, id)).returning();
  if (!updated) return void res.status(404).json({ error: "Partido no encontrado" });

  const payload = { match: toMatchDto(updated) };
  broadcast(id, "match_update", payload);
  res.json(payload);
});

app.get("/api/matches/:id/events/stream", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return void res.status(400).json({ error: "Id invalido" });
  const match = await findMatch(id);
  if (!match) return void res.status(404).json({ error: "Partido no encontrado" });

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("retry: 3000\n\n");

  // Se registra antes de reproducir lo pendiente para no perder eventos que
  // lleguen durante la consulta; el cliente descarta duplicados por id.
  subscribe(id, res);
  req.on("close", () => unsubscribe(id, res));

  const lastId = Number(req.header("last-event-id") ?? req.query.lastEventId ?? 0);
  if (Number.isInteger(lastId) && lastId > 0) {
    const missed = await db
      .select()
      .from(matchEvents)
      .where(and(eq(matchEvents.matchId, id), gt(matchEvents.id, lastId)))
      .orderBy(asc(matchEvents.id));
    const current = (await findMatch(id)) ?? match;
    for (const e of missed) send(res, "match_event", { match: toMatchDto(current), event: toEventDto(e) }, e.id);
  }

  send(res, "match_update", { match: toMatchDto((await findMatch(id)) ?? match) });
});

// Numero de conexiones SSE abiertas por partido (usado para comprobar la limpieza).
app.get("/api/matches/:id/subscribers", (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return void res.status(400).json({ error: "Id invalido" });
  res.json({ matchId: id, subscribers: subscriberCount(id) });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Error interno" });
});

setInterval(heartbeat, 25_000).unref();

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Servidor en http://localhost:${port}`));
