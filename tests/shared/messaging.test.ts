import { describe, it, expect, vi } from 'vitest';
import { sendToBackground, sendToTab, onMessage } from '@shared/messaging';
import type { MessageType } from '@shared/types';

describe('messaging', () => {
  it('sendToBackground calls chrome.runtime.sendMessage', async () => {
    const msg: MessageType = { type: 'TRIGGER_PAGE_TRANSLATE' };
    await sendToBackground(msg);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(msg);
  });

  it('sendToTab calls chrome.tabs.sendMessage', async () => {
    const msg: MessageType = { type: 'TRIGGER_PAGE_TRANSLATE' };
    await sendToTab(1, msg);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, msg);
  });

  it('onMessage registers a listener', () => {
    const handler = vi.fn();
    onMessage(handler);
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(handler);
  });
});
