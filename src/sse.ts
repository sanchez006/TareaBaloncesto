import type { Response } from "express";
import type { StreamPayload } from "./shared.js";

// Suscriptores agrupados por partido: un evento solo se escribe en las
// conexiones registradas bajo el id de su partido.
const subscribers = new Map<number, Set<Response>>();

export function subscribe(matchId: number, res: Response) {
  let set = subscribers.get(matchId);
  if (!set) {
    set = new Set();
    subscribers.set(matchId, set);
  }
  set.add(res);
}

export function unsubscribe(matchId: number, res: Response) {
  const set = subscribers.get(matchId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) subscribers.delete(matchId);
}

export function subscriberCount(matchId: number) {
  return subscribers.get(matchId)?.size ?? 0;
}

export function send(res: Response, name: string, payload: StreamPayload, id?: number) {
  let frame = "";
  if (id !== undefined) frame += `id: ${id}\n`;
  frame += `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
  res.write(frame);
}

export function broadcast(matchId: number, name: string, payload: StreamPayload, id?: number) {
  for (const res of subscribers.get(matchId) ?? []) send(res, name, payload, id);
}

export function heartbeat() {
  for (const set of subscribers.values()) {
    for (const res of set) res.write(": ping\n\n");
  }
}
