// Trails-only: Rails has no Vite pipeline, so there is no counterpart test.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { Base, Template, TseHandler } from "@blazetrails/actionview";
import { AppGenerator } from "../generators/app-generator.js";
import { computeAssetPath, loadManifest, resetManifest } from "./assets.js";

let tmpDir: string | undefined;

beforeEach(() => {
  (Base.prototype as unknown as Record<string, unknown>)["computeAssetPath"] = computeAssetPath;
});

afterEach(() => {
  resetManifest();
  delete (Base.prototype as unknown as Record<string, unknown>)["computeAssetPath"];
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

async function generateApp(): Promise<string> {
  tmpDir = fs.mkdtempSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "trails-assets-"),
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
    path.join(root, "app/views/layouts/application.html.tse"),
    "utf-8",
  );
  const view = new (Base.withEmptyTemplateCache())(null, {}, null);
  view.viewFlow.set("layout", "<p>body</p>");
  return new Template({
    source,
    identifier: "application.html.tse",
    extension: "tse",
    handler: new TseHandler(),
  })
    .render(view, {})
    .toString();
}

describe("the generated layout's stylesheet link", () => {
  it("resolves to the hashed file vite build emitted", async () => {
    const root = await generateApp();
    await build({
      root: path.join(root, "app"),
      configFile: path.join(root, "vite.config.ts"),
      logLevel: "warn",
    });
    await loadManifest(root);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "public/assets/.vite/manifest.json"), "utf-8"),
    ) as Record<string, { file: string }>;
    const emitted = manifest["assets/stylesheets/application.css"].file;

    expect(renderLayout(root)).toContain(`href="/assets/${emitted}"`);
    expect(fs.existsSync(path.join(root, "public/assets", emitted))).toBe(true);
  }, 60_000);

  it("falls back to the dev path when no build has run", async () => {
    const root = await generateApp();
    await loadManifest(root);

    expect(renderLayout(root)).toContain('href="/assets/stylesheets/application.css"');
  }, 60_000);
});

describe("computeAssetPath", () => {
  it("returns the undigested public path with no manifest loaded", () => {
    expect(computeAssetPath("application.css", { type: "stylesheet" })).toBe(
      "/assets/stylesheets/application.css",
    );
  });
});
