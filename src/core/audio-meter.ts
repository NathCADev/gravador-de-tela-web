// Cálculo de nível de áudio compartilhado entre a tela de gravação
// e o painel de teste prévio. Baseado em RMS convertido para dBFS,
// com decaimento suave na descida (sobe rápido, desce gradual).

const MIN_DB = -60;
const SIGNAL_THRESHOLD_DB = -50;
const SIGNAL_HOLD_MS = 2000;

export interface LevelMeter {
  /** Nível atual de 0 a 1. Chamar a cada quadro ou a cada 50-100 ms. */
  update(): number;
  /** Verdadeiro se houve sinal acima do limiar nos últimos 2 segundos. */
  hasSignal(): boolean;
}

export function createLevelMeter(analyser: AnalyserNode, decayPerUpdate = 0.08): LevelMeter {
  try {
    analyser.fftSize = 1024;
  } catch {
    /* ignora */
  }
  const data = new Float32Array(analyser.fftSize);
  let level = 0;
  let lastSignalAt = 0;

  const update = (): number => {
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : MIN_DB;
    const target = Math.min(1, Math.max(0, (db - MIN_DB) / -MIN_DB));
    level = target > level ? target : Math.max(target, level - decayPerUpdate);
    if (db > SIGNAL_THRESHOLD_DB) lastSignalAt = performance.now();
    return level;
  };

  return {
    update,
    hasSignal: () => performance.now() - lastSignalAt < SIGNAL_HOLD_MS
  };
}
