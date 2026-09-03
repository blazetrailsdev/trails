import { describe, it, expect } from "vitest";
import { Properties } from "./properties.js";

describe("ActiveRecord::Encryption::Properties (trails)", () => {
  it("generates a reader and a writer for every DEFAULT_PROPERTIES entry", () => {
    expect(Object.keys(Properties.DEFAULT_PROPERTIES)).toEqual([
      "encryptedDataKey",
      "encryptedDataKeyId",
      "compressed",
      "iv",
      "authTag",
      "encoding",
    ]);

    for (const [name, key] of Object.entries(Properties.DEFAULT_PROPERTIES)) {
      const props = new Properties();
      (props as unknown as Record<string, unknown>)[name] = "some value";
      expect(props.get(key)).toBe("some value");
      expect((props as unknown as Record<string, unknown>)[name]).toBe("some value");
    }
  });

  it("reads and writes the encoding property through the 'e' key", () => {
    const props = new Properties();
    props.encoding = "US-ASCII";
    expect(props.encoding).toBe("US-ASCII");
    expect(props.get("e")).toBe("US-ASCII");
  });
});
