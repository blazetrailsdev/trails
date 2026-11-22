import { describe, expectTypeOf, it } from "vitest";
import type { Base } from "@blazetrails/actionview";
import type { StreamsHelper } from "../lib/app/helpers/turbo/streams-helper.js";
import "../lib/engine.js";

describe("turbo.helpers view types", () => {
  it("types every view with the engine's helpers", () => {
    expectTypeOf<Base["turboStreamFrom"]>().toEqualTypeOf<
      (typeof StreamsHelper)["turboStreamFrom"]
    >();
  });
});
