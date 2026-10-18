import { browser } from 'wxt/browser';
import { PAGE_CHANNEL, type Reply } from '../lib/messages';
import { normaliseSnapshot } from '../lib/queue';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_idle',
  async main(ctx) {
    let ready = false;
    const pending = new Map<string, (reply: Reply) => void>();
    ctx.addEventListener(window, 'message', event => {
      if (event.source !== window || event.origin !== location.origin || event.data?.channel !== PAGE_CHANNEL) return;
      if (event.data.type === 'ready') ready = true;
      if (event.data.type === 'snapshot') {
        const snapshot = normaliseSnapshot(event.data.snapshot);
        if (snapshot) void browser.runtime.sendMessage({
          type: 'queue:capture', snapshot, structureChanged: event.data.structureChanged === true,
        }).catch(error => console.debug('[Queue Persist] Save unavailable', error));
      }
      if (event.data.type === 'restored' && typeof event.data.requestId === 'string') {
        pending.get(event.data.requestId)?.({ ok: event.data.ok === true,
          error: typeof event.data.error === 'string' ? event.data.error.slice(0, 500) : undefined });
      }
    });
    const listener = (message: { type?: string; snapshot?: unknown }): Promise<Reply> | undefined => {
      if (message.type === 'page:ready') return Promise.resolve({ ok: ready && !!document.querySelector('ytd-app') });
      if (message.type === 'page:capture') {
        window.postMessage({ channel: PAGE_CHANNEL, type: 'capture' }, location.origin);
        return Promise.resolve({ ok: ready });
      }
      if (message.type !== 'page:restore') return;
      const snapshot = normaliseSnapshot(message.snapshot);
      if (!ready || !snapshot) return Promise.resolve({ ok: false, error: 'YouTube is not ready yet. Reload the page and try again.' });
      return new Promise(resolve => {
        const requestId = crypto.randomUUID();
        const timeout = ctx.setTimeout(() => {
          pending.delete(requestId);
          resolve({ ok: false, error: 'YouTube took too long to respond. Your saved queue is safe.' });
        }, 22000);
        pending.set(requestId, reply => { clearTimeout(timeout); pending.delete(requestId); resolve(reply); });
        window.postMessage({ channel: PAGE_CHANNEL, type: 'restore', snapshot, requestId }, location.origin);
      });
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(listener));
    await injectScript('/youtube-main.js');
  },
});
