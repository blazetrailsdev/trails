import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { Dir, File, FileUtils, stdin } from "@blazetrails/ruby-compat";
import { ChangeGenerator } from "../generators/trails/db/system/change/change-generator.js";
import { DATABASES } from "../generators/database.js";
import { invoke } from "../command.js";

let appPath: string;
let originalCwd: string;

function appFile(path: string, contents: string): void {
  FileUtils.mkdirP(File.dirname(path));
  File.write(path, contents);
}

function removeFile(path: string): void {
  FileUtils.rmRf(path);
}

beforeEach(() => {
  appPath = Dir.mktmpdir("trails-db-system-change-");
  originalCwd = Dir.pwd();
  Dir.chdir(appPath);
  vi.spyOn(stdin, "gets").mockResolvedValue(null);
  appFile("tsconfig.json", "{}");
  appFile(
    "package.json",
    JSON.stringify(
      { name: "app", dependencies: { "@blazetrails/activerecord": "*", "better-sqlite3": "*" } },
      null,
      2,
    ) + "\n",
  );
  appFile(
    "Dockerfile",
    "FROM node:22-slim AS base\n" +
      "RUN apt-get update -qq && apt-get install --no-install-recommends -y build-essential git\n" +
      "RUN apt-get update -qq && apt-get install --no-install-recommends -y curl libvips sqlite3\n",
  );
});

beforeEach(async () => {
  await capture(":stdout", () => ChangeGenerator.start(["--to", "sqlite3"]));
});

afterEach(() => {
  vi.restoreAllMocks();
  Dir.chdir(originalCwd);
  FileUtils.rmRf(appPath);
});

async function trails(command: string, args: string[]): Promise<string> {
  let stdout = "";
  const stderr = await capture(":stderr", async () => {
    stdout = await capture(":stdout", () => invoke(command, args));
  });
  return stdout + stderr;
}

function changeDatabase({ to }: { to: string }, ...options: string[]): Promise<string> {
  const args = ["--to", to, ...options];
  return trails("db:system:change", args);
}

describe("Trails::Command::DbSystemChangeTest", { timeout: 30_000 }, () => {
  it("change to existing database", async () => {
    await changeDatabase({ to: "sqlite3" });

    const output = await changeDatabase({ to: "sqlite3" });

    expect(output).toMatch("identical  config/database.ts");
    expect(output).toMatch("gsub  package.json");
  });

  it("change to invalid database", async () => {
    const output = await changeDatabase({ to: "invalid-db" });

    expect(output).toMatch(
      `Invalid value for --to option. Supported preconfigurations are: ${DATABASES.join(", ")}.`,
    );
  });

  it("change to postgresql", async () => {
    const output = await changeDatabase({ to: "postgresql" });

    expect(output).toMatch("force  config/database.ts");
    expect(output).toMatch("gsub  package.json");
  });

  it("change to mysql", async () => {
    const output = await changeDatabase({ to: "mysql" });

    expect(output).toMatch("force  config/database.ts");
    expect(output).toMatch("gsub  package.json");
  });

  it("change to sqlite3", async () => {
    await changeDatabase({ to: "postgresql" });
    const output = await changeDatabase({ to: "sqlite3" });

    expect(output).toMatch("force  config/database.ts");
    expect(output).toMatch("gsub  package.json");
  });

  it("change can be forced", async () => {
    const output = await trails("db:system:change", ["--to=postgresql", "--force"]);

    expect(output).toMatch("force  config/database.ts");
    expect(output).toMatch("gsub  package.json");
  });

  it("change works with no Dockerfile", async () => {
    removeFile("Dockerfile");

    const output = await changeDatabase({ to: "sqlite3" });

    expect(output).toMatch("gsub  package.json");
  });
});
