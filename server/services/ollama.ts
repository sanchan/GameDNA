const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function generateJSON<T>(prompt: string, temperature = 0.3): Promise<T | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
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

export async function* generateStream(prompt: string, temperature = 0.7): AsyncGenerator<string> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
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
          if (parsed.response) {
            yield parsed.response;
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        if (parsed.response) {
          yield parsed.response;
        }
      } catch {
        // skip
      }
    }
  } catch {
    // Graceful degradation - just stop generating
  }
}

export async function generateText(prompt: string, temperature = 0.7): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
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
