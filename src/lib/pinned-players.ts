import { useSyncExternalStore } from "react";

const STORAGE_KEY = "pinned-players";
const MAX_PINNED = 5;

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(players: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
  emitChange();
}

let listeners: Array<() => void> = [];

function emitChange() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot(): string[] {
  return read();
}

const serverSnapshot: string[] = [];

export function usePinnedPlayers() {
  const pinned = useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);

  const pin = (username: string) => {
    const current = read();
    if (current.length >= MAX_PINNED || current.includes(username)) return;
    write([...current, username]);
  };

  const unpin = (username: string) => {
    write(read().filter((u) => u !== username));
  };

  const isPinned = (username: string) => pinned.includes(username);

  const clear = () => write([]);

  return { pinned, pin, unpin, isPinned, clear, maxPinned: MAX_PINNED } as const;
}
