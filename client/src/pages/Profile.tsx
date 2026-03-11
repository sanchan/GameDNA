import { useEffect, useRef, useState, useCallback } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { useProfile, useGamingDNA } from '../hooks/use-profile';
import { api } from '../lib/api';
import RadarChart from '../components/RadarChart';

export default function Profile() {
  const { user, loading: authLoading, syncStatus, triggerSync } = useAuth();
  const { data: profile, isLoading: profileLoading, refetch: refetchProfile } = useProfile();
  const { data: dna, isLoading: dnaLoading, refetch: refetchDna } = useGamingDNA();
  const prevSyncStatus = useRef(syncStatus);
  const [showAllTags, setShowAllTags] = useState(false);
  const [togglingTag, setTogglingTag] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refetch profile data when sync transitions to 'synced'
  useEffect(() => {
    if (prevSyncStatus.current === 'syncing' && syncStatus === 'synced') {
      refetchProfile();
      refetchDna();
    }
    prevSyncStatus.current = syncStatus;
  }, [syncStatus, refetchProfile, refetchDna]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const loading = profileLoading || dnaLoading;

  if (loading) {
    return (
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 lg:p-8 mb-8 animate-pulse">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-full bg-[#333]" />
            <div className="flex-1 space-y-3">
              <div className="h-8 w-48 bg-[#333] rounded" />
              <div className="h-5 w-32 bg-[#333] rounded" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#242424] border border-[#333] rounded-xl p-6 animate-pulse">
              <div className="h-10 w-20 bg-[#333] rounded mb-2" />
              <div className="h-4 w-16 bg-[#333] rounded" />
            </div>
          ))}
        </div>
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 lg:p-8 mb-8 animate-pulse">
          <div className="h-[300px] bg-[#333] rounded" />
        </div>
      </div>
    );
  }

  const totalSwipes = dna
    ? dna.swipeStats.yes + dna.swipeStats.no + dna.swipeStats.maybe
    : 0;

  const handleToggleTag = async (tagName: string, currentlyIgnored: boolean) => {
    setTogglingTag(tagName);
    try {
      await api.post('/user/ignored-tags', { tag: tagName, ignored: !currentlyIgnored });
      refetchDna();
    } catch {
      // ignore
    } finally {
      setTogglingTag(null);
    }
  };

  const handleExport = useCallback(async () => {
    try {
      const data = await api.get<unknown>('/user/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gamedna-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, []);

  const handleImport = useCallback(async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await api.post<{ importedTags: number; importedSwipes: number }>('/user/import', data);
      setImportResult(`Imported ${result.importedTags} ignored tags, ${result.importedSwipes} swipes`);
      refetchDna();
    } catch (e) {
      setImportResult('Import failed — invalid file format');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [refetchDna]);

  const activeTags = dna?.allTags.filter((t) => !t.ignored) ?? [];
  const ignoredTags = dna?.allTags.filter((t) => t.ignored) ?? [];
  const topDisplayTags = dna?.topTags ?? [];

  const tagColors = ['#3b82f6', '#8b5cf6', '#22c55e', '#eab308', '#ef4444', '#ec4899', '#06b6d4', '#f97316'];

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      {/* Profile Header Card */}
      <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 lg:p-8 mb-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {user.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt={user.displayName ?? 'Avatar'}
              className="w-24 h-24 lg:w-32 lg:h-32 rounded-full border-4 border-[var(--primary)]"
            />
          )}
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-3xl lg:text-4xl font-black text-white">
              {user.displayName ?? 'Gamer'}
            </h1>
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--primary)]/20 text-sm text-gray-300">
              <i className="fa-brands fa-steam text-[var(--primary)]" />
              <span>{user.steamId}</span>
            </div>
            <div className="mt-4">
              <button
                onClick={() => triggerSync()}
                disabled={syncStatus === 'syncing'}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--primary)] text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <i className="fa-solid fa-arrows-rotate" />
                {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Library'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <i className="fa-solid fa-gamepad text-blue-400 text-xl" />
            </div>
            <div>
              <div className="text-4xl font-black text-white">{dna?.totalGames ?? 0}</div>
              <div className="text-gray-400 text-sm">Games Owned</div>
            </div>
          </div>
        </div>
        <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <i className="fa-solid fa-clock text-purple-400 text-xl" />
            </div>
            <div>
              <div className="text-4xl font-black text-white">{dna?.totalPlaytimeHours.toLocaleString() ?? 0}</div>
              <div className="text-gray-400 text-sm">Hours Played</div>
            </div>
          </div>
        </div>
        <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center">
              <i className="fa-solid fa-hand-pointer text-green-400 text-xl" />
            </div>
            <div>
              <div className="text-4xl font-black text-white">{totalSwipes}</div>
              <div className="text-gray-400 text-sm">Total Swipes</div>
            </div>
          </div>
        </div>
      </div>

      {/* Radar Chart Section */}
      {dna && dna.topGenres.length > 0 && (
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 lg:p-8 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Gaming Preference Profile</h2>
              <p className="text-gray-400 text-sm mt-1">Your top genres based on playtime and library analysis</p>
            </div>
            <button
              onClick={() => { refetchDna(); refetchProfile(); }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#333] text-sm text-gray-300 hover:border-[var(--primary)] hover:text-white transition-colors"
            >
              <i className="fa-solid fa-arrows-rotate" />
              Refresh Profile
            </button>
          </div>
          <div className="max-w-lg mx-auto">
            <RadarChart data={dna.topGenres} />
          </div>
        </div>
      )}

      {/* Tag Management */}
      {dna && dna.allTags.length > 0 && (
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 lg:p-8 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold text-white">Tag Preferences</h2>
            <button
              onClick={() => setShowAllTags(!showAllTags)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#333] text-sm text-gray-300 hover:border-[var(--primary)] hover:text-white transition-colors"
            >
              <i className={`fa-solid ${showAllTags ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
              {showAllTags ? 'Hide All Tags' : 'Show All Tags'}
            </button>
          </div>

          {/* Top Tags Grid */}
          {topDisplayTags.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {topDisplayTags.map((tag, idx) => {
                const tagData = dna.allTags.find((t) => t.name === tag.name);
                const isIgnored = tagData?.ignored ?? false;
                const color = tagColors[idx % tagColors.length];
                return (
                  <div key={tag.name} className="bg-[#1a1a1a] rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${color}33` }}
                      >
                        <i className="fa-solid fa-tag text-sm" style={{ color }} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{tag.name}</div>
                        <div className="text-xs text-gray-400">{tag.score.toFixed(2)}</div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={!isIgnored}
                        disabled={togglingTag === tag.name}
                        onChange={() => handleToggleTag(tag.name, isIgnored)}
                      />
                      <div className="w-9 h-5 bg-[#333] rounded-full peer peer-checked:bg-[var(--primary)] peer-disabled:opacity-50 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          {/* All Tags Table (collapsible) */}
          {showAllTags && (
            <div className="rounded-xl border border-[#333] overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#242424] border-b border-[#333]">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Tag Name</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium w-20">Score</th>
                      <th className="text-center px-4 py-3 text-gray-400 font-medium w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dna.allTags.map((tag) => (
                      <tr
                        key={tag.name}
                        className={`border-b border-[#333] last:border-0 ${tag.ignored ? 'opacity-50' : ''}`}
                      >
                        <td className="px-4 py-3 text-white">{tag.name}</td>
                        <td className="px-4 py-3 text-right text-gray-400">{tag.score.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={!tag.ignored}
                              disabled={togglingTag === tag.name}
                              onChange={() => handleToggleTag(tag.name, tag.ignored)}
                            />
                            <div className="w-9 h-5 bg-[#333] rounded-full peer peer-checked:bg-[var(--primary)] peer-disabled:opacity-50 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Summary */}
      {dna?.aiSummary && (
        <div className="bg-gradient-to-br from-[var(--primary)]/10 to-purple-500/10 border border-[var(--primary)]/30 rounded-2xl p-6 lg:p-8 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/20 flex items-center justify-center">
              <i className="fa-solid fa-brain text-[var(--primary)] text-lg" />
            </div>
            <h2 className="text-xl font-bold text-white">AI Gaming Profile Summary</h2>
          </div>
          <div className="bg-[#242424]/50 rounded-xl p-6">
            <p className="text-gray-300 leading-relaxed">
              {dna.aiSummary.split(/(\b(?:RPG|FPS|action|strategy|indie|simulation|adventure|puzzle|multiplayer|singleplayer|co-op|competitive|casual|hardcore)\b)/gi).map((part, i) =>
                i % 2 === 1 ? (
                  <span key={i} className="text-[var(--primary)] font-bold">{part}</span>
                ) : (
                  part
                )
              )}
            </p>
          </div>
        </div>
      )}

      {/* Utility Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <button
          onClick={() => triggerSync()}
          disabled={syncStatus === 'syncing'}
          className="bg-[#242424] border border-[#333] hover:border-blue-500 rounded-xl p-6 flex items-center space-x-4 group transition-colors disabled:opacity-50 text-left"
        >
          <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
            <i className="fa-solid fa-arrows-rotate text-blue-400 text-xl" />
          </div>
          <div>
            <div className="font-semibold text-white">Sync Library</div>
            <div className="text-sm text-gray-400">
              {syncStatus === 'syncing' ? 'Syncing...' : 'Update your Steam data'}
            </div>
          </div>
        </button>

        <button
          onClick={handleExport}
          className="bg-[#242424] border border-[#333] hover:border-green-500 rounded-xl p-6 flex items-center space-x-4 group transition-colors text-left"
        >
          <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center group-hover:bg-green-500/30 transition-colors">
            <i className="fa-solid fa-download text-green-400 text-xl" />
          </div>
          <div>
            <div className="font-semibold text-white">Export Data</div>
            <div className="text-sm text-gray-400">Download your profile as JSON</div>
          </div>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="bg-[#242424] border border-[#333] hover:border-purple-500 rounded-xl p-6 flex items-center space-x-4 group transition-colors disabled:opacity-50 text-left"
        >
          <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
            <i className="fa-solid fa-upload text-purple-400 text-xl" />
          </div>
          <div>
            <div className="font-semibold text-white">{importing ? 'Importing...' : 'Import Data'}</div>
            <div className="text-sm text-gray-400">Restore from a backup file</div>
          </div>
        </button>
      </div>

      {importResult && (
        <div className="bg-[#242424] border border-[#333] rounded-xl p-4 mb-8">
          <p className="text-sm text-gray-300">{importResult}</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImport(file);
        }}
      />
    </div>
  );
}
