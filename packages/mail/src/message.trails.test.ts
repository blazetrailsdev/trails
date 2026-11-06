import { describe, expect, it } from "vitest";
import { Body, type Field, Mail, Part } from "./index.js";

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

  it("negotiates a binary body by its bytes", () => {
    const body = new Body(new Uint8Array([...new TextEncoder().encode("abcdefgh"), 0xe9]));
    expect(String(body.negotiateBestEncoding("7bit"))).toBe("quoted-printable");
  });

  it("unfolds a folded Latin-1 header value", () => {
    const raw = new Uint8Array([
      ...new TextEncoder().encode("Subject: caf"),
      0xe9,
      ...new TextEncoder().encode("\r\n x\r\n\r\nbody"),
    ]);
    const value = (new Mail.Message(raw).header().get("Subject") as Field)
      .value as unknown as Uint8Array;
    expect(Array.from(value)).not.toContain(0x0d);
  });

  it("appends a binary body's bytes to the encoded message", () => {
    const mail = new Mail.Message(new TextEncoder().encode("Subject: hi\r\n\r\nabc"));
    const encoded = mail.encoded() as Uint8Array;
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(encoded)).toMatch(/\r\n\r\nabc$/);
  });

  it("compares binary-source messages by their encoded bytes", () => {
    const raw = new TextEncoder().encode("Message-ID: <a@b>\r\nSubject: hi\r\n\r\nabc");
    expect(new Mail.Message(raw).equals(new Mail.Message(raw))).toBe(true);
  });

  it("encodes a multipart body with an 8-bit preamble as bytes", () => {
    const raw = new Uint8Array([
      0xe9,
      ...new TextEncoder().encode("\r\n--b\r\nContent-Type: text/plain\r\n\r\nhi\r\n--b--\r\n"),
    ]);
    const body = new Body(raw).splitBang("b");
    const encoded = body.encoded();
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect((encoded as Uint8Array)[0]).toBe(0xe9);
  });
});
