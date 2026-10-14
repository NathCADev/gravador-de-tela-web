import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { detectCapabilities, type Capabilities } from './core/capabilities';
import { captureMicrophone, captureScreen, listMicrophones, type ScreenCapture } from './core/capture';
import { createMixer, type MixerHandles } from './core/audio-mixer';
import { createLevelMeter, type LevelMeter } from './core/audio-meter';
import { createRecorder, finalizeBlob } from './core/recorder';
import { remuxMp4Seekable } from './core/remux';
import { buildFileName, triggerDownload } from './core/download';
import { MSG, translateError } from './core/errors';
import { acquireWakeLock, releaseWakeLock, watchVisibility } from './core/wake-lock';
import { PipController, formatElapsed } from './core/pip-controller';
import { startCountdown } from './core/countdown';
import { buildScreenshotName, Screenshotter } from './core/screenshot';
import { AudioTestSession } from './core/audio-test';
import { clearSettings, loadSettings, saveSettingsSoon } from './core/settings';
import { isDiskSaveSupported, openDiskWriter, type DiskWriter } from './core/storage-writer';
import { AUDIO_BPS, fileExtensionFor, formatSize, resolveMimeType, videoBitrate } from './core/presets';
import { announce, DEFAULTS, store } from './state';
import { icon, refreshIcons } from './ui/icons';
import { currentTheme, initTheme, toggleTheme } from './ui/theme';
import {
  renderCountdown,
  renderIncompatible,
  renderMobileOnly,
  renderRecording,
  renderRequesting,
  renderResult,
  renderSetup,
  renderStopping,
  type TestPanelModel
} from './ui/views';

interface Session {
  screenStream: MediaStream;
  micStream: MediaStream | null;
  mixer: MixerHandles | null;
  meters: { system: LevelMeter | null; mic: LevelMeter | null };
  combined: MediaStream;
  stopRecorder: () => Promise<Blob>;
  recorder: MediaRecorder;
  videoTrack: MediaStreamTrack;
  disk: DiskWriter | null;
  mimeType: string;
  screenshotter: Screenshotter | null;
  shotUrls: string[];
  shotCount: number;
  shotNames: Set<string>;
  startPerf: number;
  pausedTotal: number;
  pauseStart: number | null;
  raf: number | null;
  clock: number | null;
  totalBytes: number;
  unwatchVisibility: (() => void) | null;
  announcedLarge: boolean;
}

interface PendingCapture {
  screen: ScreenCapture;
  mic: MediaStream | null;
}

interface ReusedCapture {
  screen: ScreenCapture;
  mic: MediaStream | null;
}

let caps: Capabilities;
let mics: MediaDeviceInfo[] = [];
let session: Session | null = null;
let pending: PendingCapture | null = null;
let cancelCountdownFn: (() => void) | null = null;
let cursorMismatch = false;
let elapsedMs = 0;

// Estado do painel de teste (subestado de `idle`, fora da máquina principal).
let testSession: AudioTestSession | null = null;
let testOpen = false;
let testSysTesting = false;
let testInvalidated: string | null = null;
let testRaf: number | null = null;
let pendingRestoreMsg = false;

const pip = new PipController();
const app = document.getElementById('app') as HTMLElement;

function shell(inner: string, theme: string): string {
  const themeIcon = theme === 'dark' ? 'sun' : 'moon';
  return `
  <div class="page">
    <header class="topbar">
      <div class="brand">${icon('monitor')}<span>Gravador de tela</span></div>
      <button class="btn-icon" id="btn-theme" aria-label="Alternar tema" title="Alternar tema">${icon(themeIcon, false)}</button>
    </header>
    <main class="card" id="card">${inner}</main>
    <footer class="app-footer">Gravador de tela · ${new Date().getFullYear()}</footer>
  </div>`;
}

