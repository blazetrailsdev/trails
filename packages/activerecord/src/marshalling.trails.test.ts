import { afterEach, describe, expect, it } from "vitest";
import { marshallingFormatVersion, setMarshallingFormatVersion } from "./active-record.js";
import { Methods } from "./marshalling.js";

describe("ActiveRecord.marshalling_format_version", () => {
  afterEach(() => setMarshallingFormatVersion(6.1));

  it("defaults to 6.1 and aliases marshal_dump only under 7.1", () => {
    expect(marshallingFormatVersion()).toBe(6.1);
    expect("marshalDump" in Methods).toBe(false);
    setMarshallingFormatVersion(7.1);
    expect(marshallingFormatVersion()).toBe(7.1);
    expect((Methods as Record<string, unknown>).marshalDump).toBe(Methods._marshalDump71);
    setMarshallingFormatVersion(6.1);
    expect("marshalDump" in Methods).toBe(false);
  });

  it("raises ArgumentError for an unknown format", () => {
    expect(() => setMarshallingFormatVersion(5.0)).toThrow("Unknown marshalling format: 5");
    expect(marshallingFormatVersion()).toBe(6.1);
  });
});
