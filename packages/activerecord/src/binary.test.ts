import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { fixtures } from "./test-fixtures.js";
import { Binary } from "./test-helpers/models/binary.js";

describe("BinaryTest", () => {
  const FIXTURES = ["flowers.jpg", "example.log", "test.txt"];

  fixtures({});

  it("mixed encoding", async () => {
    const str = new Uint8Array([0x80]);

    const binary = Binary.new({ name: "いただきます！", data: str });
    await binary.saveBang();
    await binary.reload();
    expect(new Uint8Array(binary.data)).toEqual(str);

    const name = binary.readAttribute("name");
    expect(name).toBe("いただきます！");
  });

  it("load save", async () => {
    await Binary.deleteAll();

    for (const filename of FIXTURES) {
      const data = new Uint8Array(
        await readFile(new URL(`./test-helpers/assets/${filename}`, import.meta.url)),
      );

      const bin = Binary.new({ data });
      expect(new Uint8Array(bin.data)).toEqual(data);

      await bin.saveBang();
      expect(new Uint8Array(bin.data)).toEqual(data);

      await bin.reload();
      expect(new Uint8Array(bin.data)).toEqual(data);
    }
  });

  it("unicode input casting", async () => {
    const textBytes = new TextEncoder().encode("text");

    const binary = Binary.new({ name: 123 as unknown as string, data: "text" });

    expect(binary.readAttribute("name")).toEqual("123");
    expect(binary.readAttributeBeforeTypeCast("name")).toEqual(123);
    expect(new Uint8Array(binary.data)).toEqual(textBytes);
    expect(binary.readAttributeBeforeTypeCast("data")).toEqual("text");

    await binary.saveBang();

    expect(binary.readAttribute("name")).toEqual("123");
    expect(binary.readAttributeBeforeTypeCast("name")).toEqual("123");
    expect(new Uint8Array(binary.data)).toEqual(textBytes);
    expect(
      new Uint8Array((binary.readAttributeBeforeTypeCast("data") as { bytes: Uint8Array }).bytes),
    ).toEqual(textBytes);

    await binary.reload();

    expect(binary.readAttribute("name")).toEqual("123");
    expect(binary.readAttributeBeforeTypeCast("name")).toEqual("123");
    expect(new Uint8Array(binary.data)).toEqual(textBytes);
  });
});
