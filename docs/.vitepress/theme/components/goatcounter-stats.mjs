const counterUrl = 'https://boiboif.goatcounter.com/counter/TOTAL.json';
const requestTimeoutMs = 8000;

function parseCount(value) {
  if (typeof value !== 'string') return null;
  // GoatCounter returns a formatted string; the separator depends on its settings.
  if (!/^(?:\d+|\d{1,3}(?:[,.'’ \u00a0\u202f]\d{3})+)$/.test(value)) return null;
  const count = Number(value.replace(/[,.'’ \u00a0\u202f]/g, ''));
  return Number.isSafeInteger(count) ? count : null;
}

async function fetchCount(url, signal, fetchImpl, timeoutMs) {
  if (signal?.aborted) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok || controller.signal.aborted) return null;
    const data = await response.json();
    if (!data || typeof data !== 'object' || controller.signal.aborted) return null;
    return parseCount(data.count);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

/** Read each public counter independently, without treating errors as zero. */
export async function fetchGoatCounterStats({ signal, fetchImpl = globalThis.fetch, timeoutMs = requestTimeoutMs, now = new Date() } = {}) {
  // The public counter interprets dates at midnight UTC.
  const today = now.toISOString().slice(0, 10);
  const [total, recent, daily] = await Promise.all([
    fetchCount(counterUrl, signal, fetchImpl, timeoutMs),
    fetchCount(`${counterUrl}?start=month`, signal, fetchImpl, timeoutMs),
    fetchCount(`${counterUrl}?start=${today}`, signal, fetchImpl, timeoutMs),
  ]);
  return total === null && recent === null && daily === null ? null : { total, recent, today: daily };
}
