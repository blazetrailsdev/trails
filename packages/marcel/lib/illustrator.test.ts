import { MimeType } from "./mime-type.js";
import { files } from "./test-helpers/test-helper.js";
import { expect, it, describe } from "vitest";

describe("Marcel::MimeType::IllustratorTest", () => {
  it(".ai uploaded as application/postscript", async () => {
    const file = files("name/application/illustrator/illustrator.ai");

    expect(
      await MimeType.for(file, { name: "illustrator.ai", declaredType: "application/postscript" }),
    ).toEqual("application/illustrator");
  });
});
