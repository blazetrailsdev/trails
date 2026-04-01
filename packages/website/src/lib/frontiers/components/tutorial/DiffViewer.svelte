<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { FileDiff } from "../../tutorials/types.js";
  import type { VirtualFS } from "../../virtual-fs.js";
  import { applyDiff, isDiffApplied } from "../../tutorials/diff-engine.js";

  interface Props {
    diff: FileDiff;
    vfs: VirtualFS;
    onfileclick?: (path: string) => void;
    onapplied?: () => void;
  }

  let { diff, vfs, onfileclick, onapplied }: Props = $props();

  let vfsVersion = $state(0);
  let manuallyApplied = $state(false);
  let applied = $derived(manuallyApplied || isDiffApplied(vfs, diff));
  let error = $state<string | null>(null);

  let unsubscribe: (() => void) | undefined;
  onMount(() => {
    unsubscribe = vfs.onChange(() => { vfsVersion++; });
  });
  onDestroy(() => unsubscribe?.());

  function apply() {
    error = null;
    const result = applyDiff(vfs, diff);
    if (result.success) {
      manuallyApplied = true;
      onapplied?.();
    } else {
      error = result.error ?? "Unknown error";
    }
  }

  function getContext(): { before: string[]; anchor: string; after: string[] } | null {
    void vfsVersion;
    if (diff.operation !== "modify" || !diff.hunks?.length) return null;
    const file = vfs.read(diff.path);
    if (!file) return null;

    const lines = file.content.split("\n");
    const hunk = diff.hunks[0];
    const anchorMatches: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(hunk.anchor)) anchorMatches.push(i);
    }
    if (anchorMatches.length !== 1) return null;
    const anchorIdx = anchorMatches[0];

    const start = Math.max(0, anchorIdx - 2);
    const end = Math.min(lines.length, anchorIdx + 3);
    return {
      before: lines.slice(start, anchorIdx),
      anchor: lines[anchorIdx],
      after: lines.slice(anchorIdx + 1, end),
    };
  }

  let context = $derived(getContext());
</script>

<div class="rounded border border-border bg-surface-overlay p-3" data-testid="diff-viewer">
  <div class="mb-2 flex items-center justify-between">
    <button
      type="button"
      class="text-xs text-info hover:underline"
      onclick={() => onfileclick?.(diff.path)}
      data-testid="file-link"
    >
      {diff.path}
    </button>
    <span class="rounded bg-surface px-2 py-0.5 text-[10px] text-text-muted">
      {diff.operation}
    </span>
  </div>

  {#if diff.operation === "modify" && context}
    <pre class="rounded bg-surface p-2 text-xs leading-relaxed" data-testid="diff-context">
{#each context.before as line}<span class="text-text-muted">{line}</span>
{/each}<span class="text-warning font-medium">{context.anchor}</span>
{#each diff.hunks ?? [] as hunk}{#each hunk.insertLines as line}<span class="text-success">+ {line}</span>
{/each}{/each}{#each context.after as line}<span class="text-text-muted">{line}</span>
{/each}</pre>
  {:else if diff.operation === "create"}
    <pre class="max-h-32 overflow-auto rounded bg-surface p-2 text-xs text-success leading-relaxed" data-testid="diff-content">
{diff.content?.slice(0, 500)}{(diff.content?.length ?? 0) > 500 ? "\n..." : ""}</pre>
  {:else if diff.operation === "delete"}
    <p class="text-xs text-error" data-testid="diff-delete">File will be deleted</p>
  {/if}

  {#if error}
    <p class="mt-2 text-xs text-error" data-testid="diff-error">{error}</p>
  {/if}

  <div class="mt-2 flex justify-end">
    <button
      type="button"
      onclick={apply}
      disabled={applied}
      class="rounded px-3 py-1.5 text-xs font-medium md:py-1
             {applied
               ? 'border border-success text-success'
               : 'bg-accent text-surface hover:bg-accent-hover'}"
      data-testid="apply-button"
    >
      {applied ? "Applied ✓" : "Apply"}
    </button>
  </div>
</div>
