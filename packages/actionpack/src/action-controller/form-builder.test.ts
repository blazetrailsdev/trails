import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";
import { FormBuilder } from "./form-builder.js";
import { Base } from "./base.js";

class FakeBuilder {}
class OtherBuilder {}

type Host = { _defaultFormBuilder: unknown; defaultFormBuilder(builder: unknown): void };

function host(): (new () => { defaultFormBuilder(): unknown }) & Host {
  class C {}
  include(C, FormBuilder);
  return C as never;
}

describe("defaultFormBuilder DSL", () => {
  it("stores and reads a builder class on a host class", () => {
    const C = host();
    C.defaultFormBuilder(FakeBuilder);
    expect(C._defaultFormBuilder).toBe(FakeBuilder);
  });

  it("walks the prototype chain for inherited defaults", () => {
    const Parent = host();
    class Child extends Parent {}
    Parent.defaultFormBuilder(FakeBuilder);
    expect(Child._defaultFormBuilder).toBe(FakeBuilder);
  });

  it("subclass override does not mutate parent", () => {
    const Parent = host();
    class Child extends Parent {}
    Parent.defaultFormBuilder(FakeBuilder);
    Child.defaultFormBuilder(OtherBuilder);
    expect(Child._defaultFormBuilder).toBe(OtherBuilder);
    expect(Parent._defaultFormBuilder).toBe(FakeBuilder);
  });

  it("accepts a string name (held as-is for view-layer resolution)", () => {
    const C = host();
    C.defaultFormBuilder("MyAppFormBuilder");
    expect(C._defaultFormBuilder).toBe("MyAppFormBuilder");
  });

  it("instance reader returns the class-level configured value", () => {
    const C = host();
    C.defaultFormBuilder(FakeBuilder);
    expect(new C().defaultFormBuilder()).toBe(FakeBuilder);
  });

  it("is wired onto Base as both class DSL and instance reader", () => {
    class MyController extends Base {}
    MyController.defaultFormBuilder(FakeBuilder);
    expect(MyController._defaultFormBuilder).toBe(FakeBuilder);
    expect(new MyController().defaultFormBuilder()).toBe(FakeBuilder);
    class SiblingController extends Base {}
    expect(SiblingController._defaultFormBuilder).toBeUndefined();
  });
});
