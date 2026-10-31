import { describe, expect, it } from "vitest";
import { UnstructuredField } from "./unstructured-field.js";

describe("UnstructuredField#fold", () => {
  it("folds an ascii value under a non-UTF-8 charset", () => {
    const field = new UnstructuredField("Subject", "Hello there", "iso-8859-1");
    expect(field.encoded()).toBe("Subject: Hello there\r\n");
  });

  it("keeps a CR inside an ascii word of an encoded value", () => {
    const field = new UnstructuredField("Subject", "é ab\rcd");
    expect(field.encoded()).toBe("Subject: =?UTF-8?Q?=C3=A9_ab=0Dcd?=\r\n");
  });

  it.each([
    ["é ab\ncd", "=C3=A9_abcd"],
    ["é abcdefghij\nkl\nmn x", "=C3=A9_abcdefghijklmn_x"],
    ["é ab\r\ncd", "=C3=A9_ab=0Dcd"],
    ["é ab\n", "=C3=A9_ab"],
  ])("keeps every line of an ascii word in %j", (value, encoded) => {
    expect(new UnstructuredField("Subject", value).encoded()).toBe(
      `Subject: =?UTF-8?Q?${encoded}?=\r\n`,
    );
  });
});
