import { mockSupportChats } from './mock-data';

export type SupportReply = { text: string; createdAt: number };

export type SupportChatEntry = {
  id: string;
  name: string;
  email: string;
  message: string;
  time: string;
  unread: boolean;
  createdAt: number;
  replies: SupportReply[];
};

const STORAGE_KEY = 'cb_support_chats_v1';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// Parses "DD/MM/YYYY HH:mm" (our display format) into a real timestamp.
function parseVnDateTime(value: string): number {
  const [datePart, timePart] = value.split(' ');
  const [day, month, year] = datePart.split('/').map(Number);
  const [hour, minute] = (timePart ?? '00:00').split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute).getTime();
}

function seedFromMock(): SupportChatEntry[] {
  return mockSupportChats.map((c) => ({
    ...c,
    createdAt: parseVnDateTime(c.time),
    replies: [],
  }));
}

/**
 * Loads support chats from this browser's localStorage, seeding from mock
 * data on first run. Anything older than 3 days is dropped automatically
 * (per requested retention window) — since there's no real backend/database
 * yet, this lives only in the admin's current browser, not synced across
 * devices or back to the customer in real time. That two-way sync will be
 * possible once a real backend (e.g. Firebase) is connected.
 */
export function loadSupportChats(): SupportChatEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const all: SupportChatEntry[] = raw ? JSON.parse(raw) : seedFromMock();
    const cutoff = Date.now() - THREE_DAYS_MS;
    const fresh = all.filter((c) => c.createdAt >= cutoff);
    saveSupportChats(fresh);
    return fresh;
  } catch {
    return seedFromMock();
  }
}

export function saveSupportChats(chats: SupportChatEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}
