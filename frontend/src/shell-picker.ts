import { DetectShells } from '../wailsjs/go/main/App';
import { getSettings } from './settings';
import { shellMeta } from './shell-meta';

/**
 * Shows a compact popover anchored to `anchorEl` (the new-tab button) and
 * resolves with the chosen shell path. Resolves with `null` if dismissed.
 */
export async function pickShell(anchorEl: HTMLElement): Promise<string | null> {
  let shells: string[];
  try {
    shells = await DetectShells();
  } catch {
    shells = [];
  }

  if (shells.length === 0) return '';

  return new Promise<string | null>(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'shell-picker-backdrop';
    document.body.appendChild(backdrop);

    const picker = document.createElement('div');
    picker.className = 'shell-picker';
    picker.setAttribute('role', 'listbox');
    picker.setAttribute('aria-label', 'Choose shell');

    const heading = document.createElement('div');
    heading.className = 'shell-picker-heading';
    heading.textContent = 'Open shell with…';
    picker.appendChild(heading);

    const rect = anchorEl.getBoundingClientRect();
    picker.style.top  = `${rect.bottom + 6}px`;
    picker.style.left = `${rect.left}px`;

    const defaultShell = getSettings().defaultShell;

    for (const shell of shells) {
      const meta = shellMeta(shell);

      const item = document.createElement('button');
      item.className = 'shell-picker-item';
      item.setAttribute('role', 'option');
      if (shell === defaultShell) item.classList.add('default');

      // Coloured dot indicator
      const dot = document.createElement('span');
      dot.className = 'shell-dot';
      dot.style.setProperty('--shell-color', meta.color);

      const label = document.createElement('span');
      label.className = 'shell-label';
      label.textContent = meta.label;

      item.appendChild(dot);
      item.appendChild(label);

      if (shell === defaultShell) {
        const dflt = document.createElement('span');
        dflt.className = 'shell-default-tag';
        dflt.textContent = 'default';
        item.appendChild(dflt);
      }

      item.addEventListener('click', () => { cleanup(); resolve(shell); });
      picker.appendChild(item);
    }

    document.body.appendChild(picker);
    (picker.querySelector('.shell-picker-item') as HTMLElement | null)?.focus();

    function cleanup() { backdrop.remove(); picker.remove(); }

    backdrop.addEventListener('click', () => { cleanup(); resolve(null); });
    picker.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { cleanup(); resolve(null); }
    });
  });
}

/** Returns a small coloured dot element for use in the tab bar. */
export function shellBadge(shellPath: string): HTMLElement {
  const meta = shellMeta(shellPath);
  const dot = document.createElement('span');
  dot.className = 'shell-dot';
  dot.style.setProperty('--shell-color', meta.color);
  return dot;
}
