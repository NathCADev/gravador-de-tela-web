export function buildFileName(extension: string, when = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const date = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  const time = `${pad(when.getHours())}-${pad(when.getMinutes())}`;
  return `gravacao-${date}_${time}.${extension}`;
}

export function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
