import { useState, useEffect, useCallback, useRef, useMemo, useSyncExternalStore } from 'react';
import { Navigate, useNavigate } from 'react-router';
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
import { Select } from '../components/Select';
import { getAuditLog, clearAuditLog, subscribeAuditLog, type ApiAuditEntry } from '../services/api-audit';

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
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingApiKey, setSavingApiKey] = useState(false);

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
      }).catch(() => { });
    }
  }, [aiProvider]);

  // Track the last-saved snapshot for dirty detection
  const savedSettingsRef = useRef<UserSettings | null>(null);

  const saveNow = useCallback((
    overrideSettings?: UserSettings,
    overrideAiProvider?: AiProvider | null,
  ) => {
    const s = overrideSettings ?? settings;
    const provider = overrideAiProvider !== undefined ? overrideAiProvider : aiProvider;
    if (!s || !userId) return;
    setSaving(true);
    try {
      queries.saveUserSettings(userId, s);
      queries.updateConfig({
        aiProvider: provider,
        ollamaUrl: s.ollamaUrl ?? null,
        ollamaModel: s.ollamaModel ?? null,
        webllmModel: provider === 'webllm' ? webllmModel : null,
      });
      refreshConfig?.();
      savedSettingsRef.current = s;
      toast('Settings saved', 'success');
    } catch {
      toast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }, [settings, userId, toast, aiProvider, webllmModel, refreshConfig]);

  const handleSave = useCallback(() => saveNow(), [saveNow]);

  // Initialize saved snapshot when settings first load
  useEffect(() => {
    if (settings && !savedSettingsRef.current) {
      savedSettingsRef.current = settings;
    }
  }, [settings]);

  // Dirty = text fields differ from last save (buttons auto-save, so we only check text inputs)
  const isDirty = useMemo(() => {
    if (!settings || !savedSettingsRef.current) return false;
    const saved = savedSettingsRef.current;
    return (
      (settings.ollamaUrl ?? '') !== (saved.ollamaUrl ?? '') ||
      (settings.ollamaModel ?? '') !== (saved.ollamaModel ?? '') ||
      (settings.explanationTemplate ?? '') !== (saved.explanationTemplate ?? '') ||
      (settings.cacheTtlSeconds ?? '') !== (saved.cacheTtlSeconds ?? '')
    );
  }, [settings]);

  // Block browser close / refresh when dirty
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Intercept in-app link clicks when dirty
  const navigate = useNavigate();
  const [pendingNavTo, setPendingNavTo] = useState<string | null>(null);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('//')) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingNavTo(href);
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [isDirty]);


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
                  onClick={() => { const s = { ...settings, theme: 'dark' as const }; setSettings(s); saveNow(s); }}
                  className={`flex-1 p-4 rounded-xl border transition-all text-center ${settings.theme === 'dark' ? 'border-[var(--primary)] bg-[#1a1a1a]' : 'border-[#333] hover:border-[#444]'}`}
                >
                  <i className="fa-solid fa-moon text-xl mb-2" />
                  <span className="text-sm font-medium block">Dark</span>
                </button>
                <button
                  onClick={() => { const s = { ...settings, theme: 'light' as const }; setSettings(s); saveNow(s); }}
                  className={`flex-1 p-4 rounded-xl border transition-all text-center ${settings.theme === 'light' ? 'border-[var(--primary)] bg-[#1a1a1a]' : 'border-[#333] hover:border-[#444]'}`}
                >
                  <i className="fa-solid fa-sun text-xl mb-2" />
                  <span className="text-sm font-medium block">Light</span>
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">Language</label>
              <Select
                value={settings.language}
                onChange={(v) => setSettings({ ...settings, language: v })}
                size="sm"
                options={[
                  { value: 'en', label: 'English' },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Steam API Key */}
        <div className={`bg-[#242424] border rounded-2xl p-6 mb-6 ${!dbConfig?.steamApiKey ? 'border-red-500/50' : 'border-[#333]'}`}>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-key text-gray-400" />
            Steam API Key
          </h2>
          {!dbConfig?.steamApiKey ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
              <p className="text-sm text-red-400">
                <i className="fa-solid fa-triangle-exclamation mr-2" />
                Your Steam API key could not be decrypted (likely due to a browser update). Please re-enter it below to restore sync functionality.
              </p>
            </div>
          ) : (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-4">
              <p className="text-sm text-green-400">
                <i className="fa-solid fa-check-circle mr-2" />
                Steam API key is configured and working.
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={dbConfig?.steamApiKey ? 'Enter new key to replace current one' : 'Enter your Steam API key'}
              className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--primary)]"
            />
            <button
              onClick={async () => {
                if (!apiKeyInput.trim()) return;
                setSavingApiKey(true);
                try {
                  await queries.saveLocalConfig({ steamApiKey: apiKeyInput.trim() });
                  await refreshConfig?.();
                  setApiKeyInput('');
                  toast('Steam API key saved', 'success');
                } catch {
                  toast('Failed to save API key', 'error');
                } finally {
                  setSavingApiKey(false);
                }
              }}
              disabled={!apiKeyInput.trim() || savingApiKey}
              className="px-4 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
            >
              {savingApiKey ? 'Saving...' : 'Save Key'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Get your key from <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:underline">steamcommunity.com/dev/apikey</a>
          </p>
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
                  onClick={() => { setAiProvider('webllm'); saveNow(undefined, 'webllm'); }}
                  className={`flex-1 p-4 rounded-xl border transition-all text-center ${aiProvider === 'webllm' ? 'border-[var(--primary)] bg-[#1a1a1a]' : 'border-[#333] hover:border-[#444]'}`}
                >
                  <i className="fa-solid fa-microchip text-xl mb-2" />
                  <span className="text-sm font-medium block">WebLLM</span>
                  <span className="text-xs text-gray-500 block mt-1">In-browser (WebGPU)</span>
                </button>
                <button
                  onClick={() => { setAiProvider('ollama'); saveNow(undefined, 'ollama'); }}
                  className={`flex-1 p-4 rounded-xl border transition-all text-center ${aiProvider === 'ollama' ? 'border-[var(--primary)] bg-[#1a1a1a]' : 'border-[#333] hover:border-[#444]'}`}
                >
                  <i className="fa-solid fa-server text-xl mb-2" />
                  <span className="text-sm font-medium block">Ollama</span>
                  <span className="text-xs text-gray-500 block mt-1">Local server</span>
                </button>
                <button
                  onClick={() => { setAiProvider(null); saveNow(undefined, null); }}
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

        {/* API Audit Log */}
        <ApiAuditLogSection />

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
        <div className="flex justify-end gap-3 items-center">
          {isDirty && (
            <span className="text-sm text-amber-400">
              <i className="fa-solid fa-circle-exclamation mr-1" />
              Unsaved changes
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 ${isDirty ? 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 ring-2 ring-[var(--primary)]/30' : 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90'}`}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Unsaved changes dialog */}
        {pendingNavTo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-2">Unsaved Changes</h3>
              <p className="text-sm text-gray-400 mb-6">
                You have unsaved settings. Do you want to save before leaving?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setPendingNavTo(null); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 border border-[#444] hover:bg-[#333] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { const to = pendingNavTo; setPendingNavTo(null); navigate(to); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-red-400 border border-red-500/50 hover:bg-red-500/10 transition-colors"
                >
                  Discard
                </button>
                <button
                  onClick={() => { saveNow(); const to = pendingNavTo; setPendingNavTo(null); navigate(to); }}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
                >
                  Save & Leave
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ApiAuditLogSection() {
  const log = useSyncExternalStore(subscribeAuditLog, getAuditLog);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <i className="fa-solid fa-scroll text-gray-400" />
          API Call Log
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{log.length} calls this session</span>
          {log.length > 0 && (
            <button
              onClick={clearAuditLog}
              className="text-xs text-gray-400 hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Every external API call the app makes is logged here. No data leaves your device except Steam API requests shown below.
      </p>
      {log.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No API calls recorded yet.</p>
      ) : (
        <>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {log.slice(-(expanded ? 100 : 10)).reverse().map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 text-xs font-mono bg-[#1a1a1a] rounded px-3 py-2">
                <span className="text-gray-500 shrink-0">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                <span className={`shrink-0 ${entry.status && entry.status < 400 ? 'text-green-400' : 'text-red-400'}`}>
                  {entry.status ?? 'ERR'}
                </span>
                <span className="text-gray-300 truncate">{entry.url}</span>
                <span className="text-gray-500 shrink-0 ml-auto">{entry.durationMs}ms</span>
              </div>
            ))}
          </div>
          {log.length > 10 && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-2 text-xs text-[var(--primary)] hover:underline"
            >
              Show all {log.length} entries
            </button>
          )}
        </>
      )}
    </div>
  );
}
