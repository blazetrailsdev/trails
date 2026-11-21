import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { include } from "@blazetrails/ruby-compat";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";
import { hiddenCommands } from "../../lib/command.js";
import type { ThorClass } from "@blazetrails/thor";
import { lookupBang, subclasses } from "../../lib/command/behavior.js";
import { RoutesCommand } from "../../lib/commands/routes.js";
import { UnusedRoutesCommand } from "../../lib/commands/unused-routes.js";

await lookupBang();

describe("UnusedRoutesCommand", () => {
  it("is registered on the program", () => {
    expect(subclasses()).toContain(UnusedRoutesCommand);
  });

  it("is hidden, mirroring hide_command!", () => {
    expect(hiddenCommands()).toContain(UnusedRoutesCommand);
  });

  it("has the class options UnusedRoutesCommand declares", () => {
    const options = (UnusedRoutesCommand as unknown as ThorClass).classOptions();
    expect(Object.values(options).map((o) => o.switchName)).toEqual(
      expect.arrayContaining(["--controller", "--grep"]),
    );
  });

  it("routes gains the -u/--unused class option", () => {
    const unused = (RoutesCommand as unknown as ThorClass).classOptions().unused;
    expect(unused.aliases).toEqual(["-u"]);
  });
});

const routes = (body: string): string => `
  import { Trails } from "@blazetrails/trailties";
  Trails.application!.routes().draw(function () {
    ${body}
  });
`;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface UnusedRoutesTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class UnusedRoutesTest extends TestCase {
  runUnusedRoutesCommand(args: string[] = [], { allowFailure = false } = {}): Promise<string> {
    return this.trails("unused_routes", args, { allowFailure });
  }
}
include(UnusedRoutesTest, Isolation);

describe("Trails::Command::UnusedRoutesTest", { timeout: 120_000 }, () => {
  let t: UnusedRoutesTest;

  beforeEach(async () => {
    t = new UnusedRoutesTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("filter by grep", async () => {
    await t.appFile(
      "config/routes.ts",
      routes(`this.get("/one", { to: "posts#one" });
    this.get("/two", { to: "users#two" });`),
    );

    expect(await t.runUnusedRoutesCommand(["-g", "one"], { allowFailure: true })).toContain(
      `Found 1 unused route:

Prefix Verb URI Pattern    Controller#Action
   one GET  /one(.:format) posts#one
`,
    );
  });

  it("filter by controller", async () => {
    await t.appFile(
      "config/routes.ts",
      routes(`this.get("/one", { to: "posts#one" });
    this.get("/two", { to: "users#two" });`),
    );

    expect(await t.runUnusedRoutesCommand(["-c", "posts"], { allowFailure: true })).toContain(
      `Found 1 unused route:

Prefix Verb URI Pattern    Controller#Action
   one GET  /one(.:format) posts#one
`,
    );
  });
});
