import { describe, it, expectTypeOf } from "vitest";
import {
  ValueType,
  IntegerType,
  BooleanType,
  DateType,
  FloatType,
  ImmutableStringType,
  StringType,
  BinaryType,
} from "@blazetrails/activemodel";

// Regression guard for the ValueType<T> refactor — inherited methods on
// concrete subclasses must return the concrete narrowed type, not
// `unknown`. Before `ValueType<T = unknown>` was introduced, extending
// `ValueType` without a type parameter silently leaked `unknown` back
// into every subclass's cast / deserialize / serialize surface.

describe("ValueType<T> type parameter flows into concrete subclasses", () => {
  it("IntegerType#cast narrows to number | null", () => {
    const t = new IntegerType();
    expectTypeOf(t.cast(0)).toEqualTypeOf<number | null>();
  });

  it("BooleanType#cast narrows to boolean | null", () => {
    const t = new BooleanType();
    expectTypeOf(t.cast(0)).toEqualTypeOf<boolean | null>();
  });

  it("DateType#cast narrows to Date | null", () => {
    const t = new DateType();
    expectTypeOf(t.cast(0)).toEqualTypeOf<Date | null>();
  });

  it("FloatType#cast narrows to number | null", () => {
    const t = new FloatType();
    expectTypeOf(t.cast(0)).toEqualTypeOf<number | null>();
  });

  it("BinaryType#cast narrows to Uint8Array | null", () => {
    const t = new BinaryType();
    expectTypeOf(t.cast(0)).toEqualTypeOf<Uint8Array | null>();
  });

  it("ImmutableStringType and StringType narrow to string | null", () => {
    const a = new ImmutableStringType();
    const b = new StringType();
    expectTypeOf(a.cast(0)).toEqualTypeOf<string | null>();
    expectTypeOf(b.cast(0)).toEqualTypeOf<string | null>();
  });

  it("bare ValueType defaults to unknown | null", () => {
    const t = new ValueType();
    expectTypeOf(t.cast(0)).toEqualTypeOf<unknown>();
  });
});
