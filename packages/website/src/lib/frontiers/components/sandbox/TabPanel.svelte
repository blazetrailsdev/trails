<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    tabs: Array<{ id: string; label: string }>;
    activeTab?: string;
    onchange?: (id: string) => void;
    children: Snippet<[string]>;
  }

  let { tabs, activeTab = $bindable(tabs[0]?.id ?? ""), onchange, children }: Props = $props();

  $effect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.id === activeTab)) {
      activeTab = tabs[0].id;
    }
  });

  function safeId(id: string): string {
    return encodeURIComponent(id);
  }

  function selectTab(id: string) {
    if (id === activeTab) return;
    activeTab = id;
    onchange?.(id);
  }

  function handleTabKeydown(e: KeyboardEvent) {
    if (tabs.length === 0) return;
    const idx = Math.max(0, tabs.findIndex((t) => t.id === activeTab));
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = tabs[(idx + 1) % tabs.length];
      selectTab(next.id);
      focusActiveTab(e.currentTarget as HTMLElement);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
      selectTab(prev.id);
      focusActiveTab(e.currentTarget as HTMLElement);
    }
  }

  function focusActiveTab(currentButton: HTMLElement) {
    requestAnimationFrame(() => {
      const tablist = currentButton.closest('[role="tablist"]');
      const active = tablist?.querySelector('[aria-selected="true"]') as HTMLElement | null;
      active?.focus();
    });
  }
</script>

<div class="flex h-full flex-col" data-testid="tab-panel">
  <div
    class="flex overflow-x-auto border-b border-border bg-surface-raised"
    role="tablist"
    aria-label="Sandbox panes"
  >
    {#each tabs as tab (tab.id)}
      <button
        type="button"
        role="tab"
        id={`tab-${safeId(tab.id)}`}
        aria-selected={tab.id === activeTab}
        aria-controls={`tabpanel-${safeId(tab.id)}`}
        tabindex={tab.id === activeTab ? 0 : -1}
        class="whitespace-nowrap px-3 py-1.5 text-xs transition-colors md:py-1
               {tab.id === activeTab
                 ? 'border-b-2 border-accent text-text font-medium'
                 : 'text-text-muted hover:text-accent'}"
        onclick={() => selectTab(tab.id)}
        onkeydown={handleTabKeydown}
        data-testid="tab-button"
        data-tab={tab.id}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  {#each tabs as tab (tab.id)}
    <div
      class="flex-1 overflow-auto"
      role="tabpanel"
      id={`tabpanel-${safeId(tab.id)}`}
      aria-labelledby={`tab-${safeId(tab.id)}`}
      data-testid={tab.id === activeTab ? "tab-content" : undefined}
      hidden={tab.id !== activeTab}
    >
      {#if tab.id === activeTab}
        {@render children(activeTab)}
      {/if}
    </div>
  {/each}
</div>
