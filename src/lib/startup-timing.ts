// The test release keeps console output so these timestamps can be aligned
// with Android's ActivityTaskManager and WindowManager logcat entries.
const startedAt = performance.now();
const recordedOnce = new Set<string>();

type StartupDetails = Record<string, number | string | boolean | null>;

export function startupNow(): number {
  return performance.now();
}

export function logStartup(event: string, details: StartupDetails = {}): void {
  console.info(
    '[startup-timing]',
    JSON.stringify({
      event,
      wallMs: Date.now(),
      sinceFirstMarkMs: Math.round(performance.now() - startedAt),
      ...details,
    }),
  );
}

export function logStartupOnce(event: string, details: StartupDetails = {}): void {
  if (recordedOnce.has(event)) return;
  recordedOnce.add(event);
  logStartup(event, details);
}

export function logStartupDuration(event: string, start: number, details: StartupDetails = {}): void {
  logStartup(event, { durationMs: Math.round(performance.now() - start), ...details });
}

logStartup('js-timing-start');
