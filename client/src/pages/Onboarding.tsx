import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useDb } from '../contexts/db-context';
import * as queries from '../db/queries';
import { importDb } from '../db/index';
import { getPlayerSummary, resolveVanityUrl } from '../services/steam-api';
import type { AiProvider } from '../services/ai-engine';

type Step = 'welcome' | 'steam-id' | 'api-key' | 'preferences' | 'import';

const WEBLLM_MODELS = [
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 1B', size: '~700MB' },
  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', name: 'Llama 3.1 8B', size: '~4.5GB' },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi 3.5 Mini', size: '~2GB' },
  { id: 'gemma-2-2b-it-q4f16_1-MLC', name: 'Gemma 2 2B', size: '~1.3GB' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { refreshConfig } = useDb();
  const [step, setStep] = useState<Step>('welcome');
  const [steamInput, setSteamInput] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [playerAvatar, setPlayerAvatar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Preferences state
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [selectedAiProvider, setSelectedAiProvider] = useState<AiProvider | null>('webllm');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3.1:8b');
  const [webllmModel, setWebllmModel] = useState('Llama-3.2-1B-Instruct-q4f16_1-MLC');

  const resolveSteamId = useCallback(async () => {
    setError(null);
    setLoading(true);

    let steamId = steamInput.trim();

    // Extract from profile URL
    const profileMatch = steamId.match(/steamcommunity\.com\/profiles\/(\d+)/);
    const vanityMatch = steamId.match(/steamcommunity\.com\/id\/([^/]+)/);

    if (profileMatch) {
      steamId = profileMatch[1];
    } else if (vanityMatch) {
      // Need API key to resolve vanity URL, skip for now
      setError('Please enter your Steam ID number directly (17-digit number), or enter your API key first to resolve profile URLs.');
      setLoading(false);
      return;
    }

    // Validate: should be a 17-digit number
    if (!/^\d{17}$/.test(steamId)) {
      setError('Please enter a valid 17-digit Steam ID (e.g., 76561198012345678), or paste your Steam profile URL.');
      setLoading(false);
      return;
    }

    setResolvedId(steamId);
    setLoading(false);
    setStep('api-key');
  }, [steamInput]);

  const validateApiKey = useCallback(async () => {
    if (!resolvedId || !apiKey.trim()) return;
    setError(null);
    setLoading(true);

    try {
      // Validate API key by fetching player summary
      const summary = await getPlayerSummary(resolvedId, apiKey.trim());
      if (!summary) {
        setError('Could not verify your Steam ID and API key. Please check both values are correct.');
        setLoading(false);
        return;
      }

      setPlayerName(summary.personaname);
      setPlayerAvatar(summary.avatarfull);
      setStep('preferences');
    } catch (e) {
      setError(`Verification failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [resolvedId, apiKey]);

  const finishSetup = useCallback(async () => {
    if (!resolvedId || !apiKey.trim()) return;
    setError(null);
    setLoading(true);

    try {
      const summary = await getPlayerSummary(resolvedId, apiKey.trim());

      // Save config with preferences
      await queries.saveLocalConfig({
        steamId: resolvedId,
        steamApiKey: apiKey.trim(),
        displayName: summary?.personaname ?? playerName ?? undefined,
        avatarUrl: summary?.avatarfull ?? playerAvatar ?? undefined,
        profileUrl: summary?.profileurl,
        countryCode: summary?.loccountrycode ?? undefined,
        aiProvider: selectedAiProvider ?? undefined,
        ollamaUrl: selectedAiProvider === 'ollama' ? ollamaUrl : undefined,
        ollamaModel: selectedAiProvider === 'ollama' ? ollamaModel : undefined,
        webllmModel: selectedAiProvider === 'webllm' ? webllmModel : undefined,
        setupComplete: true,
      });

      // Ensure user row exists and save user settings (theme)
      const userId = queries.ensureUser(
        resolvedId,
        summary?.personaname ?? playerName ?? '',
        summary?.avatarfull ?? playerAvatar ?? '',
        summary?.profileurl ?? '',
        summary?.loccountrycode,
      );
      const existingSettings = queries.getUserSettings(userId);
      queries.saveUserSettings(userId, { ...existingSettings, theme });

      await refreshConfig();
      navigate('/');
    } catch (e) {
      setError(`Setup failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [resolvedId, apiKey, refreshConfig, navigate, playerName, playerAvatar, theme, selectedAiProvider, ollamaUrl, ollamaModel, webllmModel]);

  const handleImportBackup = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setImportStatus('Reading backup file...');

    try {
      const buffer = await file.arrayBuffer();
      setImportStatus('Restoring database...');
      await importDb(new Uint8Array(buffer));
      setImportStatus('Done!');
      await refreshConfig();
      navigate('/');
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setImportStatus(null);
    } finally {
      setLoading(false);
    }
  }, [refreshConfig, navigate]);

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {(['welcome', 'steam-id', 'api-key', 'preferences'] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`w-3 h-3 rounded-full transition-colors ${
                s === step ? 'bg-[var(--primary)]' : i < ['welcome', 'steam-id', 'api-key', 'preferences'].indexOf(step) ? 'bg-[var(--primary)]/70' : 'bg-[var(--border)]'
              }`}
            />
          ))}
        </div>

        <div className="bg-[var(--card)] rounded-2xl p-8 shadow-xl border border-[var(--border)]">
          {step === 'welcome' && (
            <>
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">
                  Welcome to GameDNA
                </h1>
                <p className="text-[var(--muted-foreground)] text-lg">
                  Discover your gaming personality and find your next favorite game.
                </p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex gap-3 items-start">
                  <div className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[var(--primary)] text-sm font-bold">1</span>
                  </div>
                  <div>
                    <p className="text-[var(--foreground)] font-medium">Your data stays local</p>
                    <p className="text-[var(--muted-foreground)] text-sm">Everything is stored in your browser. No accounts, no servers.</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[var(--primary)] text-sm font-bold">2</span>
                  </div>
                  <div>
                    <p className="text-[var(--foreground)] font-medium">Analyze your Steam library</p>
                    <p className="text-[var(--muted-foreground)] text-sm">Build a taste profile from your games and playtime.</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[var(--primary)] text-sm font-bold">3</span>
                  </div>
                  <div>
                    <p className="text-[var(--foreground)] font-medium">Get personalized recommendations</p>
                    <p className="text-[var(--muted-foreground)] text-sm">Swipe through games tailored to your taste, with optional AI insights.</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep('steam-id')}
                className="w-full py-3 px-6 bg-gradient-to-r from-[#1b2838] to-[#2a475e] hover:from-[#2a475e] hover:to-[#3a5a7e] text-white rounded-xl font-medium transition-all duration-300"
              >
                Get Started
              </button>

              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <p className="text-[var(--muted-foreground)] text-xs text-center mb-3">Already have a backup?</p>
                <label className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] rounded-xl font-medium cursor-pointer hover:bg-[var(--accent)] transition-colors text-sm">
                  <i className="fa-solid fa-upload" />
                  Restore from Backup (.db)
                  <input type="file" accept=".db,.sqlite" onChange={handleImportBackup} className="hidden" />
                </label>
              </div>
            </>
          )}

          {step === 'steam-id' && (
            <>
              <h2 className="text-2xl font-bold text-[var(--foreground)] mb-2">Your Steam ID</h2>
              <p className="text-[var(--muted-foreground)] mb-6">
                Enter your 17-digit Steam ID or paste your Steam profile URL.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Steam ID or Profile URL
                </label>
                <input
                  type="text"
                  value={steamInput}
                  onChange={(e) => setSteamInput(e.target.value)}
                  placeholder="76561198012345678 or https://steamcommunity.com/profiles/..."
                  className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-xl text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  onKeyDown={(e) => e.key === 'Enter' && resolveSteamId()}
                />
              </div>

              <div className="mb-6 p-3 bg-[var(--primary)]/10 border border-[var(--primary)]/30 rounded-xl">
                <p className="text-[var(--primary)] text-sm mb-2 font-medium">How to find your Steam ID:</p>
                <ol className="text-[var(--muted-foreground)] text-sm space-y-1 list-decimal list-inside">
                  <li>Open Steam and go to your profile page</li>
                  <li>The URL will look like <span className="font-mono text-[var(--foreground)] text-xs">steamcommunity.com/profiles/<strong>76561198...</strong></span></li>
                  <li>Copy the 17-digit number from the URL</li>
                </ol>
                <p className="text-[var(--muted-foreground)] text-xs mt-2">
                  If your URL uses a custom name instead, find your numeric ID at{' '}
                  <a href="https://steamid.io" target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] underline">
                    steamid.io
                  </a>
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-[var(--destructive)]/10 border border-[var(--destructive-foreground)]/30 rounded-xl text-[var(--destructive-foreground)] text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('welcome')}
                  className="px-6 py-3 bg-[var(--background)] text-[var(--foreground)] rounded-xl font-medium border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={resolveSteamId}
                  disabled={!steamInput.trim() || loading}
                  className="flex-1 py-3 px-6 bg-gradient-to-r from-[#1b2838] to-[#2a475e] hover:from-[#2a475e] hover:to-[#3a5a7e] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all duration-300"
                >
                  {loading ? 'Checking...' : 'Continue'}
                </button>
              </div>
            </>
          )}

          {step === 'api-key' && (
            <>
              <h2 className="text-2xl font-bold text-[var(--foreground)] mb-2">Steam API Key</h2>
              <p className="text-[var(--muted-foreground)] mb-6">
                We need your Steam Web API key to access your game library. It's stored encrypted, locally in your browser only.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Your Steam Web API key"
                  className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-xl text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] font-mono"
                  onKeyDown={(e) => e.key === 'Enter' && validateApiKey()}
                />
              </div>

              <div className="mb-6 p-3 bg-[var(--primary)]/10 border border-[var(--primary)]/30 rounded-xl">
                <p className="text-[var(--primary)] text-sm mb-2 font-medium">How to get your API key:</p>
                <ol className="text-[var(--muted-foreground)] text-sm space-y-1 list-decimal list-inside">
                  <li>
                    Go to{' '}
                    <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] underline">
                      steamcommunity.com/dev/apikey
                    </a>
                  </li>
                  <li>Log in with your Steam account</li>
                  <li>Enter any domain name (e.g., "localhost")</li>
                  <li>Copy the key shown on the page</li>
                </ol>
              </div>

              {resolvedId && (
                <p className="text-[var(--muted-foreground)] text-xs mb-4">
                  Steam ID: <span className="font-mono text-[var(--foreground)]">{resolvedId}</span>
                </p>
              )}

              {playerName && (
                <div className="mb-4 flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                  {playerAvatar && <img src={playerAvatar} alt="" className="w-10 h-10 rounded-full" />}
                  <div>
                    <p className="text-green-400 text-sm font-medium">Verified!</p>
                    <p className="text-[var(--foreground)] text-sm">{playerName}</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 bg-[var(--destructive)]/10 border border-[var(--destructive-foreground)]/30 rounded-xl text-[var(--destructive-foreground)] text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep('steam-id'); setError(null); }}
                  className="px-6 py-3 bg-[var(--background)] text-[var(--foreground)] rounded-xl font-medium border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={validateApiKey}
                  disabled={!apiKey.trim() || loading}
                  className="flex-1 py-3 px-6 bg-gradient-to-r from-[#1b2838] to-[#2a475e] hover:from-[#2a475e] hover:to-[#3a5a7e] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all duration-300"
                >
                  {loading ? 'Verifying...' : 'Continue'}
                </button>
              </div>
            </>
          )}

          {step === 'preferences' && (
            <>
              <h2 className="text-2xl font-bold text-[var(--foreground)] mb-2">Preferences</h2>
              <p className="text-[var(--muted-foreground)] mb-6">
                Customize your experience. You can change these later in Settings.
              </p>

              {/* Appearance */}
              <div className="mb-6">
                <label className="text-sm font-medium text-[var(--foreground)] mb-3 block flex items-center gap-2">
                  <i className="fa-solid fa-palette text-[var(--muted-foreground)]" />
                  Theme
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex-1 p-4 rounded-xl border transition-all text-center ${theme === 'dark' ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] hover:border-[var(--primary)]/50'}`}
                  >
                    <i className="fa-solid fa-moon text-xl mb-2 text-[var(--foreground)]" />
                    <span className="text-sm font-medium block text-[var(--foreground)]">Dark</span>
                  </button>
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex-1 p-4 rounded-xl border transition-all text-center ${theme === 'light' ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] hover:border-[var(--primary)]/50'}`}
                  >
                    <i className="fa-solid fa-sun text-xl mb-2 text-[var(--foreground)]" />
                    <span className="text-sm font-medium block text-[var(--foreground)]">Light</span>
                  </button>
                </div>
              </div>

              {/* AI Provider */}
              <div className="mb-6">
                <label className="text-sm font-medium text-[var(--foreground)] mb-3 block flex items-center gap-2">
                  <i className="fa-solid fa-brain text-[var(--muted-foreground)]" />
                  AI Provider
                </label>
                <div className="flex gap-3 mb-3">
                  <button
                    onClick={() => setSelectedAiProvider('webllm')}
                    className={`flex-1 p-4 rounded-xl border transition-all text-center ${selectedAiProvider === 'webllm' ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] hover:border-[var(--primary)]/50'}`}
                  >
                    <i className="fa-solid fa-microchip text-xl mb-2 text-[var(--foreground)]" />
                    <span className="text-sm font-medium block text-[var(--foreground)]">WebLLM</span>
                    <span className="text-xs text-[var(--muted-foreground)] block mt-1">In-browser (WebGPU)</span>
                  </button>
                  <button
                    onClick={() => setSelectedAiProvider('ollama')}
                    className={`flex-1 p-4 rounded-xl border transition-all text-center ${selectedAiProvider === 'ollama' ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] hover:border-[var(--primary)]/50'}`}
                  >
                    <i className="fa-solid fa-server text-xl mb-2 text-[var(--foreground)]" />
                    <span className="text-sm font-medium block text-[var(--foreground)]">Ollama</span>
                    <span className="text-xs text-[var(--muted-foreground)] block mt-1">Local server</span>
                  </button>
                  <button
                    onClick={() => setSelectedAiProvider(null)}
                    className={`flex-1 p-4 rounded-xl border transition-all text-center ${!selectedAiProvider ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] hover:border-[var(--primary)]/50'}`}
                  >
                    <i className="fa-solid fa-ban text-xl mb-2 text-[var(--foreground)]" />
                    <span className="text-sm font-medium block text-[var(--foreground)]">None</span>
                    <span className="text-xs text-[var(--muted-foreground)] block mt-1">Heuristic only</span>
                  </button>
                </div>

                {/* WebLLM model selector */}
                {selectedAiProvider === 'webllm' && (
                  <div className="mt-3">
                    <label className="text-sm text-[var(--muted-foreground)] mb-2 block">Model</label>
                    <select
                      value={webllmModel}
                      onChange={(e) => setWebllmModel(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    >
                      {WEBLLM_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.size})</option>
                      ))}
                    </select>
                    <p className="text-xs text-[var(--muted-foreground)] mt-1.5">
                      The model will be downloaded when you first use an AI feature.
                    </p>
                  </div>
                )}

                {/* Ollama config */}
                {selectedAiProvider === 'ollama' && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="text-sm text-[var(--muted-foreground)] mb-2 block">Ollama URL</label>
                      <input
                        type="text"
                        value={ollamaUrl}
                        onChange={(e) => setOllamaUrl(e.target.value)}
                        placeholder="http://localhost:11434"
                        className="w-full px-4 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-xl text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-[var(--muted-foreground)] mb-2 block">Model</label>
                      <input
                        type="text"
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        placeholder="llama3.1:8b"
                        className="w-full px-4 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-xl text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                      />
                    </div>
                  </div>
                )}

                {!selectedAiProvider && (
                  <p className="text-sm text-[var(--muted-foreground)] mt-2">
                    AI features disabled. Recommendations will use heuristic scoring only.
                  </p>
                )}
              </div>

              {error && (
                <div className="mb-4 p-3 bg-[var(--destructive)]/10 border border-[var(--destructive-foreground)]/30 rounded-xl text-[var(--destructive-foreground)] text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep('api-key'); setError(null); }}
                  className="px-6 py-3 bg-[var(--background)] text-[var(--foreground)] rounded-xl font-medium border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={finishSetup}
                  disabled={loading}
                  className="flex-1 py-3 px-6 bg-gradient-to-r from-[#1b2838] to-[#2a475e] hover:from-[#2a475e] hover:to-[#3a5a7e] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all duration-300"
                >
                  {loading ? 'Setting up...' : 'Complete Setup'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
