import type { Capabilities } from '../core/capabilities';
import { estimateBytesPerMinute, formatSize } from '../core/presets';
import type { RecorderConfig, ResultInfo } from '../state';
import { icon } from './icons';
import { meter, note, segmented, statusText, switchControl } from './components';

export interface TestPanelModel {
  micState: 'starting' | 'live' | 'denied' | 'none';
  micMessage: string | null;
  sysState: 'untested' | 'testing' | 'live' | 'no-audio';
  sysMessage: string | null;
  canReuse: boolean;
  invalidatedNote: string | null;
}

export interface SetupExtras {
  cursorSupported: boolean;
  testOpen: boolean;
  test: TestPanelModel | null;
  restoreMsg: string | null;
}

export function renderSetup(
  config: RecorderConfig,
  caps: Capabilities,
  mics: MediaDeviceInfo[],
  estimateNote: string | null,
  extras: SetupExtras
): string {
  const estimate = formatSize(estimateBytesPerMinute(config.quality, config.fps, config.format));
  const mp4Disabled = !caps.mp4Supported;
  const webmDisabled = !caps.webmSupported;
  const micOptions =
    mics.length > 0
      ? mics
          .map((m, i) => {
            const label = m.label || `Microfone ${i + 1}`;
            const selected = config.micDeviceId === m.deviceId ? ' selected' : '';
            return `<option value="${m.deviceId}"${selected}>${label}</option>`;
          })
          .join('')
      : `<option value="default">Microfone padrão</option>`;

  return `
  <section class="section">
    <h2 class="section-title">Fonte</h2>
    ${segmented('fonte', [
      { value: 'screen', label: 'Tela inteira', iconName: 'monitor' },
      { value: 'window', label: 'Janela', iconName: 'app-window' },
      { value: 'tab', label: 'Aba', iconName: 'panel-top' }
    ], config.source)}
    <!-- TEMP: controle de cursor oculto; reativar apagando este comentário -->
  </section>
  <section class="section">
    <h2 class="section-title">Áudio</h2>
    <div class="switch-row">
      <div class="switch-label">${icon('volume-2')}<div>Áudio do sistema<small>Disponível em tela inteira e aba</small></div></div>
      ${switchControl('opt-system-audio', config.systemAudio, 'Áudio do sistema')}
    </div>
    <div class="switch-row">
      <div class="switch-label">${icon(config.micEnabled ? 'mic' : 'mic-off')}<div>Microfone<small>Use fones para evitar eco</small></div></div>
      ${switchControl('opt-mic', config.micEnabled, 'Microfone')}
    </div>
    ${config.micEnabled ? `<select class="select" id="opt-mic-device" aria-label="Dispositivo de microfone">${micOptions}</select>` : ''}
    <div style="margin-top:12px">
      <button class="btn btn-secondary" id="btn-test-audio">${icon('audio-lines')}Testar áudio</button>
    </div>
    ${extras.testOpen && extras.test ? renderTestPanel(config, extras.test) : ''}
  </section>
  <section class="section">
    <div class="section-row two">
      <div>
        <h2 class="section-title">Qualidade</h2>
        ${segmented('qualidade', [
          { value: '480p', label: '480p' },
          { value: '720p', label: '720p' },
          { value: '1080p', label: '1080p' }
        ], config.quality)}
      </div>
      <div>
        <h2 class="section-title">Quadros por segundo</h2>
        ${segmented('fps', [
          { value: '15', label: '15' },
          { value: '24', label: '24' },
          { value: '30', label: '30' }
        ], String(config.fps))}
      </div>
    </div>
  </section>
  <section class="section">
    <h2 class="section-title">Formato</h2>
    ${segmented('formato', [
      { value: 'mp4', label: 'MP4 compatível', disabled: mp4Disabled, hint: mp4Disabled ? 'Navegador sem suporte a MP4' : 'Compatível com tudo' },
      { value: 'webm', label: 'WebM VP9 menor', disabled: webmDisabled, hint: webmDisabled ? 'Navegador sem suporte a WebM' : 'Arquivo menor' }
    ], config.format)}
    ${mp4Disabled ? note('Este navegador não grava em MP4. O WebM será usado.') : ''}
    <p class="estimate">Estimativa: <strong>~${estimate} por minuto</strong></p>
    ${estimateNote ? note(estimateNote) : ''}
    ${caps.filePickerSupported ? `<div class="switch-row"><div class="switch-label"><div>Salvar direto no disco<small>Recomendado para gravações longas</small></div></div>${switchControl('opt-disk', config.saveToDisk, 'Salvar direto no disco')}</div>` : ''}
  </section>
  <section class="section">
    <h2 class="section-title">Início da gravação</h2>
    ${segmented('contagem', [
      { value: '0', label: 'Desligada' },
      { value: '3', label: '3 s', iconName: 'timer' },
      { value: '5', label: '5 s', iconName: 'timer' }
    ], String(config.countdown))}
  </section>
  <section class="section">
    <button class="btn btn-primary" id="btn-start">${icon('circle')}Iniciar gravação</button>
    <div style="display:flex;justify-content:center;margin-top:12px">
      <button class="btn-quiet" id="btn-restore">${icon('rotate-ccw')}Restaurar padrões</button>
    </div>
    ${extras.restoreMsg ? statusText('restore-status') : ''}
    <p class="footer-note">A gravação acontece no seu computador e não é enviada a nenhum servidor.</p>
  </section>`;
}

