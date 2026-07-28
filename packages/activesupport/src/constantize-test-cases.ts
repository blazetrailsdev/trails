/**
 * Mirrors: activesupport/test/constantize_test_cases.rb
 *
 * Arms that a flat constant table cannot express are omitted rather than
 * faked: inherited-constant lookup (`Ace::Base::Fase::Dice` resolving through
 * `Fase < Case`), the `Object::…` / `AddtlGlobalConstants` arms that depend on
 * Ruby's implicit `Object` namespace and `include`-into-`Object`, and the
 * `with_autoloading_fixtures` arms.
 */
import { expect } from "vitest";
import { registerConstant } from "./inflector.js";

class AceBaseCase {}
class AceBaseCaseDice {}
class ConstantizeTestCases {}

export function registerConstantizeFixtures(): void {
  registerConstant("Ace::Base::Case", AceBaseCase);
  registerConstant("Ace::Base::Case::Dice", AceBaseCaseDice);
  registerConstant("Ace::Gas::Case", AceBaseCase);
  registerConstant("Ace::Gas::Case::Dice", AceBaseCaseDice);
  registerConstant("ConstantizeTestCases", ConstantizeTestCases);
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

  expect(() => yieldFn("UnknownClass")).toThrow(ReferenceError);
  expect(() => yieldFn("UnknownClass::Ace")).toThrow(ReferenceError);
  expect(() => yieldFn("UnknownClass::Ace::Base")).toThrow(ReferenceError);
  expect(() => yieldFn("An invalid string")).toThrow(ReferenceError);
  expect(() => yieldFn("InvalidClass\n")).toThrow(ReferenceError);
  expect(() => yieldFn("Ace::ConstantizeTestCases")).toThrow(ReferenceError);
  expect(() => yieldFn("Ace::Base::ConstantizeTestCases")).toThrow(ReferenceError);
  expect(() => yieldFn("Ace::Gas::Base")).toThrow(ReferenceError);
  expect(() => yieldFn("Ace::Gas::ConstantizeTestCases")).toThrow(ReferenceError);
  expect(() => yieldFn("")).toThrow(ReferenceError);
  expect(() => yieldFn("::")).toThrow(ReferenceError);
  expect(() => yieldFn("Ace::gas")).toThrow(ReferenceError);
}

export function runSafeConstantizeTestsOn(yieldFn: (name: string) => unknown): void {
  expect(yieldFn("Ace::Base::Case")).toBe(AceBaseCase);
  expect(yieldFn("::Ace::Base::Case")).toBe(AceBaseCase);
  expect(yieldFn("Ace::Base::Case::Dice")).toBe(AceBaseCaseDice);
  expect(yieldFn("Ace::Gas::Case")).toBe(AceBaseCase);
  expect(yieldFn("Ace::Gas::Case::Dice")).toBe(AceBaseCaseDice);
  expect(yieldFn("ConstantizeTestCases")).toBe(ConstantizeTestCases);
  expect(yieldFn("::ConstantizeTestCases")).toBe(ConstantizeTestCases);

  expect(yieldFn("")).toBeUndefined();
  expect(yieldFn("::")).toBeUndefined();
  expect(yieldFn("UnknownClass")).toBeUndefined();
  expect(yieldFn("UnknownClass::Ace")).toBeUndefined();
  expect(yieldFn("UnknownClass::Ace::Base")).toBeUndefined();
  expect(yieldFn("An invalid string")).toBeUndefined();
  expect(yieldFn("InvalidClass\n")).toBeUndefined();
  expect(yieldFn("blargle")).toBeUndefined();
  expect(yieldFn("Ace::ConstantizeTestCases")).toBeUndefined();
  expect(yieldFn("Ace::Base::ConstantizeTestCases")).toBeUndefined();
  expect(yieldFn("Ace::Gas::Base")).toBeUndefined();
  expect(yieldFn("Ace::Gas::ConstantizeTestCases")).toBeUndefined();
  expect(yieldFn("#<Class:0x7b8b718b>::Nested_1")).toBeUndefined();
  expect(yieldFn("Ace::gas")).toBeUndefined();
}
