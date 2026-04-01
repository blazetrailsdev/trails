<script lang="ts">
  import { onMount } from "svelte";
  import initSqlJs from "sql.js";
  import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
  import { SqlJsAdapter } from "$lib/frontiers/sql-js-adapter.js";
  import { VirtualFS } from "$lib/frontiers/virtual-fs.js";
  import FileTree from "$lib/frontiers/components/sandbox/FileTree.svelte";

  let vfs = $state<VirtualFS | null>(null);
  let selectedPath = $state("");

  onMount(async () => {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    const adapter = new SqlJsAdapter(new SQL.Database());
    const v = new VirtualFS(adapter);

    // Seed with a realistic project structure
    v.write("package.json", '{ "name": "docs" }');
    v.write("tsconfig.json", '{ "compilerOptions": {} }');
    v.write("src/config/application.ts", 'export const app = { name: "docs" };');
    v.write("src/config/routes.ts", "// routes");
    v.write("src/config/database.ts", 'export default { adapter: "sqlite3" };');
    v.write("src/app/models/user.ts", 'import { Base } from "@blazetrails/activerecord";\n\nexport class User extends Base {\n  static {\n    this.attribute("name", "string");\n    this.attribute("email", "string");\n  }\n}');
    v.write("src/app/models/post.ts", 'import { Base } from "@blazetrails/activerecord";\n\nexport class Post extends Base {\n  static {\n    this.attribute("title", "string");\n    this.attribute("body", "text");\n  }\n}');
    v.write("src/app/controllers/application-controller.ts", "class ApplicationController {}");
    v.write("src/app/controllers/posts-controller.ts", "class PostsController {}");
    v.write("db/migrations/20260401120000-create-users.ts", "class CreateUsers extends Migration {}");
    v.write("db/migrations/20260401120001-create-posts.ts", "class CreatePosts extends Migration {}");
    v.write("db/seeds.ts", "// seeds");
    v.write("db/schema.ts", "// schema");
    v.write("test/models/user.test.ts", "// user tests");
    v.write("test/models/post.test.ts", "// post tests");

    vfs = v;
    selectedPath = "src/app/models/user.ts";
  });
</script>

<div class="flex h-screen bg-surface text-text">
  <div class="w-64 border-r border-border">
    {#if vfs}
      <FileTree {vfs} {selectedPath} onselect={(p) => selectedPath = p} />
    {/if}
  </div>
  <div class="flex-1 p-4">
    <p class="text-sm text-text-muted">Selected: <code class="text-accent">{selectedPath || "none"}</code></p>
    {#if vfs && selectedPath}
      <pre class="mt-2 rounded bg-surface-overlay p-3 text-xs">{vfs.read(selectedPath)?.content}</pre>
    {/if}
  </div>
</div>
