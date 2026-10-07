import type { FormatId, Fps, Quality } from '../state';
import { pickMime } from './capabilities';

export interface Preset {
  quality: Quality;
  width: number;
  height: number;
  h264VideoBps: number;
  vp9VideoBps: number;
}

export const PRESETS: Record<Quality, Preset> = {
  '480p': { quality: '480p', width: 854, height: 480, h264VideoBps: 1_000_000, vp9VideoBps: 700_000 },
  '720p': { quality: '720p', width: 1280, height: 720, h264VideoBps: 2_500_000, vp9VideoBps: 1_600_000 },
  '1080p': { quality: '1080p', width: 1920, height: 1080, h264VideoBps: 5_000_000, vp9VideoBps: 3_300_000 }
};

export const AUDIO_BPS = 128_000;

const FPS_FACTOR: Record<Fps, number> = { 15: 0.7, 24: 0.9, 30: 1.0 };

export function videoBitrate(quality: Quality, fps: Fps, format: FormatId): number {
  const preset = PRESETS[quality];
  const base = format === 'mp4' ? preset.h264VideoBps : preset.vp9VideoBps;
  return Math.round(base * FPS_FACTOR[fps]);
}

export function estimateBytesPerMinute(quality: Quality, fps: Fps, format: FormatId): number {
  const totalBps = videoBitrate(quality, fps, format) + AUDIO_BPS;
  return Math.round((totalBps / 8) * 60);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function resolveMimeType(format: FormatId): string | null {
  return pickMime(format);
}

export function fileExtensionFor(format: FormatId): string {
  return format === 'mp4' ? 'mp4' : 'webm';
}
