import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Dir, File, getFs } from "@blazetrails/ruby-compat";
import { invoke } from "../../lib/command.js";

async function trailsNew(...args: string[]) {
  await invoke("application", [
    "new",
    "my-app",
    "--skip-git",
    "--skip-install",
    "--skip-docker",
    ...args,
  ]);
}

describe("NewCommand", () => {
  let tmpDir: string;
  let cwd: string;

  beforeEach(async () => {
    cwd = Dir.pwd();
    tmpDir = await Dir.mktmpdir("trails-new-");
    Dir.chdir(tmpDir);
  });

  afterEach(async () => {
    Dir.chdir(cwd);
    await getFs().rm!(tmpDir, { recursive: true, force: true });
  });

  const app = (path: string) => File.isExist(File.join(tmpDir, "my-app", path));

  it("parses a class option", async () => {
    await trailsNew("--skip-ci");
    expect(app("package.json")).toBe(true);
    expect(app(".github")).toBe(false);
  });

  it("parses an alias", async () => {
    await trailsNew("-d", "postgresql");
    const packageJson = await File.readAsync(File.join(tmpDir, "my-app", "package.json"));
    expect(packageJson).toContain('"pg"');
  });

  it("parses a --no- negation", async () => {
    await trailsNew("--skip-eslint", "--no-skip-eslint");
    expect(app("eslint.config.mjs")).toBe(true);
  });
});
