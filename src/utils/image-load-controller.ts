export type ImageLoadSnapshot = {
  phase: 'loading' | 'retrying' | 'loaded' | 'error';
  /** Keep usable content when a later native load starts or fails. */
  hasContent: boolean;
};

type Timer = ReturnType<typeof setTimeout>;
type Options = {
  reload: () => Promise<unknown> | void;
  schedule?: (callback: () => void, delay: number) => Timer;
  cancel?: (timer: Timer) => void;
};

const RETRY_DELAYS = [500, 1500] as const;

/** One displayed image owns its requests; neither cache fills nor preview dismissal restart them. */
export function createImageLoadController({ reload, schedule = setTimeout, cancel = clearTimeout }: Options) {
  let snapshot: ImageLoadSnapshot = { phase: 'loading', hasContent: false };
  const listeners = new Set<() => void>();
  let active = true;
  let generation = 0;
  let automaticAttempts = 0;
  let timer: Timer | undefined;
  let pendingDelay: number | undefined;
  let recovery: { token: object; confirmed: boolean; attempted: boolean } | undefined;

  const update = (phase: ImageLoadSnapshot['phase'], hasContent = snapshot.hasContent) => {
    if (snapshot.phase === phase && snapshot.hasContent === hasContent) return;
    snapshot = { phase, hasContent };
    listeners.forEach((listener) => listener());
  };
  const cancelRetry = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    pendingDelay = undefined;
  };
  const reloadImage = () => {
    cancelRetry();
    const attempt = ++generation;
    update('loading');
    try {
      // Command completion is not image success; only onLoad confirms usable content.
      void Promise.resolve(reload()).catch(() => {
        if (active && generation === attempt) onError();
      });
    } catch {
      if (active && generation === attempt) onError();
    }
  };
  const scheduleRetry = (delay: number) => {
    pendingDelay = delay;
    timer = schedule(() => {
      timer = undefined;
      if (active) reloadImage();
    }, delay);
  };
  const recover = () => {
    if (!recovery?.confirmed || recovery.attempted) return false;
    recovery.attempted = true;
    reloadImage();
    return true;
  };
  const onError = () => {
    if (!active || snapshot.hasContent || snapshot.phase === 'retrying') return;
    ++generation;
    const delay = RETRY_DELAYS[automaticAttempts];
    if (delay !== undefined) {
      ++automaticAttempts;
      update('retrying');
      scheduleRetry(delay);
    } else if (!recover()) update('error');
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    activate() {
      active = true;
      // React Strict Mode may replay the effect without remounting this image.
      if (pendingDelay !== undefined && timer === undefined) scheduleRetry(pendingDelay);
    },
    dispose() {
      active = false;
      ++generation;
      if (timer !== undefined) cancel(timer);
      timer = undefined;
    },
    onLoadStart() {
      if (!active) return;
      ++generation;
      cancelRetry();
      update(snapshot.hasContent ? 'loaded' : 'loading');
    },
    onLoad() {
      if (!active) return;
      ++generation;
      cancelRetry();
      automaticAttempts = 0;
      update('loaded', true);
    },
    onError,
    retry() {
      if (!active || snapshot.phase !== 'error') return;
      automaticAttempts = 0;
      if (recovery) recovery.attempted = true;
      reloadImage();
    },
    beginRecovery(token: object) {
      if (active) recovery = { token, confirmed: false, attempted: false };
    },
    confirmRecovery(token: object) {
      if (!active || recovery?.token !== token || snapshot.hasContent) return;
      recovery.confirmed = true;
      // Leave ongoing requests and scheduled automatic retries alone.
      if (snapshot.phase === 'error') recover();
    },
  };
}
