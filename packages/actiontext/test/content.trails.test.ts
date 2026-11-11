import { describe, expect, it } from "vitest";
import "./test-helper.js";
import { Content } from "../lib/content.js";
import { RemoteImage } from "../lib/attachables/remote-image.js";

describe("ActionText::Content (trails)", () => {
  it("canonicalizes Trix attachments and galleries when awaited", async () => {
    const trix = `<figure data-trix-attachment='{"sgid":"123","contentType":"text/plain"}'></figure>`;
    const gallery =
      '<div class="attachment-gallery attachment-gallery--2"><action-text-attachment sgid="1" presentation="gallery"></action-text-attachment><action-text-attachment sgid="2" presentation="gallery"></action-text-attachment></div>';
    const content = await new Content(trix + gallery).canonicalized;
    expect(content.toHtml()).toBe(
      '<action-text-attachment sgid="123" content-type="text/plain"></action-text-attachment><div><action-text-attachment sgid="1" presentation="gallery"></action-text-attachment><action-text-attachment sgid="2" presentation="gallery"></action-text-attachment></div>',
    );
  });

  it("keeps the markup as given with canonicalize: false", async () => {
    const html = '<action-text-attachment sgid="1"><div>HTML</div></action-text-attachment>';
    const content = await new Content(html, { canonicalize: false }).canonicalized;
    expect(content.toHtml()).toBe(html);
  });

  it("extracts unique links and remote image attachments", async () => {
    const content = await new Content(
      '<a href="http://a/">a</a><a href="http://a/">a</a><action-text-attachment content-type="image" url="http://a/cat.jpg" caption="Cat"></action-text-attachment>',
    ).canonicalized;
    expect(content.links()).toEqual(["http://a/"]);
    const attachments = await content.attachments();
    expect(attachments).toHaveLength(1);
    expect(attachments[0]!.caption).toBe("Cat");
    expect(attachments[0]!.attachable).toBeInstanceOf(RemoteImage);
  });

  it("converts attachments to Trix markup", async () => {
    const content = await new Content(
      '<action-text-attachment sgid="123"></action-text-attachment>',
    ).canonicalized;
    expect((await content.toTrixHtml()).trim()).toBe(
      '<figure data-trix-attachment="{&quot;sgid&quot;:&quot;123&quot;}"></figure>',
    );
  });

  it("compares equal content by html and inspects truncated html", async () => {
    const content = await new Content("<div>test</div>").canonicalized;
    expect(content.equals(await new Content("<div>test</div>").canonicalized)).toBe(true);
    expect(content.equals("<div>test</div>")).toBeNull();
    expect(content.asJson()).toBe("<div>test</div>");
    expect(content.inspect()).toBe('#<ActionText::Content "<div>test</div>">');
  });
});
