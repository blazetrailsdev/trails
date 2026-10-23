import { describe, it, expect } from "vitest";
import { MediaType } from "./media-type.js";

describe("when content_type is empty string", () => {
  it("#type is nil", () => {
    expect(MediaType.type("")).toBeNull();
  });

  it("#params is empty", () => {
    expect(MediaType.params("")).toEqual({});
  });
});