function renderTestPanel(config: RecorderConfig, test: TestPanelModel): string {
  const micBlock =
    test.micState === 'live'
      ? `${meter('test-mic', 'mic', 'Nível do microfone no teste')}<p class="test-state" id="test-mic-status" role="status">Sem sinal</p>`
      : test.micState === 'starting'
        ? `<p class="test-state" role="status">Aguardando permissão do microfone</p>`
        : note(test.micMessage ?? 'Microfone indisponível.', 'error');

  let sysBlock = '';
  if (test.sysState === 'untested') {
    sysBlock = `
      ${config.source === 'window' ? note('Para testar o áudio do sistema, escolha Tela inteira ou Aba.') : ''}
      <button class="btn btn-secondary" id="btn-test-sys">Testar áudio do sistema</button>`;
  } else if (test.sysState === 'testing') {
    sysBlock = `<p class="test-state" role="status">Aguardando você escolher o que compartilhar</p>`;
  } else if (test.sysState === 'live') {
    sysBlock = `${meter('test-sys', 'volume-2', 'Nível do áudio do sistema no teste')}<p class="test-state" id="test-sys-status" role="status">O áudio do sistema está sendo compartilhado. Toque algum som para ver o nível.</p>`;
  } else {
    sysBlock = `
      ${note(test.sysMessage ?? 'O áudio do sistema não foi compartilhado.', 'error')}
      <button class="btn btn-secondary" id="btn-test-sys">Testar de novo</button>`;
  }

  return `
  <div class="test-panel" id="test-panel">
    <div class="test-head">
      <h3>Teste de áudio</h3>
      <button class="btn-icon btn-icon-sm" id="btn-test-close" aria-label="Fechar teste" title="Fechar teste">${icon('x', false)}</button>
    </div>
    <h4 class="test-title">${icon('mic')}Microfone</h4>
    ${micBlock}
    <h4 class="test-title">${icon('volume-2')}Áudio do sistema</h4>
    ${sysBlock}
    ${note('O compartilhamento está ativo, mas nada está sendo gravado.')}
    ${test.invalidatedNote ? note(test.invalidatedNote, 'error') : ''}
    ${test.canReuse ? `<button class="btn btn-primary" id="btn-test-reuse">Usar esta captura para gravar</button>` : ''}
  </div>`;
}

