import { describe, it } from "vitest";

describe("ExplicitContentTypeTest", () => {
  it.skip("default response is text/plain and UTF8", () => {});
  it.skip("setting the content type of the response directly on the response object", () => {});
  it.skip("setting the content type of the response as an option to render", () => {});
});

describe("ImpliedContentTypeTest", () => {
  it.skip("sets Content-Type as text/html when rendering *.html.erb", () => {});
  it.skip("sets Content-Type as application/xml when rendering *.xml.erb", () => {});
  it.skip("sets Content-Type as text/html when rendering *.html.builder", () => {});
  it.skip("sets Content-Type as application/xml when rendering *.xml.builder", () => {});
});

describe("ExplicitCharsetTest", () => {
  it.skip("setting the charset of the response directly on the response object", () => {});
  it.skip("setting the charset of the response as nil directly on the response object", () => {});
});
