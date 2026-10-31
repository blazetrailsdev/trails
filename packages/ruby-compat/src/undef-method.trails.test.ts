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
  it("stops the search at a subclass, for each half", () => {
    class Parent {}
    rbModAttrReader(Parent, "name");
    rbModAttrWriter(Parent, "name");
    class Reader extends Parent {}
    expect(rbModUndefMethod(Reader, "name")).toBe(Reader);
    class Writer extends Parent {}
    rbModUndefMethod(Writer, "name=");
    expect(rbObjRespondTo(new Reader(), "name")).toBe(false);
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
