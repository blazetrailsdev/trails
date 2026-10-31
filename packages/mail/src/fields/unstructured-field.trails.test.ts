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
});
