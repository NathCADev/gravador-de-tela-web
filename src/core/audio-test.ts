import { captureMicrophone, captureScreen, type ScreenCapture } from './capture';
import { createLevelMeter, type LevelMeter } from './audio-meter';
import type { CursorMode, Fps, Quality, SourceHint } from '../state';

export interface TestVideoOptions {
  source: SourceHint;
  quality: Quality;
  fps: Fps;
  cursor: CursorMode;
}

export type MicTestState = 'starting' | 'live' | 'denied' | 'none';
export type SysTestState = 'untested' | 'live' | 'no-audio';

/**
 * Sessão de teste prévio de áudio. Mantém streams, AudioContext e
 * analisadores enquanto o painel está aberto, sem gravar nada.
 * A captura de tela pode ser reaproveitada pela gravação (handOver).
 */
export class AudioTestSession {
  micStream: MediaStream | null = null;
  micState: MicTestState = 'starting';
  micMessage: string | null = null;
  screen: ScreenCapture | null = null;
  screenOpts: TestVideoOptions | null = null;
  sysState: SysTestState = 'untested';
  micMeter: LevelMeter | null = null;
  sysMeter: LevelMeter | null = null;

  private audioCtx: AudioContext | null = null;
  private nodes: AudioNode[] = [];
  private handedOver = false;

  private ensureContext(): AudioContext {
    if (!this.audioCtx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AC();
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => undefined);
    }
    return this.audioCtx;
  }

  // Fonte ligada a um analisador e a um ganho zero, para o grafo
  // continuar ativo sem sair som nos alto-falantes.
  private attach(track: MediaStreamTrack): AnalyserNode {
    const ctx = this.ensureContext();
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    const zero = ctx.createGain();
    zero.gain.value = 0;
    src.connect(analyser);
    analyser.connect(zero);
    zero.connect(ctx.destination);
    this.nodes.push(src, analyser, zero);
    return analyser;
  }

  async startMic(deviceId: string): Promise<void> {
    this.stopMic();
    this.micState = 'starting';
    this.micMessage = null;
    try {
      this.micStream = await captureMicrophone(deviceId);
    } catch (err) {
      const name = (err as DOMException)?.name ?? '';
      if (name === 'NotAllowedError') {
        this.micState = 'denied';
        this.micMessage =
          'O microfone está bloqueado. Libere o acesso no ícone de cadeado da barra de endereço.';
      } else {
        this.micState = 'none';
        this.micMessage = 'Nenhum microfone foi encontrado. Conecte um e tente de novo.';
      }
      return;
    }
    const track = this.micStream.getAudioTracks()[0];
    if (!track) {
      this.micState = 'none';
      this.micMessage = 'Nenhum microfone foi encontrado. Conecte um e tente de novo.';
      return;
    }
    this.micMeter = createLevelMeter(this.attach(track));
    this.micState = 'live';
  }

  private stopMic(): void {
    try {
      this.micStream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignora */
    }
    this.micStream = null;
    this.micMeter = null;
  }

  async restartMic(deviceId: string): Promise<void> {
    await this.startMic(deviceId);
  }

  /**
   * Abre o seletor de compartilhamento para testar o áudio do sistema.
   * Retorna 'cancelled' se o usuário fechar o seletor.
   */
  async startScreen(opts: TestVideoOptions, withSystemAudio: boolean): Promise<'shared' | 'no-audio' | 'cancelled'> {
    let capture: ScreenCapture;
    try {
      capture = await captureScreen(opts.source, opts.quality, opts.fps, withSystemAudio, opts.cursor);
    } catch (err) {
      if ((err as DOMException)?.name === 'NotAllowedError') return 'cancelled';
      throw err;
    }
    this.screen = capture;
    this.screenOpts = { ...opts };
    const audioTrack = capture.systemAudioTrack;
    if (withSystemAudio && audioTrack) {
      this.sysMeter = createLevelMeter(this.attach(audioTrack));
      this.sysState = 'live';
      return 'shared';
    }
    this.sysMeter = null;
    this.sysState = 'no-audio';
    return 'no-audio';
  }

  matchesVideo(opts: TestVideoOptions): boolean {
    if (!this.screen || !this.screenOpts) return false;
    const s = this.screenOpts;
    return s.source === opts.source && s.quality === opts.quality && s.fps === opts.fps && s.cursor === opts.cursor;
  }

  /** Descarta só a captura de tela (opções de vídeo mudaram). O microfone continua. */
  invalidateScreen(): void {
    try {
      this.screen?.stream.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignora */
    }
    this.screen = null;
    this.screenOpts = null;
    this.sysMeter = null;
    this.sysState = 'untested';
  }

  onVideoEnded(cb: () => void): void {
    this.screen?.videoTrack.addEventListener('ended', cb, { once: true });
  }

  /** Transfere os streams para a gravação. A sessão não os encerra depois. */
  handOver(): { screen: ScreenCapture; mic: MediaStream | null } | null {
    if (!this.screen) return null;
    const result = { screen: this.screen, mic: this.micStream };
    this.screen = null;
    this.screenOpts = null;
    this.micStream = null;
    this.micMeter = null;
    this.sysMeter = null;
    this.handedOver = true;
    return result;
  }

  dispose(): void {
    if (!this.handedOver) {
      try {
        this.screen?.stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignora */
      }
      this.stopMic();
    }
    this.screen = null;
    this.screenOpts = null;
    try {
      this.nodes.forEach((n) => n.disconnect());
    } catch {
      /* ignora */
    }
    this.nodes = [];
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => undefined);
      this.audioCtx = null;
    }
  }
}
