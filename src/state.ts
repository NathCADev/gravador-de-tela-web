export type RecorderState =
  | 'idle'
  | 'requesting'
  | 'countdown'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'ready'
  | 'error';

export type SourceHint = 'screen' | 'window' | 'tab';
export type Quality = '480p' | '720p' | '1080p';
export type Fps = 15 | 24 | 30;
export type FormatId = 'mp4' | 'webm';
export type CursorMode = 'always' | 'never';
export type CountdownSecs = 0 | 3 | 5;

export interface RecorderConfig {
  source: SourceHint;
  systemAudio: boolean;
  micEnabled: boolean;
  micDeviceId: string;
  quality: Quality;
  fps: Fps;
  format: FormatId;
  saveToDisk: boolean;
  cursor: CursorMode;
  countdown: CountdownSecs;
}

export interface ResultInfo {
  blob: Blob;
  url: string;
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  format: FormatId;
}

type Listener = () => void;

export const DEFAULTS: RecorderConfig = {
  source: 'screen',
  systemAudio: true,
  micEnabled: false,
  micDeviceId: 'default',
  quality: '720p',
  fps: 30,
  format: 'mp4',
  saveToDisk: false,
  cursor: 'always',
  countdown: 3
};

class Store {
  state: RecorderState = 'idle';
  config: RecorderConfig = { ...DEFAULTS };
  errorMessage: string | null = null;
  result: ResultInfo | null = null;
  private listeners = new Set<Listener>();

  setState(next: RecorderState): void {
    this.state = next;
    this.emit();
  }

  patchConfig(patch: Partial<RecorderConfig>): void {
    this.config = { ...this.config, ...patch };
    this.emit();
  }

  setError(message: string | null): void {
    this.errorMessage = message;
    this.emit();
  }

  setResult(result: ResultInfo | null): void {
    this.result = result;
    this.emit();
  }

  resetResult(): void {
    if (this.result) {
      URL.revokeObjectURL(this.result.url);
    }
    this.result = null;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

export const store = new Store();

export function announce(message: string): void {
  const el = document.getElementById('sr-live');
  if (el) el.textContent = message;
}
