import { describe, expect, it } from "vitest";

import { Document } from "../../lib/html5/document.js";

describe("Nokogiri::XML::TestDocument", () => {
  const xml = () => Document.parse("<html><body></body></html>");

  it("create_element with namespace", () => {
    const elm = xml().createElement("foo", { "xmlns:foo": "http://tenderlovemaking.com" });
    expect(elm.namespaces["xmlns:foo"]).toBe("http://tenderlovemaking.com");
  });

  it("create_element with hyphenated namespace", () => {
    const elm = xml().createElement("foo", { "xmlns:SOAP-ENC": "http://tenderlovemaking.com" });
    expect(elm.namespaces["xmlns:SOAP-ENC"]).toBe("http://tenderlovemaking.com");
  });

  it("create_element with invalid namespace", () => {
    const elm = xml().createElement("foo", { "xmlns:SOAP!ENC": "http://tenderlovemaking.com" });
    expect(Object.keys(elm.namespaces)).not.toContain("xmlns:SOAP!ENC");
  });
});
