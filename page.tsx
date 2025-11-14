'use client';

import { useState, useEffect, useRef } from 'react';
import { config } from '@/lib/providers';
import type { Message } from '@/lib/types';

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState(config.providers[0]?.id || '');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [lastPrompt, setLastPrompt] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('chatHistory');
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load chat history');
      }
    }
  }, []);

  // Save chat history
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chatHistory', JSON.stringify(messages));
    }
  }, [messages]);

  // Fetch models when provider changes
  useEffect(() => {
    if (!provider) return;
    
    fetch(`/api/models?provider=${provider}`)
      .then(res => res.json())
      .then(data => {
        setModels(data.models || []);
        setModel(data.models?.[0] || '');
      })
      .catch(err => console.error('Failed to load models:', err));
  }, [provider]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTimestamp = () => {
    const now = new Date();
    return now.toISOString().slice(0, 19).replace('T', ' ');
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || !provider || !model) return;

    setLoading(true);
    setLastPrompt(content);

    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: formatTimestamp()
    };

    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          provider,
          model
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let aiResponse = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(l => l.trim());
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || 
                               parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                aiResponse += content;
                
                setMessages(prev => {
                  const updated = [...prev];
                  const lastMsg = updated[updated.length - 1];
                  
                  if (lastMsg?.role === 'assistant') {
                    lastMsg.content = aiResponse;
                  } else {
                    updated.push({
                      role: 'assistant',
                      content: aiResponse,
                      timestamp: formatTimestamp()
                    });
                  }
                  return updated;
                });
              } catch (e) {
                // Skip parse errors
              }
            }
          }
        }
      }

      if (!aiResponse) {
        throw new Error('No response received');
      }
    } catch (error) {
      const errorMsg: Message = {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: formatTimestamp()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
    setInput('');
  };

  const handleRegenerate = () => {
    if (!lastPrompt) return;
    sendMessage(lastPrompt);
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem('chatHistory');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select 
            value={provider} 
            onChange={e => setProvider(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
          >
            {config.providers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select 
            value={model} 
            onChange={e => setModel(e.target.value)}
            disabled={!models.length}
            style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
          >
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <button 
            onClick={handleRegenerate}
            disabled={!lastPrompt || loading}
            style={{ 
              padding: '0.5rem 1rem', 
              background: '#3b82f6', 
              color: 'white', 
              border: 'none',
              borderRadius: '0.375rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1
            }}
          >
            Regenerate
          </button>

          <button 
            onClick={clearHistory}
            style={{ 
              padding: '0.5rem 1rem', 
              background: '#ef4444', 
              color: 'white', 
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer'
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {messages.map((msg, i) => (
          <div 
            key={i} 
            style={{ 
              marginBottom: '1rem', 
              padding: '1rem', 
              background: msg.role === 'user' ? '#eff6ff' : '#f3f4f6',
              borderRadius: '0.5rem'
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#6b7280' }}>
              {msg.role === 'user' ? 'User' : 'AI'}: {msg.timestamp}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{ padding: '1rem', borderTop: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={loading}
            style={{ 
              flex: 1, 
              padding: '0.75rem', 
              border: '1px solid #d1d5db', 
              borderRadius: '0.375rem',
              fontSize: '1rem'
            }}
          />
          <button 
            type="submit" 
            disabled={loading || !input.trim()}
            style={{ 
              padding: '0.75rem 1.5rem', 
              background: '#10b981', 
              color: 'white', 
              border: 'none',
              borderRadius: '0.375rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1
            }}
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
