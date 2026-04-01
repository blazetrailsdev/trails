<script lang="ts">
  import type { CliResult } from "../../trail-cli.js";

  interface Props {
    command: string;
    exec: (command: string) => Promise<CliResult>;
    onoutput?: (output: string[]) => void;
  }

  let { command, exec, onoutput }: Props = $props();

  let running = $state(false);
  let output = $state<string[]>([]);
  let error = $state(false);
  let hasRun = $state(false);

  async function run() {
    running = true;
    error = false;
    output = [];
    try {
      const result = await exec(command);
      output = result.output;
      error = !result.success;
      hasRun = true;
      onoutput?.(result.output);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      output = [`Error: ${message}`];
      error = true;
      hasRun = true;
    } finally {
      running = false;
    }
  }
</script>

<div class="rounded border border-border bg-surface-overlay p-3">
  <div class="flex items-center gap-2">
    <span class="text-accent text-xs">$</span>
    <code class="flex-1 text-xs text-text">{command}</code>
    <button
      type="button"
      onclick={run}
      disabled={running}
      class="rounded bg-accent px-3 py-1.5 text-xs font-medium text-surface
             hover:bg-accent-hover disabled:opacity-50
             md:py-1"
      data-testid="run-button"
    >
      {running ? "Running…" : hasRun ? "Re-run" : "Run"}
    </button>
  </div>
  {#if output.length > 0}
    <pre
      class="mt-2 max-h-48 overflow-auto rounded bg-surface p-2 text-xs leading-relaxed
             {error ? 'text-error' : 'text-text-muted'}"
      role="log"
      aria-live="polite"
      data-testid="cli-output"
    >{output.join("\n")}</pre>
  {/if}
</div>
