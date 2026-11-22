import { describe, it, expect } from "vitest";
import { Headers } from "../lib/headers.js";
import { Response } from "../lib/response.js";

describe("Rack::Response", () => {
  it("copies headers given as a Rack::Headers", () => {
    const headers = new Headers();
    headers.set("Content-Type", "text/plain");
    const response = new Response([], 200, headers as never);
    expect(response.headers["content-type"]).toBe("text/plain");
  });
});
