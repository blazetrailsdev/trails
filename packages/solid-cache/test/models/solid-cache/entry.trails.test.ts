import { b } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Entry } from "../../../lib/index.js";
import { useSolidCache } from "../../support/test-helper.js";

describe("EntryTest", () => {
  useSolidCache();

  it("reads a multibyte binary key through a different Uint8Array instance", async () => {
    await Entry.writeMulti([{ key: b("héllo"), value: "there" }]);
    const results = await Entry.readMulti([b("héllo"), b("hello")]);
    expect(results.size).toBe(1);
    expect(new TextDecoder().decode(results.get(b("héllo")) as Uint8Array)).toBe("there");
    expect(new TextDecoder().decode((await Entry.read(b("héllo"))) as Uint8Array)).toBe("there");
  });

  it("sizes a multibyte string key by its bytes", async () => {
    await Entry.write("héllo", "there");
    const entry = (await Entry.uncached(() => Entry.last()))!;
    expect(entry.readAttribute("byte_size")).toBe(6 + 5 + Entry.ESTIMATED_ROW_OVERHEAD);
  });
});
