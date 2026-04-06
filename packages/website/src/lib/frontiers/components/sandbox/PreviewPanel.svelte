<script lang="ts">
  import { onMount } from "svelte";
  import type { SwClient } from "$frontiers/sw-client.js";

  const DEV_PREFIX = "/~dev/";

  let {
    client,
    onerror,
  }: {
    client: SwClient;
    onerror?: (message: string) => void;
  } = $props();

  let relativePath = $state("");
  let previewKey = $state(0);
  let errors: string[] = $state([]);
  let iframeEl: HTMLIFrameElement | undefined = $state();

  const iframeSrc = $derived(`${DEV_PREFIX}${relativePath}`);

  export function refresh() {
    errors = [];
    previewKey++;
  }

  function handleMessage(event: MessageEvent) {
    if (event.origin !== location.origin) return;
    if (iframeEl && event.source !== iframeEl.contentWindow) return;
    if (event.data?.type === "frontiers:error") {
      const msg = event.data.message ?? "Unknown error";
      errors = [...errors, msg];
      onerror?.(msg);
    }
  }

  onMount(() => {
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  });
</script>

<div class="flex h-full flex-col gap-2 -m-3">
  <div class="flex items-center gap-2 border-b border-border bg-surface-raised px-3 py-1">
    <span class="text-[10px] text-text-muted">/~dev/</span>
    <input
      bind:value={relativePath}
      onkeydown={(e) => { if (e.key === "Enter") refresh(); }}
      class="flex-1 rounded border border-border bg-surface-overlay px-2 py-0.5 text-xs text-text outline-none focus:border-border-focus"
      placeholder="path"
      spellcheck="false"
    />
    <button class="rounded border border-border px-2 py-0.5 text-xs text-text-muted hover:text-accent" onclick={refresh}>Refresh</button>
  </div>
  {#key previewKey}
    <iframe
      bind:this={iframeEl}
      src={iframeSrc}
      class="flex-1 border-0 bg-white"
      sandbox="allow-scripts allow-same-origin allow-forms"
      title="Preview"
    ></iframe>
  {/key}
  {#if errors.length > 0}
    <div class="border-t border-error/30 bg-error/5 px-3 py-1.5">
      <div class="mb-1 flex items-center justify-between">
        <span class="text-[10px] font-medium text-error">Preview Errors ({errors.length})</span>
        <button class="text-[10px] text-text-muted hover:text-text" onclick={() => (errors = [])}>Clear</button>
      </div>
      {#each errors.slice(-5) as err}
        <pre class="text-[10px] text-error">{err}</pre>
      {/each}
    </div>
  {/if}
</div>
