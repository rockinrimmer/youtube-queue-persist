import { MAX_VIDEOS, VIDEO_ID, type QueueSnapshot, type QueueVideo } from './queue';

// YouTube's page objects are undocumented. Keep their use in this adapter.
interface NativeVideo {
  videoId?: string;
  title?: { simpleText?: string; runs?: { text?: string }[] };
  shortBylineText?: { simpleText?: string; runs?: { text?: string }[] };
  selected?: boolean;
  navigationEndpoint?: Record<string, unknown>;
}
interface NativePanel {
  playlistId?: string;
  totalVideos?: number;
  contents?: {
    playlistPanelVideoRenderer?: NativeVideo;
    playlistPanelVideoWrapperRenderer?: { primaryRenderer?: { playlistPanelVideoRenderer?: NativeVideo } };
    continuationItemRenderer?: unknown;
  }[];
}
type PanelElement = HTMLElement & { data?: NativePanel; polymerController?: { data?: NativePanel } };
type PlayerElement = HTMLElement & {
  getPlaylistId?: () => string;
  getPlaylist?: () => string[];
  getPlaylistIndex?: () => number;
  getCurrentTime?: () => number;
  getVideoData?: () => { video_id?: string };
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  pauseVideo?: () => void;
};

export type Observation =
  | { status: 'queue'; snapshot: QueueSnapshot }
  | { status: 'none' | 'incomplete' };

function text(value?: NativeVideo['title']): string {
  return value?.simpleText ?? value?.runs?.map(run => run.text ?? '').join('') ?? '';
}

function player(): PlayerElement | null {
  return document.getElementById('movie_player') as PlayerElement | null;
}

function panelData(element: PanelElement): NativePanel | undefined {
  return element.data ?? element.polymerController?.data;
}

export function readNativeQueue(): Observation {
  const panels = Array.from(document.querySelectorAll<PanelElement>('ytd-playlist-panel-renderer'));
  const data = panels.map(panelData).find(panel => panel?.playlistId?.startsWith('TLPQ'));
  const media = player();
  const playlistId = media?.getPlaylistId?.() || new URL(location.href).searchParams.get('list') || '';
  if (!data && !playlistId.startsWith('TLPQ')) return { status: 'none' };
  // Never silently save just the loaded portion of a long queue.
  if (data?.contents?.some(item => item.continuationItemRenderer)) return { status: 'incomplete' };
  const renderers = (data?.contents ?? []).flatMap(item => {
    const video = item.playlistPanelVideoRenderer
      ?? item.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer;
    return video ? [video] : [];
  });
  const metadata = new Map(renderers.map(video => [video.videoId, video]));
  const panelIds = renderers.map(video => video.videoId);
  if (data?.totalVideos && panelIds.length < data.totalVideos) return { status: 'incomplete' };
  // Panel data includes the queue, even when only a few rows are rendered.
  const ids = panelIds.length ? panelIds : media?.getPlaylist?.() ?? [];
  if (!ids.length || ids.length > MAX_VIDEOS || ids.some(id => typeof id !== 'string' || !VIDEO_ID.test(id))) {
    return { status: 'incomplete' };
  }
  const videos: QueueVideo[] = (ids as string[]).map(id => ({
    id, title: text(metadata.get(id)?.title) || id, author: text(metadata.get(id)?.shortBylineText),
  }));
  const currentId = media?.getVideoData?.()?.video_id;
  const selected = renderers.findIndex(video => video.selected);
  const currentIndex = selected >= 0 && (!currentId || ids[selected] === currentId)
    ? selected : currentId ? ids.indexOf(currentId) : selected;
  const index = currentIndex >= 0 ? currentIndex : Math.max(0, media?.getPlaylistIndex?.() ?? 0);
  if (media?.classList.contains('ad-showing')) return { status: 'incomplete' };
  return { status: 'queue', snapshot: {
    videos,
    currentIndex: Math.min(index, videos.length - 1),
    position: Math.max(0, media?.getCurrentTime?.() ?? 0),
  } };
}

export function queueCommand(ids: string[]): Record<string, unknown> {
  return { signalServiceEndpoint: { signal: 'CLIENT_SIGNAL', actions: [{ addToPlaylistCommand: {
    openMiniplayer: true,
    videoId: ids[0],
    videoIds: ids,
    // Required to open the miniplayer when restoring from the homepage.
    // A watch page already has a player, which hid this omission in early tests.
    videoCommand: {
      commandMetadata: { webCommandMetadata: {
        url: `/watch?v=${ids[0]}`,
        webPageType: 'WEB_PAGE_TYPE_WATCH',
        rootVe: 3832,
      } },
      watchEndpoint: { videoId: ids[0] },
    },
    listType: 'PLAYLIST_EDIT_LIST_TYPE_QUEUE',
    onCreateListCommand: {
      commandMetadata: { webCommandMetadata: { sendPost: true, apiUrl: '/youtubei/v1/playlist/create' } },
      createPlaylistServiceEndpoint: { videoIds: ids, params: 'CAQ%3D' },
    },
  } }] } };
}

export function runNativeCommand(command: Record<string, unknown>): void {
  const app = document.querySelector('ytd-app');
  if (!app) throw new Error('YouTube is still loading. Try again in a moment.');
  app.dispatchEvent(new CustomEvent('yt-action', {
    bubbles: true, composed: true,
    detail: {
      actionName: 'yt-command-executor-command',
      optionalAction: false,
      args: [command, app],
      returnValue: [],
    },
  }));
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function restoreNativeQueue(snapshot: QueueSnapshot): Promise<void> {
  runNativeCommand({ signalServiceEndpoint: { signal: 'CLIENT_SIGNAL', actions: [{
    endPlaylistCommand: { closeMiniplayer: true, listType: 'PLAYLIST_EDIT_LIST_TYPE_QUEUE' },
  }] } });
  await delay(400);
  runNativeCommand(queueCommand(snapshot.videos.map(video => video.id)));
  const deadline = Date.now() + 18000;
  while (Date.now() < deadline) {
    await delay(400);
    const observed = readNativeQueue();
    if (observed.status !== 'queue') continue;
    const actual = observed.snapshot.videos;
    if (actual.length !== snapshot.videos.length || actual.some((video, index) => video.id !== snapshot.videos[index]?.id)) continue;
    const panels = Array.from(document.querySelectorAll<PanelElement>('ytd-playlist-panel-renderer'));
    const data = panels.map(panelData).find(panel => panel?.playlistId?.startsWith('TLPQ'));
    const item = data?.contents?.flatMap(entry => {
      const video = entry.playlistPanelVideoRenderer
        ?? entry.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer;
      return video ? [video] : [];
    })[snapshot.currentIndex];
    if (item?.navigationEndpoint) runNativeCommand(item.navigationEndpoint);
    // Wait for the saved video to become active before applying its timestamp.
    const target = snapshot.videos[snapshot.currentIndex]?.id;
    while (Date.now() < deadline) {
      await delay(250);
      const media = player();
      if (!media || media.getVideoData?.()?.video_id !== target || media.classList.contains('ad-showing')) continue;
      media.seekTo?.(snapshot.position, true);
      media.pauseVideo?.();
      return;
    }
    throw new Error('The queue was rebuilt, but YouTube could not resume the saved video. Your saved copy is safe.');
  }
  throw new Error('YouTube did not confirm the restored queue. Your saved copy is safe. Reload YouTube and try again.');
}
