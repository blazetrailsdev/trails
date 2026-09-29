import { describe, expect, it } from "vitest";
import { Response } from "./response.js";

describe("ActionDispatch::Response#location", () => {
  it("is nil when no Location header is set, as Rack's get_header answers", () => {
    const response = new Response();
    expect(response.location).toBeUndefined();
    response.location = "http://example.com/";
    expect(response.location).toBe("http://example.com/");
  });
});
