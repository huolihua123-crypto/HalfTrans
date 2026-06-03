import { UserSettings, TermEntry, DEFAULT_SETTINGS, ApiConfig } from './types';

export async function getSettings(): Promise<UserSettings> {
  const result = await chrome.storage.sync.get('settings');
  return (result.settings as UserSettings) ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await chrome.storage.sync.set({ settings });
}

export async function getActiveApiConfig(): Promise<ApiConfig | null> {
  const settings = await getSettings();
  if (!settings.apiConfigs.length) return null;
  return settings.apiConfigs.find(c => c.id === settings.activeConfigId) ?? settings.apiConfigs[0];
}

export async function getTerminology(): Promise<TermEntry[]> {
  const result = await chrome.storage.sync.get('terminology');
  return (result.terminology as TermEntry[]) ?? [];
}

export async function saveTerminology(terms: TermEntry[]): Promise<void> {
  await chrome.storage.sync.set({ terminology: terms });
}
