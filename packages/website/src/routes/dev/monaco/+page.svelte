<script lang="ts">
  import MonacoEditor from "$lib/frontiers/components/sandbox/MonacoEditor.svelte";
  import type { HighlightRange } from "$lib/frontiers/tutorials/types.js";

  const sampleCode = `import { Base } from "@blazetrails/activerecord";

export class User extends Base {
  static {
    this.attribute("name", "string");
    this.attribute("email", "string");
    this.attribute("created_at", "datetime");
    this.attribute("updated_at", "datetime");
  }

  // Validate presence of name
  static validations = {
    name: { presence: true },
    email: { presence: true, format: /^[^@]+@[^@]+$/ },
  };

  get displayName(): string {
    return this.name || this.email;
  }
}`;

  const highlights: HighlightRange[] = [
    { startLine: 5, endLine: 6 },
    { startLine: 14, endLine: 15 },
  ];

  let showHighlights = $state(true);
</script>

<div class="flex h-screen flex-col bg-surface text-text">
  <div class="flex items-center gap-4 border-b border-border px-4 py-2">
    <span class="text-sm text-text-muted">Monaco Editor — earth-tone theme</span>
    <label class="flex items-center gap-1 text-xs text-text-muted">
      <input type="checkbox" bind:checked={showHighlights} />
      Show highlights
    </label>
  </div>
  <div class="flex-1">
    <MonacoEditor
      file={{ path: "src/app/models/user.ts", content: sampleCode }}
      readonly={false}
      highlights={showHighlights ? highlights : []}
    />
  </div>
</div>
