<script lang="ts">
  import {
    Quit,
    WindowMinimise,
    WindowToggleMaximise,
  } from "../../../wailsjs/runtime/runtime";

  interface Props {
    onSettings: () => void;
  }
  const { onSettings }: Props = $props();
</script>

<div id="titlebar">
  <div class="controls">
    <button class="wbtn" id="btn-close" title="Close" onclick={Quit}></button>
    <button class="wbtn" id="btn-min" title="Minimise" onclick={WindowMinimise}
    ></button>
    <button
      class="wbtn"
      id="btn-max"
      title="Maximise"
      onclick={WindowToggleMaximise}
    ></button>
  </div>
  <span class="title">myTerm</span>
  <div class="titlebar-right">
    <button id="settings-btn" title="Settings (Ctrl+,)" onclick={onSettings}
      >⚙</button
    >
  </div>
</div>

<style>
  .titlebar-right {
    width: 54px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
</style>
