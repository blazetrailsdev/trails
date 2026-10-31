import { describe, expect, it } from "vitest";
import {
  NameError,
  NoMethodError,
  rbFSend,
  rbModAttrReader,
  rbModAttrWriter,
  rbModUndefMethod,
  rbObjRespondTo,
} from "./index.js";

describe("rbModUndefMethod", () => {
  it("undefines both halves of an inherited accessor, in either order", () => {
    class Parent {}
    rbModAttrReader(Parent, "name");
    rbModAttrWriter(Parent, "name");
    for (const names of [
      ["name", "name="],
      ["name=", "name"],
    ]) {
      class Sub extends Parent {}
      rbModUndefMethod(Sub, ...names);
      expect(rbObjRespondTo(new Sub(), "name")).toBe(false);
      expect(rbObjRespondTo(new Sub(), "name=")).toBe(false);
      expect(() => rbFSend(new Sub(), "name=", 1)).toThrow(NoMethodError);
    }
  });

  it("keeps a class's own reader when undefining an inherited writer", () => {
    class Parent {}
    rbModAttrReader(Parent, "name");
    rbModAttrWriter(Parent, "name");
    class Sub extends Parent {
      name(): string {
        return "own";
      }
    }
    rbModUndefMethod(Sub, "name=");
    expect(rbFSend(new Sub(), "name")).toBe("own");
    expect(rbObjRespondTo(new Sub(), "name=")).toBe(false);
  });

  it("undefines a writer spelled setName and keeps the reader", () => {
    class Klass {
      name(): string {
        return "own";
      }
      setName(_value: unknown): void {}
    }
    rbModUndefMethod(Klass, "name=");
    expect(rbFSend(new Klass(), "name")).toBe("own");
    expect(rbObjRespondTo(new Klass(), "name=")).toBe(false);
    expect(() => rbFSend(new Klass(), "name=", 1)).toThrow(NoMethodError);
  });

  it("stops the search at a subclass, for each half", () => {
    class Parent {}
    rbModAttrReader(Parent, "name");
    rbModAttrWriter(Parent, "name");
    class Reader extends Parent {}
    expect(rbModUndefMethod(Reader, "name")).toBe(Reader);
    class Writer extends Parent {}
    rbModUndefMethod(Writer, "name=");
    expect(rbObjRespondTo(new Reader(), "name")).toBe(false);
    expect((new Reader() as { name?: unknown }).name).toBeUndefined();
    expect(() => rbFSend(new Reader(), "name")).toThrow(NoMethodError);
    expect(rbObjRespondTo(new Reader(), "name=")).toBe(true);
    expect(rbObjRespondTo(new Writer(), "name=")).toBe(false);
    expect(() => rbFSend(new Writer(), "name=", 1)).toThrow(NoMethodError);
    expect(rbFSend(new Writer(), "name")).toBe(null);
  });

  it("raises NameError for an undefined name", () => {
    class Klass {}
    expect(() => rbModUndefMethod(Klass, "missing")).toThrow(NameError);
  });

  it("undefines the reader and keeps the writer", () => {
    class Klass {}
    rbModAttrReader(Klass, "name");
    rbModAttrWriter(Klass, "name");
    rbModUndefMethod(Klass, "name");
    const k = new Klass();
    expect(() => rbFSend(k, "name")).toThrow(NoMethodError);
    expect(rbObjRespondTo(k, "name=")).toBe(true);
  });

  it("undefines the writer and keeps the reader", () => {
    class Klass {}
    rbModAttrReader(Klass, "name");
    rbModAttrWriter(Klass, "name");
    rbModUndefMethod(Klass, "name=");
    const k = new Klass();
    expect(rbFSend(k, "name")).toBe(null);
    expect(() => rbFSend(k, "name=", 1)).toThrow(NoMethodError);
  });
});
