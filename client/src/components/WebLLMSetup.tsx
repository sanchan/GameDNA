// WebLLM setup component — model download, WebGPU check, storage management.

import { useState, useEffect, useCallback } from 'react';
import { useAi } from '../hooks/use-ai';
import type { WebLLMProgress } from '../services/webllm-engine';

const WEBLLM_MODELS = [
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 1B', size: '~700MB' },
  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', name: 'Llama 3.1 8B', size: '~4.5GB' },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi 3.5 Mini', size: '~2GB' },
  { id: 'gemma-2-2b-it-q4f16_1-MLC', name: 'Gemma 2 2B', size: '~1.3GB' },
];

interface Props {
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export default function WebLLMSetup({ selectedModel, onModelChange }: Props) {
  const { loading, ready, error, downloadProgress, initEngine } = useAi();
  const [webgpuAvailable, setWebgpuAvailable] = useState<boolean | null>(null);
  const [storageUsage, setStorageUsage] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    // Check WebGPU
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      (navigator as any).gpu.requestAdapter()
        .then((adapter: unknown) => setWebgpuAvailable(adapter !== null))
        .catch(() => setWebgpuAvailable(false));
    } else {
      setWebgpuAvailable(false);
    }

    // Check storage
    navigator.storage?.estimate?.().then((est) => {
      setStorageUsage({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
    }).catch(() => {});
  }, []);

  const handleDownload = useCallback(() => {
    initEngine('webllm', { webllmModel: selectedModel });
  }, [initEngine, selectedModel]);

  const handleDeleteCache = useCallback(async () => {
    try {
      await caches.delete('webllm/model');
      const est = await navigator.storage.estimate();
      setStorageUsage({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
    } catch { /* ignore */ }
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div className="space-y-4">
      {/* WebGPU Check */}
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${
          webgpuAvailable === null ? 'bg-gray-500' :
          webgpuAvailable ? 'bg-green-500' : 'bg-red-500'
        }`} />
        <span className="text-sm text-gray-300">
          {webgpuAvailable === null ? 'Checking WebGPU...' :
           webgpuAvailable ? 'WebGPU available' : 'WebGPU not available — WebLLM requires a WebGPU-capable browser'}
        </span>
      </div>

      {/* Model Selector */}
      <div>
        <label className="text-sm font-medium text-gray-300 mb-2 block">Model</label>
        <select
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={loading}
          className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--primary)]"
        >
          {WEBLLM_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.name} ({m.size})</option>
          ))}
        </select>
      </div>

      {/* Download / Status */}
      {loading && downloadProgress ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-300">{downloadProgress.text}</span>
            <span className="text-[var(--primary)] font-medium">{Math.round(downloadProgress.progress * 100)}%</span>
          </div>
          <div className="w-full h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--primary)] rounded-full transition-all duration-300"
              style={{ width: `${downloadProgress.progress * 100}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            Time elapsed: {Math.round(downloadProgress.timeElapsed)}s
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownload}
            disabled={loading || !webgpuAvailable}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary)]/20 border border-[var(--primary)]/30 text-[var(--primary)] rounded-xl text-sm font-medium hover:bg-[var(--primary)]/30 transition-colors disabled:opacity-50"
          >
            <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : ready ? 'fa-check' : 'fa-download'}`} />
            {loading ? 'Loading...' : ready ? 'Model Ready' : 'Download & Load Model'}
          </button>
          {ready && (
            <span className="text-xs text-green-400 font-medium">Engine active</span>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {/* Storage Usage */}
      {storageUsage && (
        <div className="flex items-center justify-between bg-[#1a1a1a] rounded-lg px-4 py-3">
          <div className="text-sm">
            <span className="text-gray-400">Storage: </span>
            <span className="text-white font-medium">{formatBytes(storageUsage.usage)}</span>
            <span className="text-gray-500"> / {formatBytes(storageUsage.quota)}</span>
          </div>
          <button
            onClick={handleDeleteCache}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Clear cached models
          </button>
        </div>
      )}
    </div>
  );
}
