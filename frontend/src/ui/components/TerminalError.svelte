<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getSettings } from "../../domain/settings";
  import { EventsOn, EventsOff } from "../../infrastructure/wails/events";
  import { GenerateOllamaResponse } from "../../infrastructure/wails/backend";

  let errorEvent = $state<{
    sessionId: string;
    command: string;
    output: string;
  } | null>(null);
  let isAnalyzing = $state(false);
  let analysisResult = $state("");

  import { i18nStore } from "../../application/i18n.store.svelte";
  import { dictTerminalError } from "../../application/i18n/dictionaries/TerminalError";

  let dict = $derived(dictTerminalError[i18nStore.locale]);

  const loadingMessages = $derived([
    dict.loading1,
    dict.loading2,
    dict.loading3,
    dict.loading4,
    dict.loading5,
    dict.loading6,
  ]);
  let loadingMessageIdx = $state(0);
  let loadingInterval: any;
  let autoCloseTimer: any;

  function renderMarkdown(text: string) {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/```[\s\S]*?(?:```|$)/g, (match) => {
        let content = match.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "");
        return `<div class="md-code-block">${content}</div>`;
      })
      .replace(/`([^`\n]+)`/g, '<span class="md-code">$1</span>')
      .replace(/^> (.*$)/gim, '<span class="md-quote">$1</span>')
      .replace(/\*\*(.*?)\*\*/g, '<span class="md-bold">$1</span>')
      .replace(/\*(.*?)\*/g, '<span class="md-italic">$1</span>')
      .replace(/^### (.*$)/gim, '<span class="md-h3">$1</span>')
      .replace(/^## (.*$)/gim, '<span class="md-h2">$1</span>')
      .replace(/^# (.*$)/gim, '<span class="md-h1">$1</span>')
      .replace(/^\s*[-*]\s+(.*$)/gim, '<span class="md-list">• $1</span>');
  }

  // Custom font from settings
  let fontFamily = $state("monospace");

  $effect(() => {
    const s = getSettings();
    fontFamily =
      s.fontFamily === "monospace"
        ? "monospace"
        : `'${s.fontFamily}', 'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace`;
  });

  function startAutoClose() {
    cancelAutoClose();
    autoCloseTimer = setTimeout(() => {
      dismiss();
    }, 5000);
  }

  function cancelAutoClose() {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
  }

  function handleMouseLeave() {
    if (!isAnalyzing && !analysisResult) {
      startAutoClose();
    }
  }

  function onTerminalError(e: Event) {
    errorEvent = (e as CustomEvent).detail;
    analysisResult = "";
    isAnalyzing = false;
    loadingMessageIdx = 0;
    if (loadingInterval) {
      clearInterval(loadingInterval);
      loadingInterval = null;
    }
    
    startAutoClose();
  }

  onMount(() => {
    window.addEventListener("myterm:terminal-error", onTerminalError);
    return () =>
      window.removeEventListener("myterm:terminal-error", onTerminalError);
  });

  function dismiss() {
    cancelAutoClose();
    errorEvent = null;
    analysisResult = "";
    isAnalyzing = false;
  }

  async function analyzeWithOllama() {
    cancelAutoClose();
    if (!errorEvent) return;
    isAnalyzing = true;
    analysisResult = "";
    loadingMessageIdx = 0;

    if (loadingInterval) clearInterval(loadingInterval);
    loadingInterval = setInterval(() => {
      loadingMessageIdx = (loadingMessageIdx + 1) % loadingMessages.length;
    }, 2500);

    const prompt = `${dict.systemPrompt}
Command: ${errorEvent.command}
Error Output:
${errorEvent.output}`;

    const s = getSettings();
    const host = s.ollamaHost.replace(/\/$/, ""); // Remove trailing slash if any
    const model = s.ollamaModel || "llama3";

    const chunkHandler = (chunk: string) => {
      try {
        const data = JSON.parse(chunk);
        if (data.response) {
          analysisResult += data.response;
        }
      } catch (e) {
        console.error("Failed to parse Ollama JSON chunk:", e);
      }
    };

    EventsOn("ollama-chunk", chunkHandler);

    const doneHandler = () => {
      EventsOff("ollama-chunk");
      EventsOff("ollama-done");
      isAnalyzing = false;
      if (loadingInterval) clearInterval(loadingInterval);
    };
    EventsOn("ollama-done", doneHandler);

    try {
      await GenerateOllamaResponse(host, model, prompt);
    } catch (err: any) {
      analysisResult = `[!] ${dict.errorConnecting}: ${err.message || err}\n${dict.makeSure} '${host}' and the '${model}' model is available.`;
      doneHandler();
    }
  }
</script>

