import { describe, expect, it } from "vitest";
import "../test-helper.js";
import { Page } from "../dummy/app/models/page.js";

describe("ActionText::AttachmentTest", () => {
  it.skip("from_attachable", () => {});

  it.skip("proxies missing methods to attachable", () => {});

  it.skip("proxies #to_param to attachable", () => {});

  it.skip("converts to TrixAttachment", () => {});

  it.skip("converts to TrixAttachment with content", () => {});

  it.skip("converts to plain text", () => {});

  it.skip("converts HTML content attachment", () => {});

  it.skip("renders content attachment", () => {});

  it.skip("to_trix_html sanitizes action-text HTML content attachment", () => {});

  it("defaults trix partial to model partial", async () => {
    const attachable = await Page.createBang({ title: "Homepage" });
    expect(attachable.toTrixContentAttachmentPartialPath()).toBe("pages/page");
  });
});
