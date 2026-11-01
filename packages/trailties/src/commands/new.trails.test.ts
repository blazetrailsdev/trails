import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Dir, File, getFs } from "@blazetrails/ruby-compat";
import { createProgram } from "../cli.js";
import { lookupBang } from "../command/behavior.js";

await lookupBang();

async function trailsNew(...args: string[]) {
  await createProgram().parseAsync(
    ["new", "my-app", "--skip-git", "--skip-bundle", "--skip-docker", ...args],
    { from: "user" },
  );
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

  it("is registered on the program", () => {
    expect(createProgram().commands.some((c) => c.name() === "new")).toBe(true);
  });

  it("declares no commander options", () => {
    const cmd = createProgram().commands.find((c) => c.name() === "new");
    expect(cmd?.options).toEqual([]);
  });

  it("parses a class option commander never listed", async () => {
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
