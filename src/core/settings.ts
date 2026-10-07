import { DEFAULTS, type RecorderConfig } from '../state';

const KEY = 'gravador:settings:v1';
const SAVE_DELAY_MS = 300;

export interface StoredSettings {
  version: 1;
  source: RecorderConfig['source'];
  systemAudio: boolean;
  micEnabled: boolean;
  micDeviceId: string;
  quality: RecorderConfig['quality'];
  fps: RecorderConfig['fps'];
  format: RecorderConfig['format'];
  cursor: RecorderConfig['cursor'];
  countdown: RecorderConfig['countdown'];
  saveToDisk: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** Lê e valida as configurações salvas. Retorna null se não houver nada válido. */
export function loadSettings(): StoredSettings | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  return {
    version: 1,
    source: pick(parsed.source, ['screen', 'window', 'tab'] as const, DEFAULTS.source),
    systemAudio: pickBoolean(parsed.systemAudio, DEFAULTS.systemAudio),
    micEnabled: pickBoolean(parsed.micEnabled, DEFAULTS.micEnabled),
    micDeviceId: pickString(parsed.micDeviceId, DEFAULTS.micDeviceId),
    quality: pick(parsed.quality, ['480p', '720p', '1080p'] as const, DEFAULTS.quality),
    fps: pick(parsed.fps, [15, 24, 30] as const, DEFAULTS.fps),
    format: pick(parsed.format, ['mp4', 'webm'] as const, DEFAULTS.format),
    cursor: pick(parsed.cursor, ['always', 'never'] as const, DEFAULTS.cursor),
    countdown: pick(parsed.countdown, [0, 3, 5] as const, DEFAULTS.countdown),
    saveToDisk: pickBoolean(parsed.saveToDisk, DEFAULTS.saveToDisk)
  };
}

export function readSettings(): StoredSettings {
  return loadSettings() ?? { version: 1, ...DEFAULTS };
}

let timer: number | null = null;
let pending: RecorderConfig | null = null;

function flush(): void {
  timer = null;
  if (!pending) return;
  const config = pending;
  pending = null;
  const data: StoredSettings = {
    version: 1,
    source: config.source,
    systemAudio: config.systemAudio,
    micEnabled: config.micEnabled,
    micDeviceId: config.micDeviceId,
    quality: config.quality,
    fps: config.fps,
    format: config.format,
    cursor: config.cursor,
    countdown: config.countdown,
    saveToDisk: config.saveToDisk
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Armazenamento indisponível (anônima, cheio, bloqueado): segue com padrões.
  }
}

/** Salva com atraso curto para agrupar mudanças seguidas. */
export function saveSettingsSoon(config: RecorderConfig): void {
  pending = { ...config };
  if (timer !== null) return;
  timer = window.setTimeout(flush, SAVE_DELAY_MS);
}

export function clearSettings(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  pending = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
}
