import { describe, it, expect } from "vitest";
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
