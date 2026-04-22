<script lang="ts">
  import { ForceQuit } from "../../infrastructure/wails/backend";

  interface Props {
    count: number;
    onCancel: () => void;
  }
  const { count, onCancel }: Props = $props();

  import { i18nStore } from "../../application/i18n.store.svelte";
  import { dictConfirmCloseModal } from "../../application/i18n/dictionaries/ConfirmCloseModal";

  let dict = $derived(dictConfirmCloseModal[i18nStore.locale]);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<div class="modal-backdrop" onclick={onCancel} role="dialog" aria-modal="true" tabindex="-1">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-box" onclick={(e) => e.stopPropagation()}>
    <h3 class="modal-title">{dict.title}</h3>
    <p class="modal-body">
      {count}
      {count === 1 ? dict.openSession : dict.openSessions}. {dict.warning}
    </p>
    <div class="modal-actions">
      <button class="btn-cancel" onclick={onCancel}>{dict.cancel}</button>
      <button class="btn-close" onclick={() => ForceQuit()}>{dict.close}</button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .modal-box {
    background: #1e1e2e;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 28px 32px;
    width: 360px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
    animation: modal-in 0.15s ease;
  }

  @keyframes modal-in {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .modal-title {
    font-size: 1rem;
    font-weight: 600;
    color: #cdd6f4;
    margin: 0 0 10px;
  }

  .modal-body {
    font-size: 0.875rem;
    color: #a6adc8;
    margin: 0 0 22px;
    line-height: 1.5;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .btn-cancel,
  .btn-close {
    padding: 7px 18px;
    border-radius: 7px;
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-cancel {
    background: rgba(255, 255, 255, 0.07);
    color: #cdd6f4;
  }

  .btn-close {
    background: #f38ba8;
    color: #1e1e2e;
  }

  .btn-cancel:hover {
    opacity: 0.8;
  }
  .btn-close:hover {
    opacity: 0.85;
  }
</style>
