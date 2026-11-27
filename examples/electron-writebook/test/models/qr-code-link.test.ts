import { describe, expect, it } from "vitest";
import "../test-helper.ts";
import { QrCodeLink } from "../../app/models/qr-code-link.ts";

describe("QrCodeLinkTest", () => {
  it("links can be signed and verified", () => {
    const link = new QrCodeLink("https://example.com");
    const signedLink = link.signed();

    const verified = QrCodeLink.fromSigned(signedLink);
    expect(verified.url).toBe(link.url);
  });
});
