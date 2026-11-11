import { describe, expect, it } from "vitest";
import { Attachable } from "../lib/attachable.js";
import { ContentAttachment } from "../lib/attachables/content-attachment.js";
import { MissingAttachable } from "../lib/attachables/missing-attachable.js";
import { RemoteImage } from "../lib/attachables/remote-image.js";
import { HtmlConversion } from "../lib/html-conversion.js";
import { Person } from "./dummy/app/models/person.js";
import "./test-helper.js";

function node(attributes: Record<string, unknown>) {
  return HtmlConversion.createElement("action-text-attachment", attributes);
}

describe("ActionText::Attachable", () => {
  it("from_node locates the attachable by its sgid", async () => {
    const person = await Person.createBang({ name: "Javan" });
    const attachable = await Attachable.fromNode(node({ sgid: person.attachableSgid() }));
    expect((attachable as Person).id).toBe(person.id);
    expect(person.toRichTextAttributes()).toMatchObject({
      sgid: person.attachableSgid(),
      contentType: "application/octet-stream",
    });
  });

  it("from_node falls through to a content attachment, a remote image, then missing", async () => {
    const content = await Attachable.fromNode(
      node({ "content-type": "text/html", content: "abc" }),
    );
    expect(content).toBeInstanceOf(ContentAttachment);
    expect((content as ContentAttachment).content).toBe("abc");

    const image = await Attachable.fromNode(
      node({ url: "http://example.com/a.png", "content-type": "image/png" }),
    );
    expect(image).toBeInstanceOf(RemoteImage);
    expect((image as RemoteImage).attachablePlainTextRepresentation(null)).toBe("[Image]");

    const missing = await Attachable.fromNode(node({ sgid: "bogus" }));
    expect(missing).toBeInstanceOf(MissingAttachable);
    expect((missing as MissingAttachable).toPartialPath()).toBe(
      "action_text/attachables/missing_attachable",
    );
  });

  it("a missing attachable whose model resolves uses its partial path", async () => {
    const person = await Person.createBang({ name: "Javan" });
    const sgid = person.attachableSgid();
    await person.destroy();
    const missing = (await Attachable.fromNode(node({ sgid }))) as MissingAttachable;
    expect(missing).toBeInstanceOf(MissingAttachable);
    expect(missing.model()).toBe(Person);
    expect(missing.toPartialPath()).toBe("people/missing_attachable");
  });
});
