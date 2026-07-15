import { describe, it, expect } from "vitest";
import { fixtures } from "./test-helpers/fixtures.js";
import { Binary } from "./test-helpers/models/binary.js";

describe("BinaryTest", () => {
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

  it.skip("load save", () => {
    // PERMANENT-SKIP: Ruby-only — reads binary asset files (flowers.jpg,
    // example.log, test.txt) from ASSETS_ROOT via File.read. Porting needs the
    // asset fixtures plus filesystem reads, which this package's hard rules
    // exclude (no node:* imports).
  });

  it("unicode input casting", async () => {
    // Ported from binary_test.rb:41-70. Rails interleaves two concerns: the
    // Integer-to-String casting of `name`, which ports directly, and assertions
    // that `data` / `data_before_type_cast` carry `Encoding::BINARY` /
    // `Encoding::UTF_8`. JS has no String encoding attribute, so the encoding
    // *labels* have no analogue. What `assert_equal Encoding::BINARY,
    // binary.data.encoding` is asserting in Ruby terms — that the string input
    // was cast to binary — does port: `data` must be the bytes of "text" at each
    // phase, which is what `expectTextBytes` pins. The `_before_type_cast`
    // encoding half stays out: Rails itself notes it is adapter-dependent after
    // reload (PG returns the bytea_output form).
    // `name` is a restricted attribute in trails, hence readAttribute.
    const textBytes = new TextEncoder().encode("text");
    const expectTextBytes = () => {
      expect(binary.data).toBeInstanceOf(Uint8Array);
      expect(new Uint8Array(binary.data)).toEqual(textBytes);
    };

    const binary = Binary.new({ name: 123 as unknown as string, data: "text" });

    // Before saving, attribute methods return casted values, but their
    // _before_type_cast still returns the original value. (Integer-to-String
    // conversion used for comparison.)
    expect(binary.readAttribute("name")).toBe("123");
    expect(binary.readAttributeBeforeTypeCast("name")).toBe(123);
    expectTextBytes();

    await binary.saveBang();

    // After saving, casted values appear throughout.
    expect(binary.readAttribute("name")).toBe("123");
    expect(binary.readAttributeBeforeTypeCast("name")).toBe("123");
    expectTextBytes();

    await binary.reload();

    expect(binary.readAttribute("name")).toBe("123");
    expect(binary.readAttributeBeforeTypeCast("name")).toBe("123");
    expectTextBytes();
  });
});
