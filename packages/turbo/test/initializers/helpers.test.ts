import { describe, expect, it } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import { rbGvGet } from "@blazetrails/ruby-compat";
import "../test-helper.js";
import { TurboStreamsTagBuilder } from "../../lib/app/controllers/turbo/streams/turbo-streams-tag-builder.js";
import { StreamsHelper } from "../../lib/app/helpers/turbo/streams-helper.js";

describe("Turbo::HelpersInInitializersTest", () => {
  it("AC::Base has the helpers in place when initializers run", () => {
    expect(rbGvGet("$dummy_ac_base_ancestors_in_initializers")).toInclude(TurboStreamsTagBuilder);
    expect(rbGvGet("$dummy_ac_base_helpers_in_initializers")).toInclude(StreamsHelper);
  });
});
