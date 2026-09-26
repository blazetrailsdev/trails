import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { destroyCommand } from "./destroy.js";
import { Generators } from "../generators.js";

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
    const routes = "export default (mapper) => {\n  // routes\n};\n";
    fs.writeFileSync(path.join(tmpDir, "config", "routes.ts"), routes);
    fs.mkdirSync(path.join(tmpDir, "app", "views", "layouts"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "app", "views", "layouts", "application.html.tse"), "");
    const before = listFiles(tmpDir);

    process.chdir(tmpDir);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await Generators.invoke("scaffold", ["Post", "title:string"], {
      cwd: tmpDir,
      output: () => {},
    });
    const generated = listFiles(tmpDir);
    expect(generated).toContain("app/views/posts/index.html.tse");
    expect(generated.some((f) => /^db\/migrate\/\d+_create_posts\.ts$/.test(f))).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, "config", "routes.ts"), "utf-8")).not.toBe(routes);

    await destroyCommand()
      .exitOverride()
      .parseAsync(["scaffold", "Post", "title:string"], { from: "user" });
    log.mockRestore();

    expect(listFiles(tmpDir)).toEqual(before);
    expect(fs.readFileSync(path.join(tmpDir, "config", "routes.ts"), "utf-8")).toBe(routes);
  });
});
