import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getSettings, saveSettings, getTerminology, saveTerminology } from '@shared/storage';
import type { UserSettings, TermEntry, ApiConfig } from '@shared/types';
import { DEFAULT_SETTINGS, API_PRESETS } from '@shared/types';

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [terms, setTerms] = useState<TermEntry[]>([]);
  const [newTerm, setNewTerm] = useState('');
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    getSettings().then(setSettings);
    getTerminology().then(setTerms);
  }, []);

  const debouncedSave = useCallback((updated: UserSettings) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveSettings(updated), 500);
  }, []);

  const updateSettings = (updated: UserSettings) => {
    setSettings(updated);
    debouncedSave(updated);
  };

  const immediatelySave = (updated: UserSettings) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSettings(updated);
    saveSettings(updated);
  };

  const activeConfig = settings.apiConfigs.find(c => c.id === settings.activeConfigId) ?? settings.apiConfigs[0] ?? null;

  const updateActiveConfig = (patch: Partial<ApiConfig>) => {
    if (!activeConfig) return;
    const updatedConfigs = settings.apiConfigs.map(c =>
      c.id === activeConfig.id ? { ...c, ...patch } : c
    );
    updateSettings({ ...settings, apiConfigs: updatedConfigs });
  };

  const switchConfig = (id: string) => {
    immediatelySave({ ...settings, activeConfigId: id });
  };

  const addFromPreset = (preset: typeof API_PRESETS[number] | null) => {
    const newConfig: ApiConfig = {
      id: crypto.randomUUID(),
      name: preset?.name ?? '自定义',
      baseUrl: preset?.baseUrl ?? '',
      apiKey: '',
      model: preset?.model ?? '',
    };
    const updatedConfigs = [...settings.apiConfigs, newConfig];
    immediatelySave({ ...settings, apiConfigs: updatedConfigs, activeConfigId: newConfig.id });
    setShowPresetMenu(false);
  };

  const deleteConfig = () => {
    if (!activeConfig || settings.apiConfigs.length <= 1) return;
    const updatedConfigs = settings.apiConfigs.filter(c => c.id !== activeConfig.id);
    immediatelySave({ ...settings, apiConfigs: updatedConfigs, activeConfigId: updatedConfigs[0].id });
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

  if (settings.apiConfigs.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 space-y-6">
        <h1 className="text-2xl font-bold">HalfTrans 设置</h1>
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">选择一个 API 服务开始配置</h2>
          <p className="text-sm text-gray-500">选择后可继续修改，也可以之后添加更多配置。</p>
          <div className="grid grid-cols-2 gap-3">
            {API_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => addFromPreset(preset)}
                className="p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50 text-left transition"
              >
                <div className="font-medium">{preset.name}</div>
                <div className="text-xs text-gray-500 mt-1">{preset.baseUrl}</div>
                <div className="text-xs text-gray-400 mt-0.5">推荐模型：{preset.model}</div>
              </button>
            ))}
            <button
              onClick={() => addFromPreset(null)}
              className="p-4 border rounded-lg hover:border-gray-400 text-left transition border-dashed"
            >
              <div className="font-medium text-gray-600">自定义</div>
              <div className="text-xs text-gray-400 mt-1">手动填写 API 地址</div>
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">HalfTrans 设置</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">API 配置</h2>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 shrink-0">当前配置：</label>
          <select
            value={settings.activeConfigId}
            onChange={(e) => switchConfig(e.target.value)}
            className="flex-1 border rounded px-3 py-2"
          >
            {settings.apiConfigs.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="relative">
            <button
              onClick={() => setShowPresetMenu(!showPresetMenu)}
              className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
            >
              + 新增
            </button>
            {showPresetMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg z-10">
                {API_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => addFromPreset(preset)}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                  >
                    {preset.name}
                  </button>
                ))}
                <button
                  onClick={() => addFromPreset(null)}
                  className="block w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-t text-gray-600"
                >
                  自定义空白
                </button>
              </div>
            )}
          </div>
          <button
            onClick={deleteConfig}
            disabled={settings.apiConfigs.length <= 1}
            className="px-3 py-2 text-red-500 border border-red-200 rounded hover:bg-red-50 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            删除
          </button>
        </div>

        {activeConfig && (
          <div className="space-y-3 pl-1">
            <label className="block">
              <span className="text-sm text-gray-600">配置名称</span>
              <input
                type="text"
                value={activeConfig.name}
                onChange={(e) => updateActiveConfig({ name: e.target.value })}
                className="mt-1 block w-full border rounded px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">API Base URL</span>
              <input
                type="text"
                value={activeConfig.baseUrl}
                onChange={(e) => updateActiveConfig({ baseUrl: e.target.value })}
                className="mt-1 block w-full border rounded px-3 py-2"
                placeholder="https://api.openai.com/v1"
              />
              <span className="text-xs text-gray-400 mt-1 block">示例：https://api.deepseek.com/v1、http://localhost:11434/v1</span>
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">API Key</span>
              <input
                type="password"
                value={activeConfig.apiKey}
                onChange={(e) => updateActiveConfig({ apiKey: e.target.value })}
                className="mt-1 block w-full border rounded px-3 py-2"
                placeholder="sk-..."
              />
              <span className="text-xs text-gray-400 mt-1 block">格式：sk-... 或对应平台的密钥格式</span>
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">模型</span>
              <input
                type="text"
                value={activeConfig.model}
                onChange={(e) => updateActiveConfig({ model: e.target.value })}
                className="mt-1 block w-full border rounded px-3 py-2"
                placeholder="gpt-4o-mini"
              />
              <span className="text-xs text-gray-400 mt-1 block">示例：gpt-4o-mini、deepseek-chat、anthropic/claude-3.5-sonnet</span>
            </label>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">翻译设置</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-gray-600">翻译风格</span>
            <select
              value={settings.style}
              onChange={(e) => immediatelySave({ ...settings, style: e.target.value as UserSettings['style'] })}
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
    </div>
  );
}
