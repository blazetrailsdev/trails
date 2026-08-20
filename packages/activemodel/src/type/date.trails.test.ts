import { describe, it, expect, vi, afterEach } from "vitest";
import { Types, ValueType } from "../index.js";

// AcceptsMultiparameterTime::InstanceMethods#assert_valid_value
// (activemodel/lib/active_model/type/helpers/accepts_multiparameter_time.rb:24-30)
// sends a non-Hash value on to `super`. `ActiveModel::Type::Value#assert_valid_value`
// is a no-op, so the arm is only observable once an ancestor supplies a real one —
// which ActiveRecord's Type::Serialized and the enum/PG OID types do.
describe("DateType assert_valid_value", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a non-hash value to super", () => {
    const spy = vi.spyOn(ValueType.prototype, "assertValidValue").mockImplementation(() => {
      throw new Error("from super");
    });
    const type = new Types.DateType();
    expect(() => type.assertValidValue("2020-07-04")).toThrow("from super");
    expect(spy).toHaveBeenCalledWith("2020-07-04");
  });

  it("does not send a multiparameter hash to super", () => {
    const spy = vi.spyOn(ValueType.prototype, "assertValidValue").mockImplementation(() => {
      throw new Error("from super");
    });
    const type = new Types.DateType();
    expect(() => type.assertValidValue({ 1: 2025, 2: 7, 3: 4 })).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
