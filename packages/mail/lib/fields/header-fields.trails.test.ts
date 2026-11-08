import { describe, expect, it } from "vitest";
import { ContentLocationField } from "./content-location-field.js";
import { ReceivedField } from "./received-field.js";

describe("nil interpolation in header fields", () => {
  it("renders a nil location as an empty string", () => {
    expect(new ContentLocationField("").encoded()).toEqual("Content-Location: \r\n");
  });

  it("renders a nil formatted date as an empty string", () => {
    const t = new ReceivedField("a by b; Mon, 29 Jul 2013 25:12:46 +0900");
    expect(t.encoded()).toEqual("Received: a by b; \r\n");
    expect(t.decoded()).toEqual("a by b; ");
  });
});