function render(): void {
  const theme = currentTheme();
  const state = store.state;
  let inner = '';
  if (caps.isMobile) {
    inner = renderMobileOnly();
  } else if (!caps.supported) {
    inner = renderIncompatible(caps);
  } else if (state === 'requesting') {
    inner = renderRequesting();
  } else if (state === 'countdown') {
    inner = renderCountdown();
  } else if (state === 'recording' || state === 'paused') {
    inner = renderRecording(store.config, cursorMismatch);
  } else if (state === 'ready' && store.result) {
    inner = renderResult(store.result);
  } else if (state === 'stopping') {
    inner = renderStopping();
  } else {
    if (state === 'error' && store.errorMessage) {
      inner = `<div style="margin-bottom:12px">${errorNote(store.errorMessage)}</div>` + renderSetup(store.config, caps, mics, null, setupExtras());
    } else {
      inner = renderSetup(store.config, caps, mics, null, setupExtras());
    }
  }
  app.innerHTML = shell(inner, theme);
  refreshIcons();
  bind();
  if (state === 'recording' || state === 'paused') syncRecordingUi();
  if (pendingRestoreMsg) {
    pendingRestoreMsg = false;
    const el = document.getElementById('restore-status');
    if (el) {
      el.textContent = 'Configurações restauradas';
      window.setTimeout(() => {
        if (el.isConnected) el.textContent = '';
      }, 4000);
    }
  }
}

function setupExtras(): Parameters<typeof renderSetup>[4] {
  return {
    cursorSupported: caps.cursorSupported,
    testOpen,
    test: testOpen ? buildTestModel() : null,
    restoreMsg: null
  };
}

function buildTestModel(): TestPanelModel {
  const t = testSession;
  return {
    micState: t?.micState ?? 'starting',
    micMessage: t?.micMessage ?? null,
    sysState: testSysTesting ? 'testing' : t?.sysState === 'live' ? 'live' : t?.sysState === 'no-audio' ? 'no-audio' : 'untested',
    sysMessage: t?.sysState === 'no-audio' ? MSG.systemAudioMissing : null,
    canReuse: !!t?.screen,
    invalidatedNote: testInvalidated
  };
}

function errorNote(message: string): string {
  return `<div class="note note-error" role="alert">${icon('triangle-alert')}<span>${message}</span></div>`;
}

function bind(): void {
  document.getElementById('btn-theme')?.addEventListener('click', () => {
    toggleTheme();
    render();
  });

  if (caps.isMobile || !caps.supported) return;
  const state = store.state;

  if (state === 'idle' || state === 'error') {
    bindSetup();
  } else if (state === 'countdown') {
    document.getElementById('btn-countdown-cancel')?.addEventListener('click', () => cancelCountdown());
    document.getElementById('btn-countdown-cancel')?.focus();
  } else if (state === 'recording' || state === 'paused') {
    bindRecording();
  } else if (state === 'ready') {
    document.getElementById('btn-download')?.addEventListener('click', downloadResult);
    document.getElementById('btn-new')?.addEventListener('click', () => {
      store.resetResult();
      store.setError(null);
      store.setState('idle');
    });
  }
}

/** Mudança em opção de vídeo com teste aberto: descarta a captura e avisa. */
function maybeInvalidateTest(): void {
  if (testSession?.screen) {
    testSession.invalidateScreen();
    testInvalidated = MSG.testInvalidated;
  }
}

