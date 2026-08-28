/**
 * `ActiveRecord::AttributeMethods::Dirty`'s `included do` block opens with a
 * guard Rails has no test for (activerecord/lib/active_record/attribute_methods/
 * dirty.rb:44-47) — `if self < ::ActiveRecord::Timestamp` — so this pins it on
 * the trails side.
 */
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
    // Base includes Dirty (base.ts) well before Timestamp::InstanceMethods, so
    // its hook ran to completion — the class_attributes it issues are the
    // receipt.
    expect(Base.partialUpdates).toBe(true);
    expect(Base.partialInserts).toBe(true);
  });
});
