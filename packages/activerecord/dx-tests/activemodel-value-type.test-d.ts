import { describe, it, expectTypeOf } from "vitest";
import {
  ValueType,
  IntegerType,
  BooleanType,
  DateType,
  type DateCastResult,
  FloatType,
  ImmutableStringType,
  StringType,
  BinaryType,
} from "@blazetrails/activemodel";

describe("ValueType<T> type parameter flows into concrete subclasses", () => {
  it("IntegerType#cast narrows to number | null", () => {
    const t = new IntegerType();
    expectTypeOf(t.cast(0)).toEqualTypeOf<number | null>();
  });

  it("BooleanType#cast narrows to boolean | null", () => {
    const t = new BooleanType();
    expectTypeOf(t.cast(0)).toEqualTypeOf<boolean | null>();
  });

  it("DateType#cast narrows to DateCastResult | null (PlainDate or infinity sentinels)", () => {
    const t = new DateType();
    expectTypeOf(t.cast(0)).toEqualTypeOf<DateCastResult | null>();
  });

  it("FloatType#cast narrows to number | null", () => {
    const t = new FloatType();
    expectTypeOf(t.cast(0)).toEqualTypeOf<number | null>();
  });

  it("BinaryType#cast stays unknown because Binary#cast passes non-strings through", () => {
    const t = new BinaryType();
    expectTypeOf(t.cast(0)).toEqualTypeOf<unknown>();
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
