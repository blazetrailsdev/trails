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
