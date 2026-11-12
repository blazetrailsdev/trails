import { describe, expect, it } from "vitest";

import { Document } from "../../lib/html5/document.js";

describe("Nokogiri::HTML5::Document#create_element", () => {
  const xml = () => Document.parse("<html><body></body></html>");

  it("creates an element with namespace", () => {
    const elm = xml().createElement("foo", { "xmlns:foo": "http://tenderlovemaking.com" });
    expect(elm.namespaces["xmlns:foo"]).toBe("http://tenderlovemaking.com");
  });

  it("creates an element with hyphenated namespace", () => {
    const elm = xml().createElement("foo", { "xmlns:SOAP-ENC": "http://tenderlovemaking.com" });
    expect(elm.namespaces["xmlns:SOAP-ENC"]).toBe("http://tenderlovemaking.com");
  });

  it("creates an element with invalid namespace", () => {
    const elm = xml().createElement("foo", { "xmlns:SOAP!ENC": "http://tenderlovemaking.com" });
    expect(Object.keys(elm.namespaces)).not.toContain("xmlns:SOAP!ENC");
  });
});
