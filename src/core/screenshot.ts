// Captura do quadro atual da trilha de vídeo em PNG,
// sem interromper a gravação.

export function buildScreenshotName(when: Date, used: Set<string>): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const base =
    `captura-${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `_${pad(when.getHours())}-${pad(when.getMinutes())}-${pad(when.getSeconds())}`;
  let name = `${base}.png`;
  let counter = 2;
  while (used.has(name)) {
    name = `${base}-${counter}.png`;
    counter += 1;
  }
  used.add(name);
  return name;
}

function nextFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const v = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => void;
    };
    if (typeof v.requestVideoFrameCallback === 'function') {
      v.requestVideoFrameCallback(() => resolve());
    } else {
      requestAnimationFrame(() => resolve());
    }
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('toBlob falhou'));
    }, 'image/png');
  });
}

export class Screenshotter {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private tail: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(videoTrack: MediaStreamTrack) {
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.style.display = 'none';
    this.video.srcObject = new MediaStream([videoTrack]);
    document.body.appendChild(this.video);
    void this.video.play().catch(() => undefined);
    this.canvas = document.createElement('canvas');
  }

  /** Captura um PNG. Chamadas simultâneas são serializadas. */
  capture(): Promise<Blob> {
    const run = this.tail.then(() => this.captureNow());
    // Mantém a cadeia viva mesmo se uma captura falhar.
    this.tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async captureNow(): Promise<Blob> {
    if (this.disposed) throw new Error('descartado');
    await nextFrame(this.video);
    const width = this.video.videoWidth;
    const height = this.video.videoHeight;
    if (!width || !height) throw new Error('sem quadro');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('sem contexto');
    ctx.drawImage(this.video, 0, 0, width, height);
    return canvasToBlob(this.canvas);
  }

  dispose(): void {
    this.disposed = true;
    try {
      this.video.pause();
    } catch {
      /* ignora */
    }
    this.video.removeAttribute('src');
    this.video.remove();
  }
}
