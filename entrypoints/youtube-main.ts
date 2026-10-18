import { PAGE_CHANNEL } from '../lib/messages';
import { normaliseSnapshot } from '../lib/queue';
import { readNativeQueue, restoreNativeQueue } from '../lib/youtube';

export default defineUnlistedScript(() => {
  const bridgeWindow = window as typeof window & { __queuePersistDispose?: () => void };
  bridgeWindow.__queuePersistDispose?.();
  const controller = new AbortController();
  const { signal } = controller;
  let restoring = false;
  let navigating = false;
  let lastFingerprint = '';
  let lastOrder = '';
  let quarantined = false;
  let interactedAfterFailure = false;
  const emit = (message: Record<string, unknown>) => window.postMessage({ channel: PAGE_CHANNEL, ...message }, location.origin);
  const capture = (force = false) => {
    if (restoring || navigating) return;
    try {
      const observation = readNativeQueue();
      if (observation.status !== 'queue') return;
      const snapshot = observation.snapshot;
      const order = JSON.stringify(snapshot.videos.map(video => video.id));
      if (quarantined && (!interactedAfterFailure || order === lastOrder)) return;
      quarantined = false;
      // Position writes are limited to once per ten seconds of playback.
      const fingerprint = JSON.stringify([snapshot.videos, snapshot.currentIndex, Math.floor(snapshot.position / 10)]);
      if (!force && fingerprint === lastFingerprint) return;
      const structureChanged = order !== lastOrder;
      lastOrder = order;
      lastFingerprint = fingerprint;
      emit({ type: 'snapshot', snapshot, structureChanged });
    } catch (error) { console.debug('[Queue Persist] Capture unavailable', error); }
  };

  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== PAGE_CHANNEL) return;
    if (event.data.type === 'capture') { capture(true); return; }
    if (event.data.type !== 'restore' || typeof event.data.requestId !== 'string' || restoring) return;
    const snapshot = normaliseSnapshot(event.data.snapshot);
    if (!snapshot) return;
    restoring = true;
    try {
      await restoreNativeQueue(snapshot);
      quarantined = false;
      emit({ type: 'restored', requestId: event.data.requestId, ok: true });
    } catch (error) {
      quarantined = true;
      interactedAfterFailure = false;
      emit({ type: 'restored', requestId: event.data.requestId, ok: false,
        error: error instanceof Error ? error.message : 'Restoration failed.' });
    } finally {
      restoring = false;
      // Avoid capturing an incomplete or failed restoration over the saved copy.
      const observed = readNativeQueue();
      if (observed.status === 'queue') {
        lastOrder = JSON.stringify(observed.snapshot.videos.map(video => video.id));
        lastFingerprint = JSON.stringify([observed.snapshot.videos, observed.snapshot.currentIndex, Math.floor(observed.snapshot.position / 10)]);
      }
    }
  }, { signal });
  document.addEventListener('yt-navigate-start', () => { navigating = true; }, { signal });
  document.addEventListener('yt-navigate-finish', () => { navigating = false; setTimeout(() => { if (!signal.aborted) capture(); }, 1000); }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) capture(true); }, { signal });
  document.addEventListener('pause', () => capture(true), { capture: true, signal });
  const noteInteraction = (event: Event) => { if (event.isTrusted && quarantined) interactedAfterFailure = true; };
  document.addEventListener('pointerdown', noteInteraction, { capture: true, signal });
  document.addEventListener('keydown', noteInteraction, { capture: true, signal });
  window.addEventListener('pagehide', () => capture(true), { signal });
  const interval = setInterval(() => capture(), 1000);
  bridgeWindow.__queuePersistDispose = () => { controller.abort(); clearInterval(interval); };
  emit({ type: 'ready' });
  capture();
});
