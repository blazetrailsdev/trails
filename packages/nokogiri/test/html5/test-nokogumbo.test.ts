import { describe, expect, it } from "vitest";

import { DocumentFragment } from "../../lib/html5/document-fragment.js";

function buffer(): string {
  return `<html>
  <head>
    <meta charset="utf-8"/>
    <title>hello world</title>
    <script> if (a < b) alert(1) </script>
  </head>
  <body>
    <h1>hello world</h1>
    <main>
      <span>content</span>
    </main>
    <!-- test comment -->
    <form>
      <textarea>foo<x>bar</textarea>
    </form>
  </body>
</html>
`;
}

describe("TestHtml5Nokogumbo", () => {
  it("fragment_body", () => {
    const doc = DocumentFragment.parse(/<body>([\s\S]*?)<\/body>/.exec(buffer())![1]);
    expect(doc.xpath("main/span").toXml()).toBe("<span>content</span>");
    expect(doc.xpath("comment()").text).toBe(" test comment ");
  });
});
