import { describe, expectTypeOf, it } from "vitest";
import type { ActionController } from "@blazetrails/actionpack";
import type { StreamsHelper } from "../lib/app/helpers/turbo/streams-helper.js";
import "../lib/engine.js";

describe("turbo.helpers view types", () => {
  it("types controller views with the engine's helpers", () => {
    expectTypeOf<(typeof ActionController.Base)["_helpers"]["turboStreamFrom"]>().toEqualTypeOf<
      (typeof StreamsHelper)["turboStreamFrom"]
    >();
  });
});
