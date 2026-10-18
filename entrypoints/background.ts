import { browser, type Browser } from 'wxt/browser';
import { isYouTubeUrl, type Reply } from '../lib/messages';
import { EMPTY_STATE, normaliseSnapshot, recordSnapshot } from '../lib/queue';
import { readState, writeState } from '../lib/storage';

export default defineBackground(() => {
  // Serialize read/modify/write so captures from multiple tabs cannot race.
  let writes: Promise<unknown> = Promise.resolve();
  let restoring = false;
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = writes.then(task, task);
    writes = next.catch(() => undefined);
    return next;
  };

  async function restore(previous: boolean): Promise<Reply> {
    if (restoring) return { ok: false, error: 'A queue is already being restored.' };
    restoring = true;
    try {
      const state = await serial(readState);
      const snapshot = normaliseSnapshot(previous ? state.previous : state.current);
      if (!snapshot) return { ok: false, error: 'There is no valid saved queue to restore yet.' };
      const video = snapshot.videos[snapshot.currentIndex]!;
      const destination = `https://www.youtube.com/watch?v=${video.id}`;
      const [active] = await browser.tabs.query({ active: true, currentWindow: true });
      // Start with a fresh watch page. On the homepage YouTube can create an
      // internal queue without opening its panel; a normal playlist can also
      // contaminate the queue if we rebuild it in place.
      const tab = isYouTubeUrl(active?.url) && active?.id !== undefined
        ? await browser.tabs.update(active.id, { url: destination, active: true })
        : await browser.tabs.create({ url: destination });
      if (tab?.id === undefined) throw new Error('Could not open YouTube.');
      const tabId = tab.id;
      let ready = false;
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        try {
          const loaded = await browser.tabs.get(tabId);
          if (loaded.status === 'complete' && loaded.url === destination) {
            ready = (await browser.tabs.sendMessage(tabId, { type: 'page:ready' }) as Reply)?.ok === true;
          }
        }
        catch { /* Wait for a new tab's content script to load. */ }
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 400));
      }
      if (!ready) throw new Error('Reload the YouTube tab to connect the extension, then try again.');
      const reply = await browser.tabs.sendMessage(tabId, { type: 'page:restore', snapshot }) as Reply;
      if (reply.ok) {
        await serial(async () => writeState(recordSnapshot(await readState(), snapshot, tabId)));
      }
      return reply;
    } finally { restoring = false; }
  }

  browser.runtime.onMessage.addListener((message: unknown, sender: Browser.runtime.MessageSender) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return;
    const request = message as { type: string; snapshot?: unknown; previous?: boolean; structureChanged?: boolean };
    if (request.type === 'queue:capture') {
      if (!isYouTubeUrl(sender.url) || sender.tab?.id === undefined || sender.frameId !== 0 || restoring) return;
      const tabId = sender.tab.id;
      return serial(async () => {
        if (restoring) return { ok: true };
        const state = await readState();
        // Playback in an old tab must not overwrite a queue edited in another tab.
        if (state.current && state.current.sourceTabId !== tabId && !request.structureChanged) return { ok: true };
        const next = recordSnapshot(state, request.snapshot, tabId);
        if (next !== state) await writeState(next);
        return { ok: true };
      });
    }
    // Only extension pages can request restoration or remove saved data.
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL('/'))) return;
    if (request.type === 'queue:restore') return restore(request.previous === true).catch(error => ({ ok: false, error: String(error instanceof Error ? error.message : error) }));
    if (request.type === 'queue:forget') return serial(async () => { await writeState({ ...EMPTY_STATE }); return { ok: true }; });
    if (request.type === 'queue:save-now') return (async (): Promise<Reply> => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined || !isYouTubeUrl(tab.url)) return { ok: false, error: 'Open a YouTube tab with a native queue first.' };
      try { return await browser.tabs.sendMessage(tab.id, { type: 'page:capture' }) as Reply; }
      catch { return { ok: false, error: 'Reload YouTube to connect the extension.' }; }
    })();
  });
});
