import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { fixtures } from "./test-fixtures.js";
import { Binary } from "./test-helpers/models/binary.js";

describe("BinaryTest", () => {
  // Rails' ASSETS_ROOT fixture files, vendored verbatim from
  // vendor/rails/activerecord/test/assets/.
  const FIXTURES = ["flowers.jpg", "example.log", "test.txt"];

  fixtures({});

  it("mixed encoding", async () => {
    // Rails: `str = +"\x80"; str.force_encoding("ASCII-8BIT")`. A lone 0x80 is
    // not valid UTF-8, which is the point — it catches any lossy decode on the
    // way to the database. `Uint8Array` is our stand-in for a BINARY String.
    const str = new Uint8Array([0x80]);

    const binary = Binary.new({ name: "いただきます！", data: str });
    await binary.saveBang();
    await binary.reload();
    expect(new Uint8Array(binary.data)).toEqual(str);

    // `name` is a restricted attribute in trails; read it through readAttribute.
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
    // Ported from binary_test.rb:41-70. Rails interleaves two concerns: the
    // Integer-to-String casting of `name`, which ports directly, and assertions
    // that `data` / `data_before_type_cast` carry `Encoding::BINARY` /
    // `Encoding::UTF_8`. JS has no String encoding attribute, so each encoding
    // assertion ports as the value that the encoding *implies*: a binary-encoded
    // `data` is the bytes of "text", and a UTF-8 `data_before_type_cast` is
    // still the JS string it was assigned.
    // `name` is a restricted attribute in trails, hence readAttribute.
    const textBytes = new TextEncoder().encode("text");

    const binary = Binary.new({ name: 123 as unknown as string, data: "text" });

    // Before saving, attribute methods return casted values, but their
    // _before_type_cast still returns the original value. (Integer-to-String
    // conversion used for comparison.)
    expect(binary.readAttribute("name")).toEqual("123");
    expect(binary.readAttributeBeforeTypeCast("name")).toEqual(123);
    expect(new Uint8Array(binary.data)).toEqual(textBytes);
    expect(binary.readAttributeBeforeTypeCast("data")).toEqual("text");

    await binary.saveBang();

    // After saving, casted values appear throughout.
    expect(binary.readAttribute("name")).toEqual("123");
    expect(binary.readAttributeBeforeTypeCast("name")).toEqual("123");
    expect(new Uint8Array(binary.data)).toEqual(textBytes);
    expect(
      new Uint8Array((binary.readAttributeBeforeTypeCast("data") as { bytes: Uint8Array }).bytes),
    ).toEqual(textBytes);

    await binary.reload();

    expect(binary.readAttribute("name")).toEqual("123");
    expect(binary.readAttributeBeforeTypeCast("name")).toEqual("123");
    // After reloading, data_before_type_cast is adapter-dependent. For
    // example, PostgreSQL returns the bytea_output encoded representation,
    // which happens to be UTF-8 — so only `data` itself is asserted here.
    expect(new Uint8Array(binary.data)).toEqual(textBytes);
  });
});
