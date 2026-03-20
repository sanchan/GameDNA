// Data management panel for Settings — OPFS storage, export/import, backup, clear data.

import { useState, useEffect, useCallback } from 'react';
import { exportDb, importDb, resetDb } from '../db/index';
import * as queries from '../db/queries';
import { recalculateTasteProfile } from '../services/taste-profile';
import { useDb } from '../contexts/db-context';
import { useToast } from './Toast';

export default function DataManagement() {
  const { userId, refreshConfig } = useDb();
  const { toast } = useToast();
  const [storageUsage, setStorageUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    navigator.storage?.estimate?.().then((est) => {
      setStorageUsage({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
    }).catch(() => {});
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const handleExportDb = useCallback(() => {
    try {
      const data = exportDb();
      const blob = new Blob([data as unknown as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gamedna-backup-${new Date().toISOString().slice(0, 10)}.db`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Database backup downloaded', 'success');
    } catch {
      toast('Failed to export database', 'error');
    }
  }, [toast]);

  const handleExportJson = useCallback(() => {
    if (!userId) return;
    try {
      const data = queries.exportUserData(userId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gamedna-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Data exported as JSON', 'success');
    } catch {
      toast('Failed to export data', 'error');
    }
  }, [userId, toast]);

  const handleImportDb = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      await importDb(new Uint8Array(buffer));
      await refreshConfig();
      toast('Database restored successfully. Reloading...', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      toast('Failed to import database file', 'error');
    } finally {
      setImporting(false);
    }
  }, [refreshConfig, toast]);

  const handleImportJson = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = queries.importUserData(userId, data);
      if (result.importedSwipes > 0) recalculateTasteProfile(userId);
      toast('Data imported successfully', 'success');
    } catch {
      toast('Failed to import JSON data', 'error');
    } finally {
      setImporting(false);
    }
  }, [userId, toast]);

  const handleClearAll = useCallback(async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }

    setClearing(true);
    try {
      await resetDb();
      toast('All data cleared. Reloading...', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      toast('Failed to clear data', 'error');
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  }, [confirmClear, toast]);

  const usagePercent = storageUsage
    ? Math.round((storageUsage.usage / storageUsage.quota) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Storage Usage */}
      {storageUsage && (
        <div className="bg-[#1a1a1a] rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-300">Browser Storage</span>
            <span className="text-xs text-gray-500">
              {formatBytes(storageUsage.usage)} / {formatBytes(storageUsage.quota)} ({usagePercent}%)
            </span>
          </div>
          <div className="w-full h-2 bg-[#333] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--primary)] rounded-full transition-all"
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Export */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleExportDb}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1a] border border-[#333] text-gray-300 rounded-xl text-sm font-medium hover:border-[#444] hover:text-white transition-colors"
        >
          <i className="fa-solid fa-database" />
          Export Database (.db)
        </button>
        <button
          onClick={handleExportJson}
          disabled={!userId}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1a] border border-[#333] text-gray-300 rounded-xl text-sm font-medium hover:border-[#444] hover:text-white transition-colors disabled:opacity-50"
        >
          <i className="fa-solid fa-file-export" />
          Export as JSON
        </button>
      </div>

      {/* Import */}
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1a] border border-[#333] text-gray-300 rounded-xl text-sm font-medium hover:border-[#444] hover:text-white transition-colors cursor-pointer">
          <i className={`fa-solid ${importing ? 'fa-spinner fa-spin' : 'fa-upload'}`} />
          Import Database (.db)
          <input type="file" accept=".db,.sqlite" onChange={handleImportDb} className="hidden" />
        </label>
        <label className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1a] border border-[#333] text-gray-300 rounded-xl text-sm font-medium hover:border-[#444] hover:text-white transition-colors cursor-pointer">
          <i className={`fa-solid ${importing ? 'fa-spinner fa-spin' : 'fa-file-import'}`} />
          Import JSON
          <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
        </label>
      </div>

      {/* Clear All Data */}
      <div className="pt-4 border-t border-[#333]">
        <button
          onClick={handleClearAll}
          disabled={clearing}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            confirmClear
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'bg-[#1a1a1a] border border-red-500/50 text-red-400 hover:bg-red-500/10'
          } disabled:opacity-50`}
        >
          <i className={`fa-solid ${clearing ? 'fa-spinner fa-spin' : 'fa-trash'}`} />
          {confirmClear ? 'Click again to confirm — this cannot be undone' : 'Clear All Data'}
        </button>
        {confirmClear && (
          <button
            onClick={() => setConfirmClear(false)}
            className="ml-3 text-xs text-gray-400 hover:text-gray-300"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
