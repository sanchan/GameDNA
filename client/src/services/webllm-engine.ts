// WebLLM AI engine — runs LLMs in the browser via WebGPU.
// Lazily loads @mlc-ai/web-llm only when needed.

import type { AiEngine } from './ai-engine';

// Dynamic import type for WebLLM
type WebLLMModule = typeof import('@mlc-ai/web-llm');
type MLCEngine = import('@mlc-ai/web-llm').MLCEngine;

export type WebLLMProgress = {
  progress: number;
  text: string;
  timeElapsed: number;
};

export class WebLLMEngine implements AiEngine {
  readonly name = 'webllm';
  private model: string;
  private engine: MLCEngine | null = null;
  private loading = false;
  private webllm: WebLLMModule | null = null;
  onProgress?: (progress: WebLLMProgress) => void;

  constructor(model?: string) {
    this.model = model ?? 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
  }

  private async ensureLoaded(): Promise<MLCEngine> {
    if (this.engine) return this.engine;
    if (this.loading) {
      // Wait for existing load to finish
      while (this.loading) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (this.engine) return this.engine;
    }

    this.loading = true;
    try {
      // Dynamic import — only loads the 1.5MB WebLLM bundle when needed
      this.webllm = await import('@mlc-ai/web-llm');
      this.engine = await this.webllm.CreateMLCEngine(this.model, {
        initProgressCallback: (report) => {
          this.onProgress?.({
            progress: report.progress,
            text: report.text,
            timeElapsed: report.timeElapsed,
          });
        },
      });
      return this.engine;
    } finally {
      this.loading = false;
    }
  }

  async checkHealth(): Promise<boolean> {
    // Check if WebGPU is available
    if (typeof navigator === 'undefined') return false;
    if (!('gpu' in navigator)) return false;

    try {
      const gpu = (navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown> } }).gpu;
      const adapter = await gpu.requestAdapter();
      return adapter !== null;
    } catch {
      return false;
    }
  }

  async generateJSON<T>(prompt: string, temperature = 0.3): Promise<T | null> {
    try {
      const engine = await this.ensureLoaded();
      const reply = await engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature,
        response_format: { type: 'json_object' },
      });

      const raw = reply.choices[0]?.message?.content;
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      return parsed as T;
    } catch (e) {
      console.warn('[webllm] generateJSON error:', e);
      return null;
    }
  }

  async generateText(prompt: string, temperature = 0.7): Promise<string | null> {
    try {
      const engine = await this.ensureLoaded();
      const reply = await engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature,
      });

      return reply.choices[0]?.message?.content ?? null;
    } catch (e) {
      console.warn('[webllm] generateText error:', e);
      return null;
    }
  }

  async *generateStream(prompt: string, temperature = 0.7): AsyncGenerator<string> {
    try {
      const engine = await this.ensureLoaded();
      const chunks = await engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature,
        stream: true,
      });

      for await (const chunk of chunks) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    } catch (e) {
      console.warn('[webllm] generateStream error:', e);
    }
  }

  /** Check if a model is already cached in the browser. */
  async isModelCached(): Promise<boolean> {
    try {
      const cache = await caches.open('webllm/model');
      const keys = await cache.keys();
      return keys.some((k) => k.url.includes(this.model));
    } catch {
      return false;
    }
  }

  /** Delete cached model data. */
  async deleteCache(): Promise<void> {
    try {
      await caches.delete('webllm/model');
    } catch {
      // ignore
    }
  }

  /** Get estimated storage usage for cached models. */
  async getStorageUsage(): Promise<{ usage: number; quota: number }> {
    if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  }

  /** Unload the engine from memory. */
  async unload(): Promise<void> {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
    }
  }
}
