import { MimeType } from "../lib/mime-type.js";
import { eachContentTypeFixture } from "./support/test-helper.js";
import { expect, it, describe } from "vitest";

describe("Marcel::MimeType::MagicAndDeclaredTypeTest", () => {
  eachContentTypeFixture("name", (file, name, contentType) => {
    it(`correctly returns ${contentType} for ${name} given both file and declared type`, async () => {
      expect(await MimeType.for(file, { declaredType: contentType })).toEqual(contentType);
    });
  });
});
