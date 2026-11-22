import { describe, expect, it } from "vitest";
import { RailsEntityStore } from "../../../lib/action-dispatch/http/rack-cache.js";

class ReadWriteHash {
  [key: string]: unknown;

  read(key: string): unknown {
    return Object.hasOwn(this, key) ? this[key] : null;
  }

  write(key: string, value: unknown): unknown {
    return (this[key] = value);
  }
}

describe("RailsEntityStore", () => {
  it("reads a binary body back as its bytes", async () => {
    const store = new RailsEntityStore(new ReadWriteHash());
    const [key] = await store.write([new Uint8Array([1, 2]), new Uint8Array([255])]);
    expect(await store.read(key)).toEqual(new Uint8Array([1, 2, 255]));
  });

  it("reads a text body back as a string", async () => {
    const store = new RailsEntityStore(new ReadWriteHash());
    const [key] = await store.write(["foo", "bar"]);
    expect(await store.read(key)).toBe("foobar");
  });
});
