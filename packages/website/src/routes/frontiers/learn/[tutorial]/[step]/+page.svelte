<script lang="ts" module>
  import type { Runtime } from "$lib/frontiers/runtime.js";
  const runtimes = new Map<string, Runtime>();
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import initSqlJs from "sql.js";
  import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
  import { createRuntime } from "$lib/frontiers/runtime.js";
  import type { TutorialStep } from "$lib/frontiers/tutorials/types.js";
  import { computeHighlightRanges } from "$lib/frontiers/tutorials/diff-engine.js";
  import type { HighlightRange } from "$lib/frontiers/tutorials/types.js";
  import StepNav from "$lib/frontiers/components/tutorial/StepNav.svelte";
  import StepContent from "$lib/frontiers/components/tutorial/StepContent.svelte";
  import TabPanel from "$lib/frontiers/components/sandbox/TabPanel.svelte";
  import FileTree from "$lib/frontiers/components/sandbox/FileTree.svelte";
  import MonacoEditor from "$lib/frontiers/components/sandbox/MonacoEditor.svelte";
  import DatabaseBrowser from "$lib/frontiers/components/sandbox/DatabaseBrowser.svelte";

  let { data } = $props();

  let runtime = $state<Runtime | null>(null);
  let steps = $state<TutorialStep[]>([]);
  let currentStep = $derived(steps[data.stepNumber - 1] ?? null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let selectedFile = $state<{ path: string; content: string } | null>(null);
  let highlights = $state<HighlightRange[]>([]);
  let activeTab = $state("filetree");

  const PANE_TABS = [
    { id: "filetree", label: "Files" },
    { id: "editor", label: "Editor" },
    { id: "database", label: "Database" },
  ];

  $effect(() => {
    if (currentStep) {
      const available = PANE_TABS.filter((t) => currentStep!.panes.includes(t.id));
      if (available.length > 0 && !currentStep!.panes.includes(activeTab)) {
        activeTab = available[0].id;
      }
    }
  });

  let visibleTabs = $derived(
    currentStep ? PANE_TABS.filter((t) => currentStep!.panes.includes(t.id)) : PANE_TABS,
  );

  let lastSlug = "";

  async function loadTutorial(slug: string, loadSteps: () => Promise<TutorialStep[]>) {
    loading = true;
    error = null;
    selectedFile = null;
    highlights = [];
    try {
      let rt = runtimes.get(slug);
      if (!rt) {
        const SQL = await initSqlJs({ locateFile: () => wasmUrl });
        rt = await createRuntime(SQL);
        runtimes.set(slug, rt);
      }
      runtime = rt;
      steps = await loadSteps();

      if (data.stepNumber > steps.length) {
        error = `Step ${data.stepNumber} is out of range (1–${steps.length})`;
      }
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    lastSlug = data.slug;
    loadTutorial(data.slug, data.loadSteps);
  });

  $effect(() => {
    if (data.slug !== lastSlug) {
      lastSlug = data.slug;
      loadTutorial(data.slug, data.loadSteps);
    }
  });

  function handleFileSelect(path: string) {
    if (!runtime) return;
    const file = runtime.vfs.read(path);
    if (file) {
      selectedFile = { path: file.path, content: file.content };
      activeTab = "editor";
      highlights = [];
    }
  }

  function refreshSelectedFile() {
    if (!runtime || !selectedFile) return;
    const file = runtime.vfs.read(selectedFile.path);
    if (file) {
      selectedFile = { path: file.path, content: file.content };
    }
  }

  function handleChange() {
    refreshSelectedFile();
    highlights = [];
  }

  function handleFileClick(path: string) {
    handleFileSelect(path);
    if (currentStep && runtime) {
      for (const action of currentStep.actions) {
        if ("operation" in action && action.path === path) {
          const content = runtime.vfs.read(path)?.content ?? "";
          highlights = computeHighlightRanges(content, action);
          return;
        }
      }
    }
    highlights = [];
  }

  function navigateStep(step: number) {
    if (step >= 1 && step <= data.totalSteps) {
      goto(`/frontiers/learn/${data.slug}/${step}`);
    }
  }
</script>

<svelte:head>
  <title>{data.title} — Step {data.stepNumber} | Frontiers</title>
</svelte:head>

{#if loading}
  <div class="flex h-screen items-center justify-center bg-surface">
    <div class="text-center">
      <span class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></span>
      <p class="mt-2 text-sm text-text-muted">Loading tutorial…</p>
    </div>
  </div>
{:else if error}
  <div class="flex h-screen items-center justify-center bg-surface">
    <div class="rounded border border-error bg-surface-raised p-6 text-center">
      <p class="text-sm text-error">Failed to load tutorial</p>
      <p class="mt-1 text-xs text-text-muted">{error}</p>
      <a href="/frontiers/learn" class="mt-3 inline-block text-xs text-accent hover:underline">
        ← Back to tutorials
      </a>
    </div>
  </div>
{:else if runtime && currentStep}
  <div class="flex h-screen flex-col bg-surface">
    <StepNav
      tutorial={data.title}
      currentStep={data.stepNumber}
      totalSteps={data.totalSteps}
      onnavigate={navigateStep}
    />

    <div class="flex flex-1 flex-col overflow-hidden md:flex-row">
      <!-- Left column: tutorial content -->
      <div class="flex-1 overflow-y-auto border-r border-border md:max-w-[50%]">
        <StepContent
          step={currentStep}
          exec={(cmd) => runtime!.exec(cmd)}
          vfs={runtime.vfs}
          adapter={runtime.adapter}
          onfileclick={handleFileClick}
          onchange={handleChange}
        />
      </div>

      <!-- Right column: sandbox panes -->
      <div class="flex flex-1 flex-col overflow-hidden">
        <TabPanel tabs={visibleTabs} bind:activeTab>
          {#snippet children(tab)}
            {#if tab === "filetree"}
              <FileTree
                vfs={runtime!.vfs}
                selectedPath={selectedFile?.path ?? ""}
                onselect={handleFileSelect}
                readonly
              />
            {:else if tab === "editor"}
              <MonacoEditor
                file={selectedFile}
                {highlights}
                readonly
              />
            {:else if tab === "database"}
              <DatabaseBrowser
                adapter={runtime!.adapter}
                vfs={runtime!.vfs}
              />
            {/if}
          {/snippet}
        </TabPanel>
      </div>
    </div>
  </div>
{/if}
