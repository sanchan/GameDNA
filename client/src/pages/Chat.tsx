import { useState, useEffect, useRef, useCallback } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import type { ChatMessage } from '../../../shared/types';

export default function Chat() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user) return;
    api.get<ChatMessage[]>('/chat/history')
      .then(setMessages)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;

    const userMsg = input.trim();
    setInput('');
    setSending(true);
    setStreaming('');

    // Optimistically add user message
    const tempUserMsg: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: userMsg,
      createdAt: Math.floor(Date.now() / 1000),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: userMsg }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast(err.error || 'Failed to send message', 'error');
        setSending(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setSending(false); return; }

      const decoder = new TextDecoder();
      let fullResponse = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.chunk) {
              fullResponse += data.chunk;
              setStreaming(fullResponse);
            }
            if (data.done) {
              setMessages((prev) => [...prev, {
                id: Date.now() + 1,
                role: 'assistant',
                content: fullResponse,
                createdAt: Math.floor(Date.now() / 1000),
              }]);
              setStreaming('');
            }
          } catch { /* ignore */ }
        }
      }
    } catch {
      toast('Failed to connect to AI', 'error');
    } finally {
      setSending(false);
    }
  }, [input, sending, toast]);

  const handleClear = useCallback(async () => {
    try {
      await api.delete('/chat/history');
      setMessages([]);
    } catch { /* ignore */ }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const quickPrompts = [
    "What game should I play if I liked Hades?",
    "Recommend something relaxing",
    "What's my most underrated genre?",
    "Suggest a short game I can finish this weekend",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Header */}
      <div className="border-b border-[#333] bg-[#242424]/50 px-4 sm:px-6 py-4">
        <div className="container mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <i className="fa-solid fa-comments text-[var(--primary)]" />
              Gaming Advisor
            </h1>
            <p className="text-xs text-gray-400">Chat with AI about your gaming profile</p>
          </div>
          {messages.length > 0 && (
            <button onClick={handleClear} className="text-xs text-gray-400 hover:text-red-400 transition-colors">
              <i className="fa-solid fa-trash mr-1" /> Clear Chat
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="container mx-auto max-w-3xl space-y-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-[var(--muted)] border-t-[var(--primary)] rounded-full" />
            </div>
          ) : messages.length === 0 && !streaming ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--primary)]/20 flex items-center justify-center">
                <i className="fa-solid fa-brain text-3xl text-[var(--primary)]" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Ask me anything about your games</h2>
              <p className="text-gray-400 mb-8">I have context of your complete gaming profile and can give personalized advice.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                    className="text-left px-4 py-3 bg-[#242424] border border-[#333] hover:border-[var(--primary)] rounded-xl text-sm text-gray-300 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[#242424] border border-[#333] text-gray-200'}`}>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))}
              {streaming && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-[#242424] border border-[#333] text-gray-200">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{streaming}<span className="animate-pulse">|</span></p>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-[#333] bg-[#242424]/50 px-4 sm:px-6 py-4">
        <div className="container mx-auto max-w-3xl">
          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask about game recommendations, your profile, or anything gaming..."
              className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--primary)] resize-none"
              style={{ maxHeight: '120px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="px-4 py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <i className={`fa-solid ${sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
