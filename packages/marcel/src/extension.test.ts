import { File, Enumerator } from "@blazetrails/ruby-compat";
import { MimeType } from "./mime-type.js";
import { eachContentTypeFixture } from "./test-helpers/test-helper.js";
import { expect, it, describe } from "vitest";

describe("ExtensionTest", () => {
  it("ignores case and any preceding dot", async () => {
    expect(await MimeType.for(undefined, { extension: "PDF" })).toEqual("application/pdf");
    expect(await MimeType.for(undefined, { extension: ".PDF" })).toEqual("application/pdf");
    expect(await MimeType.for(undefined, { extension: "pdf" })).toEqual("application/pdf");
    expect(await MimeType.for(undefined, { extension: ".pdf" })).toEqual("application/pdf");
  });
  let extensions: unknown = [];
  eachContentTypeFixture("name", (file, name, contentType): unknown => {
    const extension = File.extname(name as string);
    it.skipIf(
      !!(
        extensions instanceof globalThis.Set ||
        extensions instanceof globalThis.Map ||
        extensions instanceof Enumerator
          ? [...extensions]
          : Object.getPrototypeOf(extensions) === Object.prototype
            ? Object.entries(extensions as object)
            : (extensions as unknown[])
      ).includes(extension),
    )(`gets type for ${contentType ?? ""} given file extension ${extension ?? ""}`, async () => {
      expect(await MimeType.for(undefined, { extension: extension })).toEqualRuby(contentType);
    });
    if (
      !(
        extensions instanceof globalThis.Set ||
        extensions instanceof globalThis.Map ||
        extensions instanceof Enumerator
          ? [...extensions]
          : Object.getPrototypeOf(extensions) === Object.prototype
            ? Object.entries(extensions as object)
            : (extensions as unknown[])
      ).includes(extension)
    ) {
      extensions =
        typeof extensions === "string"
          ? extensions + extension
          : Array.isArray(extensions)
            ? (extensions.push(extension), extensions)
            : extensions instanceof globalThis.Set
              ? extensions.add(extension)
              : extensions.append(extension);
    }
  });
});
