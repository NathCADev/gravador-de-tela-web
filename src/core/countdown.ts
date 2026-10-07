// Contagem regressiva baseada em prazo fixo (performance.now),
// para não distorcer quando a aba está em segundo plano.

export function startCountdown(
  totalSeconds: number,
  onTick: (remainingSeconds: number) => void,
  onDone: () => void
): () => void {
  const deadline = performance.now() + totalSeconds * 1000;
  let lastShown = -1;

  const check = (): void => {
    const remainingMs = deadline - performance.now();
    if (remainingMs <= 0) {
      cleanup();
      onDone();
      return;
    }
    const remaining = Math.ceil(remainingMs / 1000);
    if (remaining !== lastShown) {
      lastShown = remaining;
      onTick(remaining);
    }
  };

  const id = window.setInterval(check, 200);
  const cleanup = (): void => window.clearInterval(id);
  // Mostra o número inicial imediatamente.
  onTick(totalSeconds);
  lastShown = totalSeconds;
  return cleanup;
}
