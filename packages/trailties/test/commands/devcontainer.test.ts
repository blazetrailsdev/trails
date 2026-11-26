import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { Dir } from "@blazetrails/ruby-compat/dir";
import { File } from "@blazetrails/ruby-compat/file";
import { include } from "@blazetrails/ruby-compat/include";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface DevcontainerTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class DevcontainerTest extends TestCase {}
include(DevcontainerTest, Isolation);

describe("Trails::Command::DevcontainerTest", { timeout: 120_000 }, () => {
  let t: DevcontainerTest;

  beforeEach(() => {
    t = new DevcontainerTest("test");
  });

  afterEach(() => t.teardownApp());

  const readFile = async (relative: string) => File.readAsync(await t.appPath(relative));

  // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose".
  it.skip("generates devcontainer for default app with solid gems", async () => {
    await t.buildApp();

    const solidCable: string = "@blazetrails/solid-cable";
    const solidQueue: string = "@blazetrails/solid-queue";
    await import(solidCable);
    await import(solidQueue);

    const output = await t.trails("devcontainer");

    expect(output).toMatch("appName: app_template");
    expect(output).toMatch("database: sqlite3");
    expect(output).toMatch("activeStorage: true");
    expect(output).toMatch("redis: false");
    expect(output).toMatch("systemTest: true");
    expect(output).toMatch("node: false");
    expect(output).toMatch("kamal: false");
  });

  it("generates dev container for without solid gems", async () => {
    await t.buildApp();

    const output = await t.trails("devcontainer");

    expect(output).toMatch("redis: true");
  });

  it("generates dev container for using mysql2 app", async () => {
    await t.buildApp();

    await Dir.chdir(await t.appPath(), async () => {
      await t.useMysql2();

      const output = await t.trails("devcontainer");

      expect(output).toMatch("database: mysql");

      expect(await readFile(".devcontainer/devcontainer.json")).toMatch(
        "ghcr.io/rails/devcontainer/features/mysql-client",
      );
    });
  });
});
