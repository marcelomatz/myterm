/**
 * shell-meta.ts
 * Maps any shell executable path to a human-friendly label and accent colour.
 */

export interface ShellMeta {
  /** Short display name, no path, no extension. */
  label: string;
  /** CSS colour for the shell badge. */
  color: string;
}

/** Ordered rules: first match wins. */
const RULES: Array<{ test: (p: string) => boolean; meta: ShellMeta }> = [
  {
    test: (p) => /wsl(\.exe)?$/i.test(p),
    meta: { label: 'WSL', color: '#e95420' },           // Ubuntu orange
  },
  {
    test: (p) => /pwsh(\.exe)?$/i.test(p),
    meta: { label: 'pwsh', color: '#012456' },           // PowerShell 7 navy
  },
  {
    test: (p) => /powershell(\.exe)?$/i.test(p),
    meta: { label: 'PowerShell', color: '#00b4ff' },     // PS5 blue
  },
  {
    test: (p) => /cmd(\.exe)?$/i.test(p),
    meta: { label: 'cmd', color: '#c0c0c0' },            // classic silver
  },
  {
    test: (p) => /git[/\\].*bash(\.exe)?$/i.test(p),
    meta: { label: 'Git Bash', color: '#f05032' },       // Git red
  },
  {
    test: (p) => /msys64?[/\\].*bash(\.exe)?$/i.test(p),
    meta: { label: 'MSYS2', color: '#5c9bd3' },
  },
  {
    test: (p) => /cygwin[/\\].*bash(\.exe)?$/i.test(p),
    meta: { label: 'Cygwin', color: '#f5a623' },
  },
  {
    test: (p) => /zsh$/i.test(p),
    meta: { label: 'zsh', color: '#c397d8' },
  },
  {
    test: (p) => /fish$/i.test(p),
    meta: { label: 'fish', color: '#ff7043' },
  },
  {
    test: (p) => /bash$/i.test(p),
    meta: { label: 'bash', color: '#4caf50' },           // classic green
  },
  {
    test: (p) => /sh$/i.test(p),
    meta: { label: 'sh', color: '#90a4ae' },
  },
];

const FALLBACK: ShellMeta = { label: 'shell', color: '#888' };

/** Returns the display metadata for the given shell path. */
export function shellMeta(path: string): ShellMeta {
  for (const rule of RULES) {
    if (rule.test(path)) return rule.meta;
  }
  return FALLBACK;
}
