import { it, expect } from "vitest";
import { ContentLength } from "./content-length.js";
import { MockResponse } from "./mock-response.js";

const bytes = Uint8Array.from([0x00, 0x80, 0xe2, 0xff, 0x41]);

it("appends a byte chunk to the body one character per byte", () => {
  const response = new MockResponse(200, {}, [bytes, "ok"]);

  expect(response.body).toBe("\u0000\u0080âÿAok");
});

it("Rack::ContentLength counts a byte chunk by its bytes", async () => {
  const app = new ContentLength(async () => [200, {}, [bytes, "—"]]);

  expect((await app.call({}))[1]["content-length"]).toBe("8");
});