function bindSetup(): void {
  const radios = (name: string): NodeListOf<HTMLInputElement> =>
    document.querySelectorAll(`input[name="${name}"]`);
  radios('fonte').forEach((r) =>
    r.addEventListener('change', () => {
      if (r.checked) {
        maybeInvalidateTest();
        store.patchConfig({ source: r.value as typeof store.config.source });
      }
    })
  );
  radios('cursor').forEach((r) =>
    r.addEventListener('change', () => {
      if (r.checked) {
        maybeInvalidateTest();
        store.patchConfig({ cursor: r.value as typeof store.config.cursor });
      }
    })
  );
  radios('qualidade').forEach((r) =>
    r.addEventListener('change', () => {
      if (r.checked) {
        maybeInvalidateTest();
        store.patchConfig({ quality: r.value as typeof store.config.quality });
      }
    })
  );
  radios('fps').forEach((r) =>
    r.addEventListener('change', () => {
      if (r.checked) {
        maybeInvalidateTest();
        store.patchConfig({ fps: Number(r.value) as typeof store.config.fps });
      }
    })
  );
  radios('formato').forEach((r) =>
    r.addEventListener('change', () => {
      if (r.checked) store.patchConfig({ format: r.value as typeof store.config.format });
    })
  );
  radios('contagem').forEach((r) =>
    r.addEventListener('change', () => {
      if (r.checked) store.patchConfig({ countdown: Number(r.value) as typeof store.config.countdown });
    })
  );
  document.getElementById('opt-system-audio')?.addEventListener('change', (e) => {
    store.patchConfig({ systemAudio: (e.target as HTMLInputElement).checked });
  });
  document.getElementById('opt-mic')?.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    store.patchConfig({ micEnabled: enabled });
    if (enabled) {
      try {
        const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
        tmp.getTracks().forEach((t) => t.stop());
        mics = await listMicrophones();
      } catch {
        store.patchConfig({ micEnabled: false });
        store.setError(MSG.micDenied);
        return;
      }
      render();
    }
  });
  document.getElementById('opt-mic-device')?.addEventListener('change', (e) => {
    const deviceId = (e.target as HTMLSelectElement).value;
    store.patchConfig({ micDeviceId: deviceId });
    if (testSession && testOpen) void restartTestMic(deviceId);
  });
  document.getElementById('opt-disk')?.addEventListener('change', (e) => {
    store.patchConfig({ saveToDisk: (e.target as HTMLInputElement).checked });
  });
  document.getElementById('btn-start')?.addEventListener('click', () => {
    closeTestSession();
    void startRecording();
  });
  document.getElementById('btn-restore')?.addEventListener('click', () => {
    closeTestSession();
    clearSettings();
    const cfg = { ...DEFAULTS };
    if (!caps.mp4Supported && caps.webmSupported) cfg.format = 'webm';
    pendingRestoreMsg = true;
    store.patchConfig(cfg);
    announce('Configurações restauradas');
  });
  bindTestPanel();
}

function bindRecording(): void {
  document.getElementById('btn-pause')?.addEventListener('click', () => {
    if (store.state === 'recording') pauseRecording();
    else resumeRecording();
  });
  document.getElementById('btn-stop')?.addEventListener('click', () => void stopRecording('button'));
  document.getElementById('btn-pip')?.addEventListener('click', () => void openPip());
  document.getElementById('btn-shot')?.addEventListener('click', () => void takeScreenshot());
}

function syncRecordingUi(): void {
  const paused = store.state === 'paused';
  const status = document.getElementById('rec-status');
  const label = document.getElementById('rec-label');
  const pauseBtn = document.getElementById('btn-pause');
  if (status) status.classList.toggle('paused', paused);
  if (label) label.textContent = paused ? 'Pausado' : 'Gravando';
  if (pauseBtn) pauseBtn.innerHTML = `${icon(paused ? 'play' : 'pause')}${paused ? 'Retomar' : 'Pausar'}`;
  refreshIcons();
}

// ---------- Painel de teste ----------

function bindTestPanel(): void {
  document.getElementById('btn-test-audio')?.addEventListener('click', () => void openTestPanel());
  if (!testOpen) return;
  document.getElementById('btn-test-close')?.addEventListener('click', () => closeTestPanel());
  document.getElementById('btn-test-sys')?.addEventListener('click', () => void startSystemTest());
  document.getElementById('btn-test-reuse')?.addEventListener('click', () => void reuseTestCapture());
  startTestLoop();
}

