let lock: WakeLockSentinel | null = null;

export async function acquireWakeLock(): Promise<void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<WakeLockSentinel> } };
    if (!nav.wakeLock) return;
    lock = await nav.wakeLock.request('screen');
  } catch {
    lock = null;
  }
}

export function releaseWakeLock(): void {
  try {
    void lock?.release().catch(() => undefined);
  } catch {
    /* ignora */
  }
  lock = null;
}

export function watchVisibility(restore: () => void): () => void {
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') restore();
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => document.removeEventListener('visibilitychange', onVisibility);
}
