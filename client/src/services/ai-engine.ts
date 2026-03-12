// AI engine interface — factory pattern to switch between Ollama and WebLLM.

export interface AiEngine {
  readonly name: string;
  checkHealth(): Promise<boolean>;
  generateJSON<T>(prompt: string, temperature?: number): Promise<T | null>;
  generateText(prompt: string, temperature?: number): Promise<string | null>;
  generateStream(prompt: string, temperature?: number): AsyncGenerator<string>;
}

export type AiProvider = 'ollama' | 'webllm';

let currentEngine: AiEngine | null = null;

export function getAiEngine(): AiEngine | null {
  return currentEngine;
}

export function setAiEngine(engine: AiEngine): void {
  currentEngine = engine;
}

export async function createAiEngine(provider: AiProvider, config: {
  ollamaUrl?: string;
  ollamaModel?: string;
  webllmModel?: string;
}): Promise<AiEngine> {
  if (provider === 'webllm') {
    const { WebLLMEngine } = await import('./webllm-engine');
    const engine = new WebLLMEngine(config.webllmModel);
    setAiEngine(engine);
    return engine;
  }

  const { OllamaEngine } = await import('./ollama-engine');
  const engine = new OllamaEngine(config.ollamaUrl, config.ollamaModel);
  setAiEngine(engine);
  return engine;
}
