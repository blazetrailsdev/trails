import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildViews } from "./build-views.js";
import { runCli } from "./cli.js";

function mkScratch(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "trails-tsc-build-"));
}

function write(root: string, rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

describe("buildViews", () => {
  it("mirrors .tse files to .trails/views/ with .ts shim + .js runtime", () => {
    const cwd = mkScratch();
    write(cwd, "app/views/users/show.html.tse", "<h1><%= name %></h1>");
    write(cwd, "app/views/users/edit.html.tse", "<%# locals: (name:) %>edit");
    write(cwd, "app/views/posts/index.html.tse", "list");

    const { count, files } = buildViews({ cwd });

    expect(count).toBe(3);
    expect(files).toEqual(["posts/index.html.tse", "users/edit.html.tse", "users/show.html.tse"]);

    const shim = fs.readFileSync(path.join(cwd, ".trails/views/users/show.html.tse.ts"), "utf8");
    expect(shim).toContain("export default function render(");
    expect(shim).toContain("_ob.append(name)");

    const js = fs.readFileSync(path.join(cwd, ".trails/views/users/show.html.tse.js"), "utf8");
    expect(js).toContain("export default function render(context, locals)");
    expect(js).toContain("_ob.append(name)");
    expect(js).not.toContain("RenderContext");
  });

  it("emits a lazy-thunk manifest keyed by `<name>.<format>`", () => {
    const cwd = mkScratch();
    write(cwd, "app/views/users/show.html.tse", "ok");
    write(cwd, "app/views/users/show.json.tse", "{}");

    buildViews({ cwd });

    const manifest = fs.readFileSync(path.join(cwd, ".trails/views-manifest.ts"), "utf8");
    expect(manifest).toContain('"users/show.html": () => import("./views/users/show.html.tse.js")');
    expect(manifest).toContain('"users/show.json": () => import("./views/users/show.json.tse.js")');
    expect(manifest).toContain("export type ViewKey = keyof typeof views;");
    expect(manifest).toContain("export type ViewsManifest = ");
    // No-edit banner survives so reviewers see the file is generated.
    expect(manifest).toContain("AUTO-GENERATED");
  });

  it("is a no-op (empty manifest) when the views dir is absent", () => {
    const cwd = mkScratch();
    const { count } = buildViews({ cwd });
    expect(count).toBe(0);
    const manifest = fs.readFileSync(path.join(cwd, ".trails/views-manifest.ts"), "utf8");
    expect(manifest).toContain("export const views = {");
    expect(manifest).toContain("} as const;");
  });

  it("clears stale outputs from a prior build", () => {
    const cwd = mkScratch();
    write(cwd, "app/views/users/show.html.tse", "first");
    write(cwd, "app/views/users/gone.html.tse", "doomed");
    buildViews({ cwd });
    expect(fs.existsSync(path.join(cwd, ".trails/views/users/gone.html.tse.js"))).toBe(true);

    fs.rmSync(path.join(cwd, "app/views/users/gone.html.tse"));
    const { count } = buildViews({ cwd });
    expect(count).toBe(1);
    expect(fs.existsSync(path.join(cwd, ".trails/views/users/gone.html.tse.js"))).toBe(false);
    expect(fs.existsSync(path.join(cwd, ".trails/views/users/gone.html.tse.ts"))).toBe(false);
    const manifest = fs.readFileSync(path.join(cwd, ".trails/views-manifest.ts"), "utf8");
    expect(manifest).not.toContain("gone.html");
  });

  it("refuses to build when outDir is a symlink escaping cwd", () => {
    const cwd = mkScratch();
    const elsewhere = mkScratch();
    // `.trails` inside cwd is a symlink to a sibling tempdir. Lexically
    // the mirror path is fine; realpath check must catch the escape.
    fs.symlinkSync(elsewhere, path.join(cwd, ".trails"));
    write(cwd, "app/views/home.html.tse", "x");
    expect(() => buildViews({ cwd })).toThrow(/symlink escape/);
    // Sanity: the symlinked-to dir was not wiped.
    expect(fs.existsSync(elsewhere)).toBe(true);
  });

  it("honors custom viewsDir / outDir", () => {
    const cwd = mkScratch();
    write(cwd, "src/templates/home.html.tse", "hi");
    buildViews({ cwd, viewsDir: "src/templates", outDir: "build/.gen" });
    expect(fs.existsSync(path.join(cwd, "build/.gen/views/home.html.tse.js"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, "build/.gen/views-manifest.ts"))).toBe(true);
  });
});

describe("runCli", () => {
  it("dispatches `build` to buildViews with --cwd", () => {
    const cwd = mkScratch();
    write(cwd, "app/views/home.html.tse", "x");
    const rc = runCli(["build", "--cwd", cwd]);
    expect(rc).toBe(0);
    expect(fs.existsSync(path.join(cwd, ".trails/views/home.html.tse.js"))).toBe(true);
  });

  it("rejects unknown commands with a non-zero exit", () => {
    expect(runCli(["bogus"])).toBe(1);
  });

  it("rejects a value-flag without a value", () => {
    expect(runCli(["build", "--cwd"])).toBe(1);
  });

  it("catches buildViews errors and returns 1 instead of throwing", () => {
    // outDir resolving outside cwd trips the safety guard; the CLI must
    // surface that as a clean stderr message + non-zero exit, not a stack.
    const cwd = mkScratch();
    expect(runCli(["build", "--cwd", cwd, "--out", "/tmp/elsewhere"])).toBe(1);
  });

  it("prints usage for --help and exits 0", () => {
    expect(runCli(["--help"])).toBe(0);
  });

  afterEach(() => vi.restoreAllMocks());

  it("`dev` starts the watcher synchronously and runs an initial build", () => {
    // Stub `process.exit` so the `dev` SIGINT handler can call it
    // during teardown without actually killing the vitest process.
    vi.spyOn(process, "exit").mockImplementation(((_c?: number) => undefined) as never);
    const cwd = mkScratch();
    write(cwd, "app/views/home.html.tse", "hi");
    const rc = runCli(["dev", "--cwd", cwd]);
    expect(rc).toBe(0);
    expect(fs.existsSync(path.join(cwd, ".trails/views/home.html.tse.js"))).toBe(true);
    process.emit("SIGINT");
  });
});
