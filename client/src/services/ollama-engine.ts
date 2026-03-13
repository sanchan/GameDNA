// Ollama AI engine — port of server/services/ollama.ts.
// Direct HTTP to user's Ollama instance (Ollama supports CORS).

import type { AiEngine } from './ai-engine';

export class OllamaEngine implements AiEngine {
  readonly name = 'ollama';
  private url: string;
  private model: string;

  constructor(url?: string, model?: string) {
    this.url = url ?? 'http://localhost:11434';
    this.model = model ?? 'llama3.1:8b';
  }

  isModelReady(): boolean {
    // Ollama is always ready if reachable — model loading is server-side
    return true;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async generateJSON<T>(prompt: string, temperature = 0.3): Promise<T | null> {
    try {
      const res = await fetch(`${this.url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          format: 'json',
          stream: false,
          options: { temperature },
        }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      const raw = data.response;
      if (typeof raw !== 'string' || !raw.trim()) return null;

      const parsed = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object') return null;

      return parsed as T;
    } catch (e) {
      console.warn('[ollama] Failed to parse JSON response:', e instanceof SyntaxError ? e.message : e);
      return null;
    }
  }

  async generateText(prompt: string, temperature = 0.7): Promise<string | null> {
    try {
      const res = await fetch(`${this.url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: { temperature },
        }),
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.response || null;
    } catch {
      return null;
    }
  }

  async *generateStream(prompt: string, temperature = 0.7): AsyncGenerator<string> {
    try {
      const res = await fetch(`${this.url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: true,
          options: { temperature },
        }),
      });

      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.response) yield parsed.response;
          } catch { /* skip malformed */ }
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer);
          if (parsed.response) yield parsed.response;
        } catch { /* skip */ }
      }
    } catch {
      // Graceful degradation
    }
  }
}
