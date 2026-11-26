import { Dir } from "@blazetrails/ruby-compat/dir";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { beforeEach, describe, expect, it } from "vitest";
import { DevcontainerGenerator } from "../../lib/generators/trails/devcontainer/devcontainer-generator.js";
import { TestCase } from "../../lib/generators/test-case.js";
import { assertDevcontainerJsonFile } from "./generators-test-helper.js";

class DevcontainerGeneratorTrailsTest extends TestCase {}
DevcontainerGeneratorTrailsTest.destination(Dir.mktmpdir());
DevcontainerGeneratorTrailsTest.tests(DevcontainerGenerator);
registerSpecType(/^DevcontainerGeneratorTrailsTest$/, DevcontainerGeneratorTrailsTest);
let t: TestCase;

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
});

describe("DevcontainerGeneratorTrailsTest", () => {
  it("dockerfile content", async () => {
    await t.generator([], { nodeVersion: "20.0.0" }).invokeAll();

    await t.assertFile(".devcontainer/Dockerfile", (dockerfile) => {
      expect(dockerfile).toContain("ARG NODE_VERSION=20.0.0");
      expect(dockerfile).toContain(
        "FROM mcr.microsoft.com/devcontainers/javascript-node:1-${NODE_VERSION}",
      );
    });
  });

  it("sqlite driver node sqlite", async () => {
    await t.generator([], { sqliteDriver: "node-sqlite" }).invokeAll();

    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(devcontainerJson.features).not.toHaveProperty(
        "ghcr.io/rails/devcontainer/features/sqlite3",
      );
    });
  });
});
