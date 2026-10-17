// Prueba de aislamiento: abre un stream SSE por partido, registra un evento
// en el partido 1 y comprueba que el partido 2 no lo recibe.
// Requiere el servidor en ejecucion: npm run test:isolation

export {};

const base = process.env.BASE_URL ?? "http://localhost:3000";

async function listen(matchId: number, bucket: string[]) {
  const res = await fetch(`${base}/api/matches/${matchId}/events/stream`);
  const type = res.headers.get("content-type");
  if (!type?.startsWith("text/event-stream")) throw new Error(`Content-Type inesperado: ${type}`);

  const decoder = new TextDecoder();
  void (async () => {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      for (const line of decoder.decode(chunk).split("\n")) {
        if (line.startsWith("event: match_event")) bucket.push(`match ${matchId}`);
      }
    }
  })().catch(() => {});
}

const received1: string[] = [];
const received2: string[] = [];
await listen(1, received1);
await listen(2, received2);
await new Promise((r) => setTimeout(r, 500));

const post = await fetch(`${base}/api/matches/1/events`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ type: "foul", minute: 12, team: "home", player: "Prueba de aislamiento" }),
});
if (post.status !== 201) throw new Error(`POST fallo con estado ${post.status}`);
await new Promise((r) => setTimeout(r, 800));

console.log(`Eventos recibidos por el stream del partido 1: ${received1.length}`);
console.log(`Eventos recibidos por el stream del partido 2: ${received2.length}`);

if (received1.length !== 1 || received2.length !== 0) {
  console.error("FALLO: el aislamiento por partido no se cumple");
  process.exit(1);
}
console.log("OK: el evento del partido 1 no llego al partido 2");
process.exit(0);
