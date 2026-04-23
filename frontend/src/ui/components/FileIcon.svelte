<script lang="ts">
  import { onMount } from "svelte";
  import { getFileIcon, getFolderIcon, initIcons } from "../fileIcons";

  interface Props {
    name: string;
    isDir?: boolean;
    expanded?: boolean;
    size?: number;
  }

  const { name, isDir = false, expanded = false, size = 16 }: Props = $props();

  let iconName = $state("file");

  $effect(() => {
    // Re-run whenever name, isDir, or expanded changes
    const fetchIcon = async () => {
      await initIcons();
      if (isDir) {
        iconName = getFolderIcon(name, expanded).icon;
      } else {
        iconName = getFileIcon(name).icon;
      }
    };
    fetchIcon();
  });
</script>

<img
  src="/material-icons/{iconName}.svg"
  alt="icon"
  style="width: {size}px; height: {size}px; flex-shrink: 0;"
/>
