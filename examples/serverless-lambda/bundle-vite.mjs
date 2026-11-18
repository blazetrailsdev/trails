// Builds the app as a Vite (Rollup) SSR bundle and serves one request from it, the check for
// Vite-based serverless hosts. Run after `pnpm build`, which writes `.trails/`.
import { build } from "vite";
import { copyFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

await build({
  root: import.meta.dirname,
  configFile: false,
  logLevel: "error",
  esbuild: { tsconfigRaw: "{}" },
  ssr: { noExternal: true, external: ["libxml2-wasm"] },
  build: {
    ssr: "serverless/lambda.ts",
    outDir: "dist-vite",
    target: "node22",
    minify: false,
    rollupOptions: {
      output: {
        format: "es",
        banner:
          "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
      },
    },
  },
});

const db = join(await mkdtemp(join(tmpdir(), "trails-vite-")), "spike.sqlite3");
await copyFile(join(import.meta.dirname, "db/spike.sqlite3"), db);
process.env.SQLITE_PATH = db;
process.env.TRAILS_ENV ??= "production";
const { fetch } = await import(join(import.meta.dirname, "dist-vite/lambda.js"));
const response = await fetch(new globalThis.Request("http://local/posts"));
const body = await response.text();
if (response.status !== 200 || !body.includes("<h1>Posts</h1>")) {
  console.error(response.status, body);
  process.exit(1);
}
console.log("vite ssr bundle served GET /posts 200");
