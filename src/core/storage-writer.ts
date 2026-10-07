// Gravação direta em disco (opcional, para gravações longas).
// Cada pedaço do MediaRecorder é gravado em um FileSystemWritableFileStream,
// evitando acumular tudo em memória.

export interface DiskWriter {
  write: (chunk: Blob) => Promise<void>;
  close: () => Promise<void>;
  abort: () => Promise<void>;
}

export function isDiskSaveSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function'
  );
}

export async function openDiskWriter(extension: string, mimeType: string): Promise<DiskWriter> {
  const picker = (window as unknown as {
    showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
  }).showSaveFilePicker;
  const handle = await picker({
    suggestedName: `gravacao.${extension}`,
    types: [
      {
        description: extension === 'mp4' ? 'Vídeo MP4' : 'Vídeo WebM',
        accept: { [mimeType]: [`.${extension}`] }
      }
    ]
  });
  const writable = await handle.createWritable();
  return {
    write: async (chunk: Blob) => {
      await writable.write(chunk);
    },
    close: async () => {
      await writable.close();
    },
    abort: async () => {
      await writable.abort();
    }
  };
}
