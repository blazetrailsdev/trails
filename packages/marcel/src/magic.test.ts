import { Magic } from "./magic.js";
import { MimeType } from "./mime-type.js";
import { eachContentTypeFixture } from "./test-helpers/test-helper.js";
import { expect, it, describe } from "vitest";

describe("Marcel::MimeType::MagicTest", () => {
  eachContentTypeFixture("magic", (file, name, contentType) => {
    it(`gets type for ${contentType} by using only magic bytes ${name}`, async () => {
      expect(await MimeType.for(file)).toEqual(contentType);
    });
  });

  it("add and remove type", async () => {
    await Magic.add("application/x-my-thing", { extensions: "mtg", parents: "application/json" });
    await Magic.remove("application/x-my-thing");
  });

  it("#extensions", async () => {
    const json = Magic.byExtension("json")!;

    expect(json.extensions()).toEqual(["json"]);
  });

  it(".child?", async () => {
    expect(await Magic.isChild("text/csv", "text/plain")).toBeTruthy();
    expect(await Magic.isChild("text/plain", "text/csv")).toBeFalsy();
  });
});
