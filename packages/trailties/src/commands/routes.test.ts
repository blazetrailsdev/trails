import { describe, it, expect } from "vitest";
import type { ThorClass } from "@blazetrails/thor";
import { lookupBang, subclasses } from "../command/behavior.js";
import { RoutesCommand } from "./routes.js";

await lookupBang();

const classOptions = () => (RoutesCommand as unknown as ThorClass).classOptions();

describe("RoutesCommand", () => {
  it("is registered on the program", () => {
    expect(subclasses()).toContain(RoutesCommand);
  });

  it("does not register invokeCommand as a command", () => {
    expect(Object.keys((RoutesCommand as unknown as ThorClass).allCommands())).not.toContain(
      "invoke-command",
    );
  });

  it("has --grep option", () => {
    expect(classOptions().grep.switchName).toBe("--grep");
  });

  it("has the class options RoutesCommand declares", () => {
    expect(Object.values(classOptions()).map((o) => o.switchName)).toEqual(
      expect.arrayContaining(["--controller", "--grep", "--expanded"]),
    );
  });
});
