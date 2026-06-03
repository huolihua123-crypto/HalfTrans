/**
 * 强保留术语表
 * 维护一份在技术语境中通常不翻译的英文术语列表
 * 被 prompt.ts 引用，作为 system prompt 的一部分发送给 LLM
 */

export interface StrongTerm {
  term: string;
  allowOverride?: boolean;
}

export const STRONG_TERMS: StrongTerm[] = [
  // Programming paradigms & concepts
  { term: 'event loop' },
  { term: 'callback' },
  { term: 'promise' },
  { term: 'closure' },
  { term: 'runtime' },
  { term: 'fiber' },
  { term: 'coroutine' },
  { term: 'goroutine' },
  { term: 'async/await' },
  { term: 'generator' },
  { term: 'iterator' },
  { term: 'decorator' },
  { term: 'mixin' },
  { term: 'trait' },
  { term: 'monad' },
  { term: 'functor' },

  // Frontend
  { term: 'virtual DOM' },
  { term: 'reconciliation' },
  { term: 'hydration' },
  { term: 'SSR' },
  { term: 'SSG' },
  { term: 'hook' },
  { term: 'render props' },
  { term: 'higher-order component' },
  { term: 'slot' },
  { term: 'directive' },
  { term: 'composable' },

  // AI/ML
  { term: 'transformer' },
  { term: 'embedding' },
  { term: 'token' },
  { term: 'attention' },
  { term: 'fine-tuning' },
  { term: 'inference' },
  { term: 'RAG' },
  { term: 'prompt' },
  { term: 'hallucination' },
  { term: 'agent' },

  // Cloud native & infrastructure
  { term: 'pod' },
  { term: 'deployment' },
  { term: 'ingress' },
  { term: 'service mesh' },
  { term: 'sidecar' },
  { term: 'operator' },
  { term: 'daemon' },
  { term: 'cron job' },

  // Systems & networking
  { term: 'middleware' },
  { term: 'webhook' },
  { term: 'websocket' },
  { term: 'gRPC' },
  { term: 'GraphQL' },
  { term: 'REST' },
  { term: 'mutex' },
  { term: 'semaphore' },
  { term: 'deadlock' },
  { term: 'race condition' },

  // Data & storage
  { term: 'schema' },
  { term: 'migration' },
  { term: 'ORM' },
  { term: 'sharding' },
  { term: 'replica' },

  // DevOps & tools
  { term: 'CI/CD' },
  { term: 'pipeline' },
  { term: 'container' },
  { term: 'orchestration' },
  { term: 'canary' },
  { term: 'blue-green' },

  // General dev concepts
  { term: 'framework' },
  { term: 'library' },
  { term: 'API' },
  { term: 'SDK' },
  { term: 'CLI' },
  { term: 'IDE' },
  { term: 'linter' },
  { term: 'bundler' },
  { term: 'polyfill' },
  { term: 'shim' },
  { term: 'boilerplate' },
  { term: 'scaffold' },
  { term: 'monorepo' },
  { term: 'microservice' },
];

/** 将术语列表拼接为逗号分隔的字符串，用于嵌入 system prompt */
export function getStrongTermsList(): string {
  return STRONG_TERMS.map((t) => t.term).join(', ');
}
