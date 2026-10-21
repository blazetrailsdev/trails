import { File } from "@blazetrails/ruby-compat";
import { MimeType } from "./mime-type.js";
import { eachContentTypeFixture } from "./test-helpers/test-helper.js";
import { expect, it, describe } from "vitest";

describe("ExtensionTest", () => {
  it("ignores case and any preceding dot", () => {
    expect(MimeType.for(undefined, { extension: "PDF" })).toEqual("application/pdf");
    expect(MimeType.for(undefined, { extension: ".PDF" })).toEqual("application/pdf");
    expect(MimeType.for(undefined, { extension: "pdf" })).toEqual("application/pdf");
    expect(MimeType.for(undefined, { extension: ".pdf" })).toEqual("application/pdf");
  });

  const extensions = new Map<string, string>();
  eachContentTypeFixture("name", (file, name, contentType) => {
    const extension = File.extname(name);
    if (!extensions.has(extension)) extensions.set(extension, contentType);
  });
  for (const [extension, contentType] of extensions) {
    it(`gets type for ${contentType} given file extension ${extension}`, () => {
      expect(MimeType.for(undefined, { extension: extension })).toEqual(contentType);
    });
  }
});
