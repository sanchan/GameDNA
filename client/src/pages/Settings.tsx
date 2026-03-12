import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import type { UserSettings } from '../../../shared/types';

export default function Settings() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [ollamaHealthy, setOllamaHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    api.get<UserSettings>('/settings')
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  // Check Ollama health
  useEffect(() => {
    fetch('/api/health').then(() => {
      const url = settings?.ollamaUrl || 'http://localhost:11434';
      fetch(`${url}/api/tags`).then((r) => setOllamaHealthy(r.ok)).catch(() => setOllamaHealthy(false));
    }).catch(() => {});
  }, [settings?.ollamaUrl]);

  const handleSave = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api.put('/settings', settings);
      toast('Settings saved', 'success');
    } catch {
      toast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }, [settings, toast]);

  const handleBackup = useCallback(async () => {
    setBackingUp(true);
    try {
      const result = await api.post<{ success: boolean; path: string }>('/settings/backup');
      toast(`Backup created: ${result.path}`, 'success');
    } catch {
      toast('Backup failed', 'error');
    } finally {
      setBackingUp(false);
    }
  }, [toast]);

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
            <i className="fa-solid fa-palette text-purple-400" />
            Appearance
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">Theme</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setSettings({ ...settings, theme: 'dark' })}
                  className={`flex-1 p-4 rounded-xl border transition-all ${settings.theme === 'dark' ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[#333] hover:border-[#444]'}`}
                >
                  <i className="fa-solid fa-moon text-xl mb-2 block" />
                  <span className="text-sm font-medium">Dark</span>
                </button>
                <button
                  onClick={() => setSettings({ ...settings, theme: 'light' })}
                  className={`flex-1 p-4 rounded-xl border transition-all ${settings.theme === 'light' ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[#333] hover:border-[#444]'}`}
                >
                  <i className="fa-solid fa-sun text-xl mb-2 block" />
                  <span className="text-sm font-medium">Light</span>
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
            <i className="fa-solid fa-brain text-blue-400" />
            AI Configuration
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">Ollama URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.ollamaUrl || ''}
                  onChange={(e) => setSettings({ ...settings, ollamaUrl: e.target.value || null })}
                  placeholder="http://localhost:11434"
                  className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--primary)]"
                />
                <div className={`px-3 py-2.5 rounded-lg text-xs font-bold ${ollamaHealthy ? 'bg-green-500/20 text-green-400' : ollamaHealthy === false ? 'bg-red-500/20 text-red-400' : 'bg-[#333] text-gray-400'}`}>
                  {ollamaHealthy ? 'Connected' : ollamaHealthy === false ? 'Offline' : 'Checking...'}
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
          </div>
        </div>

        {/* Cache & Performance */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-gauge-high text-green-400" />
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

        {/* Backup */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-database text-amber-400" />
            Backup
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">Backup Directory</label>
              <input
                type="text"
                value={settings.backupDir || ''}
                onChange={(e) => setSettings({ ...settings, backupDir: e.target.value || null })}
                placeholder="./data/backups"
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">Auto-backup Interval (hours)</label>
              <input
                type="number"
                value={settings.backupIntervalHours}
                onChange={(e) => setSettings({ ...settings, backupIntervalHours: Number(e.target.value) || 24 })}
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--primary)]"
              />
            </div>
            <button
              onClick={handleBackup}
              disabled={backingUp}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-xl text-sm font-medium hover:bg-amber-500/30 transition-colors disabled:opacity-50"
            >
              <i className={`fa-solid ${backingUp ? 'fa-spinner fa-spin' : 'fa-download'}`} />
              {backingUp ? 'Creating Backup...' : 'Backup Now'}
            </button>
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-keyboard text-cyan-400" />
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
