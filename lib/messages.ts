import type { QueueSnapshot } from './queue';

export const PAGE_CHANNEL = 'youtube-queue-persist:v1';
export interface Reply { ok: boolean; error?: string }
export type ExtensionMessage =
  | { type: 'queue:capture'; snapshot: QueueSnapshot }
  | { type: 'queue:restore'; previous?: boolean }
  | { type: 'queue:forget' }
  | { type: 'queue:save-now' };

export function isYouTubeUrl(url?: string): boolean {
  if (!url) return false;
  try { const parsed = new URL(url); return parsed.origin === 'https://www.youtube.com'; }
  catch { return false; }
}
