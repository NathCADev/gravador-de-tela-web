export interface Capabilities {
  displayMedia: boolean;
  mediaRecorder: boolean;
  audioContext: boolean;
  mp4Supported: boolean;
  webmSupported: boolean;
  cursorSupported: boolean;
  pipSupported: boolean;
  wakeLockSupported: boolean;
  filePickerSupported: boolean;
  isMobile: boolean;
  supported: boolean;
  missing: string[];
}

const MP4_CANDIDATES = [
  'video/mp4;codecs=avc1.64002A,mp4a.40.2',
  'video/mp4;codecs=avc1,opus',
  'video/mp4'
];

const WEBM_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

export function pickMime(kind: 'mp4' | 'webm'): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return null;
  }
  const list = kind === 'mp4' ? MP4_CANDIDATES : WEBM_CANDIDATES;
  for (const mime of list) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      continue;
    }
  }
  return null;
}

export function detectCapabilities(): Capabilities {
  const missing: string[] = [];
  const displayMedia =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function';
  const mediaRecorder = typeof MediaRecorder !== 'undefined';
  const audioContext =
    typeof window !== 'undefined' &&
    (typeof window.AudioContext !== 'undefined' ||
      typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined');

  if (!displayMedia) missing.push('captura de tela (getDisplayMedia)');
  if (!mediaRecorder) missing.push('gravação de mídia (MediaRecorder)');
  if (!audioContext) missing.push('áudio (AudioContext)');

  const mp4Supported = pickMime('mp4') !== null;
  const webmSupported = pickMime('webm') !== null;
  if (!mp4Supported && !webmSupported) missing.push('formato de vídeo suportado');

  let cursorSupported = false;
  try {
    const supported = navigator.mediaDevices?.getSupportedConstraints?.();
    cursorSupported = !!supported && 'cursor' in supported;
  } catch {
    cursorSupported = false;
  }

  const pipSupported =
    typeof document !== 'undefined' &&
    'pictureInPictureEnabled' in document &&
    typeof document.createElement('video').requestPictureInPicture === 'function';
  const docPipSupported =
    typeof (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture !== 'undefined';
  const wakeLockSupported =
    typeof navigator !== 'undefined' && typeof (navigator as unknown as { wakeLock?: unknown }).wakeLock !== 'undefined';
  const filePickerSupported =
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';

  // Só para computador: no celular os navegadores não oferecem captura de tela.
  // Detecção por user agent (não por toque, para não barrar notebook com touch).
  const isMobile =
    typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

  const supported = displayMedia && mediaRecorder && audioContext && (mp4Supported || webmSupported);

  return {
    displayMedia,
    mediaRecorder,
    audioContext,
    mp4Supported,
    webmSupported,
    cursorSupported,
    pipSupported: pipSupported || docPipSupported,
    wakeLockSupported,
    filePickerSupported,
    isMobile,
    supported,
    missing
  };
}

export const MP4_MIME_CANDIDATES = MP4_CANDIDATES;
export const WEBM_MIME_CANDIDATES = WEBM_CANDIDATES;