async function openTestPanel(): Promise<void> {
  closeTestSession();
  testOpen = true;
  testInvalidated = null;
  testSession = new AudioTestSession();
  render();
  document.getElementById('btn-test-close')?.focus();
  await testSession.startMic(store.config.micDeviceId);
  mics = await listMicrophones();
  if (store.state === 'idle' || store.state === 'error') render();
}

async function restartTestMic(deviceId: string): Promise<void> {
  if (!testSession) return;
  await testSession.restartMic(deviceId);
  if (store.state === 'idle' || store.state === 'error') render();
}

function closeTestPanel(): void {
  closeTestSession();
  render();
}

function closeTestSession(): void {
  if (testRaf !== null) {
    cancelAnimationFrame(testRaf);
    testRaf = null;
  }
  testSession?.dispose();
  testSession = null;
  testOpen = false;
  testSysTesting = false;
  testInvalidated = null;
}

async function startSystemTest(): Promise<void> {
  if (!testSession || testSysTesting) return;
  testSysTesting = true;
  render();
  const config = store.config;
  let outcome: 'shared' | 'no-audio' | 'cancelled';
  try {
    outcome = await testSession.startScreen(
      { source: config.source, quality: config.quality, fps: config.fps, cursor: config.cursor },
      config.systemAudio
    );
  } catch {
    testSysTesting = false;
    store.setError('Não foi possível acessar a tela. Permita o compartilhamento e tente de novo.');
    store.setState('error');
    return;
  }
  testSysTesting = false;
  if (outcome === 'cancelled') {
    if (store.state === 'idle' || store.state === 'error') render();
    return;
  }
  testSession.onVideoEnded(() => {
    if (!testSession) return;
    testSession.invalidateScreen();
    announce('Compartilhamento encerrado');
    if (store.state === 'idle' || store.state === 'error') render();
  });
  if (store.state === 'idle' || store.state === 'error') render();
}

async function reuseTestCapture(): Promise<void> {
  if (!testSession) return;
  const handed = testSession.handOver();
  closeTestSession();
  if (!handed) {
    render();
    return;
  }
  // Se o microfone foi desligado depois do teste, descarta o microfone de teste.
  if (!store.config.micEnabled) {
    try {
      handed.mic?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignora */
    }
    handed.mic = null;
  }
  render();
  await startRecording({ reuse: handed });
}

function setBar(id: string, ratio: number): void {
  const fill = document.getElementById(id);
  if (fill) fill.style.width = `${Math.round(ratio * 100)}%`;
  const wrap = document.getElementById(`${id}-wrap`);
  if (wrap) {
    const now = Math.round(ratio * 100);
    const last = Number(wrap.getAttribute('data-aria-ts') ?? 0);
    if (performance.now() - last > 1000) {
      wrap.setAttribute('aria-valuenow', String(now));
      wrap.setAttribute('data-aria-ts', String(performance.now()));
    }
  }
}

