import { MimeType } from "../lib/mime-type.js";
import { eachContentTypeFixture } from "./support/test-helper.js";
import { expect, it, describe } from "vitest";

describe("Marcel::MimeType::NameTest", () => {
  eachContentTypeFixture("name", (file, name, contentType) => {
    it(`gets type for ${contentType} by filename from ${name}`, async () => {
      expect(await MimeType.for(undefined, { name: name })).toEqual(contentType);
    });
  });
});