export function renderRecording(config: RecorderConfig, cursorNote: boolean): string {
  return `
  <section class="section" style="text-align:center">
    <div class="rec-status" id="rec-status"><span class="rec-dot"></span><span id="rec-label">Gravando</span></div>
    <div class="timer" id="rec-timer">00:00:00</div>
    <div class="chip-row">
      <span class="chip">${config.quality}</span>
      <span class="chip">${config.format === 'mp4' ? 'MP4' : 'WebM'}</span>
      <span class="chip">${config.fps} fps</span>
      <span class="chip mono" id="rec-size">0 MB</span>
    </div>
    ${cursorNote ? note('O navegador não aplicou a opção de cursor escolhida.') : ''}
    ${config.systemAudio ? meter('meter-system', 'volume-2', 'Nível do áudio do sistema') : ''}
    ${config.micEnabled ? meter('meter-mic', 'mic', 'Nível do microfone') : ''}
    <div class="rec-actions">
      <button class="btn btn-secondary" id="btn-pause">${icon('pause')}Pausar</button>
      <button class="btn btn-danger" id="btn-stop">${icon('square')}Parar gravação</button>
      <button class="btn-icon" id="btn-shot" aria-label="Capturar imagem" title="Capturar imagem">${icon('camera', false)}</button>
      <button class="btn-icon" id="btn-pip" aria-label="Abrir mini controle" title="Abrir mini controle">${icon('picture-in-picture-2', false)}</button>
    </div>
    <p class="estimate" id="shot-count" aria-live="off"></p>
    ${statusText('shot-status')}
  </section>`;
}

export function renderCountdown(): string {
  return `
  <section class="section" style="text-align:center">
    <p>A gravação começa em</p>
    <div class="countdown-number" id="countdown-number" aria-hidden="true">3</div>
    <p class="footer-note">Troque para a janela que deseja gravar.</p>
    <div class="rec-actions">
      <button class="btn btn-secondary" id="btn-countdown-cancel">${icon('x')}Cancelar</button>
    </div>
  </section>`;
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function renderResult(result: ResultInfo): string {
  const label = result.format === 'mp4' ? 'MP4 H.264' : 'WebM VP9';
  return `
  <section class="section">
    <div class="video-wrap"><video src="${result.url}" controls playsinline></video></div>
    <dl class="meta-grid">
      <div class="meta-item"><dt>Duração</dt><dd>${formatDuration(result.durationMs)}</dd></div>
      <div class="meta-item"><dt>Tamanho</dt><dd>${formatSize(result.sizeBytes)}</dd></div>
      <div class="meta-item"><dt>Formato</dt><dd>${label}</dd></div>
      <div class="meta-item"><dt>Resolução</dt><dd>${result.width}x${result.height}</dd></div>
    </dl>
    <div class="result-actions">
      <button class="btn btn-primary" id="btn-download">${icon('download')}Baixar</button>
      <button class="btn btn-secondary" id="btn-new">${icon('rotate-ccw')}Nova gravação</button>
    </div>
  </section>`;
}

export function renderIncompatible(caps: Capabilities): string {
  return `
  <section class="section" style="text-align:center">
    <div style="display:flex;justify-content:center;margin-bottom:12px">${icon('triangle-alert')}</div>
    <h2 class="section-title">Navegador não compatível</h2>
    <p style="color:var(--text-muted);font-size:13px">Este navegador não oferece os recursos de gravação. Abra o gravador no Chrome ou no Edge atualizados.</p>
    ${note(`Faltando: ${caps.missing.join(', ')}`, 'error')}
  </section>`;
}

export function renderMobileOnly(): string {
  return `
  <section class="section" style="text-align:center">
    <div style="display:flex;justify-content:center;margin-bottom:12px">${icon('monitor')}</div>
    <h2 class="section-title">Só para computador</h2>
    <p style="color:var(--text-muted);font-size:13px">Este gravador funciona em computador com Windows, no Chrome ou no Edge. No celular a captura de tela não é suportada pelo navegador.</p>
  </section>`;
}

export function renderRequesting(): string {
  return `
  <section class="section" style="text-align:center">
    <p>Aguardando você escolher o que compartilhar</p>
    <p class="footer-note">Use o seletor do navegador para continuar.</p>
  </section>`;
}