function setStatus(id: string, text: string, last: { text: string }): void {
  if (last.text === text) return;
  last.text = text;
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

const micStatusLast = { text: '' };
const sysStatusLast = { text: '' };

function startTestLoop(): void {
  if (testRaf !== null || !testSession) return;
  const loop = (): void => {
    testRaf = null;
    if (!testSession || !testOpen) return;
    const s = testSession;
    if (s.micMeter) {
      setBar('test-mic', s.micMeter.update());
      setStatus('test-mic-status', s.micMeter.hasSignal() ? 'Sinal detectado' : 'Sem sinal', micStatusLast);
    }
    if (s.sysMeter) {
      setBar('test-sys', s.sysMeter.update());
      if (s.sysMeter.hasSignal()) {
        setStatus('test-sys-status', 'O áudio do sistema está chegando.', sysStatusLast);
      }
    }
    if (testSession && testOpen) testRaf = requestAnimationFrame(loop);
  };
  testRaf = requestAnimationFrame(loop);
}

// ---------- Gravação ----------

function beforeUnloadHandler(e: BeforeUnloadEvent): void {
  e.preventDefault();
}

function onTrackEnded(): void {
  const st = store.state;
  if (st === 'countdown') {
    cancelCountdown();
  } else if (st === 'recording' || st === 'paused') {
    void stopRecording('native');
  }
}

async function startRecording(opts?: { reuse?: ReusedCapture }): Promise<void> {
  const config = store.config;
  store.resetResult();
  store.setError(null);
  cursorMismatch = false;
  store.setState('requesting');
  announce('Aguardando você escolher o que compartilhar');

  const mimeType = resolveMimeType(config.format);
  if (!mimeType) {
    store.setError('Este navegador não suporta o formato escolhido. Tente o outro formato.');
    store.setState('error');
    return;
  }

  let screen: ScreenCapture | null = null;
  let micStream: MediaStream | null = null;

  if (opts?.reuse) {
    screen = opts.reuse.screen;
    micStream = opts.reuse.mic;
    if (config.micEnabled && !micStream) {
      try {
        micStream = await captureMicrophone(config.micDeviceId);
      } catch (err) {
        const { message } = translateError(err);
        const denied = (err as DOMException)?.name === 'NotAllowedError';
        store.patchConfig({ micEnabled: false });
        store.setError(denied ? MSG.micDenied : message);
      }
    }
  } else {
    try {
      screen = await captureScreen(config.source, config.quality, config.fps, config.systemAudio, config.cursor);
    } catch (err) {
      const { message, silent } = translateError(err);
      if (silent) {
        store.setState('idle');
        return;
      }
      store.setError(message || 'Não foi possível acessar a tela. Permita o compartilhamento e tente de novo.');
      store.setState('error');
      return;
    }

    if (config.micEnabled) {
      try {
        micStream = await captureMicrophone(config.micDeviceId);
        mics = await listMicrophones();
      } catch (err) {
        const { message } = translateError(err);
        const denied = (err as DOMException)?.name === 'NotAllowedError';
        store.patchConfig({ micEnabled: false });
        store.setError(denied ? MSG.micDenied : message);
      }
    }
  }

  if (!screen) {
    store.setError('Não foi possível acessar a tela. Permita o compartilhamento e tente de novo.');
    store.setState('error');
    return;
  }

  if (config.systemAudio && !screen.systemAudioTrack) {
    store.setError(MSG.systemAudioMissing);
  }

  // Confirma se o navegador aplicou a opção de cursor.
  try {
    const applied = (screen.videoTrack.getSettings() as MediaTrackSettings & { cursor?: string }).cursor;
    cursorMismatch = caps.cursorSupported && typeof applied === 'string' && applied !== config.cursor;
  } catch {
    cursorMismatch = false;
  }

  screen.videoTrack.addEventListener('ended', onTrackEnded);

  if (config.countdown > 0) {
    pending = { screen, mic: micStream };
    enterCountdown(config.countdown);
    return;
  }
  await beginRecording({ screen, mic: micStream }, mimeType);
}

// ---------- Contagem regressiva ----------

function onCountdownKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && store.state === 'countdown') {
    e.preventDefault();
    cancelCountdown();
  }
}

function enterCountdown(seconds: number): void {
  store.setState('countdown');
  announce(`A gravação começa em ${seconds} segundos`);
  document.addEventListener('keydown', onCountdownKey);
  cancelCountdownFn = startCountdown(
    seconds,
    (remaining) => {
      const el = document.getElementById('countdown-number');
      if (el) el.textContent = String(remaining);
      document.title = `Começa em ${remaining} - Gravador de tela`;
    },
    () => {
      void finishCountdown();
    }
  );
}

async function finishCountdown(): Promise<void> {
  const streams = pending;
  pending = null;
  teardownCountdownChrome();
  if (!streams) {
    store.setState('idle');
    return;
  }
  const mimeType = resolveMimeType(store.config.format);
  if (!mimeType) {
    cleanupTracks(streams.screen.stream, streams.mic, null);
    store.setError('Este navegador não suporta o formato escolhido. Tente o outro formato.');
    store.setState('error');
    return;
  }
  await beginRecording(streams, mimeType);
}

