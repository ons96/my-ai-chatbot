import providersJson from '../providers.json';
import type { Provider, SearchProvider, ProviderConfig } from './types';

export const config: ProviderConfig = providersJson as ProviderConfig;

export function getProvider(id: string): Provider | undefined {
  return config.providers.find(p => p.id === id);
}

export function getApiKey(provider: Provider): string | undefined {
  if (!provider.apiKeyEnv && !provider.tokenEnv) return undefined;
  const envKey = provider.apiKeyEnv || provider.tokenEnv;
  return process.env[envKey!];
}

export function getSearchProvider(id: string): SearchProvider | undefined {
  return config.searchProviders.find(p => p.id === id);
}
