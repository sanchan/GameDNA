// Hook for AI engine state — init, health, download progress.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDb } from '../contexts/db-context';
import { getAiEngine, setAiEngine, createAiEngine, type AiProvider } from '../services/ai-engine';
import type { WebLLMProgress } from '../services/webllm-engine';

interface UseAiState {
  provider: AiProvider | null;
  ready: boolean;
  loading: boolean;
  healthy: boolean | null;
  error: string | null;
  downloadProgress: WebLLMProgress | null;
  initEngine: (provider: AiProvider, config?: {
    ollamaUrl?: string;
    ollamaModel?: string;
    webllmModel?: string;
  }) => Promise<void>;
  checkHealth: () => Promise<boolean>;
}

export function useAi(): UseAiState {
  const { config: dbConfig } = useDb();
  const [provider, setProvider] = useState<AiProvider | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<WebLLMProgress | null>(null);
  const initRef = useRef(false);

  const initEngine = useCallback(async (
    prov: AiProvider,
    cfg?: { ollamaUrl?: string; ollamaModel?: string; webllmModel?: string },
  ) => {
    setLoading(true);
    setError(null);
    setReady(false);
    setDownloadProgress(null);

    try {
      const engine = await createAiEngine(prov, {
        ollamaUrl: cfg?.ollamaUrl ?? dbConfig?.ollamaUrl ?? undefined,
        ollamaModel: cfg?.ollamaModel ?? dbConfig?.ollamaModel ?? undefined,
        webllmModel: cfg?.webllmModel ?? dbConfig?.webllmModel ?? undefined,
      });

      const ok = await engine.checkHealth();
      setHealthy(ok);

      if (!ok) {
        setError(prov === 'webllm'
          ? 'WebGPU is not available in this browser.'
          : 'Cannot connect to Ollama. Make sure it is running.');
        setReady(false);
        setProvider(prov);
        return;
      }

      // For WebLLM: attach progress callback and eagerly download/load the model
      if (prov === 'webllm' && 'load' in engine) {
        (engine as any).onProgress = (progress: WebLLMProgress) => {
          setDownloadProgress(progress);
        };
        await (engine as any).load();
      }

      setReady(true);
      setProvider(prov);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to initialize AI engine');
      setHealthy(false);
      setReady(false);
    } finally {
      setLoading(false);
    }
  }, [dbConfig]);

  const checkHealth = useCallback(async (): Promise<boolean> => {
    const engine = getAiEngine();
    if (!engine) {
      setHealthy(false);
      return false;
    }
    const ok = await engine.checkHealth();
    setHealthy(ok);
    setReady(ok);
    return ok;
  }, []);

  // Auto-init from saved config
  useEffect(() => {
    if (initRef.current || !dbConfig?.aiProvider) return;
    initRef.current = true;

    const prov = dbConfig.aiProvider as AiProvider;
    initEngine(prov).catch(() => {});
  }, [dbConfig, initEngine]);

  return {
    provider,
    ready,
    loading,
    healthy,
    error,
    downloadProgress,
    initEngine,
    checkHealth,
  };
}