function teardownCountdownChrome(): void {
  if (cancelCountdownFn) {
    cancelCountdownFn();
    cancelCountdownFn = null;
  }
  document.removeEventListener('keydown', onCountdownKey);
  if (store.state === 'countdown') document.title = 'Gravador de tela';
}

function cancelCountdown(): void {
  const streams = pending;
  pending = null;
  teardownCountdownChrome();
  if (streams) cleanupTracks(streams.screen.stream, streams.mic, null);
  pip.close();
  store.setState('idle');
}

async function beginRecording(streams: PendingCapture, mimeType: string): Promise<void> {
  const config = store.config;

  const mixer = createMixer(
    streams.screen.systemAudioTrack ? new MediaStream([streams.screen.systemAudioTrack]) : null,
    streams.mic
  );

  const combined = new MediaStream();
  combined.addTrack(streams.screen.videoTrack);
  if (mixer) {
    mixer.destination.stream.getAudioTracks().forEach((t) => combined.addTrack(t));
  } else if (streams.screen.systemAudioTrack && !config.micEnabled) {
    combined.addTrack(streams.screen.systemAudioTrack);
  }

  let disk: DiskWriter | null = null;
  if (config.saveToDisk && isDiskSaveSupported()) {
    try {
      disk = await openDiskWriter(fileExtensionFor(config.format), mimeType);
    } catch {
      disk = null; // Cancelou o seletor de arquivo: segue em memória.
    }
  }

  const vBps = videoBitrate(config.quality, config.fps, config.format);
  let handles;
  try {
    handles = createRecorder(combined, mimeType, vBps, AUDIO_BPS, (chunk) => {
      if (disk) void disk.write(chunk).catch(() => undefined);
    });
  } catch {
    cleanupTracks(streams.screen.stream, streams.mic, mixer);
    if (disk) await disk.abort().catch(() => undefined);
    store.setError(MSG.recorderFailed);
    store.setState('error');
    return;
  }

  handles.recorder.onerror = () => {
    void stopRecording('error');
  };

  const screenshotter = new Screenshotter(streams.screen.videoTrack);

  session = {
    screenStream: streams.screen.stream,
    micStream: streams.mic,
    mixer,
    meters: {
      system: mixer?.analysers.system ? createLevelMeter(mixer.analysers.system) : null,
      mic: mixer?.analysers.mic ? createLevelMeter(mixer.analysers.mic) : null
    },
    combined,
    stopRecorder: handles.stop,
    recorder: handles.recorder,
    videoTrack: streams.screen.videoTrack,
    disk,
    mimeType,
    screenshotter,
    shotUrls: [],
    shotCount: 0,
    shotNames: new Set<string>(),
    startPerf: performance.now(),
    pausedTotal: 0,
    pauseStart: null,
    raf: null,
    clock: null,
    totalBytes: 0,
    unwatchVisibility: null,
    announcedLarge: false
  };
  elapsedMs = 0;

  handles.addListener((total) => {
    if (!session) return;
    session.totalBytes = total;
    const el = document.getElementById('rec-size');
    if (el) el.textContent = formatSize(total);
    if (total > 1_073_741_824 && !session.announcedLarge) {
      session.announcedLarge = true;
      announce(MSG.largeFile);
    }
  });

  await acquireWakeLock();
  session.unwatchVisibility = watchVisibility(() => void acquireWakeLock());
  window.addEventListener('beforeunload', beforeUnloadHandler);

  store.setState('recording');
  announce('Gravação iniciada');
  document.title = 'Gravador de tela';
  startClock();
  startMeters();
}

