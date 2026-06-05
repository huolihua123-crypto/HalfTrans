import { describe, it, expect, beforeEach } from 'vitest';
import { getSettings, saveSettings, getTerminology, saveTerminology, getActiveApiConfig } from '@shared/storage';
import { DEFAULT_SETTINGS } from '@shared/types';
import type { ApiConfig, UserSettings } from '@shared/types';

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
      const config: ApiConfig = { id: 'cfg-1', name: 'Test', baseUrl: 'http://localhost', apiKey: 'sk-test', model: 'gpt-4o' };
      const custom: UserSettings = { ...DEFAULT_SETTINGS, apiConfigs: [config], activeConfigId: 'cfg-1' };
      await chrome.storage.sync.set({ settings: custom });
      const settings = await getSettings();
      expect(settings.apiConfigs).toHaveLength(1);
      expect(settings.activeConfigId).toBe('cfg-1');
    });
  });

  describe('saveSettings', () => {
    it('persists settings', async () => {
      const config: ApiConfig = { id: 'cfg-1', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-abc', model: 'gpt-4o-mini' };
      await saveSettings({ ...DEFAULT_SETTINGS, apiConfigs: [config], activeConfigId: 'cfg-1' });
      const result = await chrome.storage.sync.get('settings');
      expect((result.settings as UserSettings).apiConfigs[0].apiKey).toBe('sk-abc');
    });
  });

  describe('getActiveApiConfig', () => {
    it('returns null when no configs exist', async () => {
      const config = await getActiveApiConfig();
      expect(config).toBeNull();
    });

    it('returns the active config by id', async () => {
      const configs: ApiConfig[] = [
        { id: 'cfg-1', name: 'A', baseUrl: 'http://a', apiKey: 'k1', model: 'm1' },
        { id: 'cfg-2', name: 'B', baseUrl: 'http://b', apiKey: 'k2', model: 'm2' },
      ];
      await saveSettings({ ...DEFAULT_SETTINGS, apiConfigs: configs, activeConfigId: 'cfg-2' });
      const config = await getActiveApiConfig();
      expect(config!.name).toBe('B');
      expect(config!.apiKey).toBe('k2');
    });

    it('falls back to first config if activeConfigId is invalid', async () => {
      const configs: ApiConfig[] = [
        { id: 'cfg-1', name: 'Fallback', baseUrl: 'http://fb', apiKey: 'k1', model: 'm1' },
      ];
      await saveSettings({ ...DEFAULT_SETTINGS, apiConfigs: configs, activeConfigId: 'nonexistent' });
      const config = await getActiveApiConfig();
      expect(config!.name).toBe('Fallback');
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

  describe('selectionPopupEnabled default', () => {
    it('defaults to true so existing users keep seeing the floating button', () => {
      expect(DEFAULT_SETTINGS.selectionPopupEnabled).toBe(true);
    });

    it('returns selectionPopupEnabled=true from getSettings on fresh install', async () => {
      const settings = await getSettings();
      expect(settings.selectionPopupEnabled).toBe(true);
    });
  });
});
