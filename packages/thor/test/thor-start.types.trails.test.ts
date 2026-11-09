import { describe, expectTypeOf, it } from "vitest";
import { Thor } from "../lib/thor.js";

describe("Thor subclass static start", () => {
  it("is typed on a subclass without a cast", () => {
    class Cli extends Thor {}
    expectTypeOf(Cli.start).parameter(0).toEqualTypeOf<string[] | undefined>();
    expectTypeOf<ReturnType<typeof Cli.start>>().toEqualTypeOf<Promise<unknown>>();
  });
});
