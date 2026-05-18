import { describe, expect, it } from "vitest";
import { Response } from "../http/response.js";
import { TestResponse } from "./test-response.js";

describe("TestResponse", () => {
  describe(".fromResponse", () => {
    it("builds a TestResponse from a Response", () => {
      const response = new Response(201, { "content-type": "text/html" }, ["<p>ok</p>"]);
      const test = TestResponse.fromResponse(response);
      expect(test).toBeInstanceOf(TestResponse);
      expect(test.status).toBe(201);
      expect(test.body).toBe("<p>ok</p>");
    });
  });

  describe("#parsedBody", () => {
    it("returns the raw body for unknown content types", () => {
      const response = new TestResponse(200, { "content-type": "text/plain" }, ["hello"]);
      expect(response.parsedBody).toBe("hello");
    });

    it("parses JSON when content type is application/json", () => {
      const response = new TestResponse(200, { "content-type": "application/json" }, [
        '{"id":42,"title":"Title"}',
      ]);
      expect(response.parsedBody).toEqual({ id: 42, title: "Title" });
    });

    it("memoizes the parsed result", () => {
      const response = new TestResponse(200, { "content-type": "application/json" }, ['{"a":1}']);
      const first = response.parsedBody;
      const second = response.parsedBody;
      expect(first).toBe(second);
    });

    it("returns the raw body for HTML (no DOM parser ported yet)", () => {
      const response = new TestResponse(200, { "content-type": "text/html" }, ["<p>hi</p>"]);
      expect(response.parsedBody).toBe("<p>hi</p>");
    });
  });

  describe("#responseParser", () => {
    it("returns an identity parser for unregistered content types", () => {
      const response = new TestResponse(200, { "content-type": "application/x-unknown" }, ["x"]);
      expect(response.responseParser("anything")).toBe("anything");
    });
  });
});