function currentElapsed(): number {
  if (!session) return elapsedMs;
  if (store.state === 'paused' && session.pauseStart !== null) {
    return session.pauseStart - session.startPerf - session.pausedTotal;
  }
  return performance.now() - session.startPerf - session.pausedTotal;
}

function startClock(): void {
  if (!session) return;
  const tick = (): void => {
    if (!session) return;
    elapsedMs = currentElapsed();
    const el = document.getElementById('rec-timer');
    if (el) el.textContent = formatElapsed(elapsedMs);
    document.title = `${store.state === 'paused' ? 'Pausado' : 'Gravando'} ${formatElapsed(elapsedMs)} - Gravador de tela`;
  };
  tick();
  session.clock = window.setInterval(tick, 500);
}

function startMeters(): void {
  if (!session) return;
  const { system, mic } = session.meters;
  if (!system && !mic) return;
  const loop = (): void => {
    if (!session) return;
    if (system) setBar('meter-system', system.update());
    if (mic) setBar('meter-mic', mic.update());
    session.raf = requestAnimationFrame(loop);
  };
  session.raf = requestAnimationFrame(loop);
}

function pauseRecording(): void {
  if (!session || store.state !== 'recording') return;
  try {
    session.recorder.pause();
  } catch {
    return;
  }
  session.pauseStart = performance.now();
  store.setState('paused');
  announce('Gravação pausada');
}

function resumeRecording(): void {
  if (!session || store.state !== 'paused') return;
  try {
    session.recorder.resume();
  } catch {
    return;
  }
  if (session.pauseStart !== null) {
    session.pausedTotal += performance.now() - session.pauseStart;
    session.pauseStart = null;
  }
  store.setState('recording');
  announce('Gravação retomada');
}

async function openPip(): Promise<void> {
  if (!session) return;
  const ok = await pip.open(session.combined, {
    onPause: () => pauseRecording(),
    onResume: () => resumeRecording(),
    onStop: () => void stopRecording('pip'),
    onScreenshot: () => void takeScreenshot(),
    getStatus: () => ({ paused: store.state === 'paused', elapsedMs: currentElapsed() })
  });
  if (!ok) announce('O mini controle não é suportado neste navegador');
}

// ---------- Captura de imagem ----------

let shotStatusTimer: number | null = null;

async function takeScreenshot(): Promise<void> {
  const s = session;
  if (!s?.screenshotter || (store.state !== 'recording' && store.state !== 'paused')) return;
  try {
    const blob = await s.screenshotter.capture();
    const name = buildScreenshotName(new Date(), s.shotNames);
    // Sem modo pasta nesta versão, o PNG sempre baixa pelo navegador,
    // mesmo com "salvar direto no disco" (o arquivo em disco é o vídeo).
    const url = URL.createObjectURL(blob);
    s.shotUrls.push(url);
    triggerDownload(url, name);
    s.shotCount += 1;
    const count = document.getElementById('shot-count');
    if (count) count.textContent = `Imagens salvas nesta gravação: ${s.shotCount}`;
    showShotStatus('Imagem salva');
    announce('Imagem salva');
  } catch {
    showShotStatus(MSG.screenshotFailed);
    announce(MSG.screenshotFailed);
  }
}

function showShotStatus(text: string): void {
  const el = document.getElementById('shot-status');
  if (el) el.textContent = text;
  if (shotStatusTimer !== null) clearTimeout(shotStatusTimer);
  shotStatusTimer = window.setTimeout(() => {
    const current = document.getElementById('shot-status');
    if (current) current.textContent = '';
  }, 2000);
}

function updateStoppingStatus(text: string): void {
  const el = document.getElementById('stopping-status');
  if (el) el.textContent = text;
}

