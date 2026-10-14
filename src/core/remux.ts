// O MP4 gerado pelo MediaRecorder do Chrome é fragmentado e sai sem o
// índice de amostras (moov) completo, então muitos players não permitem
// avançar/voltar no vídeo. Aqui o arquivo é remontado (transmux, sem
// re-codificar) para um MP4 comum com o índice no início: rápido,
// sem perda de qualidade e com busca funcionando em qualquer player.
//
// O import é dinâmico de propósito: o Mediabunny só é baixado quando
// uma gravação MP4 termina, mantendo o carregamento inicial leve.
const MAX_REMUX_BYTES = 500 * 1024 * 1024;

export async function remuxMp4Seekable(
  blob: Blob,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  if (blob.size === 0 || blob.size > MAX_REMUX_BYTES) {
    throw new Error('remux ignorado pelo tamanho');
  }
  const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } =
    await import('mediabunny');
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const conversion = await Conversion.init({ input, output });
  // Se alguma trilha fosse descartada (ex.: codec sem suporte), prefere o
  // original a entregar um arquivo sem áudio ou sem vídeo.
  if (!conversion.isValid || conversion.discardedTracks.length > 0) {
    throw new Error('conversão inválida para este arquivo');
  }
  if (onProgress) {
    conversion.onProgress = onProgress;
  }
  await conversion.execute();
  const buffer = output.target.buffer;
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('saída vazia');
  }
  return new Blob([buffer], { type: 'video/mp4' });
}
