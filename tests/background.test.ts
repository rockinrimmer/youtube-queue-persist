import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { EMPTY_STATE, recordSnapshot, type QueueState } from '../lib/queue';

type Handler = (message: unknown, sender: Browser.runtime.MessageSender) => unknown;
const mocks = vi.hoisted(() => ({
  state: { current: null, previous: null } as QueueState,
  handler: undefined as Handler | undefined,
  query: vi.fn(), update: vi.fn(), create: vi.fn(), get: vi.fn(), sendMessage: vi.fn(), writeState: vi.fn(),
}));

vi.mock('wxt/browser', () => ({ browser: {
  runtime: {
    id: 'queue-persist-test',
    getURL: (path: string) => `moz-extension://test${path}`,
    onMessage: { addListener: (handler: Handler) => { mocks.handler = handler; } },
  },
  tabs: { query: mocks.query, update: mocks.update, create: mocks.create, get: mocks.get, sendMessage: mocks.sendMessage },
} }));
vi.mock('../lib/storage', () => ({
  readState: async () => mocks.state,
  writeState: async (state: QueueState) => { mocks.writeState(state); mocks.state = state; },
}));
vi.stubGlobal('defineBackground', (main: () => void) => ({ main }));
const { default: background } = await import('../entrypoints/background');

const sender = { id: 'queue-persist-test', url: 'moz-extension://test/popup.html' };
const tab = (id: number) => ({ id } as Browser.tabs.Tab);
const snapshot = {
  videos: [{ id: 'jNQXAC9IVRw', title: 'Zoo', author: 'jawed' }, { id: 'aqz-KE-bpKQ', title: 'Bunny', author: 'Blender' }],
  currentIndex: 1, position: 35,
};
const destination = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = recordSnapshot(EMPTY_STATE, snapshot, 7, 100);
  mocks.query.mockResolvedValue([{ id: 7, url: 'https://www.youtube.com/' }]);
  mocks.update.mockResolvedValue({ id: 7, url: destination, status: 'loading' });
  mocks.create.mockResolvedValue({ id: 8, url: destination, status: 'loading' });
  mocks.get.mockResolvedValue({ url: destination, status: 'complete' });
  mocks.sendMessage.mockResolvedValue({ ok: true });
  background.main();
});

describe('restore coordination', () => {
  it('opens the saved video before rebuilding a queue from the homepage', async () => {
    expect(await mocks.handler!({ type: 'queue:restore' }, sender)).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(7, { url: destination, active: true });
    expect(mocks.sendMessage.mock.calls).toEqual([
      [7, { type: 'page:ready' }],
      [7, { type: 'page:restore', snapshot }],
    ]);
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendMessage.mock.invocationCallOrder[0]!);
  });
  it('opens a new watch tab when the active tab is elsewhere', async () => {
    mocks.query.mockResolvedValue([{ id: 7, url: 'https://example.org/' }]);
    expect(await mocks.handler!({ type: 'queue:restore' }, sender)).toEqual({ ok: true });
    expect(mocks.create).toHaveBeenCalledWith({ url: destination });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.sendMessage).toHaveBeenLastCalledWith(8, { type: 'page:restore', snapshot });
  });
  it('keeps both saved copies intact if YouTube rejects a restore', async () => {
    const state = mocks.state;
    mocks.sendMessage.mockImplementation(async (_tab, message) => message.type === 'page:ready'
      ? { ok: true } : { ok: false, error: 'YouTube did not confirm the queue.' });
    expect(await mocks.handler!({ type: 'queue:restore' }, sender)).toMatchObject({ ok: false });
    expect(mocks.state).toBe(state);
    expect(mocks.writeState).not.toHaveBeenCalled();
  });
  it('accepts a verified extension document opened in a tab', async () => {
    expect(await mocks.handler!({ type: 'queue:restore' }, { ...sender, tab: tab(10) })).toEqual({ ok: true });
  });
  it('does not accept restore requests from page content or another extension', () => {
    expect(mocks.handler!({ type: 'queue:restore' }, { ...sender, url: 'https://www.youtube.com/', tab: tab(7) })).toBeUndefined();
    expect(mocks.handler!({ type: 'queue:restore' }, { ...sender, id: 'someone-else' })).toBeUndefined();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('does not open YouTube for an invalid saved queue', async () => {
    mocks.state = { current: null, previous: null };
    expect(await mocks.handler!({ type: 'queue:restore' }, sender)).toMatchObject({ ok: false });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
