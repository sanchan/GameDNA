// Migration tool — import data from an existing GameDNA server.

import { useState, useCallback } from 'react';
import { useDb } from '../contexts/db-context';
import * as queries from '../db/queries';
import { useToast } from './Toast';

export default function MigrationTool() {
  const { userId } = useDb();
  const { toast } = useToast();
  const [serverUrl, setServerUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleImport = useCallback(async () => {
    if (!serverUrl.trim() || !userId) return;
    setImporting(true);
    setStatus('Connecting to server...');

    try {
      const baseUrl = serverUrl.trim().replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/user/export`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}. Make sure you're logged in to the old server.`);
      }

      setStatus('Downloading data...');
      const data = await res.json();

      setStatus('Importing data...');
      queries.importUserData(userId, data);

      setStatus(null);
      toast('Data imported from server successfully!', 'success');
    } catch (e) {
      setStatus(null);
      toast(`Import failed: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
    } finally {
      setImporting(false);
    }
  }, [serverUrl, userId, toast]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        If you were using a previous GameDNA server, you can import your data here.
        Make sure you're logged in to the old server in the same browser.
      </p>
      <div>
        <label className="text-sm font-medium text-gray-300 mb-2 block">Server URL</label>
        <input
          type="text"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="http://localhost:3000"
          className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--primary)]"
        />
      </div>
      <button
        onClick={handleImport}
        disabled={importing || !serverUrl.trim()}
        className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-xl text-sm font-medium hover:bg-purple-500/30 transition-colors disabled:opacity-50"
      >
        <i className={`fa-solid ${importing ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'}`} />
        {importing ? 'Importing...' : 'Import from Server'}
      </button>
      {status && (
        <p className="text-sm text-blue-400 flex items-center gap-2">
          <i className="fa-solid fa-spinner fa-spin" /> {status}
        </p>
      )}
    </div>
  );
}
