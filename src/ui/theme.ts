const KEY = 'gravador-tema';
const META = 'meta[name="theme-color"]';

export type Theme = 'dark' | 'light';

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector(META);
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#121315' : '#F6F6F4');
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignora */
  }
}

export function initTheme(): Theme {
  const stored = readStored();
  const theme: Theme = stored ?? 'dark';
  applyTheme(theme);
  return theme;
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
