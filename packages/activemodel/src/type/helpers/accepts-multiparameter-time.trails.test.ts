import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { DateTimeType } from "../date-time.js";
import { AcceptsMultiparameterTime } from "./accepts-multiparameter-time.js";

describe("AcceptsMultiparameterTime", () => {
  it("reaches super when a subclass re-includes the mixin its parent already has", () => {
    class Reincluded extends DateTimeType {}
    include(Reincluded, new AcceptsMultiparameterTime({ defaults: { "4": 0, "5": 0 } }));
    const type = new Reincluded();
    expect(type.cast(null)).toBeNull();
    expect(type.cast("2020-07-04T12:30:00Z")).toEqual(
      new DateTimeType().cast("2020-07-04T12:30:00Z"),
    );
  });
});
