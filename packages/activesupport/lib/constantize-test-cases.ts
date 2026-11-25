import { expect } from "vitest";
import { constSet } from "@blazetrails/ruby-compat/include";
import { NameError } from "@blazetrails/ruby-compat/name-error";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { constGet } from "@blazetrails/ruby-compat/variable";

class AceBaseCase {}
class AceBaseCaseDice {}
class ConstantizeTestCases {}

export function registerConstantizeFixtures(): void {
  constSet(TopLevel, "Ace", {});
  constSet(constGet(Object, "Ace") as object, "Base", {});
  constSet(constGet(Object, "Ace::Base") as object, "Case", AceBaseCase);
  constSet(constGet(Object, "Ace::Base::Case") as object, "Dice", AceBaseCaseDice);
  constSet(constGet(Object, "Ace") as object, "Gas", {});
  constSet(constGet(Object, "Ace::Gas") as object, "Case", AceBaseCase);
  constSet(constGet(Object, "Ace::Gas::Case") as object, "Dice", AceBaseCaseDice);
  constSet(TopLevel, "ConstantizeTestCases", ConstantizeTestCases);
}

export function runConstantizeTestsOn(yieldFn: (name: string) => unknown): void {
  expect(yieldFn("Ace::Base::Case")).toBe(AceBaseCase);
  expect(yieldFn("::Ace::Base::Case")).toBe(AceBaseCase);
  expect(yieldFn("Ace::Base::Case::Dice")).toBe(AceBaseCaseDice);

  expect(yieldFn("Ace::Gas::Case")).toBe(AceBaseCase);
  expect(yieldFn("Ace::Gas::Case::Dice")).toBe(AceBaseCaseDice);
  expect(yieldFn("Ace::Base::Case::Dice")).toBe(AceBaseCaseDice);

  expect(yieldFn("ConstantizeTestCases")).toBe(ConstantizeTestCases);
  expect(yieldFn("::ConstantizeTestCases")).toBe(ConstantizeTestCases);

  expect(() => yieldFn("UnknownClass")).toThrow(NameError);
  expect(() => yieldFn("UnknownClass::Ace")).toThrow(NameError);
  expect(() => yieldFn("UnknownClass::Ace::Base")).toThrow(NameError);
  expect(() => yieldFn("An invalid string")).toThrow(NameError);
  expect(() => yieldFn("InvalidClass\n")).toThrow(NameError);
  expect(() => yieldFn("Ace::ConstantizeTestCases")).toThrow(NameError);
  expect(() => yieldFn("Ace::Base::ConstantizeTestCases")).toThrow(NameError);
  expect(() => yieldFn("Ace::Gas::Base")).toThrow(NameError);
  expect(() => yieldFn("Ace::Gas::ConstantizeTestCases")).toThrow(NameError);
  expect(() => yieldFn("")).toThrow(NameError);
  expect(() => yieldFn("::")).toThrow(NameError);
  expect(() => yieldFn("Ace::gas")).toThrow(NameError);
}

export function runSafeConstantizeTestsOn(yieldFn: (name: string) => unknown): void {
  expect(yieldFn("Ace::Base::Case")).toBe(AceBaseCase);
  expect(yieldFn("::Ace::Base::Case")).toBe(AceBaseCase);
  expect(yieldFn("Ace::Base::Case::Dice")).toBe(AceBaseCaseDice);
  expect(yieldFn("Ace::Gas::Case")).toBe(AceBaseCase);
  expect(yieldFn("Ace::Gas::Case::Dice")).toBe(AceBaseCaseDice);
  expect(yieldFn("ConstantizeTestCases")).toBe(ConstantizeTestCases);
  expect(yieldFn("::ConstantizeTestCases")).toBe(ConstantizeTestCases);

  expect(yieldFn("")).toBeNull();
  expect(yieldFn("::")).toBeNull();
  expect(yieldFn("UnknownClass")).toBeNull();
  expect(yieldFn("UnknownClass::Ace")).toBeNull();
  expect(yieldFn("UnknownClass::Ace::Base")).toBeNull();
  expect(yieldFn("An invalid string")).toBeNull();
  expect(yieldFn("InvalidClass\n")).toBeNull();
  expect(yieldFn("blargle")).toBeNull();
  expect(yieldFn("Ace::ConstantizeTestCases")).toBeNull();
  expect(yieldFn("Ace::Base::ConstantizeTestCases")).toBeNull();
  expect(yieldFn("Ace::Gas::Base")).toBeNull();
  expect(yieldFn("Ace::Gas::ConstantizeTestCases")).toBeNull();
  expect(yieldFn("#<Class:0x7b8b718b>::Nested_1")).toBeNull();
  expect(yieldFn("Ace::gas")).toBeNull();
}
