# Marcador en vivo

Aplicacion web que muestra los eventos de partidos de futbol en tiempo real. El servidor
transmite los cambios al navegador con Server-Sent Events (SSE) y el esquema de la base de
datos se versiona con migraciones de Drizzle.

Stack: TypeScript, Express, PostgreSQL, Drizzle ORM, Zod, esbuild.

## Estructura

```
src/
  server.ts          API HTTP y endpoint SSE
  sse.ts             suscriptores agrupados por partido
  shared.ts          tipos y validacion compartidos (servidor y cliente)
  db/                esquema, conexion, migrador y datos de ejemplo
  client/            codigo TypeScript del navegador (se empaqueta con esbuild)
public/              HTML y CSS estaticos
drizzle/             migraciones SQL versionadas
scripts/             prueba de aislamiento entre partidos
```

## Requisitos

- Node.js 20 o superior
- Docker (para PostgreSQL) o una instancia propia de PostgreSQL 14+

## Instalacion

```bash
npm install
cp .env.example .env
docker compose up -d        # PostgreSQL en el puerto 5433
npm run db:migrate          # aplica las migraciones
npm run db:seed             # inserta tres partidos de ejemplo
npm start                   # http://localhost:3000
```

Si usa su propio PostgreSQL, ajuste `DATABASE_URL` en `.env`.

- Vista publica: http://localhost:3000/
- Administracion: http://localhost:3000/admin.html

## Migraciones

| Archivo | Contenido |
| --- | --- |
| `drizzle/0000_initial.sql` | Crea `matches` y `match_events` con su clave foranea e indice |
| `drizzle/0001_add_player_and_venue.sql` | Agrega `match_events.player` y `matches.venue` |

Generar una migracion despues de cambiar `src/db/schema.ts`:

```bash
npm run db:generate -- --name=descripcion_del_cambio
```

Aplicar las migraciones pendientes:

```bash
npm run db:migrate
```

El estado de las migraciones se guarda en la tabla `drizzle.__drizzle_migrations`. El esquema
nunca se modifica a mano: todo cambio pasa por un archivo en `drizzle/`.

## API

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/api/matches` | Lista de partidos con marcador |
| GET | `/api/matches/:id` | Partido y linea de tiempo (ordenada por minuto y fecha de creacion) |
| POST | `/api/matches/:id/events` | Registra un evento; los goles actualizan el marcador |
| PATCH | `/api/matches/:id` | Cambia el estado del partido |
| GET | `/api/matches/:id/events/stream` | Stream SSE (`text/event-stream`) de un solo partido |

Un evento se guarda en una transaccion y solo despues de confirmarla se transmite a los
suscriptores de ese partido.

## Como funciona SSE

1. El navegador carga el estado y el historial con `GET /api/matches/:id`.
2. Despues abre `EventSource` en `/api/matches/:id/events/stream?lastEventId=<ultimo id>`.
3. El servidor registra la conexion bajo el id del partido; `broadcast` solo escribe en las
   conexiones de ese partido, asi que un evento no llega a otro.
4. Cada evento viaja con `id:` igual a su id en la base de datos. Si la conexion se corta, el
   navegador reconecta y envia `Last-Event-ID`; el servidor reenvia solo lo que falta.
5. El cliente guarda los eventos en un mapa por id, por lo que un evento repetido tras una
   reconexion no aparece dos veces.
6. Al cambiar de partido o salir de la pagina se llama a `EventSource.close()`, y el servidor
   elimina la conexion cuando recibe el cierre.

El indicador de estado muestra Conectado, Reconectando o Desconectado segun `readyState`.

## Verificar el aislamiento entre partidos

Con el servidor en marcha:

```bash
npm run test:isolation
```

La prueba abre un stream para el partido 1 y otro para el partido 2, registra una falta en el
partido 1 y comprueba que solo el primer stream la recibe. Nota: deja un evento de prueba en la
base de datos.

Para volver a un estado limpio:

```bash
docker exec marcador-db psql -U marcador -d marcador -c "TRUNCATE match_events RESTART IDENTITY; UPDATE matches SET home_score = 0, away_score = 0;"
```

## Scripts

| Comando | Accion |
| --- | --- |
| `npm start` | Empaqueta el cliente y arranca el servidor |
| `npm run dev` | Igual, con recarga del servidor al editar |
| `npm run typecheck` | Comprueba los tipos |
| `npm run db:generate` | Genera una migracion |
| `npm run db:migrate` | Aplica las migraciones |
| `npm run db:seed` | Inserta partidos de ejemplo |
| `npm run test:isolation` | Prueba de aislamiento SSE |
