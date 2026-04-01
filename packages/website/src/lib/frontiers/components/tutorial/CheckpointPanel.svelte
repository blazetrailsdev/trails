<script lang="ts">
  import type { CheckSpec, CheckpointResult } from "../../tutorials/types.js";
  import type { VirtualFS } from "../../virtual-fs.js";
  import type { SqlJsAdapter } from "../../sql-js-adapter.js";
  import { runCheckpoint } from "../../tutorials/diff-engine.js";

  interface Props {
    checks: CheckSpec[];
    vfs: VirtualFS;
    adapter: SqlJsAdapter;
  }

  let { checks, vfs, adapter }: Props = $props();

  let result = $state<CheckpointResult | null>(null);
  let checking = $state(false);

  async function verify() {
    checking = true;
    await new Promise((r) => setTimeout(r, 0));
    try {
      result = runCheckpoint(vfs, adapter, checks);
    } finally {
      checking = false;
    }
  }
</script>

<div
  class="rounded border border-border bg-surface-overlay p-3"
  data-testid="checkpoint-panel"
>
  <div class="mb-2 flex items-center justify-between">
    <h4 class="text-xs font-medium text-text">Checkpoint</h4>
    <button
      type="button"
      onclick={verify}
      disabled={checking}
      class="rounded bg-accent px-3 py-1.5 text-xs font-medium text-surface
             hover:bg-accent-hover disabled:opacity-50
             md:py-1"
      data-testid="verify-button"
    >
      {checking ? "Checking…" : "Verify"}
    </button>
  </div>

  {#if result}
    <div
      class="rounded bg-surface p-2"
      aria-live="assertive"
      data-testid="checkpoint-results"
    >
      {#each result.results as r}
        <div class="flex items-center gap-2 py-1 text-xs" data-testid="check-result">
          <span class={r.passed ? "text-success" : "text-error"}>
            {r.passed ? "PASS" : "FAIL"}
          </span>
          <span class="text-text-muted">
            {r.check.type}{r.check.target ? `: ${r.check.target}` : ""}
          </span>
          {#if !r.passed && r.error}
            <span class="text-error text-[10px]">— {r.error}</span>
          {/if}
        </div>
      {/each}
      <div class="mt-2 border-t border-border pt-2 text-xs font-medium"
           data-testid="checkpoint-summary">
        {#if result.allPassed}
          <span class="text-success">All checks passed</span>
        {:else}
          <span class="text-error">
            {result.results.filter((r) => !r.passed).length} of {result.results.length} checks failed
          </span>
        {/if}
      </div>
    </div>
  {/if}
</div>
