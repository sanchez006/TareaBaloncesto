import { count } from "drizzle-orm";
import { db, pool } from "./index.js";
import { matches } from "./schema.js";

const [{ total }] = await db.select({ total: count() }).from(matches);

if (total > 0) {
  console.log("Ya existen partidos, no se inserta nada");
} else {
  await db.insert(matches).values([
    { homeTeam: "Real Madrid", awayTeam: "FC Barcelona", status: "live", venue: "Santiago Bernabeu" },
    { homeTeam: "Atletico de Madrid", awayTeam: "Sevilla FC", status: "live", venue: "Metropolitano" },
    { homeTeam: "Valencia CF", awayTeam: "Athletic Club", status: "scheduled", venue: "Mestalla" },
  ]);
  console.log("Partidos de ejemplo insertados");
}
await pool.end();
