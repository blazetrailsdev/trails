import { describe, it, expect } from "vitest";
import { IndifferentCoder } from "./store.js";

describe("StoreTrailsTest", () => {
  it("a value that implements neither load nor dump resolves through YAMLColumn", () => {
    const coder = new IndifferentCoder("settings", null);
    const dumped = coder.dump({ color: "black" }) as string;

    expect(dumped).toContain("color: black");
    expect(coder.load(dumped).get("color")).toBe("black");
  });
});
