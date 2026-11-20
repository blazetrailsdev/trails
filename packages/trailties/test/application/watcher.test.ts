import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { include } from "@blazetrails/ruby-compat";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";
import { Trails } from "../../lib/trails.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface WatcherTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class WatcherTest extends TestCase {}
include(WatcherTest, Isolation);
registerSpecType(/^WatcherTest$/, WatcherTest);

describe("WatcherTest", { timeout: 120_000 }, () => {
  let t: WatcherTest;

  beforeEach(async () => {
    t = new WatcherTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("watchable_args does NOT include files in autoload path", async () => {
    await t.appFile("app/README.md", "");

    await import(`${await t.trailsRoot()}/config/environment.ts`);

    const [files] = Trails.application!.watchableArgs();
    expect(files).not.toContain(`${await t.trailsRoot()}/app/README.md`);
  });

  it("watchable_args does include dirs in autoload path", async () => {
    await t.addToConfig(
      `this.config.autoloadPaths.push(\`${await t.trailsRoot()}/manually-specified-path\`);`,
    );
    await t.appDir("app/automatically-specified-path");
    await t.appDir("manually-specified-path");

    await import(`${await t.trailsRoot()}/config/environment.ts`);

    const [, dirs] = Trails.application!.watchableArgs();

    expect(Object.keys(dirs)).toContain(`${await t.trailsRoot()}/app/automatically-specified-path`);
    expect(Object.keys(dirs)).toContain(`${await t.trailsRoot()}/manually-specified-path`);
  });
});
