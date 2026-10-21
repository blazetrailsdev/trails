import { MimeType } from "./mime-type.js";
import { eachContentTypeFixture } from "./test-helpers/test-helper.js";
import { expect, it, describe } from "vitest";

describe("MagicAndDeclaredTypeTest", () => {
  eachContentTypeFixture("name", (file, name, contentType) => {
    it(`correctly returns ${contentType ?? ""} for ${name ?? ""} given both file and declared type`, async () => {
      expect(await MimeType.for(file, { declaredType: contentType })).toEqualRuby(contentType);
    });
  });
});
