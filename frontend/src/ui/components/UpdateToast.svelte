<script lang="ts">
  import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime';

  interface Props {
    version: string;
    url: string;
    onDismiss: () => void;
  }

  let { version, url, onDismiss }: Props = $props();

  function openRelease() {
    BrowserOpenURL(url);
  }
</script>

<div class="update-toast" role="status" aria-live="polite">
  <div class="update-text">
    <span class="update-label">▲ update available</span>
    <span class="update-version">{version}</span>
  </div>
  <div class="update-actions">
    <button class="btn-download" onclick={openRelease}>[ download ]</button>
    <button class="btn-close" onclick={onDismiss} aria-label="Fechar">✕</button>
  </div>
</div>

<style>
  .update-toast {
    position: fixed;
    bottom: 18px;
    right: 18px;
    z-index: 9998;

    display: flex;
    align-items: center;
    gap: 16px;

    background: #0a0a00;
    border: 1px solid #ffb300;
    border-radius: 3px;
    padding: 10px 14px;

    font-family: "JetBrains Mono", "Fira Code", "Source Code Pro", ui-monospace, monospace;
    font-size: 0.78rem;
    letter-spacing: 0.04em;

    box-shadow:
      0 0 0 1px rgba(255, 179, 0, 0.12),
      0 0 18px rgba(255, 179, 0, 0.15),
      0 6px 28px rgba(0, 0, 0, 0.6);

    animation: toast-in 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* subtle scanline overlay matching WelcomeScreen */
  .update-toast::before {
    content: "";
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      to bottom,
      transparent 0px,
      transparent 3px,
      rgba(0, 0, 0, 0.14) 3px,
      rgba(0, 0, 0, 0.14) 4px
    );
    pointer-events: none;
    border-radius: inherit;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .update-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .update-label {
    color: #ffb300;
    text-shadow: 0 0 6px rgba(255, 179, 0, 0.5);
    font-weight: 700;
    line-height: 1.2;
    animation: flicker 8s infinite;
  }

  .update-version {
    color: #c8920a;
    text-shadow: 0 0 4px rgba(200, 146, 10, 0.35);
    line-height: 1.2;
  }

  .update-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-download {
    background: none;
    border: 1px solid #ffb300;
    border-radius: 2px;
    color: #ffb300;
    font-family: inherit;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    padding: 4px 8px;
    cursor: pointer;
    white-space: nowrap;
    text-shadow: 0 0 6px rgba(255, 179, 0, 0.5);
    transition: background 0.15s, color 0.15s;
  }

  .btn-download:hover {
    background: #ffb300;
    color: #0a0a00;
    text-shadow: none;
  }

  .btn-close {
    background: none;
    border: none;
    color: #7a5800;
    font-family: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    padding: 4px 2px;
    transition: color 0.15s;
    line-height: 1;
  }

  .btn-close:hover { color: #ffb300; }

  @keyframes flicker {
    0%, 97%, 100% { opacity: 1; }
    97.5%  { opacity: 0.55; }
    98%    { opacity: 1; }
    98.5%  { opacity: 0.7; }
    99%    { opacity: 1; }
  }
</style>
