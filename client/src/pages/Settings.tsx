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
import { useTheme, type Theme } from '../hooks/use-theme';
import ThemePicker from '../components/ThemePicker';
import { getAuditLog, clearAuditLog, subscribeAuditLog, type ApiAuditEntry } from '../services/api-audit';
import { isValidSteamApiKeyFormat, isValidOllamaUrl } from '../db/crypto';

export default function Settings() {
  const { user, loading: authLoading } = useAuth();
  const { userId, config: dbConfig, refreshConfig } = useDb();
  const { toast } = useToast();
  const { setTheme } = useTheme();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProvider | null>(null);
  const [webllmModel, setWebllmModel] = useState('Llama-3.2-1B-Instruct-q4f16_1-MLC');
  const ai = useAi();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);

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
            <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 animate-pulse">
              <div className="h-6 w-40 bg-[var(--muted)] rounded mb-4" />
              <div className="h-10 w-full bg-[var(--muted)] rounded" />
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
          <p className="text-[var(--text-muted)]">Configure GameDNA to your preferences</p>
        </div>

        {/* Appearance */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <i className="fa-solid fa-palette text-[var(--text-muted)]" />
            Appearance
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[var(--text-body)] mb-2 block">Theme</label>
              <ThemePicker
                value={settings.theme}
                onChange={(t: Theme) => { const s = { ...settings, theme: t }; setSettings(s); setTheme(t); saveNow(s); }}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--text-body)] mb-2 block">Language</label>
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
        <div className={`bg-[var(--card)] border rounded-2xl p-6 mb-6 ${!dbConfig?.steamApiKey ? 'border-red-500/50' : 'border-[var(--border)]'}`}>
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <i className="fa-solid fa-key text-[var(--text-muted)]" />
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
              className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--foreground)] placeholder-gray-500 focus:outline-none focus:border-[var(--primary)]"
            />
            <button
              onClick={async () => {
                const key = apiKeyInput.trim();
                if (!key) return;
                if (!isValidSteamApiKeyFormat(key)) {
                  setApiKeyError('Invalid format — Steam API keys are 32 hexadecimal characters.');
                  return;
                }
                setApiKeyError(null);
                setSavingApiKey(true);
                try {
                  await queries.saveLocalConfig({ steamApiKey: key });
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
          {apiKeyError && (
            <p className="text-xs text-red-400 mt-2">
              <i className="fa-solid fa-triangle-exclamation mr-1" />
              {apiKeyError}
            </p>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Get your key from <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:underline">steamcommunity.com/dev/apikey</a>. Keys are 32 hex characters (e.g. A1B2C3D4...).
          </p>
        </div>

        {/* AI Configuration */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <i className="fa-solid fa-brain text-[var(--text-muted)]" />
            AI Configuration
          </h2>
          <div className="space-y-4">
            {/* Provider Toggle */}
            <div>
              <label className="text-sm font-medium text-[var(--text-body)] mb-2 block">AI Provider</label>
              <div className="flex gap-3">
                <button
                  onClick={() => { setAiProvider('webllm'); saveNow(undefined, 'webllm'); }}
                  className={`flex-1 p-4 rounded-xl border transition-all text-center ${aiProvider === 'webllm' ? 'border-[var(--primary)] bg-[var(--background)]' : 'border-[var(--border)] hover:border-[var(--muted-foreground)]'}`}
                >
                  <i className="fa-solid fa-microchip text-xl mb-2" />
                  <span className="text-sm font-medium block">WebLLM</span>
                  <span className="text-xs text-gray-500 block mt-1">In-browser (WebGPU)</span>
                </button>
                <button
                  onClick={() => { setAiProvider('ollama'); saveNow(undefined, 'ollama'); }}
                  className={`flex-1 p-4 rounded-xl border transition-all text-center ${aiProvider === 'ollama' ? 'border-[var(--primary)] bg-[var(--background)]' : 'border-[var(--border)] hover:border-[var(--muted-foreground)]'}`}
                >
                  <i className="fa-solid fa-server text-xl mb-2" />
                  <span className="text-sm font-medium block">Ollama</span>
                  <span className="text-xs text-gray-500 block mt-1">Local server</span>
                </button>
                <button
                  onClick={() => { setAiProvider(null); saveNow(undefined, null); }}
                  className={`flex-1 p-4 rounded-xl border transition-all text-center ${!aiProvider ? 'border-[var(--primary)] bg-[var(--background)]' : 'border-[var(--border)] hover:border-[var(--muted-foreground)]'}`}
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
                  <label className="text-sm font-medium text-[var(--text-body)] mb-2 block">Ollama URL</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={settings.ollamaUrl || ''}
                      onChange={(e) => setSettings({ ...settings, ollamaUrl: e.target.value || null })}
                      placeholder="http://localhost:11434"
                      className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--foreground)] placeholder-gray-500 focus:outline-none focus:border-[var(--primary)]"
                    />
                    <button
                      onClick={async () => {
                        if (!settings.ollamaUrl || !isValidOllamaUrl(settings.ollamaUrl)) {
                          toast('Invalid Ollama URL format', 'error');
                          return;
                        }
                        setTestingConnection(true);
                        try {
                          await ai.initEngine('ollama', { ollamaUrl: settings.ollamaUrl, ollamaModel: settings.ollamaModel ?? undefined });
                          const ok = await ai.checkHealth?.();
                          toast(ok ? 'Ollama connection successful' : 'Ollama is unreachable', ok ? 'success' : 'error');
                        } catch {
                          toast('Ollama connection failed', 'error');
                        } finally {
                          setTestingConnection(false);
                        }
                      }}
                      disabled={testingConnection}
                      className="px-3 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap bg-[var(--muted)] text-[var(--text-body)] hover:bg-[var(--muted-foreground)]/20 transition-colors disabled:opacity-50"
                    >
                      {testingConnection ? 'Testing...' : 'Test'}
                    </button>
                    <div className={`px-3 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap ${ai.healthy ? 'bg-green-500/20 text-green-400' : ai.healthy === false ? 'bg-red-500/20 text-red-400' : 'bg-[var(--muted)] text-[var(--text-muted)]'}`}>
                      {ai.healthy ? 'Connected' : ai.healthy === false ? 'Offline' : 'Checking...'}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--text-body)] mb-2 block">Ollama Model</label>
                  <input
                    type="text"
                    value={settings.ollamaModel || ''}
                    onChange={(e) => setSettings({ ...settings, ollamaModel: e.target.value || null })}
                    placeholder="llama3.1:8b"
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--foreground)] placeholder-gray-500 focus:outline-none focus:border-[var(--primary)]"
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
              <div className="border-t border-[var(--border)] pt-4 mt-4">
                <label className="text-sm font-medium text-[var(--text-body)] mb-2 block">
                  "Why this game?" Prompt Template
                </label>
                <textarea
                  value={settings.explanationTemplate || ''}
                  onChange={(e) => setSettings({ ...settings, explanationTemplate: e.target.value || null })}
                  placeholder={DEFAULT_EXPLANATION_TEMPLATE}
                  rows={8}
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--foreground)] placeholder-gray-500 focus:outline-none focus:border-[var(--primary)] font-mono resize-y"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  Available variables: <code className="text-[var(--text-muted)]">{'{{game_name}}'}</code> <code className="text-[var(--text-muted)]">{'{{game_genres}}'}</code> <code className="text-[var(--text-muted)]">{'{{game_tags}}'}</code> <code className="text-[var(--text-muted)]">{'{{game_description}}'}</code> <code className="text-[var(--text-muted)]">{'{{game_reviews}}'}</code> <code className="text-[var(--text-muted)]">{'{{game_price}}'}</code> <code className="text-[var(--text-muted)]">{'{{player_genres}}'}</code> <code className="text-[var(--text-muted)]">{'{{player_tags}}'}</code> <code className="text-[var(--text-muted)]">{'{{player_budget}}'}</code> <code className="text-[var(--text-muted)]">{'{{player_playtime}}'}</code>
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
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <i className="fa-solid fa-gauge-high text-[var(--text-muted)]" />
            Cache & Performance
          </h2>
          <div>
            <label className="text-sm font-medium text-[var(--text-body)] mb-2 block">Cache TTL (seconds)</label>
            <input
              type="number"
              value={settings.cacheTtlSeconds ?? ''}
              onChange={(e) => setSettings({ ...settings, cacheTtlSeconds: e.target.value ? Number(e.target.value) : null })}
              placeholder="604800 (7 days)"
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--foreground)] placeholder-gray-500 focus:outline-none focus:border-[var(--primary)]"
            />
            <p className="text-xs text-gray-500 mt-1">How long to cache game metadata. Default: 604800 (7 days)</p>
          </div>
        </div>

        {/* Scoring Weights */}
        <ScoringWeightsSection userId={userId} toast={toast} />

        {/* Data Transparency */}
        <DataTransparencySection userId={userId} />

        {/* Data Management */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <i className="fa-solid fa-database text-[var(--text-muted)]" />
            Data Management
          </h2>
          <DataManagement />
        </div>

        {/* API Audit Log */}
        <ApiAuditLogSection />

        {/* Migration */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <i className="fa-solid fa-cloud-arrow-down text-[var(--text-muted)]" />
            Import from Server
          </h2>
          <MigrationTool />
        </div>

        {/* Keyboard Shortcuts */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <i className="fa-solid fa-keyboard text-[var(--text-muted)]" />
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
              <div key={key} className="flex items-center justify-between bg-[var(--background)] rounded-lg px-4 py-3">
                <span className="text-sm text-[var(--text-body)]">{desc}</span>
                <kbd className="px-2 py-1 bg-[var(--muted)] rounded text-xs font-mono text-[var(--text-body)]">{key}</kbd>
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
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
              <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">Unsaved Changes</h3>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                You have unsaved settings. Do you want to save before leaving?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setPendingNavTo(null); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-body)] border border-[var(--muted)] hover:bg-[var(--muted)] transition-colors"
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

function WeightSlider({ label, desc, value, onChange, min = 0, max = 1, step = 0.05 }: {
  label: string; desc: string; value: number;
  onChange: (v: number) => void; min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-[var(--text-body)]">{label}</label>
        <span className="text-sm font-mono text-[var(--primary)]">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="range-slider w-full"
      />
      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
    </div>
  );
}

function ScoringWeightsSection({ userId, toast }: { userId: number | null; toast: (msg: string, type: 'success' | 'error') => void }) {
  const [weights, setWeights] = useState<queries.ScoringWeights | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setWeights(queries.getScoringWeights(userId));
  }, [userId]);

  if (!weights) return null;

  // Ensure the 4 main weights sum to ~1.0
  const normalizeMainWeights = (w: queries.ScoringWeights): queries.ScoringWeights => {
    const sum = w.genreWeight + w.tagWeight + w.reviewWeight + w.recencyWeight;
    if (sum === 0) return w;
    return {
      ...w,
      genreWeight: Math.round((w.genreWeight / sum) * 100) / 100,
      tagWeight: Math.round((w.tagWeight / sum) * 100) / 100,
      reviewWeight: Math.round((w.reviewWeight / sum) * 100) / 100,
      recencyWeight: Math.round((w.recencyWeight / sum) * 100) / 100,
    };
  };

  const handleSave = () => {
    if (!userId || !weights) return;
    const normalized = normalizeMainWeights(weights);
    setWeights(normalized);
    queries.saveScoringWeights(userId, normalized);
    toast('Scoring weights saved', 'success');
  };

  const handleReset = () => {
    const defaults: queries.ScoringWeights = {
      genreWeight: 0.4, tagWeight: 0.3, reviewWeight: 0.2, recencyWeight: 0.1,
      temporalDecayRate: 0.01, explorationRatio: 0.15,
    };
    setWeights(defaults);
    if (userId) {
      queries.saveScoringWeights(userId, defaults);
      toast('Scoring weights reset to defaults', 'success');
    }
  };

  const decayLabel = weights.temporalDecayRate >= 0.02
    ? 'Fast (tastes change often)'
    : weights.temporalDecayRate <= 0.005
    ? 'Slow (I know what I like)'
    : 'Medium';

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <i className="fa-solid fa-sliders text-[var(--text-muted)]" />
          Scoring Weights
        </h2>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-[var(--primary)] hover:underline"
        >
          {expanded ? 'Collapse' : 'Customize'}
        </button>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Control how recommendations are scored. These weights determine the importance of each factor.
        Weights auto-normalize to sum to 100%.
      </p>

      {expanded && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <WeightSlider label="Genre Match" desc="How much genres matter" value={weights.genreWeight}
              onChange={(v) => setWeights({ ...weights, genreWeight: v })} />
            <WeightSlider label="Tag Match" desc="How much tags matter" value={weights.tagWeight}
              onChange={(v) => setWeights({ ...weights, tagWeight: v })} />
            <WeightSlider label="Community Reviews" desc="How much reviews matter" value={weights.reviewWeight}
              onChange={(v) => setWeights({ ...weights, reviewWeight: v })} />
            <WeightSlider label="Release Recency" desc="Preference for newer games" value={weights.recencyWeight}
              onChange={(v) => setWeights({ ...weights, recencyWeight: v })} />
          </div>

          <div className="border-t border-[var(--border)] pt-4">
            <WeightSlider label="Exploration Ratio" desc="Percentage of recommendations reserved for outside-your-comfort-zone picks" value={weights.explorationRatio}
              onChange={(v) => setWeights({ ...weights, explorationRatio: v })} max={0.5} />
          </div>

          <div className="border-t border-[var(--border)] pt-4">
            <WeightSlider label={`Temporal Decay — ${decayLabel}`} desc="How fast old swipes lose influence. Higher = recent swipes matter much more than old ones."
              value={weights.temporalDecayRate}
              onChange={(v) => setWeights({ ...weights, temporalDecayRate: v })}
              min={0.001} max={0.05} step={0.001} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={handleReset} className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-red-400 transition-colors">
              Reset to Defaults
            </button>
            <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
              Save Weights
            </button>
          </div>
        </div>
      )}

      {!expanded && (
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Genre', value: weights.genreWeight },
            { label: 'Tags', value: weights.tagWeight },
            { label: 'Reviews', value: weights.reviewWeight },
            { label: 'Recency', value: weights.recencyWeight },
          ].map((w) => (
            <span key={w.label} className="px-3 py-1 bg-[var(--background)] rounded-full text-xs text-[var(--text-body)]">
              {w.label}: {Math.round(w.value * 100)}%
            </span>
          ))}
          <span className="px-3 py-1 bg-[var(--primary)]/10 rounded-full text-xs text-[var(--primary)]">
            Exploration: {Math.round(weights.explorationRatio * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}

function DataTransparencySection({ userId }: { userId: number | null }) {
  const [stats, setStats] = useState<ReturnType<typeof queries.getDataTransparencyStats> | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setStats(queries.getDataTransparencyStats(userId));
  }, [userId]);

  if (!stats) return null;

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <i className="fa-solid fa-shield-halved text-[var(--text-muted)]" />
          Data Transparency
        </h2>
        <button onClick={() => setExpanded(!expanded)} className="text-sm text-[var(--primary)] hover:underline">
          {expanded ? 'Collapse' : 'View Details'}
        </button>
      </div>

      <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 mb-4">
        <p className="text-sm text-green-400">
          <i className="fa-solid fa-lock mr-2" />
          No data leaves your device except Steam API calls shown in the audit log.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--foreground)]">{formatBytes(stats.dbSizeBytes)}</div>
          <div className="text-xs text-[var(--text-muted)]">Database Size</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--foreground)]">{stats.apiUsage.count.toLocaleString()}</div>
          <div className="text-xs text-[var(--text-muted)]">API Calls Today</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--foreground)]">{stats.errorCount}</div>
          <div className="text-xs text-[var(--text-muted)]">Errors (7d)</div>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 mt-4 border-t border-[var(--border)] pt-4">
          <h3 className="text-sm font-medium text-[var(--text-body)] mb-2">What's stored locally</h3>
          {stats.counts.map((c) => (
            <div key={c.table} className="flex items-center justify-between bg-[var(--background)] rounded-lg px-3 py-2">
              <span className="text-sm text-[var(--text-body)]">{c.label}</span>
              <span className="text-sm font-mono text-[var(--text-muted)]">{c.count.toLocaleString()} rows</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ApiAuditLogSection() {
  const log = useSyncExternalStore(subscribeAuditLog, getAuditLog);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <i className="fa-solid fa-scroll text-[var(--text-muted)]" />
          API Call Log
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{log.length} calls this session</span>
          {log.length > 0 && (
            <button
              onClick={clearAuditLog}
              className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Every external API call the app makes is logged here. No data leaves your device except Steam API requests shown below.
      </p>
      {log.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No API calls recorded yet.</p>
      ) : (
        <>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {log.slice(-(expanded ? 100 : 10)).reverse().map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 text-xs font-mono bg-[var(--background)] rounded px-3 py-2">
                <span className="text-gray-500 shrink-0">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                <span className={`shrink-0 ${entry.status && entry.status < 400 ? 'text-green-400' : 'text-red-400'}`}>
                  {entry.status ?? 'ERR'}
                </span>
                <span className="text-[var(--text-body)] truncate">{entry.url}</span>
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
