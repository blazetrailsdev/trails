import fs from "node:fs";
import path from "node:path";
import { buildViews } from "@blazetrails/trails-tsc";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Application } from "../lib/application.js";
import { Trails } from "../lib/trails.js";

describe("trails-tsc build views inside a booted app", () => {
  const root = new URL("./fixtures/boot-app", import.meta.url).pathname;
  let outDir: string;

  beforeAll(async () => {
    await import("./fixtures/boot-app/config/application.js");
    Trails.application!.config.setRoot(root);
    await Trails.initialize();
    outDir = path.join(root, ".trails-build-views-test");
  }, 15_000);

  afterAll(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
    Trails.application = null;
    Application.appClass = null;
  });

  it("loads the routes through the reloader, drawing them once", async () => {
    await buildViews({ cwd: root, outDir });

    const augmentation = fs.readFileSync(path.join(outDir, "routes-augmentation.d.ts"), "utf8");
    expect(augmentation).toContain("postsPath(...args: unknown[]): string;");
  }, 30_000);
});
