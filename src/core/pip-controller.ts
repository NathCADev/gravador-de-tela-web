export interface PipCallbacks {
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onScreenshot?: () => void;
  getStatus: () => { paused: boolean; elapsedMs: number };
}

interface DocPipWindow extends Window {
  document: Document;
}

// Document Picture-in-Picture (Chrome/Edge atuais). Fallback: video PiP.
export class PipController {
  private docWindow: DocPipWindow | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private timer: number | null = null;

  get isOpen(): boolean {
    return this.docWindow !== null || this.videoEl !== null;
  }

  async open(stream: MediaStream, cb: PipCallbacks): Promise<boolean> {
    const w = window as unknown as {
      documentPictureInPicture?: { requestWindow: (o?: unknown) => Promise<DocPipWindow> };
    };
    if (w.documentPictureInPicture) {
      try {
        const pip = await w.documentPictureInPicture.requestWindow({ width: 280, height: 160 });
        this.docWindow = pip;
        this.renderDocWindow(pip, cb);
        return true;
      } catch {
        // Cai para video PiP abaixo.
      }
    }
    try {
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play().catch(() => undefined);
      this.videoEl = video;
      document.body.appendChild(video);
      video.style.position = 'fixed';
      video.style.bottom = '8px';
      video.style.right = '8px';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.opacity = '0';
      video.style.pointerEvents = 'none';
      await video.requestPictureInPicture();
      video.addEventListener('leavepictureinpicture', () => this.close(), { once: true });
      return true;
    } catch {
      return false;
    }
  }

  private renderDocWindow(pip: DocPipWindow, cb: PipCallbacks): void {
    const doc = pip.document;
    doc.title = 'Gravador de tela';
    const style = doc.createElement('style');
    style.textContent = `
      body { font-family: system-ui, sans-serif; background: #121315; color: #e6e7e9; margin: 0; padding: 16px; }
      .t { font-family: ui-monospace, monospace; font-size: 32px; text-align: center; margin: 8px 0 16px; font-variant-numeric: tabular-nums; }
      .row { display: flex; gap: 8px; justify-content: center; }
      button { height: 40px; padding: 0 14px; border-radius: 8px; border: 1px solid #2e3035; background: #222327; color: #e6e7e9; cursor: pointer; }
      button.danger { background: #e5675f; color: #1a0e0d; border-color: transparent; }
    `;
    doc.head.appendChild(style);
    const wrap = doc.createElement('div');
    const timer = doc.createElement('div');
    timer.className = 't';
    timer.textContent = '00:00:00';
    const row = doc.createElement('div');
    row.className = 'row';
    const pauseBtn = doc.createElement('button');
    pauseBtn.textContent = 'Pausar';
    pauseBtn.onclick = () => {
      const s = cb.getStatus();
      if (s.paused) cb.onResume();
      else cb.onPause();
    };
    const stopBtn = doc.createElement('button');
    stopBtn.textContent = 'Parar';
    stopBtn.className = 'danger';
    stopBtn.onclick = () => cb.onStop();
    row.append(pauseBtn);
    if (cb.onScreenshot) {
      const shotBtn = doc.createElement('button');
      shotBtn.textContent = 'Foto';
      shotBtn.onclick = () => cb.onScreenshot?.();
      row.append(shotBtn);
    }
    row.append(stopBtn);
    wrap.append(timer, row);
    doc.body.append(wrap);

    this.timer = window.setInterval(() => {
      const s = cb.getStatus();
      timer.textContent = formatElapsed(s.elapsedMs);
      pauseBtn.textContent = s.paused ? 'Retomar' : 'Pausar';
    }, 500);
  }

  close(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try {
      this.docWindow?.close();
    } catch {
      /* ignora */
    }
    this.docWindow = null;
    try {
      if (this.videoEl) {
        if (document.pictureInPictureElement === this.videoEl) {
          void document.exitPictureInPicture().catch(() => undefined);
        }
        this.videoEl.remove();
      }
    } catch {
      /* ignora */
    }
    this.videoEl = null;
  }
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
