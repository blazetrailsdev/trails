import { describe, it, expect } from "vitest";
import { ArgumentError, registerConstant } from "@blazetrails/ruby-compat";

import { Rescuable } from "./rescuable.js";

describe("Rescuable.ClassMethods.rescueFrom", () => {
  it("raises ArgumentError for a module that does not respond to ===", () => {
    const NoCaseEquals = {};
    registerConstant("NoCaseEquals", NoCaseEquals);
    const host = { rescueHandlers: [] as unknown[][] };
    expect(() => Rescuable.ClassMethods.rescueFrom.call(host, NoCaseEquals, { with: "x" })).toThrow(
      ArgumentError,
    );
    expect(host.rescueHandlers).toEqual([]);
  });
});
