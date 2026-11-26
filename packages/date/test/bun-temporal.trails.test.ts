import { describe, expect, it } from "vitest";
import { runtime } from "@blazetrails/ruby-compat";
import "@blazetrails/date";

describe("bun-temporal", () => {
  it.skipIf(runtime() !== "bun")("seats a global Temporal under Bun", () => {
    expect(Temporal.Now.instant()).toBeInstanceOf(Temporal.Instant);
  });
});
