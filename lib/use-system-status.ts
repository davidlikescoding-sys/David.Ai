"use client";

/**
 * One shared poller for brain/network status. AppShell and chat read this
 * snapshot, so the app does not open multiple timers and duplicate requests on
 * every page. A sequence number prevents a slow connectivity check from
 * overwriting a newer known-offline state.
 */
import { useSyncExternalStore } from "react";
import type { BrainStatus } from "./brain/types";

export interface SystemStatusSnapshot {
  online: boolean | null;
  brain: BrainStatus | null;
}

const SERVER_SNAPSHOT: SystemStatusSnapshot = { online: null, brain: null };
let snapshot: SystemStatusSnapshot = { online: null, brain: null };
const listeners = new Set<() => void>();
let timer: number | null = null;
let onlineHandler: (() => void) | null = null;
let offlineHandler: (() => void) | null = null;
let refreshSequence = 0;

function publish(patch: Partial<SystemStatusSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

async function refreshBrain(sequence: number): Promise<void> {
  try {
    const response = await fetch("/api/brain/status", { cache: "no-store" });
    const payload = await response.json() as { ok?: boolean; status?: BrainStatus };
    if (sequence !== refreshSequence) return;
    publish({ brain: response.ok && payload.ok && payload.status ? payload.status : null });
  } catch {
    if (sequence === refreshSequence) publish({ brain: null });
  }
}

async function refresh(): Promise<void> {
  const sequence = ++refreshSequence;
  const browserOnline = typeof navigator === "undefined" ? null : navigator.onLine;
  if (browserOnline === false) {
    if (sequence === refreshSequence) publish({ online: false });
  } else {
    try {
      const response = await fetch("/api/network/status", { cache: "no-store" });
      const payload = await response.json() as { online?: boolean };
      if (sequence !== refreshSequence) return;
      const stillOnline = typeof navigator === "undefined" ? null : navigator.onLine;
      publish({ online: stillOnline === false ? false : response.ok && payload.online === true });
    } catch {
      if (sequence === refreshSequence) publish({ online: false });
    }
  }
  await refreshBrain(sequence);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined" && timer === null) {
    void refresh();
    onlineHandler = () => { void refresh(); };
    offlineHandler = () => { void refresh(); };
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    timer = window.setInterval(() => { void refresh(); }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || typeof window === "undefined" || timer === null) return;
    window.clearInterval(timer);
    timer = null;
    if (onlineHandler) window.removeEventListener("online", onlineHandler);
    if (offlineHandler) window.removeEventListener("offline", offlineHandler);
    onlineHandler = null;
    offlineHandler = null;
  };
}

function getSnapshot(): SystemStatusSnapshot {
  return snapshot;
}

function getServerSnapshot(): SystemStatusSnapshot {
  return SERVER_SNAPSHOT;
}

export function useSystemStatus(): SystemStatusSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
