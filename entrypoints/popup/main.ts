import { browser } from 'wxt/browser';
import type { Reply } from '../../lib/messages';
import { formatPosition, type QueueState } from '../../lib/queue';
import { readState, STATE_KEY } from '../../lib/storage';
import './style.css';

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
const status = element('status');
const restore = element<HTMLButtonElement>('restore');
const previous = element<HTMLButtonElement>('previous');
const forget = element<HTMLButtonElement>('forget');
let busy = false;
let forgetArmed = false;

function render(state: QueueState): void {
  const queue = state.current;
  element('saved').hidden = !queue;
  element('actions').hidden = !queue;
  element('empty').hidden = !!queue;
  previous.hidden = !state.previous;
  element('summary').textContent = queue
    ? `${queue.videos.length} ${queue.videos.length === 1 ? 'video' : 'videos'} saved. Close the tab. Come back later.`
    : 'Close the browser. Keep what’s up next.';
  if (!queue) return;
  element('saved-time').textContent = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(queue.savedAt);
  element('saved-time').title = new Date(queue.savedAt).toLocaleString('en-GB');
  const list = element('videos');
  list.replaceChildren();
  queue.videos.forEach((video, index) => {
    const row = document.createElement('li');
    if (index === queue.currentIndex) row.classList.add('current');
    const number = document.createElement('span');
    number.className = 'number';
    number.textContent = index === queue.currentIndex ? '▶' : `${index + 1}`.padStart(2, '0');
    if (index === queue.currentIndex) number.setAttribute('aria-label', 'Current video');
    const details = document.createElement('div');
    details.className = 'video-details';
    const title = document.createElement('p');
    title.className = 'video-title';
    title.textContent = video.title;
    title.title = video.title;
    const author = document.createElement('p');
    author.className = 'video-author';
    author.textContent = video.author || 'YouTube video';
    details.append(title, author);
    row.append(number, details);
    list.append(row);
  });
  element('resume').textContent = `Resume video ${queue.currentIndex + 1} at ${formatPosition(queue.position)}. Playback starts paused.`;
  if (state.previous) previous.title = `${state.previous.videos.length} videos, saved ${new Date(state.previous.savedAt).toLocaleString('en-GB')}`;
}

function setStatus(message: string, error = false): void {
  status.textContent = message;
  status.classList.toggle('error', error);
}

async function restoreQueue(usePrevious = false): Promise<void> {
  if (busy) return;
  busy = true;
  restore.disabled = previous.disabled = forget.disabled = true;
  setStatus('Opening your saved video and rebuilding the queue…');
  try {
    const reply = await browser.runtime.sendMessage({ type: 'queue:restore', previous: usePrevious }) as Reply;
    setStatus(reply.ok ? 'Queue restored. Press play on YouTube when you’re ready.' : reply.error || 'Could not restore the queue.', !reply.ok);
  } catch { setStatus('Could not connect to the extension. Try opening the popup again.', true); }
  finally { busy = false; restore.disabled = previous.disabled = forget.disabled = false; }
}

restore.addEventListener('click', () => void restoreQueue());
previous.addEventListener('click', () => void restoreQueue(true));
forget.addEventListener('click', async () => {
  if (!forgetArmed) {
    forgetArmed = true;
    forget.textContent = 'Click again to forget';
    setStatus('This removes both saved copies. Your queue on YouTube stays as it is.');
    setTimeout(() => { forgetArmed = false; forget.textContent = 'Forget saved copies'; }, 5000);
    return;
  }
  await browser.runtime.sendMessage({ type: 'queue:forget' });
  forgetArmed = false;
  forget.textContent = 'Forget saved copies';
  setStatus('Saved copies removed. New queue activity will be saved automatically.');
});
element('open-youtube').addEventListener('click', () => void browser.tabs.create({ url: 'https://www.youtube.com/' }));
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STATE_KEY]) render(changes[STATE_KEY].newValue as QueueState);
});
void readState().then(render).catch(() => setStatus('Could not read your saved queue.', true));
