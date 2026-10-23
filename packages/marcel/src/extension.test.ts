import { File } from "@blazetrails/ruby-compat";
import { MimeType } from "./mime-type.js";
import { eachContentTypeFixture } from "./test-helpers/test-helper.js";
import { expect, it, describe } from "vitest";

describe("Marcel::MimeType::ExtensionTest", () => {
  it("ignores case and any preceding dot", () => {
    expect(MimeType.for(undefined, { extension: "PDF" })).toEqual("application/pdf");
    expect(MimeType.for(undefined, { extension: ".PDF" })).toEqual("application/pdf");
    expect(MimeType.for(undefined, { extension: "pdf" })).toEqual("application/pdf");
    expect(MimeType.for(undefined, { extension: ".pdf" })).toEqual("application/pdf");
  });

  const extensions: string[] = [];

  eachContentTypeFixture("name", (file, name, contentType) => {
    const extension = File.extname(name);

    if (!extensions.includes(extension)) {
      it(`gets type for ${contentType} given file extension ${extension}`, () => {
        expect(MimeType.for(undefined, { extension: extension })).toEqual(contentType);
      });

      extensions.push(extension);
    }
  });
});
