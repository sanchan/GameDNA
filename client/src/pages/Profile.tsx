import { useEffect, useRef, useState, useCallback } from 'react';
import { Navigate, Link } from 'react-router';
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
  const [ignoredOverrides, setIgnoredOverrides] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const newIgnored = !currentlyIgnored;
    setIgnoredOverrides((prev) => ({ ...prev, [tagName]: newIgnored }));
    setTogglingTag(tagName);
    try {
      await api.post('/user/ignored-tags', { tag: tagName, ignored: newIgnored });
    } catch {
      // Revert on error
      setIgnoredOverrides((prev) => ({ ...prev, [tagName]: currentlyIgnored }));
    } finally {
      setTogglingTag(null);
    }
  };

  // Helper to get effective ignored status (local override takes precedence)
  const isTagIgnored = (tag: { name: string; ignored: boolean }) =>
    tag.name in ignoredOverrides ? ignoredOverrides[tag.name] : tag.ignored;

  const topDisplayTags = dna?.allTags
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 6) ?? [];

  const tagColors = ['#f97316', '#8b5cf6', '#3b82f6', '#22c55e', '#eab308', '#ef4444', '#ec4899', '#06b6d4'];

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      {/* Profile Header Card */}
      <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 lg:p-8 mb-8">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
          {user.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt={user.displayName ?? 'Avatar'}
              className="w-24 h-24 lg:w-32 lg:h-32 rounded-full border-4 border-[var(--primary)]"
            />
          )}
          <div className="flex-1">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-3">
              <h1 className="text-3xl lg:text-4xl font-black text-white">
                {user.displayName ?? 'Gamer'}
              </h1>
              <div className="flex items-center space-x-2">
                <div className="w-10 h-10 bg-[var(--primary)]/20 rounded-lg flex items-center justify-center">
                  <i className="fa-brands fa-steam text-[var(--primary)] text-xl" />
                </div>
                <div>
                  <p className="text-sm text-gray-400">Steam ID</p>
                  <p className="text-sm font-bold">{user.steamId}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button
                onClick={() => triggerSync()}
                disabled={syncStatus === 'syncing'}
                className="flex items-center space-x-2 px-4 py-2 bg-[var(--primary)] hover:bg-[var(--primary)]/90 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
              >
                <i className="fa-solid fa-arrows-rotate" />
                <span>{syncStatus === 'syncing' ? 'Syncing...' : 'Sync Library'}</span>
              </button>
              <button className="flex items-center space-x-2 px-4 py-2 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all">
                <i className="fa-solid fa-share-nodes" />
                <span>Share Profile</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <i className="fa-solid fa-gamepad text-blue-500 text-xl" />
            </div>
            <span className="text-4xl font-black text-white">{dna?.totalGames ?? 0}</span>
          </div>
          <h3 className="text-sm text-gray-400 mb-1">Games Owned</h3>
          <p className="text-xs text-gray-500">In Steam library</p>
        </div>
        <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <i className="fa-solid fa-clock text-purple-500 text-xl" />
            </div>
            <span className="text-4xl font-black text-white">{dna?.totalPlaytimeHours.toLocaleString() ?? 0}</span>
          </div>
          <h3 className="text-sm text-gray-400 mb-1">Hours Played</h3>
          <p className="text-xs text-gray-500">Total playtime</p>
        </div>
        <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center">
              <i className="fa-solid fa-hand-pointer text-green-500 text-xl" />
            </div>
            <span className="text-4xl font-black text-white">{totalSwipes}</span>
          </div>
          <h3 className="text-sm text-gray-400 mb-1">Total Swipes</h3>
          <p className="text-xs text-gray-500">Discovery activity</p>
        </div>
      </div>

      {/* Radar Chart Section */}
      {dna && dna.topGenres.length > 0 && (
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 lg:p-8 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Gaming Preference Profile</h2>
              <p className="text-gray-400 text-sm">Your unique gaming DNA based on swipe history and play patterns</p>
            </div>
            <button
              onClick={() => { refetchDna(); refetchProfile(); }}
              className="flex items-center space-x-2 px-4 py-3 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all mt-4 lg:mt-0"
            >
              <i className="fa-solid fa-rotate" />
              <span>Refresh Profile</span>
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
          <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Tag Preferences</h2>
              <p className="text-gray-400 text-sm">Manage which game tags influence your recommendations</p>
            </div>
            <button
              onClick={() => setShowAllTags(!showAllTags)}
              className="flex items-center space-x-2 px-4 py-3 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all mt-4 lg:mt-0"
            >
              <i className={`fa-solid ${showAllTags ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
              <span>{showAllTags ? 'Hide All Tags' : 'Show All Tags'}</span>
            </button>
          </div>

          {/* Top Tags Grid */}
          {topDisplayTags.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {topDisplayTags.map((tag, idx) => {
                const ignored = isTagIgnored(tag);
                const color = tagColors[idx % tagColors.length];
                return (
                  <div key={tag.name} className="bg-[#1a1a1a] rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${color}33` }}
                      >
                        <i className="fa-solid fa-tag" style={{ color }} />
                      </div>
                      <div>
                        <h3 className="font-bold text-white">{tag.name}</h3>
                        <p className="text-xs text-gray-400">Score: {tag.score.toFixed(1)}</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={!ignored}
                        disabled={togglingTag === tag.name}
                        onChange={() => handleToggleTag(tag.name, ignored)}
                      />
                      <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)] peer-disabled:opacity-50" />
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          {/* All Tags Table (collapsible) */}
          {showAllTags && (
            <div className="border-t border-[#333] pt-6">
              <h3 className="text-lg font-bold text-white mb-4">All Tags</h3>
              <div className="bg-[#1a1a1a] rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-[#242424]">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-bold text-white">Tag Name</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-white">Score</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-white">Games</th>
                        <th className="px-6 py-4 text-right text-sm font-bold text-white">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#333]">
                      {dna.allTags.map((tag) => {
                        const ignored = isTagIgnored(tag);
                        return (
                          <tr
                            key={tag.name}
                            className={`hover:bg-[#242424]/50 transition-colors ${ignored ? 'opacity-50' : ''}`}
                          >
                            <td className="px-6 py-4 text-sm font-medium text-white">{tag.name}</td>
                            <td className="px-6 py-4 text-sm text-gray-400">{tag.score.toFixed(1)}</td>
                            <td className="px-6 py-4 text-sm text-gray-400">{tag.count}</td>
                            <td className="px-6 py-4 text-right">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="sr-only peer"
                                  checked={!ignored}
                                  disabled={togglingTag === tag.name}
                                  onChange={() => handleToggleTag(tag.name, ignored)}
                                />
                                <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)] peer-disabled:opacity-50" />
                              </label>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Summary */}
      {dna?.aiSummary && (
        <div className="bg-gradient-to-br from-[var(--primary)]/10 to-purple-500/10 border border-[var(--primary)]/30 rounded-2xl p-6 lg:p-8 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
            <div className="flex items-start space-x-4">
              <div className="w-14 h-14 bg-[var(--primary)]/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <i className="fa-solid fa-brain text-[var(--primary)] text-2xl" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">AI Gaming Profile Summary</h2>
                <p className="text-gray-400 text-sm">Generated insights based on your gaming DNA and activity patterns</p>
              </div>
            </div>
            <button
              onClick={() => { refetchDna(); }}
              className="flex items-center space-x-2 px-4 py-3 bg-[#242424] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all"
            >
              <i className="fa-solid fa-rotate" />
              <span>Regenerate</span>
            </button>
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
          className="bg-[#242424] border border-[#333] hover:border-[var(--primary)] rounded-xl p-6 flex items-center space-x-4 group transition-all disabled:opacity-50 text-left"
        >
          <div className="w-14 h-14 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors flex-shrink-0">
            <i className="fa-solid fa-arrows-rotate text-blue-500 text-2xl" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-white mb-1">Sync Library</h3>
            <p className="text-sm text-gray-400">
              {syncStatus === 'syncing' ? 'Syncing...' : 'Update from Steam'}
            </p>
          </div>
        </button>

        <button
          onClick={handleExport}
          className="bg-[#242424] border border-[#333] hover:border-[var(--primary)] rounded-xl p-6 flex items-center space-x-4 group transition-all text-left"
        >
          <div className="w-14 h-14 rounded-xl bg-green-500/20 flex items-center justify-center group-hover:bg-green-500/30 transition-colors flex-shrink-0">
            <i className="fa-solid fa-download text-green-500 text-2xl" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-white mb-1">Export Data</h3>
            <p className="text-sm text-gray-400">Download as JSON</p>
          </div>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="bg-[#242424] border border-[#333] hover:border-[var(--primary)] rounded-xl p-6 flex items-center space-x-4 group transition-all disabled:opacity-50 text-left"
        >
          <div className="w-14 h-14 rounded-xl bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors flex-shrink-0">
            <i className="fa-solid fa-upload text-purple-500 text-2xl" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-white mb-1">{importing ? 'Importing...' : 'Import Data'}</h3>
            <p className="text-sm text-gray-400">Restore preferences</p>
          </div>
        </button>
      </div>

      {importResult && (
        <div className="bg-[#242424] border border-[#333] rounded-xl p-4 mb-8">
          <p className="text-sm text-gray-300">{importResult}</p>
        </div>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          to="/history"
          className="bg-[#242424] border-2 border-[#333] hover:border-[var(--primary)] rounded-xl p-6 flex items-center justify-between transition-all group"
        >
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-[var(--primary)]/20 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-clock-rotate-left text-[var(--primary)] text-2xl" />
            </div>
            <div>
              <h3 className="font-bold text-xl text-white mb-1">View History</h3>
              <p className="text-sm text-gray-400">{totalSwipes} total swipes</p>
            </div>
          </div>
          <i className="fa-solid fa-arrow-right text-gray-500 group-hover:text-[var(--primary)] transition-colors" />
        </Link>

        <Link
          to="/backlog"
          className="bg-[#242424] border-2 border-[#333] hover:border-[var(--primary)] rounded-xl p-6 flex items-center justify-between transition-all group"
        >
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-[var(--primary)]/20 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-list-check text-[var(--primary)] text-2xl" />
            </div>
            <div>
              <h3 className="font-bold text-xl text-white mb-1">Manage Backlog</h3>
              <p className="text-sm text-gray-400">{dna?.totalGames ?? 0} games in library</p>
            </div>
          </div>
          <i className="fa-solid fa-arrow-right text-gray-500 group-hover:text-[var(--primary)] transition-colors" />
        </Link>
      </div>

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
