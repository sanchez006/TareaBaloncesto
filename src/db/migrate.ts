import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index.js";

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migraciones aplicadas correctamente");
await pool.end();
