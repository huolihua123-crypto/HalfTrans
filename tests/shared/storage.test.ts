import { describe, it, expect, beforeEach } from 'vitest';
import { getSettings, saveSettings, getTerminology, saveTerminology } from '@shared/storage';
import { DEFAULT_SETTINGS } from '@shared/types';

describe('storage', () => {
  beforeEach(async () => {
    await chrome.storage.sync.clear();
  });

  describe('getSettings', () => {
    it('returns default settings when none saved', async () => {
      const settings = await getSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('returns saved settings', async () => {
      const custom = { ...DEFAULT_SETTINGS, model: 'deepseek-chat' };
      await chrome.storage.sync.set({ settings: custom });
      const settings = await getSettings();
      expect(settings.model).toBe('deepseek-chat');
    });
  });

  describe('saveSettings', () => {
    it('persists settings', async () => {
      await saveSettings({ ...DEFAULT_SETTINGS, apiKey: 'sk-test' });
      const result = await chrome.storage.sync.get('settings');
      expect((result.settings as typeof DEFAULT_SETTINGS).apiKey).toBe('sk-test');
    });
  });

  describe('getTerminology', () => {
    it('returns empty array when none saved', async () => {
      const terms = await getTerminology();
      expect(terms).toEqual([]);
    });
  });

  describe('saveTerminology', () => {
    it('persists terminology list', async () => {
      const terms = [{ id: '1', term: 'event loop', keep: true }];
      await saveTerminology(terms);
      const result = await getTerminology();
      expect(result).toEqual(terms);
    });
  });
});
