import React, { useEffect, useState } from 'react';
import { getSettings, saveSettings, getTerminology, saveTerminology } from '@shared/storage';
import type { UserSettings, TermEntry } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [terms, setTerms] = useState<TermEntry[]>([]);
  const [newTerm, setNewTerm] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
    getTerminology().then(setTerms);
  }, []);

  const handleSaveSettings = async () => {
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addTerm = async () => {
    if (!newTerm.trim()) return;
    const entry: TermEntry = { id: crypto.randomUUID(), term: newTerm.trim(), keep: true };
    const updated = [...terms, entry];
    setTerms(updated);
    await saveTerminology(updated);
    setNewTerm('');
  };

  const removeTerm = async (id: string) => {
    const updated = terms.filter((t) => t.id !== id);
    setTerms(updated);
    await saveTerminology(updated);
  };

  const toggleTerm = async (id: string) => {
    const updated = terms.map((t) => (t.id === id ? { ...t, keep: !t.keep } : t));
    setTerms(updated);
    await saveTerminology(updated);
  };

  const exportTerms = () => {
    const blob = new Blob([JSON.stringify(terms, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'halftrans-terminology.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importTerms = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string) as TermEntry[];
        setTerms(imported);
        await saveTerminology(imported);
      } catch { /* ignore invalid files */ }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">HalfTrans 设置</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">API 配置</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-gray-600">API Base URL</span>
            <input
              type="text"
              value={settings.apiBaseUrl}
              onChange={(e) => setSettings({ ...settings, apiBaseUrl: e.target.value })}
              className="mt-1 block w-full border rounded px-3 py-2"
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">API Key</span>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              className="mt-1 block w-full border rounded px-3 py-2"
              placeholder="sk-..."
            />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">模型</span>
            <input
              type="text"
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              className="mt-1 block w-full border rounded px-3 py-2"
              placeholder="gpt-4o-mini"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">翻译设置</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-gray-600">翻译风格</span>
            <select
              value={settings.style}
              onChange={(e) => setSettings({ ...settings, style: e.target.value as UserSettings['style'] })}
              className="mt-1 block w-full border rounded px-3 py-2"
            >
              <option value="colloquial">口语化</option>
              <option value="formal">书面化</option>
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">自定义术语表</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTerm()}
            className="flex-1 border rounded px-3 py-2"
            placeholder="输入术语，回车添加"
          />
          <button onClick={addTerm} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            添加
          </button>
        </div>

        <div className="space-y-1 max-h-64 overflow-y-auto">
          {terms.map((term) => (
            <div key={term.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded">
              <span className="font-mono text-sm">{term.term}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleTerm(term.id)}
                  className={`text-xs px-2 py-1 rounded ${term.keep ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}
                >
                  {term.keep ? '保留原文' : '翻译'}
                </button>
                <button onClick={() => removeTerm(term.id)} className="text-red-400 hover:text-red-600">×</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={exportTerms} className="text-sm text-blue-500 hover:underline">导出</button>
          <label className="text-sm text-blue-500 hover:underline cursor-pointer">
            导入
            <input type="file" accept=".json" onChange={importTerms} className="hidden" />
          </label>
        </div>
      </section>

      <button
        onClick={handleSaveSettings}
        className="w-full py-3 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
      >
        {saved ? '✓ 已保存' : '保存设置'}
      </button>
    </div>
  );
}
