import { capture } from "@blazetrails/activesupport";
import { describe, it, expect, beforeAll, beforeEach, afterEach, onTestFinished, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DestroyCommand } from "./destroy.js";
import { createProgram } from "../cli.js";
import { invoke as commandInvoke } from "../command.js";
import { Generators } from "../generators.js";
import { Application } from "../application.js";
import { Trails } from "../rails.js";
import "../trailties/active-record.js";

class DestroyCommandApp extends Application {}

beforeAll(async () => {
  Trails.application = DestroyCommandApp.instance();
  await Trails.application.loadGenerators();
});

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  originalCwd = process.cwd();
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function listFiles(root: string): string[] {
  return (fs.readdirSync(root, { recursive: true }) as string[])
    .filter((f) => fs.statSync(path.join(root, f)).isFile())
    .sort();
}

describe("DestroyCommand", () => {
  it("revokes everything a scaffold generate created, including views and the routes line", async () => {
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
    fs.mkdirSync(path.join(tmpDir, "config"));
    const routes = "Trails.application!.routes().draw(function () {\n});\n";
    fs.writeFileSync(path.join(tmpDir, "config", "routes.ts"), routes);
    fs.mkdirSync(path.join(tmpDir, "app", "views", "layouts"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "app", "views", "layouts", "application.html.tse"), "");
    const before = listFiles(tmpDir);

    process.chdir(tmpDir);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const generateOutput = await capture(":stdout", () =>
      Generators.invoke("scaffold", ["Post", "title:string"], {
        destinationRoot: tmpDir,
      }),
    );
    expect(generateOutput).toMatch(/invoke\s+resource_route/);
    const generated = listFiles(tmpDir);
    expect(generated).toContain("app/views/posts/index.html.tse");
    expect(generated.some((f) => /^db\/migrate\/\d+_create_posts\.ts$/.test(f))).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, "config", "routes.ts"), "utf-8")).not.toBe(routes);

    const destroyOutput = await capture(":stdout", () =>
      DestroyCommand.perform("destroy", ["scaffold", "Post", "title:string"], {}),
    );
    log.mockRestore();
    expect(destroyOutput).toMatch(/invoke\s+resource_route/);

    expect(listFiles(tmpDir)).toEqual(before);
    expect(fs.readFileSync(path.join(tmpDir, "config", "routes.ts"), "utf-8")).toBe(routes);
  });

  it("a pretended revoke reports but leaves files and the routes line in place", async () => {
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
    fs.mkdirSync(path.join(tmpDir, "config"));
    fs.writeFileSync(
      path.join(tmpDir, "config", "routes.ts"),
      "Trails.application!.routes().draw(function () {\n});\n",
    );
    await Generators.invoke("scaffold", ["Post"], { destinationRoot: tmpDir });
    const generated = listFiles(tmpDir);
    const routes = fs.readFileSync(path.join(tmpDir, "config", "routes.ts"), "utf-8");

    const output = await capture("stdout", () =>
      Generators.invoke("scaffold", ["Post", "--pretend"], {
        destinationRoot: tmpDir,
        behavior: "revoke",
      }),
    );

    expect(output).toMatch(/^ +remove +app\/models\/post\.ts$/m);
    expect(listFiles(tmpDir)).toEqual(generated);
    expect(fs.readFileSync(path.join(tmpDir, "config", "routes.ts"), "utf-8")).toBe(routes);
  });

  it("is not registered on the program", () => {
    expect(createProgram().commands.some((c) => c.name() === "destroy")).toBe(false);
  });

  it("resolves both spellings of a generator name", async () => {
    const invoke = vi.spyOn(Generators, "invoke").mockResolvedValue();
    onTestFinished(() => invoke.mockRestore());
    await commandInvoke("destroy", ["scaffold_controller", "Post"]);
    await commandInvoke("destroy", ["scaffold-controller", "Post"]);
    expect(invoke.mock.calls.map((c) => c[0])).toEqual([
      "scaffold_controller",
      "scaffold-controller",
    ]);
    expect(await Generators.findByNamespace("scaffold_controller")).toBe(
      await Generators.findByNamespace("scaffold-controller"),
    );
  });
});
