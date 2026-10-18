import { afterEach, describe, expect, it, vi } from 'vitest';
import { queueCommand, readNativeQueue, restoreNativeQueue } from '../lib/youtube';

const ids = ['jNQXAC9IVRw', 'aqz-KE-bpKQ'];
function fixture(playlistId = 'TLPQ-test') {
  document.body.innerHTML = '<ytd-app></ytd-app><div id="movie_player"></div><ytd-playlist-panel-renderer></ytd-playlist-panel-renderer>';
  const data = {
    playlistId, totalVideos: 2,
    contents: ids.map((id, index) => ({ playlistPanelVideoRenderer: {
      videoId: id, title: { simpleText: `Video ${index}` }, shortBylineText: { runs: [{ text: 'Channel' }] },
      selected: index === 1, navigationEndpoint: { watchEndpoint: { videoId: id, playlistId, index } },
    } })),
  };
  Object.assign(document.querySelector('ytd-playlist-panel-renderer')!, { data });
  const player = Object.assign(document.getElementById('movie_player')!, {
    getPlaylist: () => ids, getPlaylistId: () => playlistId,
    getVideoData: () => ({ video_id: ids[1] }), getCurrentTime: () => 65,
    seekTo: vi.fn(), pauseVideo: vi.fn(),
  });
  return { data, player };
}
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

describe('native YouTube adapter', () => {
  it('reads the native queue order, metadata, selected video and position', () => {
    fixture();
    expect(readNativeQueue()).toMatchObject({ status: 'queue', snapshot: {
      videos: [{ id: ids[0], title: 'Video 0', author: 'Channel' }, { id: ids[1] }], currentIndex: 1, position: 65,
    } });
  });
  it('does not capture normal playlists or recommendations', () => {
    fixture('PL-not-a-queue');
    expect(readNativeQueue()).toEqual({ status: 'none' });
  });
  it('keeps the selected occurrence when a queue repeats a video', () => {
    const { data, player } = fixture();
    data.contents.push({ playlistPanelVideoRenderer: {
      ...data.contents[0]!.playlistPanelVideoRenderer, selected: true,
    } });
    data.contents[1]!.playlistPanelVideoRenderer.selected = false;
    data.totalVideos = 3;
    player.getVideoData = () => ({ video_id: ids[0] });
    expect(readNativeQueue()).toMatchObject({ status: 'queue', snapshot: { currentIndex: 2 } });
  });
  it('does not persist a partially loaded queue or an advert timestamp', () => {
    const { data, player } = fixture();
    data.totalVideos = 50;
    expect(readNativeQueue()).toEqual({ status: 'incomplete' });
    data.totalVideos = 2;
    player.classList.add('ad-showing');
    expect(readNativeQueue()).toEqual({ status: 'incomplete' });
  });
  it('builds one native command containing the full ordered video list', () => {
    expect(queueCommand(ids)).toMatchObject({ signalServiceEndpoint: { actions: [{ addToPlaylistCommand: {
      videoIds: ids, listType: 'PLAYLIST_EDIT_LIST_TYPE_QUEUE',
      videoCommand: { watchEndpoint: { videoId: ids[0] } },
      onCreateListCommand: { createPlaylistServiceEndpoint: { videoIds: ids } },
    } }] } });
  });
  it('opens a player when restoring from a homepage with no existing video', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<ytd-app></ytd-app>';
    let createdPlayer: ReturnType<typeof fixture>['player'] | undefined;
    document.querySelector('ytd-app')!.addEventListener('yt-action', event => {
      const command = (event as CustomEvent).detail.args[0];
      const add = command.signalServiceEndpoint?.actions?.[0]?.addToPlaylistCommand;
      if (add?.videoCommand?.watchEndpoint?.videoId === ids[0]) createdPlayer = fixture().player;
    });
    const restore = restoreNativeQueue({ videos: ids.map(id => ({ id, title: id, author: '' })), currentIndex: 1, position: 35 });
    await vi.advanceTimersByTimeAsync(1200);
    await restore;
    expect(createdPlayer?.seekTo).toHaveBeenCalledWith(35, true);
    expect(createdPlayer?.pauseVideo).toHaveBeenCalledOnce();
  });
  it('verifies the rebuilt queue before seeking and pausing the saved video', async () => {
    vi.useFakeTimers();
    const { player } = fixture();
    const commands: unknown[] = [];
    document.querySelector('ytd-app')!.addEventListener('yt-action', event => {
      commands.push((event as CustomEvent).detail.args[0]);
    });
    const restore = restoreNativeQueue({ videos: ids.map(id => ({ id, title: id, author: '' })), currentIndex: 1, position: 123 });
    await vi.advanceTimersByTimeAsync(1200);
    await restore;
    expect(commands).toHaveLength(3);
    expect(player.seekTo).toHaveBeenCalledWith(123, true);
    expect(player.pauseVideo).toHaveBeenCalledOnce();
  });
  it('reports a failed restoration when YouTube never exposes the expected queue', async () => {
    vi.useFakeTimers();
    const { data } = fixture();
    data.contents = [];
    const restore = restoreNativeQueue({ videos: ids.map(id => ({ id, title: id, author: '' })), currentIndex: 0, position: 0 });
    const assertion = expect(restore).rejects.toThrow('Your saved copy is safe');
    await vi.advanceTimersByTimeAsync(20000);
    await assertion;
  });
});
