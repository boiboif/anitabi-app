export type GoatCounterStats = {
  total: number | null;
  recent: number | null;
};

export function fetchGoatCounterStats(options?: {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<GoatCounterStats | null>;
