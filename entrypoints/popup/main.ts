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
  element('save-state').hidden = !queue;
  previous.hidden = !state.previous;
  element('summary').textContent = queue
    ? `${queue.videos.length} ${queue.videos.length === 1 ? 'video' : 'videos'}`
    : '0 videos';
  if (!queue) return;
  const savedDate = new Date(queue.savedAt);
  const day = savedDate.toDateString() === new Date().toDateString()
    ? 'today' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(savedDate);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(savedDate);
  element('saved-time').textContent = `Saved ${day} at ${time}`;
  element('saved-time').title = new Date(queue.savedAt).toLocaleString('en-GB');
  const list = element('videos');
  list.replaceChildren();
  queue.videos.forEach((video, index) => {
    const row = document.createElement('li');
    if (index === queue.currentIndex) {
      row.classList.add('current');
      row.setAttribute('aria-current', 'true');
    }
    const number = document.createElement('span');
    number.className = 'number';
    number.textContent = `${index + 1}`.padStart(2, '0');
    if (index === queue.currentIndex) {
      number.setAttribute('aria-label', `Resume video ${index + 1}`);
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      marker.classList.add('position-marker');
      marker.setAttribute('viewBox', '0 0 12 12');
      marker.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M3 2 10 6 3 10Z');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.2');
      path.setAttribute('stroke-linejoin', 'round');
      marker.append(path);
      number.replaceChildren(marker);
    }
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
  element('resume').textContent = `Video ${queue.currentIndex + 1} · ${formatPosition(queue.position)}`;
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
  restore.setAttribute('aria-busy', 'true');
  setStatus('Opening your saved video and rebuilding the queue…');
  try {
    const reply = await browser.runtime.sendMessage({ type: 'queue:restore', previous: usePrevious }) as Reply;
    setStatus(reply.ok ? 'Queue restored. Press play on YouTube when you’re ready.' : reply.error || 'Could not restore the queue.', !reply.ok);
  } catch { setStatus('Could not connect to the extension. Try opening the popup again.', true); }
  finally {
    busy = false;
    restore.disabled = previous.disabled = forget.disabled = false;
    restore.removeAttribute('aria-busy');
  }
}

restore.addEventListener('click', () => void restoreQueue());
previous.addEventListener('click', () => void restoreQueue(true));
forget.addEventListener('click', async () => {
  if (!forgetArmed) {
    forgetArmed = true;
    forget.textContent = 'Confirm clear';
    forget.dataset.confirm = '';
    setStatus('Click again to remove both saved copies. Your YouTube queue will be kept.');
    setTimeout(() => {
      forgetArmed = false;
      forget.textContent = 'Clear saved copies';
      delete forget.dataset.confirm;
    }, 5000);
    return;
  }
  try {
    await browser.runtime.sendMessage({ type: 'queue:forget' });
    setStatus('Saved copies removed. New queue activity will be saved automatically.');
  } catch { setStatus('Could not clear your saved copies. Try again.', true); }
  finally {
    forgetArmed = false;
    forget.textContent = 'Clear saved copies';
    delete forget.dataset.confirm;
  }
});
element('open-youtube').addEventListener('click', () => void browser.tabs.create({ url: 'https://www.youtube.com/' }));
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STATE_KEY]) render(changes[STATE_KEY].newValue as QueueState);
});
void readState().then(render).catch(() => setStatus('Could not read your saved queue.', true));
