import { MimeType } from "./mime-type.js";
import { eachContentTypeFixture } from "./test-helpers/test-helper.js";
import { expect, it, describe } from "vitest";

describe("MagicAndNameTest", () => {
  eachContentTypeFixture("name", (file, name, contentType) => {
    it(`correctly returns ${contentType} for ${name} given both file and name`, async () => {
      expect(await MimeType.for(file, { name: name })).toEqual(contentType);
    });
  });
});
