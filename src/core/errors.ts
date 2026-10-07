export function translateError(err: unknown): { message: string; silent: boolean } {
  if (!err) return { message: 'Algo não saiu como esperado. Tente de novo.', silent: false };
  const name = (err as DOMException)?.name ?? (err as Error)?.name ?? '';
  if (name === 'NotAllowedError') {
    return { message: '', silent: true };
  }
  if (name === 'NotFoundError') {
    return { message: 'Nenhum microfone foi encontrado. Conecte um e tente de novo.', silent: false };
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return { message: 'Não foi possível acessar a tela. Permita o compartilhamento e tente de novo.', silent: false };
  }
  if (name === 'OverconstrainedError') {
    return { message: 'Esta configuração não é suportada neste dispositivo. Tente uma qualidade menor.', silent: false };
  }
  if (name === 'SecurityError') {
    return { message: 'A captura exige uma página segura (HTTPS ou localhost). Abra o gravador pelo endereço oficial.', silent: false };
  }
  return { message: 'Algo não saiu como esperado. Tente de novo.', silent: false };
}

export const MSG = {
  systemAudioMissing:
    'O áudio do sistema não foi compartilhado. Marque a opção de compartilhar áudio no seletor.',
  micDenied: 'O microfone está bloqueado. Libere o acesso no ícone de cadeado da barra de endereço.',
  recorderFailed: 'A gravação foi interrompida. O que foi gravado até aqui está disponível para baixar.',
  screenshotFailed: 'Não foi possível salvar a imagem. Tente de novo.',
  testInvalidated:
    'As opções de vídeo mudaram. Faça o teste de novo ou inicie a gravação normalmente.',
  largeFile: 'Esta gravação já passa de 1 GB. Considere parar e salvar.'
};
