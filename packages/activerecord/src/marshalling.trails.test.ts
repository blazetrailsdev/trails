import { afterEach, describe, expect, it } from "vitest";
import { marshallingFormatVersion, setMarshallingFormatVersion } from "./active-record.js";
import { Methods } from "./marshalling.js";
import { Base } from "./base.js";

describe("ActiveRecord.marshalling_format_version", () => {
  afterEach(() => setMarshallingFormatVersion(6.1));

  it("defaults to 6.1 and aliases marshal_dump only under 7.1", () => {
    expect(marshallingFormatVersion()).toBe(6.1);
    expect(Methods.isMethodDefined("marshalDump")).toBe(false);
    setMarshallingFormatVersion(7.1);
    expect(marshallingFormatVersion()).toBe(7.1);
    expect(Methods.instanceMethod("marshalDump")!.value).toBe(
      Methods.instanceMethod("_marshalDump71")!.value,
    );
    expect(typeof (Base.prototype as unknown as Record<string, unknown>).marshalDump).toBe(
      "function",
    );
    setMarshallingFormatVersion(6.1);
    expect("marshalDump" in Base.prototype).toBe(false);
    expect(Methods.isMethodDefined("marshalDump")).toBe(false);
  });

  it("raises ArgumentError for an unknown format", () => {
    expect(() => setMarshallingFormatVersion(5.0)).toThrow("Unknown marshalling format: 5");
    expect(marshallingFormatVersion()).toBe(6.1);
  });
});
