import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initFloatingButton, destroyFloatingButton } from '@content/floating-btn';

describe('floating-btn', () => {
  let onTranslate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '<p>Some selectable text here</p>';
    onTranslate = vi.fn();
    destroyFloatingButton();

    // jsdom doesn't implement Range.getBoundingClientRect
    Range.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
      top: 50, bottom: 70, left: 100, right: 200, width: 100, height: 20, x: 100, y: 50, toJSON: () => {},
    });
  });

  it('shows button on text selection', () => {
    initFloatingButton(onTranslate);

    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('p')!);
    selection.removeAllRanges();
    selection.addRange(range);

    document.dispatchEvent(new Event('selectionchange'));

    const btn = document.querySelector('.halftrans-float-btn');
    expect(btn).not.toBeNull();
  });

  it('hides button when selection is empty', () => {
    initFloatingButton(onTranslate);

    const selection = window.getSelection()!;
    selection.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));

    const btn = document.querySelector('.halftrans-float-btn');
    expect(btn).toBeNull();
  });

  it('calls onTranslate with selected text when clicked', () => {
    initFloatingButton(onTranslate);

    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('p')!);
    selection.removeAllRanges();
    selection.addRange(range);

    document.dispatchEvent(new Event('selectionchange'));

    const btn = document.querySelector('.halftrans-float-btn') as HTMLElement;
    btn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onTranslate).toHaveBeenCalledWith('Some selectable text here');
  });
});
