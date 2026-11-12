import { describe, expect, it } from "vitest";
import { HTML4 } from "@blazetrails/html-sanitizer";
import { ContentHelper } from "../lib/content-helper.js";

describe("ContentHelperTest", () => {
  it("sanitizer defaults to the HTML4 safe list sanitizer", () => {
    expect(ContentHelper.sanitizer).toBeInstanceOf(HTML4.SafeListSanitizer);
    expect(new ContentHelper().sanitizer).toBe(ContentHelper.sanitizer);
  });

  it("allows the attachment tag and attributes by default", () => {
    const helper = new ContentHelper();
    expect([...helper.sanitizerAllowedTags()]).toEqual(
      expect.arrayContaining(["action-text-attachment", "figure", "figcaption"]),
    );
    expect([...helper.sanitizerAllowedAttributes()]).toEqual(
      expect.arrayContaining(["sgid", "content-type", "presentation"]),
    );
  });

  it("sanitizes content attachments", () => {
    const helper = new ContentHelper();
    expect(helper.sanitizeContentAttachment("<figure>x<script>alert(1)</script></figure>")).toBe(
      "<figure>xalert(1)</figure>",
    );
  });
});
