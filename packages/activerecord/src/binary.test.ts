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
    await binary.save();
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

  it.skip("unicode input casting", () => {
    // PERMANENT-SKIP: Ruby-only — asserts on Ruby String encodings
    // (`Encoding::BINARY` / `Encoding::UTF_8`) of `data` and
    // `data_before_type_cast`. JS strings have no encoding attribute, so the
    // assertions have no analogue.
  });
});
