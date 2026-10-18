export const MAX_VIDEOS = 1000;
export const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

export interface QueueVideo {
  id: string;
  title: string;
  author: string;
}

export interface QueueSnapshot {
  videos: QueueVideo[];
  currentIndex: number;
  position: number;
}

export interface SavedQueue extends QueueSnapshot {
  savedAt: number;
  sourceTabId: number;
}

export interface QueueState {
  current: SavedQueue | null;
  previous: SavedQueue | null;
}

export const EMPTY_STATE: QueueState = { current: null, previous: null };

export function normaliseSnapshot(value: unknown): QueueSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<QueueSnapshot>;
  if (!Array.isArray(raw.videos) || !raw.videos.length || raw.videos.length > MAX_VIDEOS) return null;
  const videos: QueueVideo[] = [];
  for (const video of raw.videos) {
    if (!video || typeof video !== 'object' || typeof video.id !== 'string' || !VIDEO_ID.test(video.id)) return null;
    videos.push({
      id: video.id,
      title: typeof video.title === 'string' ? video.title.slice(0, 500) : video.id,
      author: typeof video.author === 'string' ? video.author.slice(0, 200) : '',
    });
  }
  const currentIndex = typeof raw.currentIndex === 'number' && Number.isInteger(raw.currentIndex)
    ? Math.max(0, Math.min(raw.currentIndex, videos.length - 1)) : 0;
  const position = typeof raw.position === 'number' && Number.isFinite(raw.position)
    ? Math.max(0, Math.min(raw.position, 604800)) : 0;
  return { videos, currentIndex, position };
}

export function sameVideos(a: QueueSnapshot, b: QueueSnapshot): boolean {
  return a.videos.length === b.videos.length && a.videos.every((v, i) => v.id === b.videos[i]?.id);
}

/** Empty and invalid observations never erase a saved queue. */
export function recordSnapshot(state: QueueState, value: unknown, tabId: number, now = Date.now()): QueueState {
  const snapshot = normaliseSnapshot(value);
  if (!snapshot) return state;
  const current: SavedQueue = { ...snapshot, sourceTabId: tabId, savedAt: now };
  if (state.current && sameVideos(state.current, snapshot)) {
    return { ...state, current };
  }
  return { current, previous: state.current ?? state.previous };
}

export function formatPosition(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}
