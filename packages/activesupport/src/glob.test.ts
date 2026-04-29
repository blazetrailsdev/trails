import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Import via the public subpath so the vitest alias is exercised — same
// pattern other tests use for /message-verifier, /temporal, etc.
import { glob } from "@blazetrails/activesupport/glob";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "glob-test-"));
  // Layout:
  //   foo.rb
  //   bar.txt
  //   .hidden
  //   app/models/{user,post,admin}.rb
  //   app/controllers/application_controller.rb
  //   lib/tasks/deploy.rake
  for (const f of ["foo.rb", "bar.txt", ".hidden"]) {
    writeFileSync(join(root, f), "");
  }
  mkdirSync(join(root, "app", "models"), { recursive: true });
  mkdirSync(join(root, "app", "controllers"), { recursive: true });
  mkdirSync(join(root, "lib", "tasks"), { recursive: true });
  for (const f of ["user.rb", "post.rb", "admin.rb"]) {
    writeFileSync(join(root, "app", "models", f), "");
  }
  writeFileSync(join(root, "app", "controllers", "application_controller.rb"), "");
  writeFileSync(join(root, "lib", "tasks", "deploy.rake"), "");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("glob", () => {
  it("matches *.ext at root only", async () => {
    expect(await glob("*.rb", { cwd: root })).toEqual(["foo.rb"]);
  });

  it("matches **/*.ext at any depth", async () => {
    expect(await glob("**/*.rb", { cwd: root })).toEqual([
      "app/controllers/application_controller.rb",
      "app/models/admin.rb",
      "app/models/post.rb",
      "app/models/user.rb",
      "foo.rb",
    ]);
  });

  it("supports a path prefix with **", async () => {
    expect(await glob("app/**/*.rb", { cwd: root })).toEqual([
      "app/controllers/application_controller.rb",
      "app/models/admin.rb",
      "app/models/post.rb",
      "app/models/user.rb",
    ]);
  });

  it("supports brace expansion", async () => {
    expect(await glob("**/*.{rb,rake}", { cwd: root })).toEqual([
      "app/controllers/application_controller.rb",
      "app/models/admin.rb",
      "app/models/post.rb",
      "app/models/user.rb",
      "foo.rb",
      "lib/tasks/deploy.rake",
    ]);
  });

  it("supports an array of patterns with negation", async () => {
    expect(await glob(["**/*.rb", "!**/admin.rb"], { cwd: root })).toEqual([
      "app/controllers/application_controller.rb",
      "app/models/post.rb",
      "app/models/user.rb",
      "foo.rb",
    ]);
  });

  it("hides dotfiles by default", async () => {
    expect(await glob("*", { cwd: root })).not.toContain(".hidden");
  });

  it("includes dotfiles when dot:true", async () => {
    expect(await glob("*", { cwd: root, dot: true })).toContain(".hidden");
  });

  it("returns empty array for unmatched patterns", async () => {
    expect(await glob("nonexistent/**/*.zzz", { cwd: root })).toEqual([]);
  });
});
