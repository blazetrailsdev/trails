<script lang="ts">
  import { onMount } from "svelte";
  import { renderDiagram } from "../../tutorials/diagram-renderer.js";

  interface Props {
    source: string;
    label?: string;
  }

  let { source, label }: Props = $props();

  let svg = $state<string | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let renderToken = 0;
  let mounted = $state(false);

  async function render(src: string) {
    const token = ++renderToken;
    loading = true;
    svg = null;
    error = null;
    try {
      const result = await renderDiagram(src);
      if (token !== renderToken || !mounted) return;
      if (result.success) {
        const { default: DOMPurify } = await import("dompurify");
        if (token !== renderToken || !mounted) return;
        svg = DOMPurify.sanitize(result.svg!, { USE_PROFILES: { svg: true } });
      } else {
        error = result.error ?? "Failed to render diagram";
      }
    } catch (e) {
      if (token !== renderToken || !mounted) return;
      error = e instanceof Error ? e.message : "Failed to render diagram";
    } finally {
      if (token === renderToken && mounted) loading = false;
    }
  }

  onMount(() => {
    mounted = true;
    return () => { mounted = false; };
  });

  $effect(() => {
    if (mounted) render(source);
  });
</script>

<div
  class="rounded border border-border bg-surface-overlay p-3"
  data-testid="diagram-block"
>
  {#if loading}
    <div
      class="flex items-center justify-center py-4"
      data-testid="diagram-loading"
      aria-live="polite"
    >
      <span class="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"></span>
      <span class="ml-2 text-xs text-text-muted">Loading diagram…</span>
    </div>
  {:else if error}
    <div
      class="rounded bg-surface p-2"
      data-testid="diagram-error"
      aria-live="polite"
    >
      <p class="text-xs text-error">Diagram error: {error}</p>
      <pre class="mt-1 text-[10px] text-text-muted">{source.slice(0, 200)}</pre>
    </div>
  {:else if svg}
    <div
      class="overflow-auto"
      data-testid="diagram-svg"
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {@html svg}
    </div>
  {/if}
</div>
