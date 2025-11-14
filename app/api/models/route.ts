import { NextRequest, NextResponse } from 'next/server';
import { getProvider, getApiKey } from '@/lib/providers';

export const runtime = 'edge';

const modelsCache = new Map<string, { models: string[], timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(req: NextRequest) {
  const providerId = req.nextUrl.searchParams.get('provider');
  
  if (!providerId) {
    return NextResponse.json({ error: 'Provider ID required' }, { status: 400 });
  }

  const provider = getProvider(providerId);
  if (!provider) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  }

  // Check cache
  const cached = modelsCache.get(providerId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ models: cached.models });
  }

  // Return default models for puter
  if (provider.type === 'puter') {
    return NextResponse.json({ models: ['puter-js-executor'] });
  }

  // Fetch models for OpenAI-compatible providers
  if (provider.type === 'openai-compatible') {
    try {
      const apiKey = getApiKey(provider);
      if (!apiKey) {
        return NextResponse.json({ models: provider.defaultModels || [] });
      }

      const response = await fetch(`${provider.baseUrl}${provider.modelsEndpoint}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      if (!response.ok) throw new Error('Models fetch failed');

      const data = await response.json();
      const models = data.data?.map((m: any) => m.id) || provider.defaultModels || [];
      
      modelsCache.set(providerId, { models, timestamp: Date.now() });
      return NextResponse.json({ models });
    } catch (error) {
      console.error(`Failed to fetch models for ${providerId}:`, error);
      return NextResponse.json({ models: provider.defaultModels || [] });
    }
  }

  // Gemini models
  if (provider.type === 'gemini') {
    const models = provider.defaultModels || [];
    modelsCache.set(providerId, { models, timestamp: Date.now() });
    return NextResponse.json({ models });
  }

  return NextResponse.json({ models: [] });
}
