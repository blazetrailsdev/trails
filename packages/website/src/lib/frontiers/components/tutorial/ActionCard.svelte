<script lang="ts">
  import type { FileDiff } from "../../tutorials/types.js";
  import type { CliResult } from "../../trail-cli.js";
  import type { VirtualFS } from "../../virtual-fs.js";
  import CliAction from "./CliAction.svelte";
  import DiffViewer from "./DiffViewer.svelte";

  interface Props {
    action: FileDiff | { command: string };
    exec: (command: string) => Promise<CliResult>;
    vfs: VirtualFS;
    onfileclick?: (path: string) => void;
    onchange?: () => void;
  }

  let { action, exec, vfs, onfileclick, onchange }: Props = $props();

  function isCliAction(a: FileDiff | { command: string }): a is { command: string } {
    return "command" in a && !("operation" in a);
  }
</script>

{#if isCliAction(action)}
  <CliAction
    command={action.command}
    {exec}
    onoutput={() => onchange?.()}
  />
{:else}
  <DiffViewer
    diff={action}
    {vfs}
    {onfileclick}
    onapplied={() => onchange?.()}
  />
{/if}
