<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { createSwClient, type SwClient } from "$lib/frontiers/sw-client.js";
  import { SwVfsProxy } from "$lib/frontiers/sw-vfs-proxy.js";
  import { SwAdapterProxy } from "$lib/frontiers/sw-adapter-proxy.js";
  import { SwRuntimeProxy } from "$lib/frontiers/sw-runtime-proxy.js";
  import { SyncSwVfs } from "$lib/frontiers/sync-sw-vfs.js";
  import { SyncSwAdapter } from "$lib/frontiers/sync-sw-adapter.js";
  import type { CliResult } from "$lib/frontiers/trail-cli.js";
  import FileTree from "$lib/frontiers/components/sandbox/FileTree.svelte";
  import MonacoEditor from "$lib/frontiers/components/sandbox/MonacoEditor.svelte";
  import DatabaseBrowser from "$lib/frontiers/components/sandbox/DatabaseBrowser.svelte";
  import TabPanel from "$lib/frontiers/components/sandbox/TabPanel.svelte";
  import PreviewPanel from "$lib/frontiers/components/sandbox/PreviewPanel.svelte";

  let client = $state<SwClient | null>(null);
  let vfs = $state<SyncSwVfs | null>(null);
  let adapter = $state<SyncSwAdapter | null>(null);
  let runtimeProxy = $state<SwRuntimeProxy | null>(null);
  let previewPanel = $state<PreviewPanel | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let selectedFile = $state<{ path: string; content: string } | null>(null);
  let activeTab = $state("files");

  let cliInput = $state("");
  let cliOutput = $state<string[]>([]);
  let cliRunning = $state(false);
  let cliOutputEl: HTMLDivElement | undefined = $state();

  let previewCollapsed = $state(false);
  let treeWidth = $state(224);
  let treeCollapsed = $state(false);
  let resizing = $state(false);

  function startResize(e: MouseEvent) {
    e.preventDefault();
    resizing = true;
    const startX = e.clientX;
    const startWidth = treeWidth;

    function onMove(ev: MouseEvent) {
      const newWidth = Math.max(120, Math.min(500, startWidth + ev.clientX - startX));
      treeWidth = newWidth;
    }
    function onUp() {
      resizing = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const TABS = [
    { id: "files", label: "Files" },
    { id: "database", label: "Database" },
  ];

  onMount(async () => {
    try {
      const sw = await createSwClient({ scope: "/" });
      client = sw;

      const vfsProxy = new SwVfsProxy(sw);
      const adapterProxy = new SwAdapterProxy(sw);
      runtimeProxy = new SwRuntimeProxy(sw);

      const syncVfs = new SyncSwVfs(vfsProxy);
      const syncAdapter = new SyncSwAdapter(adapterProxy, sw);

      await syncVfs.hydrate();
      await syncAdapter.hydrate();

      vfs = syncVfs;
      adapter = syncAdapter;

      // Auto-scaffold a new app if VFS is empty
      if (syncVfs.list().length === 0) {
        await scaffoldNewApp();
      }
      loading = false;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
      loading = false;
    }
  });

  onDestroy(() => {
    saveFile();
    vfs?.dispose();
    adapter?.dispose();
    client?.destroy();
  });

  async function scaffoldNewApp() {
    if (!runtimeProxy) return;
    cliOutput = ["$ new myapp", "Creating new trails application..."];
    cliRunning = true;
    try {
      const result = await runtimeProxy.exec("new myapp");
      cliOutput = [...cliOutput, ...result.output];
      // Explicitly rehydrate after scaffold — don't rely on broadcast timing
      await vfs?.hydrate();
      await adapter?.hydrate();
      previewPanel?.refresh();
    } catch (e: unknown) {
      cliOutput = [...cliOutput, `Error: ${e instanceof Error ? e.message : String(e)}`];
    } finally {
      cliRunning = false;
    }
  }

  function handleFileSelect(path: string) {
    if (!vfs) return;
    saveFile();
    const file = vfs.read(path);
    if (file) {
      selectedFile = { path: file.path, content: file.content };
      dirty = false;
      activeTab = "files";
    }
  }

  let dirty = $state(false);

  function handleFileChange(content: string) {
    if (!selectedFile) return;
    selectedFile = { ...selectedFile, content };
    dirty = true;
  }

  function saveFile() {
    if (!vfs || !selectedFile || !dirty) return;
    vfs.write(selectedFile.path, selectedFile.content);
    dirty = false;
  }

  async function resetSandbox() {
    vfs?.dispose();
    adapter?.dispose();
    await client?.destroy();
    vfs = null;
    adapter = null;
    client = null;
    runtimeProxy = null;
    selectedFile = null;
    dirty = false;
    cliOutput = [];
    loading = true;
    error = null;

    // Re-register from scratch
    try {
      const sw = await createSwClient({ scope: "/" });
      client = sw;

      const vfsProxy = new SwVfsProxy(sw);
      const adapterProxy = new SwAdapterProxy(sw);
      runtimeProxy = new SwRuntimeProxy(sw);

      const syncVfs = new SyncSwVfs(vfsProxy);
      const syncAdapter = new SyncSwAdapter(adapterProxy, sw);

      await syncVfs.hydrate();
      await syncAdapter.hydrate();

      vfs = syncVfs;
      adapter = syncAdapter;

      if (syncVfs.list().length === 0) {
        await scaffoldNewApp();
      }
      loading = false;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
      loading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      saveFile();
    }
  }

  async function runCommand() {
    const cmd = cliInput.trim();
    if (!cmd || !runtimeProxy || cliRunning) return;

    cliRunning = true;
    cliOutput = [...cliOutput, `$ ${cmd}`];
    cliInput = "";

    try {
      const result: CliResult = await runtimeProxy.exec(cmd);
      cliOutput = [...cliOutput, ...result.output];
      if (!result.success) {
        cliOutput = [...cliOutput, `Exit code: ${result.exitCode}`];
      }
    } catch (e: unknown) {
      cliOutput = [...cliOutput, `Error: ${e instanceof Error ? e.message : String(e)}`];
    } finally {
      cliRunning = false;
      previewPanel?.refresh();
    }
  }

  // Auto-scroll CLI output to bottom
  $effect(() => {
    if (cliOutput.length && cliOutputEl) {
      tick().then(() => {
        cliOutputEl?.scrollTo(0, cliOutputEl.scrollHeight);
      });
    }
  });

</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>Project | Frontiers</title>
</svelte:head>

{#if loading}
  <div class="flex h-screen items-center justify-center bg-surface">
    <div class="text-center">
      <span class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></span>
      <p class="mt-2 text-sm text-text-muted">Starting sandbox…</p>
    </div>
  </div>
{:else if error}
  <div class="flex h-screen items-center justify-center bg-surface">
    <div class="rounded border border-error bg-surface-raised p-6 text-center">
      <p class="text-sm text-error">Failed to start sandbox</p>
      <p class="mt-1 text-xs text-text-muted">{error}</p>
      <p class="mt-2 text-xs text-text-muted">Service workers require HTTPS or localhost.</p>
    </div>
  </div>
{:else if vfs && adapter && client}
  <div class="flex h-screen flex-col bg-surface">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-border px-4 py-2">
      <div class="flex items-center gap-3">
        <a href="/frontiers" class="text-xs text-text-muted hover:text-accent">← Frontiers</a>
        <h1 class="text-sm font-medium text-text">Sandbox</h1>
      </div>
      <button
        class="rounded border border-border px-2 py-0.5 text-[10px] text-text-muted hover:text-accent"
        onclick={resetSandbox}
      >Reset SW</button>
    </div>

    <!-- Main content -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Left: TabPanel (Files / Database) -->
      <div class="flex flex-1 flex-col overflow-hidden">
        <TabPanel tabs={TABS} bind:activeTab>
          {#snippet children(tab)}
            {#if tab === "files"}
              <div class="flex h-full overflow-hidden" class:select-none={resizing}>
                {#if !treeCollapsed}
                  <div class="flex-shrink-0 overflow-hidden" style="width: {treeWidth}px">
                    <FileTree
                      {vfs}
                      selectedPath={selectedFile?.path ?? ""}
                      onselect={handleFileSelect}
                    />
                  </div>
                  <!-- Resize handle -->
                  <div
                    class="w-1 flex-shrink-0 cursor-col-resize bg-border hover:bg-accent transition-colors"
                    onmousedown={startResize}
                    role="separator"
                    aria-orientation="vertical"
                  ></div>
                {/if}
                <div class="flex flex-1 flex-col overflow-hidden">
                  <div class="flex items-center border-b border-border bg-surface-raised px-2 py-0.5">
                    <button
                      class="text-xs text-text-muted hover:text-accent"
                      onclick={() => treeCollapsed = !treeCollapsed}
                      title={treeCollapsed ? "Show file tree" : "Hide file tree"}
                    >{treeCollapsed ? "▶" : "◀"}</button>
                    {#if selectedFile}
                      <span class="ml-2 truncate text-[10px] text-text-muted">
                        {selectedFile.path}{#if dirty}<span class="text-accent"> *</span>{/if}
                      </span>
                    {/if}
                  </div>
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="flex-1 overflow-hidden" onfocusout={saveFile}>
                    <MonacoEditor
                      file={selectedFile}
                      readonly={false}
                      onchange={handleFileChange}
                    />
                  </div>
                </div>
              </div>
            {:else if tab === "database"}
              <DatabaseBrowser
                {adapter}
                {vfs}
              />
            {/if}
          {/snippet}
        </TabPanel>
      </div>

      <!-- Right: Preview (collapsible) -->
      <div class="flex flex-col border-l border-border {previewCollapsed ? 'w-8' : 'w-[40%]'} transition-all">
        <div class="flex items-center border-b border-border bg-surface-raised px-2 py-1">
          {#if !previewCollapsed}
            <span class="flex-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">Preview</span>
          {/if}
          <button
            class="text-xs text-text-muted hover:text-accent"
            onclick={() => previewCollapsed = !previewCollapsed}
            title={previewCollapsed ? "Show preview" : "Hide preview"}
          >{previewCollapsed ? "◀" : "▶"}</button>
        </div>
        {#if !previewCollapsed}
          <div class="flex-1 overflow-hidden">
            <PreviewPanel bind:this={previewPanel} {client} />
          </div>
        {/if}
      </div>
    </div>

    <!-- CLI bar -->
    <div class="border-t border-border bg-surface-raised">
      {#if cliOutput.length > 0}
        <div bind:this={cliOutputEl} class="max-h-32 overflow-y-auto px-4 py-2">
          {#each cliOutput as line}
            <pre class="text-[11px] leading-relaxed text-text-muted">{line}</pre>
          {/each}
        </div>
      {/if}
      <div class="flex items-center gap-2 px-4 py-2">
        <span class="text-xs text-text-muted">$</span>
        <input
          bind:value={cliInput}
          onkeydown={(e) => { if (e.key === "Enter") runCommand(); }}
          class="flex-1 bg-transparent text-xs text-text outline-none placeholder:text-text-muted"
          placeholder="generate model User name:string email:string"
          disabled={cliRunning}
          spellcheck="false"
        />
        {#if cliRunning}
          <span class="inline-block h-3 w-3 animate-spin rounded-full border border-accent border-t-transparent"></span>
        {/if}
      </div>
    </div>
  </div>
{/if}