{#if errorEvent}
  <div class="terminal-error-wrapper" style="--font: {fontFamily}">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
      class="terminal-error-box" 
      onmouseenter={cancelAutoClose}
      onmouseleave={handleMouseLeave}
    >
      <div class="error-header">
        <span class="error-badge">✖ ERROR</span>
        <span class="command-text">{errorEvent.command}</span>
        <button class="close-btn" onclick={dismiss} title="Dismiss">✕</button>
      </div>

      {#if !isAnalyzing && !analysisResult}
        <div class="error-body">
          {dict.errorMessage}
        </div>
        <div class="error-actions">
          <button class="ansi-btn" onclick={analyzeWithOllama}>
            <span class="prompt-arrow">❯</span> {dict.analyzeBtn}
          </button>
        </div>
      {/if}

      {#if isAnalyzing || analysisResult}
        <div class="analysis-box">
          {#if analysisResult}
            <pre class="analysis-text">{@html renderMarkdown(
                analysisResult,
              )}</pre>
          {/if}
          {#if isAnalyzing}
            <div class="loading-status">
              <span class="cursor-blink">_</span>
              {#if !analysisResult}
                <span class="loading-msg"
                  >{loadingMessages[loadingMessageIdx]}</span
                >
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .terminal-error-wrapper {
    position: absolute;
    bottom: 24px;
    right: 28px;
    z-index: 999;
    max-width: 500px;
    width: 100%;
    pointer-events: none;
    font-family: var(--font);
  }

  .terminal-error-box {
    background: #000000;
    border: 1px solid #ff5555;
    border-radius: 4px;
    padding: 12px;
    box-shadow: 0 8px 30px rgba(255, 85, 85, 0.15);
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: slide-up 0.2s ease-out;
  }

  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .error-header {
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px dashed #ff5555;
    padding-bottom: 8px;
  }

  .error-badge {
    color: #ff5555;
    font-weight: bold;
    font-size: 11px;
    letter-spacing: 1px;
  }

  .command-text {
    flex: 1;
    color: #f8f8f2;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #6272a4;
    cursor: pointer;
    font-size: 12px;
    padding: 0 4px;
  }

  .close-btn:hover {
    color: #f8f8f2;
  }

  .error-body {
    color: #f1fa8c;
    font-size: 12px;
    margin-top: 4px;
  }

  .error-actions {
    margin-top: 4px;
  }

  .ansi-btn {
    background: transparent;
    border: 1px solid #50fa7b;
    color: #50fa7b;
    padding: 6px 12px;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    border-radius: 2px;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ansi-btn:hover {
    background: rgba(80, 250, 123, 0.1);
  }

  .ansi-btn:active {
    background: rgba(80, 250, 123, 0.2);
  }

  .prompt-arrow {
    color: #50fa7b;
    font-weight: bold;
  }

  .analysis-box {
    margin-top: 4px;
    background: rgba(255, 255, 255, 0.03);
    padding: 10px;
    border-radius: 2px;
    font-size: 12px;
    color: #f8f8f2;
    max-height: 250px;
    overflow-y: auto;
    border-left: 2px solid #bd93f9;
  }

  .analysis-box::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .analysis-box::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.02);
    border-radius: 4px;
  }

  .analysis-box::-webkit-scrollbar-thumb {
    background: rgba(189, 147, 249, 0.4);
    border-radius: 4px;
  }

  .analysis-box::-webkit-scrollbar-thumb:hover {
    background: rgba(189, 147, 249, 0.8);
  }

  .analysis-text {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    line-height: 1.4;
  }

  .loading-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    color: #bd93f9;
  }

  .loading-msg {
    color: #6272a4;
    font-style: italic;
    animation: fade 2.5s infinite;
  }

  @keyframes fade {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }

  .cursor-blink {
    display: inline-block;
    color: #bd93f9;
    animation: blink 1s step-end infinite;
  }

  /* Markdown Styles */
  :global(.md-bold) {
    font-weight: bold;
    color: #ff79c6;
  }
  :global(.md-italic) {
    font-style: italic;
    color: #f1fa8c;
  }
  :global(.md-quote) {
    border-left: 2px solid #6272a4;
    padding-left: 8px;
    color: #6272a4;
    display: block;
    margin: 4px 0;
  }
  :global(.md-code) {
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 4px;
    border-radius: 3px;
    color: #50fa7b;
    font-family: inherit;
  }
  :global(.md-code-block) {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 8px 12px;
    border-radius: 4px;
    color: #f8f8f2;
    margin: 8px 0;
    overflow-x: auto;
    font-family: inherit;
    display: block;
    white-space: pre;
  }
  :global(.md-code-block::-webkit-scrollbar) {
    height: 6px;
  }
  :global(.md-code-block::-webkit-scrollbar-track) {
    background: rgba(255, 255, 255, 0.02);
  }
  :global(.md-code-block::-webkit-scrollbar-thumb) {
    background: rgba(80, 250, 123, 0.3);
    border-radius: 4px;
  }
  :global(.md-h1) {
    font-weight: bold;
    color: #8be9fd;
    font-size: 1.3em;
    display: block;
    margin: 8px 0 4px 0;
  }
  :global(.md-h2) {
    font-weight: bold;
    color: #8be9fd;
    font-size: 1.2em;
    display: block;
    margin: 8px 0 4px 0;
  }
  :global(.md-h3) {
    font-weight: bold;
    color: #8be9fd;
    font-size: 1.1em;
    display: block;
    margin: 6px 0 2px 0;
  }
  :global(.md-list) {
    display: block;
    margin-left: 8px;
    color: #f8f8f2;
  }
</style>
