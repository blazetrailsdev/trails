import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { Base, Template, TseHandler } from "@blazetrails/actionview";
import { AppGenerator } from "../generators/app-generator.js";
import {
  ViteManifest,
  loadViteManifest,
  setViteManifest,
  computeAssetPath,
} from "./vite-manifest.js";

let tmpDir: string | undefined;

afterEach(() => {
  setViteManifest(new ViteManifest());
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

async function generateApp(): Promise<string> {
  tmpDir = fs.mkdtempSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "trails-vite-manifest-"),
  );
  await new AppGenerator({
    cwd: tmpDir,
    output: () => {},
    appPath: "my-app",
    database: "sqlite",
    skipDocker: true,
  }).run();
  return path.join(tmpDir, "my-app");
}

function renderLayout(root: string): string {
  const source = fs.readFileSync(
    path.join(root, "app", "views", "layouts", "application.html.tse"),
    "utf-8",
  );
  const view = new (Base.withEmptyTemplateCache())(null, {}, null);
  (view as unknown as Record<string, unknown>)["computeAssetPath"] = computeAssetPath;
  return new Template({
    source,
    identifier: "application.html.tse",
    extension: "tse",
    handler: new TseHandler(),
  })
    .render(view, {})
    .toString();
}

describe("the generated layout's stylesheet", () => {
  it("renders the digested file the build emitted", async () => {
    const root = await generateApp();
    const result = (await build({
      root: path.join(root, "app"),
      configFile: path.join(root, "vite.config.ts"),
      logLevel: "warn",
    })) as { output: { fileName: string }[] };
    const emitted = result.output
      .map((chunk) => chunk.fileName)
      .find((fileName) => /application-.*\.css$/.test(fileName))!;
    expect(fs.existsSync(path.join(root, "public", "assets", emitted))).toBe(true);

    setViteManifest(await loadViteManifest(root));

    expect(renderLayout(root)).toContain(`href="/assets/${emitted}"`);
  }, 60_000);

  it("renders the path Vite's dev server serves when no build has run", async () => {
    const root = await generateApp();

    setViteManifest(await loadViteManifest(root));

    expect(renderLayout(root)).toContain('href="/assets/stylesheets/application.css"');
  }, 30_000);
});
