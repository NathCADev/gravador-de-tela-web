import type { CursorMode, Fps, Quality, SourceHint } from '../state';
import { PRESETS } from './presets';

export interface ScreenCapture {
  stream: MediaStream;
  videoTrack: MediaStreamTrack;
  systemAudioTrack: MediaStreamTrack | null;
}

function displaySurfaceHint(source: SourceHint): string {
  if (source === 'screen') return 'monitor';
  if (source === 'window') return 'window';
  return 'browser';
}

export async function captureScreen(
  source: SourceHint,
  quality: Quality,
  fps: Fps,
  withSystemAudio: boolean,
  cursor: CursorMode = 'always'
): Promise<ScreenCapture> {
  const preset = PRESETS[quality];
  const constraints: DisplayMediaStreamOptions & {
    systemAudio?: string;
    surfaceSwitching?: string;
    selfBrowserSurface?: string;
    monitorTypeSurfaces?: string;
  } = {
    video: {
      height: { ideal: preset.height },
      frameRate: { ideal: fps },
      cursor
    } as MediaTrackConstraints,
    audio: withSystemAudio ? true : false,
    systemAudio: withSystemAudio ? 'include' : 'exclude',
    surfaceSwitching: 'include',
    selfBrowserSurface: 'exclude',
    monitorTypeSurfaces: 'include'
  };

  // Dica de superfície preferida; o seletor nativo decide.
  (constraints.video as Record<string, unknown>).displaySurface = displaySurfaceHint(source);

  const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
  const videoTracks = stream.getVideoTracks();
  if (videoTracks.length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    throw new DOMException('Nenhuma trilha de vídeo', 'NotFoundError');
  }
  const videoTrack = videoTracks[0];

  // Tenta aplicar altura e fps após a captura (sugestão, pode ser ignorada).
  try {
    await videoTrack.applyConstraints({
      height: { ideal: preset.height },
      frameRate: { ideal: fps }
    });
  } catch {
    // Ignora: navegador pode recusar.
  }

  const audioTracks = stream.getAudioTracks();
  const systemAudioTrack = withSystemAudio && audioTracks.length > 0 ? audioTracks[0] : null;

  // Se pediu áudio do sistema e não veio só vídeo, remove trilhas de áudio vazias? Não: mantém.
  return { stream, videoTrack, systemAudioTrack };
}

export async function captureMicrophone(deviceId: string): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      // `ideal` em vez de `exact`: se o dispositivo salvo não existir mais,
      // o navegador usa o padrão em vez de falhar.
      deviceId: deviceId && deviceId !== 'default' ? { ideal: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: false
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}

export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  } catch {
    return [];
  }
}
