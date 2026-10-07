export interface MixerHandles {
  context: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  analysers: { system: AnalyserNode | null; mic: AnalyserNode | null };
  cleanup: () => void;
}

function createAnalyser(context: AudioContext): AnalyserNode {
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  return analyser;
}

export function createMixer(
  systemStream: MediaStream | null,
  micStream: MediaStream | null
): MixerHandles | null {
  const systemTrack = systemStream?.getAudioTracks()[0] ?? null;
  const micTrack = micStream?.getAudioTracks()[0] ?? null;
  if (!systemTrack && !micTrack) return null;

  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AC();
  const destination = context.createMediaStreamDestination();

  let systemAnalyser: AnalyserNode | null = null;
  let micAnalyser: AnalyserNode | null = null;
  const nodes: AudioNode[] = [];

  if (systemTrack) {
    const src = context.createMediaStreamSource(new MediaStream([systemTrack]));
    const gain = context.createGain();
    gain.gain.value = 1.0;
    systemAnalyser = createAnalyser(context);
    src.connect(gain);
    gain.connect(destination);
    gain.connect(systemAnalyser);
    nodes.push(src, gain);
  }

  if (micTrack) {
    const src = context.createMediaStreamSource(new MediaStream([micTrack]));
    const gain = context.createGain();
    gain.gain.value = 1.0;
    micAnalyser = createAnalyser(context);
    src.connect(gain);
    gain.connect(destination);
    gain.connect(micAnalyser);
    nodes.push(src, gain);
  }

  if (context.state === 'suspended') {
    void context.resume().catch(() => undefined);
  }

  const cleanup = (): void => {
    try {
      nodes.forEach((n) => n.disconnect());
    } catch {
      /* ignora */
    }
    void context.close().catch(() => undefined);
  };

  return {
    context,
    destination,
    analysers: { system: systemAnalyser, mic: micAnalyser },
    cleanup
  };
}
