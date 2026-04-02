<script lang="ts">
  import { tutorials } from "$lib/frontiers/tutorials/registry.js";
</script>

<div class="min-h-screen bg-surface p-8">
  <h1 class="mb-2 text-2xl font-bold text-accent">Learn Trails</h1>
  <p class="mb-8 text-sm text-text-muted">
    Interactive tutorials that teach you Trails while you build real applications.
  </p>

  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    {#each tutorials as tutorial (tutorial.slug)}
      <a
        href={`/frontiers/learn/${tutorial.slug}/1`}
        class="rounded-lg border border-border bg-surface-raised p-4 transition-colors hover:border-accent"
        data-testid="tutorial-card"
        data-slug={tutorial.slug}
      >
        <h2 class="mb-1 text-lg font-bold text-text">{tutorial.title}</h2>
        <p class="mb-3 text-sm text-text-muted">{tutorial.description}</p>
        <span class="text-xs text-accent">{tutorial.stepCount} steps →</span>
      </a>
    {/each}
  </div>
</div>
