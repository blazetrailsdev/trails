import { describe, it, expect } from "vitest";
import { strNew } from "./bytes.js";

describe("strNew", () => {
  it("decodes an empty input to an empty string", () => {
    expect(strNew([])).toBe("");
  });

  it("decodes valid runs around invalid bytes", () => {
    expect(strNew([0x61, 0xc3, 0xa9, 0xff, 0x62, 0x63])).toBe("aé\udcffbc");
    expect(strNew([0xff, 0x61])).toBe("\udcffa");
    expect(strNew([0x61, 0xff])).toBe("a\udcff");
  });

  it("keeps a BOM wherever it falls, as rb_str_new does", () => {
    expect(strNew([0xef, 0xbb, 0xbf, 0x61])).toBe("﻿a");
    expect(strNew([0x61, 0xef, 0xbb, 0xbf, 0x62])).toBe("a﻿b");
    expect(strNew([0xff, 0xef, 0xbb, 0xbf, 0x62])).toBe("\udcff﻿b");
  });
});
