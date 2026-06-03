import React, { useEffect, useState } from 'react';
import { getSettings, saveSettings, getTerminology } from '@shared/storage';
import type { UserSettings, TranslationStyle } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [termCount, setTermCount] = useState(0);

  useEffect(() => {
    getSettings().then(setSettings);
    getTerminology().then((t) => setTermCount(t.length));
  }, []);

  const handleTranslatePage = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_PAGE_TRANSLATE' });
    }
  };

  const updateSetting = async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await saveSettings(updated);
  };

  const hasConfigs = settings.apiConfigs.length > 0;

  return (
    <div className="w-72 p-4 space-y-4">
      <h1 className="text-lg font-bold text-gray-800">HalfTrans</h1>

      <button
        onClick={handleTranslatePage}
        disabled={!hasConfigs}
        className="w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ▶ 翻译当前页
      </button>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">API</span>
          {hasConfigs ? (
            <select
              value={settings.activeConfigId}
              onChange={(e) => updateSetting('activeConfigId', e.target.value)}
              className="text-sm border rounded px-2 py-1 max-w-[160px]"
            >
              {settings.apiConfigs.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <button
              onClick={() => chrome.runtime.openOptionsPage()}
              className="text-sm text-blue-500 hover:underline"
            >
              未配置 → 去设置
            </button>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">翻译风格</span>
          <select
            value={settings.style}
            onChange={(e) => updateSetting('style', e.target.value as TranslationStyle)}
            className="text-sm border rounded px-2 py-1"
          >
            <option value="colloquial">口语化</option>
            <option value="formal">书面化</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600 border-t pt-3">
        <span>术语表：已有 {termCount} 条</span>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="text-blue-500 hover:underline"
        >
          编辑 →
        </button>
      </div>

      <button
        onClick={() => chrome.runtime.openOptionsPage()}
        className="w-full text-sm text-gray-500 hover:text-gray-700"
      >
        ⚙ 设置
      </button>
    </div>
  );
}
