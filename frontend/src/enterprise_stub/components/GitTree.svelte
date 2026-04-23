<script lang="ts">
  import type { application } from "../../../infrastructure/wails/backend";
  interface Props {
    gitStatus: any | null;
    rootPath: string;
  }
  const { gitStatus, rootPath }: Props = $props();
</script>
<div style="padding: 1rem; color: #888; font-size: 12px; text-align: center;">Git integration is an Enterprise feature.</div>