async function stopRecording(origin: 'button' | 'native' | 'pip' | 'error'): Promise<void> {
  if (!session || store.state === 'stopping' || store.state === 'ready' || store.state === 'idle') return;
  void origin;
  store.setState('stopping');
  const s = session;
  session = null;

  if (s.clock !== null) clearInterval(s.clock);
  if (s.raf !== null) cancelAnimationFrame(s.raf);
  window.removeEventListener('beforeunload', beforeUnloadHandler);

  let blob: Blob;
  try {
    blob = await s.stopRecorder();
  } catch {
    blob = new Blob([], { type: s.mimeType });
  }

  const duration = currentElapsedSafe(s);
  if (s.disk) {
    try {
      await s.disk.close();
    } catch {
      /* ignora */
    }
  }

  if (s.recorder.state !== 'inactive') {
    try {
      s.recorder.stop();
    } catch {
      /* ignora */
    }
  }

  const settings = s.videoTrack.getSettings();
  const width = settings.width ?? 0;
  const height = settings.height ?? 0;

  let finalBlob = blob;
  try {
    finalBlob = await finalizeBlob(blob, duration, s.mimeType);
  } catch {
    finalBlob = blob;
  }

  if (store.config.format === 'mp4' && finalBlob.size > 0) {
    updateStoppingStatus('Otimizando o arquivo para permitir avançar…');
    try {
      finalBlob = await remuxMp4Seekable(finalBlob, (ratio) => {
        updateStoppingStatus(`Otimizando o arquivo para permitir avançar… ${Math.round(ratio * 100)}%`);
      });
    } catch {
      // Mantém o original: o vídeo toca normalmente, só a busca
      // pode não funcionar em alguns players.
    }
  }

  s.screenshotter?.dispose();
  s.shotUrls.forEach((u) => URL.revokeObjectURL(u));
  cleanupTracks(s.screenStream, s.micStream, s.mixer);
  releaseWakeLock();
  s.unwatchVisibility?.();
  pip.close();
  document.title = 'Gravador de tela';

  if (finalBlob.size === 0) {
    store.setError(MSG.recorderFailed);
    store.setState('error');
    return;
  }

  const extension = fileExtensionFor(store.config.format);
  const url = URL.createObjectURL(finalBlob);
  store.setResult({
    blob: finalBlob,
    url,
    durationMs: duration,
    sizeBytes: finalBlob.size,
    mimeType: finalBlob.type || s.mimeType,
    extension,
    width,
    height,
    format: store.config.format
  });
  store.setState('ready');
  announce('Gravação finalizada. Pré-visualize e baixe o arquivo.');
}

function currentElapsedSafe(s: Session): number {
  if (s.pauseStart !== null) return s.pauseStart - s.startPerf - s.pausedTotal;
  void s;
  return elapsedMs;
}

function cleanupTracks(screen: MediaStream, mic: MediaStream | null, mixer: MixerHandles | null): void {
  try {
    screen.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignora */
  }
  try {
    mic?.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignora */
  }
  try {
    mixer?.cleanup();
  } catch {
    /* ignora */
  }
}

function downloadResult(): void {
  const result = store.result;
  if (!result) return;
  triggerDownload(result.url, buildFileName(result.extension));
}

// ---------- Boot ----------

function boot(): void {
  initTheme();
  caps = detectCapabilities();
  const saved = loadSettings();
  if (saved) {
    const { version, ...rest } = saved;
    void version;
    store.config = { ...DEFAULTS, ...rest };
  }
  // Valor efetivo na sessão, sem apagar a escolha salva.
  if (!caps.mp4Supported && caps.webmSupported && store.config.format === 'mp4') {
    store.config = { ...store.config, format: 'webm' };
  }
  if (!caps.webmSupported && caps.mp4Supported && store.config.format === 'webm') {
    store.config = { ...store.config, format: 'mp4' };
  }
  store.subscribe(render);
  store.subscribe(() => saveSettingsSoon(store.config));
  render();

  void listMicrophones().then((list) => {
    mics = list;
    if (store.state === 'idle') render();
  });

  try {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      void listMicrophones().then((list) => {
        mics = list;
        if (store.state === 'idle') render();
      });
    });
  } catch {
    /* ignora */
  }
}

boot();
