<script lang="ts">
  import type { application } from "../../../infrastructure/wails/backend";
  interface Props {
    node: any;
    depth: number;
    onFileClick: (path: string) => void;
    activeFilePath?: string;
  }
  const { node, depth, onFileClick, activeFilePath }: Props = $props();
</script>
<div style="padding: 1rem; color: #888; font-size: 12px; text-align: center;">File Explorer is an Enterprise feature.</div>
