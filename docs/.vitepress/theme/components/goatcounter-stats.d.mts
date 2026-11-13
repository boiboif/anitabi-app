export type GoatCounterStats = {
  total: number | null;
  recent: number | null;
  today: number | null;
};

export function fetchGoatCounterStats(options?: {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: Date;
}): Promise<GoatCounterStats | null>;
