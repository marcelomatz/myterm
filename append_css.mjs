import { readFileSync, writeFileSync } from 'fs';

const f = 'c:/matz/apps/myterm/frontend/src/style.css';
const txt = readFileSync(f, 'utf8');

const add = `
/* --- Live terminal preview pane ------------------------------------------- */

.tset-preview-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.tset-preview-hdr {
  padding: 8px 16px 7px;
  border-bottom: 1px solid var(--tset-dim);
  color: var(--tset-cyan);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  flex-shrink: 0;
  user-select: none;
  text-shadow: 0 0 8px color-mix(in srgb, var(--tset-cyan) 50%, transparent);
}

.tset-preview-term {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 18px 20px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  color: var(--tset-fg);
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 2px,
    rgba(0,0,0,0.09) 2px,
    rgba(0,0,0,0.09) 4px
  );
}

.pv-line {
  display: block;
  white-space: pre;
  min-height: 1em;
  word-break: break-all;
}

/* Preview ANSI color spans */
.pv-user    { color: var(--tset-br-green); }
.pv-at      { color: var(--tset-dimfg); }
.pv-host    { color: var(--tset-cyan); }
.pv-sep     { color: var(--tset-dimfg); }
.pv-path    { color: var(--tset-br-blue, var(--tset-blue)); font-weight: bold; }
.pv-dollar  { color: var(--tset-accent); }
.pv-cmd     { color: var(--tset-fg); font-weight: bold; }
.pv-arg     { color: var(--tset-yellow); }
.pv-str     { color: var(--tset-br-yellow, var(--tset-yellow)); }
.pv-kw      { color: var(--tset-magenta); }
.pv-cmt     { color: var(--tset-dimfg); font-style: italic; }
.pv-num     { color: var(--tset-cyan); }
.pv-red     { color: var(--tset-br-red, var(--tset-red)); }
.pv-green   { color: var(--tset-br-green, var(--tset-green)); }
.pv-yellow  { color: var(--tset-yellow); }
.pv-blue    { color: var(--tset-blue); }
.pv-magenta { color: var(--tset-magenta); }
.pv-cyan    { color: var(--tset-cyan); }
.pv-dim     { color: var(--tset-br-black, var(--tset-dimfg)); }
.pv-ok      { color: var(--tset-br-green, var(--tset-green)); font-weight: bold; }
.pv-fail    { color: var(--tset-br-red, var(--tset-red)); font-weight: bold; }
.pv-pass    { color: var(--tset-br-green, var(--tset-green)); }
.pv-diff-a  { color: var(--tset-br-green, var(--tset-green)); }
.pv-diff-d  { color: var(--tset-br-red, var(--tset-red)); }
.pv-cursor  {
  display: inline-block;
  background: var(--tset-cursor);
  color: var(--tset-bg);
  animation: tset-blink-anim 1.1s step-start infinite;
  min-width: 0.6em;
}
`;

writeFileSync(f, txt + add, 'utf8');
console.log('done, total bytes:', readFileSync(f, 'utf8').length);
