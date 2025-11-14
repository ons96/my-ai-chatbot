import { NextRequest } from 'next/server';
import { StreamingTextResponse } from 'ai';
import { getProvider, getApiKey, config } from '@/lib/providers';
import type { Message } from '@/lib/types';

export const runtime = 'edge';

async function callOpenAICompatible(
  provider: any,
  messages: Message[],
  model: string,
  apiKey: string
) {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(`Provider ${provider.id} failed: ${response.statusText}`);
  }

  return response.body;
}

async function callGemini(
  provider: any,
  messages: Message[],
  model: string,
  apiKey: string
) {
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

  const response = await fetch(
    `${provider.baseUrl}/models/${model}:streamGenerateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini failed: ${response.statusText}`);
  }

  return response.body;
}

async function executePuterJS(code: string, token: string) {
  // Placeholder for puter.js execution
  // In production, integrate actual puter.js SDK
  return `Executed: ${code.substring(0, 50)}...`;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, provider: providerId, model } = await req.json();

    if (!messages || !providerId || !model) {
      return new Response('Missing required fields', { status: 400 });
    }

    const provider = getProvider(providerId);
    if (!provider) {
      return new Response('Provider not found', { status: 404 });
    }

    const apiKey = getApiKey(provider);

    // Handle puter.js execution
    if (provider.type === 'puter' && apiKey) {
      const lastMessage = messages[messages.length - 1];
      const codeMatch = lastMessage.content.match(/```(?:javascript|js)?\n([\s\S]+?)\n```/);
      
      if (codeMatch) {
        const result = await executePuterJS(codeMatch[1], apiKey);
        return new Response(JSON.stringify({ result }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('No executable code found', { status: 400 });
    }

    if (!apiKey) {
      return new Response('API key not configured', { status: 401 });
    }

    // Try primary provider
    let stream: ReadableStream | null = null;
    let lastError: Error | null = null;

    try {
      if (provider.type === 'openai-compatible') {
        stream = await callOpenAICompatible(provider, messages, model, apiKey);
      } else if (provider.type === 'gemini') {
        stream = await callGemini(provider, messages, model, apiKey);
      }
    } catch (error) {
      console.error(`Primary provider ${providerId} failed:`, error);
      lastError = error as Error;
    }

    // Fallback logic: try other providers with same model
    if (!stream) {
      const fallbackProviders = config.providers.filter(
        p => p.id !== providerId && p.type !== 'puter'
      );

      for (const fallback of fallbackProviders) {
        try {
          const fallbackKey = getApiKey(fallback);
          if (!fallbackKey) continue;

          // Check if fallback supports this model
          const modelsRes = await fetch(
            `${req.nextUrl.origin}/api/models?provider=${fallback.id}`
          );
          const { models } = await modelsRes.json();
          
          if (!models.includes(model)) continue;

          console.log(`Attempting fallback to ${fallback.id}`);

          if (fallback.type === 'openai-compatible') {
            stream = await callOpenAICompatible(fallback, messages, model, fallbackKey);
          } else if (fallback.type === 'gemini') {
            stream = await callGemini(fallback, messages, model, fallbackKey);
          }

          if (stream) break;
        } catch (error) {
          console.error(`Fallback ${fallback.id} failed:`, error);
          lastError = error as Error;
        }
      }
    }

    if (!stream) {
      return new Response(
        `Model unavailable: All providers for ${model} failed. Try a different model. Last error: ${lastError?.message}`,
        { status: 503 }
      );
    }

    return new StreamingTextResponse(stream);
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response('Internal error', { status: 500 });
  }
}
