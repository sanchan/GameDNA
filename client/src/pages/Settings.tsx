import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { useDb } from '../contexts/db-context';
import * as queries from '../db/queries';
import { useToast } from '../components/Toast';
import { useAi } from '../hooks/use-ai';
import WebLLMSetup from '../components/WebLLMSetup';
import DataManagement from '../components/DataManagement';
import MigrationTool from '../components/MigrationTool';
import type { AiProvider } from '../services/ai-engine';
import type { UserSettings } from '../../../shared/types';
import { DEFAULT_EXPLANATION_TEMPLATE } from '../services/ai-features';

export default function Settings() {
  const { user, loading: authLoading } = useAuth();
  const { userId, config: dbConfig, refreshConfig } = useDb();
  const { toast } = useToast();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProvider | null>(null);
  const [webllmModel, setWebllmModel] = useState('Llama-3.2-1B-Instruct-q4f16_1-MLC');
  const ai = useAi();

  useEffect(() => {
    if (!user || !userId) return;
    try {
      const s = queries.getUserSettings(userId);
      setSettings(s);
    } catch { /* ignore */ }
    setLoading(false);
  }, [user, userId]);

  // Load AI provider from config
  useEffect(() => {
    if (!dbConfig) return;
    setAiProvider((dbConfig.aiProvider as AiProvider) ?? null);
    if (dbConfig.webllmModel) setWebllmModel(dbConfig.webllmModel);
  }, [dbConfig]);

  // Check health when provider changes
  useEffect(() => {
    if (aiProvider) {
      ai.initEngine(aiProvider, {
        ollamaUrl: settings?.ollamaUrl ?? undefined,
        ollamaModel: settings?.ollamaModel ?? undefined,
        webllmModel,
      }).catch(() => {});
    }
  }, [aiProvider]);

  const handleSave = useCallback(() => {
    if (!settings || !userId) return;
    setSaving(true);
    try {
      queries.saveUserSettings(userId, settings);
      // Persist AI provider config
      if (aiProvider) {
        queries.updateConfig({
          aiProvider,
          ollamaUrl: settings.ollamaUrl ?? null,
          ollamaModel: settings.ollamaModel ?? null,
          webllmModel: aiProvider === 'webllm' ? webllmModel : null,
        });
        refreshConfig?.();
      }
      toast('Settings saved', 'success');
    } catch {
      toast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }, [settings, userId, toast, aiProvider, webllmModel, refreshConfig]);


  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  if (loading || !settings) {
    return (
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-[#242424] border border-[#333] rounded-2xl p-6 animate-pulse">
              <div className="h-6 w-40 bg-[#333] rounded mb-4" />
              <div className="h-10 w-full bg-[#333] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">Settings</h1>
          <p className="text-gray-400">Configure GameDNA to your preferences</p>
        </div>

        {/* Appearance */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-palette text-gray-400" />
            Appearance
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">Theme</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setSettings({ ...settings, theme: 'dark' })}
                  className={`flex-1 p-4 rounded-xl border transition-all text-center ${settings.theme === 'dark' ? 'border-[var(--primary)] bg-[#1a1a1a]' : 'border-[#333] hover:border-[#444]'}`}
                >
                  <i className="fa-solid fa-moon text-xl mb-2" />
                  <span className="text-sm font-medium block">Dark</span>
                </button>
                <button
                  onClick={() => setSettings({ ...settings, theme: 'light' })}
                  className={`flex-1 p-4 rounded-xl border transition-all text-center ${settings.theme === 'light' ? 'border-[var(--primary)] bg-[#1a1a1a]' : 'border-[#333] hover:border-[#444]'}`}
                >
                  <i className="fa-solid fa-sun text-xl mb-2" />
                  <span className="text-sm font-medium block">Light</span>
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">Language</label>
              <select
                value={settings.language}
                onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--primary)]"
              >
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

        {/* AI Configuration */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-brain text-gray-400" />
            AI Configuration
          </h2>
          <div className="space-y-4">
            {/* Provider Toggle */}
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">AI Provider</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setAiProvider('ollama')}
                  className={`flex-1 p-4 rounded-xl border transition-all text-center ${aiProvider === 'ollama' ? 'border-[var(--primary)] bg-[#1a1a1a]' : 'border-[#333] hover:border-[#444]'}`}
                >
                  <i className="fa-solid fa-server text-xl mb-2" />
                  <span className="text-sm font-medium block">Ollama</span>
                  <span className="text-xs text-gray-500 block mt-1">Local server</span>
                </button>
                <button
                  onClick={() => setAiProvider('webllm')}
                  className={`flex-1 p-4 rounded-xl border transition-all text-center ${aiProvider === 'webllm' ? 'border-[var(--primary)] bg-[#1a1a1a]' : 'border-[#333] hover:border-[#444]'}`}
                >
                  <i className="fa-solid fa-microchip text-xl mb-2" />
                  <span className="text-sm font-medium block">WebLLM</span>
                  <span className="text-xs text-gray-500 block mt-1">In-browser (WebGPU)</span>
                </button>
                <button
                  onClick={() => setAiProvider(null)}
                  className={`flex-1 p-4 rounded-xl border transition-all text-center ${!aiProvider ? 'border-[var(--primary)] bg-[#1a1a1a]' : 'border-[#333] hover:border-[#444]'}`}
                >
                  <i className="fa-solid fa-ban text-xl mb-2" />
                  <span className="text-sm font-medium block">None</span>
                  <span className="text-xs text-gray-500 block mt-1">Heuristic only</span>
                </button>
              </div>
            </div>

            {/* Ollama config */}
            {aiProvider === 'ollama' && (
              <>
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">Ollama URL</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={settings.ollamaUrl || ''}
                      onChange={(e) => setSettings({ ...settings, ollamaUrl: e.target.value || null })}
                      placeholder="http://localhost:11434"
                      className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--primary)]"
                    />
                    <div className={`px-3 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap ${ai.healthy ? 'bg-green-500/20 text-green-400' : ai.healthy === false ? 'bg-red-500/20 text-red-400' : 'bg-[#333] text-gray-400'}`}>
                      {ai.healthy ? 'Connected' : ai.healthy === false ? 'Offline' : 'Checking...'}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">Ollama Model</label>
                  <input
                    type="text"
                    value={settings.ollamaModel || ''}
                    onChange={(e) => setSettings({ ...settings, ollamaModel: e.target.value || null })}
                    placeholder="llama3.1:8b"
                    className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </>
            )}

            {/* WebLLM config */}
            {aiProvider === 'webllm' && (
              <WebLLMSetup
                selectedModel={webllmModel}
                onModelChange={setWebllmModel}
              />
            )}

            {!aiProvider && (
              <p className="text-sm text-gray-500">AI features disabled. Recommendations will use heuristic scoring only.</p>
            )}

            {/* Explanation Template */}
            {aiProvider && (
              <div className="border-t border-[#333] pt-4 mt-4">
                <label className="text-sm font-medium text-gray-300 mb-2 block">
                  "Why this game?" Prompt Template
                </label>
                <textarea
                  value={settings.explanationTemplate || ''}
                  onChange={(e) => setSettings({ ...settings, explanationTemplate: e.target.value || null })}
                  placeholder={DEFAULT_EXPLANATION_TEMPLATE}
                  rows={8}
                  className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--primary)] font-mono resize-y"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  Available variables: <code className="text-gray-400">{'{{game_name}}'}</code> <code className="text-gray-400">{'{{game_genres}}'}</code> <code className="text-gray-400">{'{{game_tags}}'}</code> <code className="text-gray-400">{'{{game_description}}'}</code> <code className="text-gray-400">{'{{game_reviews}}'}</code> <code className="text-gray-400">{'{{game_price}}'}</code> <code className="text-gray-400">{'{{player_genres}}'}</code> <code className="text-gray-400">{'{{player_tags}}'}</code> <code className="text-gray-400">{'{{player_budget}}'}</code> <code className="text-gray-400">{'{{player_playtime}}'}</code>
                </p>
                {settings.explanationTemplate && (
                  <button
                    onClick={() => setSettings({ ...settings, explanationTemplate: null })}
                    className="text-xs text-[var(--primary)] hover:underline mt-1"
                  >
                    Reset to default
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Cache & Performance */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-gauge-high text-gray-400" />
            Cache & Performance
          </h2>
          <div>
            <label className="text-sm font-medium text-gray-300 mb-2 block">Cache TTL (seconds)</label>
            <input
              type="number"
              value={settings.cacheTtlSeconds ?? ''}
              onChange={(e) => setSettings({ ...settings, cacheTtlSeconds: e.target.value ? Number(e.target.value) : null })}
              placeholder="604800 (7 days)"
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--primary)]"
            />
            <p className="text-xs text-gray-500 mt-1">How long to cache game metadata. Default: 604800 (7 days)</p>
          </div>
        </div>

        {/* Data Management */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-database text-gray-400" />
            Data Management
          </h2>
          <DataManagement />
        </div>

        {/* Migration */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-cloud-arrow-down text-gray-400" />
            Import from Server
          </h2>
          <MigrationTool />
        </div>

        {/* Keyboard Shortcuts */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-keyboard text-gray-400" />
            Keyboard Shortcuts
          </h2>
          <div className="space-y-3">
            {[
              { key: 'G D', desc: 'Go to Discovery' },
              { key: 'G R', desc: 'Go to Recommendations' },
              { key: 'G L', desc: 'Go to My Lists' },
              { key: 'G H', desc: 'Go to History' },
              { key: 'G B', desc: 'Go to Backlog' },
              { key: 'G P', desc: 'Go to Profile' },
              { key: 'G S', desc: 'Go to Settings' },
              { key: 'G C', desc: 'Go to Chat' },
              { key: '/', desc: 'Focus search' },
            ].map(({ key, desc }) => (
              <div key={key} className="flex items-center justify-between bg-[#1a1a1a] rounded-lg px-4 py-3">
                <span className="text-sm text-gray-300">{desc}</span>
                <kbd className="px-2 py-1 bg-[#333] rounded text-xs font-mono text-gray-300">{key}</kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
