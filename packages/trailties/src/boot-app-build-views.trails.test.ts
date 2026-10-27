import fs from "node:fs";
import path from "node:path";
import { buildViews } from "@blazetrails/trails-tsc";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Application } from "./application.js";
import { Trails } from "./rails.js";

describe("trails-tsc build views inside a booted app", () => {
  const root = new URL("./__fixtures__/boot-app", import.meta.url).pathname;
  let outDir: string;

  beforeAll(async () => {
    await import("./__fixtures__/boot-app/config/application.js");
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

    const names = Trails.application!.routes().namedRoutes.helperNames();
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  }, 30_000);
});
