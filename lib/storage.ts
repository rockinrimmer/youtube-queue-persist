import { browser } from 'wxt/browser';
import { EMPTY_STATE, type QueueState } from './queue';

export const STATE_KEY = 'queueState';
export async function readState(): Promise<QueueState> {
  const result = await browser.storage.local.get(STATE_KEY);
  return (result[STATE_KEY] as QueueState | undefined) ?? { ...EMPTY_STATE };
}
export async function writeState(state: QueueState): Promise<void> {
  await browser.storage.local.set({ [STATE_KEY]: state });
}
