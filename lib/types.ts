export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface Provider {
  id: string;
  name: string;
  type: 'openai-compatible' | 'gemini' | 'puter';
  baseUrl?: string;
  apiKeyEnv?: string;
  tokenEnv?: string;
  modelsEndpoint?: string;
  defaultModels?: string[];
  sandboxConfig?: {
    timeout: number;
    memoryLimit: string;
  };
}

export interface SearchProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  queryParam: string;
  resultFormat: string;
}

export interface ProviderConfig {
  providers: Provider[];
  searchProviders: SearchProvider[];
}
