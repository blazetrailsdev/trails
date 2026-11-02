import { describe, expect, it } from "vitest";
import "./index.js";
import { Part } from "./part.js";

describe("Mail::Part", () => {
  it("should not add a default Content-ID", () => {
    const part = new Part();
    part.toString();
    expect(part.contentId()).toBeNull();
  });

  it("should add a default Content-ID to inline attachments", () => {
    const part = new Part({ contentDisposition: "inline" });
    part.toString();
    expect(part.contentId()).not.toBeNull();
  });

  it("should not add a Date, MIME-Version, or Message-ID", () => {
    const part = new Part();
    part.toString();
    expect(part.date()).toBeNull();
    expect(part.mimeVersion()).toBeNull();
    expect(part.messageId()).toBeNull();
  });

  it("should add a content_id if there is none and is asked for an inline_content_id", () => {
    expect(new Part().cid()).not.toBeNull();
  });

  it("should correctly parse plain text raw source and not truncate after newlines - issue 208", () => {
    const part = new Part("First Line\n\nSecond Line\n\nThird Line\n\n");
    expect(part.get("content_type").contentType()).toEqual("text/plain");
    expect(part.toString()).toMatch(/^First Line\r\n\r\nSecond Line\r\n\r\nThird Line/m);
  });
});
