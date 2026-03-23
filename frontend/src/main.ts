import '@xterm/xterm/css/xterm.css';
import './style.css';
import App from './App.svelte';
import { mount } from 'svelte';

/**
 * Wails v2 injects `window.go` and `window.runtime` asynchronously after the
 * page loads. Mounting the Svelte app before these are available causes:
 *   TypeError: Cannot read properties of undefined (reading 'main')
 *
 * We wait for the `wails:ready` event (fired by the Wails runtime when bindings
 * are fully injected) before mounting. When running in a plain browser (dev
 * preview without Wails), `wails:ready` never fires — so we fall back to a 3-s
 * timeout to ensure the error message is visible even outside the Wails window.
 */
function waitForWails(): Promise<void> {
  return new Promise(resolve => {
    // Already ready (e.g. hot-reload after initial mount)
    if (typeof window !== 'undefined' && (window as any).go) {
      resolve();
      return;
    }
    const onReady = () => {
      window.removeEventListener('wails:ready', onReady);
      resolve();
    };
    window.addEventListener('wails:ready', onReady);

    // Safety fallback — resolve after 2 s regardless so the app still
    // renders (even if some Go calls will fail in a plain browser preview).
    setTimeout(resolve, 2000);
  });
}

waitForWails().then(() => {
  mount(App, { target: document.getElementById('app')! });
});
