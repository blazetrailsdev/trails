import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";
import { Base } from "../index.js";
import { Dirty } from "./dirty.js";
import * as Timestamp from "../timestamp.js";

describe("including Dirty after Timestamp", () => {
  it("raises 'You cannot include Dirty after Timestamp'", () => {
    class Model {}
    include(Model, Timestamp.InstanceMethods);
    expect(() => include(Model, Dirty)).toThrow("You cannot include Dirty after Timestamp");
  });

  it("does not raise for Base, which includes Dirty first", () => {
    expect(Base.partialUpdates).toBe(true);
    expect(Base.partialInserts).toBe(true);
  });
});
