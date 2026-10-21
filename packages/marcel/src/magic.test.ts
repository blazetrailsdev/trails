import { Magic } from "./magic.js";
import { MimeType } from "./mime-type.js";
import { eachContentTypeFixture } from "./test-helpers/test-helper.js";
import { expect, it, describe } from "vitest";

/** @noRailsEquivalent CONVERGEABLE marcel-magic-bytes-match-binary-io */
const MAGIC_BYTES_FAILURES = new Set([
  "application/postscript/illustrator.eps",
  "application/postscript/photoshop.eps",
  "audio/webm/webm.webm",
  "image/jpeg/jpeg.jpg",
  "image/png/png.png",
  "video/webm/webm.mkv",
]);

describe("MagicTest", () => {
  eachContentTypeFixture("magic", (file, name, contentType) => {
    (MAGIC_BYTES_FAILURES.has(name ?? "") ? it.fails : it)(
      `gets type for ${contentType ?? ""} by using only magic bytes ${name ?? ""}`,
      async () => {
        expect(await MimeType.for(file)).toEqualRuby(contentType);
      },
    );
  });
  it("add and remove type", async () => {
    await Magic.add("application/x-my-thing", { extensions: "mtg", parents: "application/json" });
    await Magic.remove("application/x-my-thing");
  });
  it("#extensions", async () => {
    const json = await Magic.byExtension("json");
    expect(await json.extensions()).toEqual(["json"]);
  });
  it(".child?", async () => {
    expect(await Magic.isChild("text/csv", "text/plain")).toBeRubyTruthy();
    expect(await Magic.isChild("text/plain", "text/csv")).toBeRubyFalsy();
  });
});
