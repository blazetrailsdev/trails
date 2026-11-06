import { describe, expect, it } from "vitest";
import { Mail, Part } from "./index.js";

describe("Mail::Message YAML", () => {
  it("round-trips a multipart message through toYaml and fromYaml", () => {
    const mail = new Mail.Message({ to: "someone@somewhere.com", subject: "subject" });
    mail.addPart(new Part({ body: "text" }));
    mail.addPart(new Part({ body: "<p>html</p>", contentType: "text/html" }));
    const yaml = mail.toYaml();
    const hash = Mail.YAML.load(yaml) as Map<string, unknown>;
    expect(hash.has("@body_raw") && !hash.has("@header")).toBe(true);
    const deserialized = Mail.Message.fromYaml(yaml);
    expect(deserialized.subject()).toEqual("subject");
    const bodies = Array.from(deserialized.parts, (p) => p.body().decoded());
    expect(bodies).toEqual(["text", "<p>html</p>"]);
  });
});

describe("Mail::Message binary raw source", () => {
  it("keeps a Latin-1 8-bit body as its bytes", () => {
    const body = new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0d, 0x0a]);
    const raw = new Uint8Array([
      ...new TextEncoder().encode(
        "From: a@b.com\r\nSubject: hi\r\nContent-Type: text/plain; charset=ISO-8859-1\r\nContent-Transfer-Encoding: 8bit\r\n\r\n",
      ),
      ...body,
    ]);
    const mail = new Mail.Message(raw);
    expect(mail.subject()).toBe("hi");
    expect(mail.body().rawSource).toEqual(body);
    expect(mail.body().decoded()).toEqual(body);
  });

  it("keeps a Latin-1 header value and a leading 0xA0 byte as bytes", () => {
    const raw = new Uint8Array([
      ...new TextEncoder().encode("X-Note: caf"),
      0xe9,
      ...new TextEncoder().encode("\r\n\r\nbody"),
    ]);
    const field = new Mail.Message(raw).header().fields.find((f) => f.name === "X-Note")!;
    expect(field.unparsedValue).toEqual(new Uint8Array([0x63, 0x61, 0x66, 0xe9]));
    const lead = new Mail.Message(new Uint8Array([0xa0, 0x0d, 0x0a, 0x0d, 0x0a, 0x78]));
    expect(lead.header().rawSource).toEqual(new Uint8Array([0xa0]));
  });
});
