import fixWebmDuration from 'fix-webm-duration';

export interface RecorderHandles {
  recorder: MediaRecorder;
  chunks: Blob[];
  addListener: (cb: (totalBytes: number) => void) => void;
  stop: () => Promise<Blob>;
}

export function createRecorder(
  stream: MediaStream,
  mimeType: string,
  videoBitsPerSecond: number,
  audioBitsPerSecond: number,
  onData?: (chunk: Blob, totalBytes: number) => void
): RecorderHandles {
  const chunks: Blob[] = [];
  const listeners = new Set<(total: number) => void>();
  let totalBytes = 0;

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond,
    audioBitsPerSecond
  });

  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
      totalBytes += event.data.size;
      onData?.(event.data, totalBytes);
      listeners.forEach((cb) => cb(totalBytes));
    }
  };

  recorder.start(1000);

  const stop = (): Promise<Blob> =>
    new Promise((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType }));
      };
      try {
        if (recorder.state !== 'inactive') recorder.stop();
        else resolve(new Blob(chunks, { type: mimeType }));
      } catch {
        resolve(new Blob(chunks, { type: mimeType }));
      }
    });

  return {
    recorder,
    chunks,
    addListener: (cb) => {
      listeners.add(cb);
    },
    stop
  };
}

export async function finalizeBlob(blob: Blob, durationMs: number, mimeType: string): Promise<Blob> {
  if (mimeType.includes('webm')) {
    try {
      const fixed = await fixWebmDuration(blob, durationMs, { logger: false });
      return fixed;
    } catch {
      return blob;
    }
  }
  return blob;
}
