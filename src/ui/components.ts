import { icon } from './icons';

export function segmented(
  name: string,
  options: { value: string; label: string; iconName?: string; disabled?: boolean; hint?: string }[],
  selected: string
): string {
  const items = options
    .map((o) => {
      const checked = o.value === selected ? ' checked' : '';
      const disabled = o.disabled ? ' disabled' : '';
      const title = o.hint ? ` title="${o.hint}"` : '';
      return `<label${title}>${o.iconName ? icon(o.iconName) : ''}<input type="radio" name="${name}" value="${o.value}"${checked}${disabled} />${o.label}</label>`;
    })
    .join('');
  return `<div class="seg" role="radiogroup" aria-label="${name}">${items}</div>`;
}

export function switchControl(id: string, checked: boolean, label: string): string {
  return `<label class="switch" for="${id}"><input type="checkbox" id="${id}" role="switch"${checked ? ' checked' : ''} aria-label="${label}" /><span class="switch-track"></span><span class="switch-thumb"></span></label>`;
}

export function note(message: string, kind: 'info' | 'error' = 'info'): string {
  const iconName = kind === 'error' ? 'triangle-alert' : 'info';
  return `<div class="note${kind === 'error' ? ' note-error' : ''}" role="${kind === 'error' ? 'alert' : 'status'}">${icon(iconName)}<span>${message}</span></div>`;
}

export function meter(id: string, iconName: string, label: string): string {
  return `<div class="meter-row">${icon(iconName)}<div class="meter" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="${id}-wrap"><div class="meter-fill" id="${id}"></div></div></div>`;
}

export function statusText(id: string): string {
  return `<p class="status-text" id="${id}" role="status"></p>`;
}
