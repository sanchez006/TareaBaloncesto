import { z } from "zod";

export const EVENT_TYPES = ["goal", "foul", "substitution", "yellow_card", "red_card"] as const;
export const MATCH_STATUSES = ["scheduled", "live", "finished"] as const;
export const TEAMS = ["home", "away"] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const newEventSchema = z.object({
  type: z.enum(EVENT_TYPES, { error: "Tipo de evento no valido" }),
  minute: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce
      .number({ error: "Indique un minuto" })
      .int("Debe ser un numero entero")
      .min(0, "El minuto no puede ser negativo")
      .max(130, "El minuto maximo es 130"),
  ),
  team: z.enum(TEAMS, { error: "Seleccione un equipo" }),
  player: z.string().trim().max(80, "Maximo 80 caracteres").optional().transform((v) => v || null),
  description: z.string().trim().max(200, "Maximo 200 caracteres").optional().transform((v) => v || null),
});

export const statusUpdateSchema = z.object({
  status: z.enum(MATCH_STATUSES),
});

export interface MatchDto {
  id: number;
  homeTeam: string;
  awayTeam: string;
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
  venue: string | null;
}

export interface EventDto {
  id: number;
  matchId: number;
  type: EventType;
  minute: number;
  team: "home" | "away";
  player: string | null;
  description: string | null;
  createdAt: string;
}

export interface MatchDetailDto {
  match: MatchDto;
  events: EventDto[];
}

export interface StreamPayload {
  match: MatchDto;
  event?: EventDto;
}
