import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { rescueFrom } from "./module-ext.js";
import { Fanout } from "./notifications/fanout.js";
import { numberToHuman } from "./number-helper.js";

describe("raise sites Rails has and the port had dropped", () => {
  it("rescue_from raises without a handler", () => {
    expect(() => rescueFrom.call({}, Error)).toThrow(
      new ArgumentError("Need a handler. Pass the with: keyword argument or provide a block."),
    );
  });

  it("rescue_from raises on a key that is neither a class nor a String", () => {
    expect(() => rescueFrom.call({}, 42 as never, { with: () => {} })).toThrow(
      new ArgumentError("42 must be an Exception class or a String referencing an Exception class"),
    );
  });

  it("Fanout#subscribe raises on a pattern that is not a String, Regexp or nil", () => {
    expect(() => new Fanout().subscribe(42 as never, () => {})).toThrow(
      new ArgumentError("pattern must be specified as a String, Regexp or empty"),
    );
  });

  it("number_to_human raises on :units that is not a Hash or String", () => {
    expect(() => numberToHuman(1234, { units: 42 as never })).toThrow(
      new ArgumentError(":units must be a Hash or String translation scope."),
    );
  });
});
