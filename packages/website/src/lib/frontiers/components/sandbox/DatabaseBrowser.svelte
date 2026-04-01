<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { SqlJsAdapter } from "../../sql-js-adapter.js";
  import type { VirtualFS } from "../../virtual-fs.js";

  interface Props {
    adapter: SqlJsAdapter;
    vfs: VirtualFS;
  }

  let { adapter, vfs }: Props = $props();

  interface TableInfo {
    name: string;
    rowCount: number;
    columns: Array<{ name: string; type: string; notnull: boolean; pk: boolean }>;
  }

  let tables = $state<TableInfo[]>([]);
  let expandedTable = $state<string | null>(null);
  let focusedIndex = $state(-1);
  let previewRows = $state<{ columns: string[]; rows: unknown[][] } | null>(null);

  function refresh() {
    const tableNames = adapter
      .getTables()
      .filter((t) => !t.startsWith("_vfs_") && t !== "schema_migrations")
      .sort();
    tables = tableNames.map((name) => {
      const columns = adapter.getColumns(name);
      let rowCount = 0;
      try {
        const result = adapter.execRaw(
          `SELECT COUNT(*) FROM "${name.replace(/"/g, '""')}"`,
        );
        rowCount = (result[0]?.values[0]?.[0] as number) ?? 0;
      } catch {
        // table may not exist yet
      }
      return { name, rowCount, columns };
    });
    if (focusedIndex >= tables.length) {
      focusedIndex = tables.length - 1;
    }
    if (expandedTable) {
      if (!tableNames.includes(expandedTable)) {
        expandedTable = null;
        previewRows = null;
      } else {
        loadPreview(expandedTable);
      }
    }
  }

  let unsubscribe: (() => void) | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  onMount(() => {
    refresh();
    unsubscribe = vfs.onChange(() => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, 100);
    });
  });
  onDestroy(() => {
    unsubscribe?.();
    clearTimeout(refreshTimer);
  });

  function toggleTable(name: string) {
    if (expandedTable === name) {
      expandedTable = null;
      previewRows = null;
    } else {
      expandedTable = name;
      loadPreview(name);
    }
  }

  function loadPreview(name: string) {
    try {
      const escaped = name.replace(/"/g, '""');
      const result = adapter.execRaw(`SELECT * FROM "${escaped}" LIMIT 3`);
      if (result.length > 0) {
        previewRows = { columns: result[0].columns, rows: result[0].values };
      } else {
        previewRows = null;
      }
    } catch {
      previewRows = null;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (tables.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, tables.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
    } else if (e.key === "Enter" && focusedIndex >= 0 && focusedIndex < tables.length) {
      e.preventDefault();
      toggleTable(tables[focusedIndex].name);
    }
  }
</script>

<div
  class="flex h-full flex-col overflow-auto text-xs"
  data-testid="database-browser"
  tabindex="0"
  role="listbox"
  aria-label="Database browser"
  aria-activedescendant={focusedIndex >= 0 && tables[focusedIndex] ? `db-item-${encodeURIComponent(tables[focusedIndex].name)}` : undefined}
  onkeydown={handleKeydown}
>
  <div class="border-b border-border px-3 py-1.5">
    <span class="text-[10px] font-medium uppercase tracking-wider text-text-muted">Database</span>
  </div>

  {#if tables.length === 0}
    <div class="px-3 py-4 text-center text-text-muted" data-testid="db-empty">
      No tables yet. Run a migration to create tables.
    </div>
  {:else}
    {#each tables as table, i (table.name)}
      <div
        id={`db-item-${encodeURIComponent(table.name)}`}
        data-testid="db-table"
        data-table={table.name}
        role="option"
        aria-selected={expandedTable === table.name}
        class="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left hover:text-accent md:py-1
               {expandedTable === table.name ? 'bg-surface-overlay text-text' : 'text-text-muted'}
               {focusedIndex === i ? 'outline outline-1 outline-border-focus' : ''}"
        onmousedown={(e) => e.preventDefault()}
        onclick={(e) => {
          focusedIndex = i;
          toggleTable(table.name);
          (e.currentTarget as HTMLElement).closest('[role="listbox"]')?.focus();
        }}
      >
        <span class="w-3 text-[10px] text-text-muted" aria-hidden="true">
          {expandedTable === table.name ? "▼" : "▶"}
        </span>
        <span class="flex-1 truncate font-medium">{table.name}</span>
        <span class="text-[10px] text-text-muted">{table.rowCount} {table.rowCount === 1 ? "row" : "rows"}</span>
      </div>

        {#if expandedTable === table.name}
          <div class="border-b border-border pb-1">
            {#each table.columns as col}
              <div
                class="flex items-center gap-2 px-3 py-0.5"
                style="padding-left: 32px"
                data-testid="db-column"
              >
                <span class="text-text">{col.name}</span>
                <span class="text-[10px] text-info">{col.type || "ANY"}</span>
                {#if col.pk}
                  <span class="rounded bg-accent px-1 py-0 text-[9px] text-surface">PK</span>
                {/if}
                {#if col.notnull}
                  <span class="rounded bg-warning px-1 py-0 text-[9px] text-surface">NOT NULL</span>
                {/if}
              </div>
            {/each}

            {#if previewRows && previewRows.rows.length > 0}
              <div class="mx-3 mt-1 overflow-x-auto rounded bg-surface p-1" data-testid="db-preview">
                <table class="w-full text-[10px]">
                  <thead>
                    <tr>
                      {#each previewRows.columns as col}
                        <th class="px-1 py-0.5 text-left text-text-muted font-normal">{col}</th>
                      {/each}
                    </tr>
                  </thead>
                  <tbody>
                    {#each previewRows.rows as row}
                      <tr>
                        {#each row as cell}
                          <td class="px-1 py-0.5 text-text">{cell ?? "NULL"}</td>
                        {/each}
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        {/if}
    {/each}
  {/if}
</div>
