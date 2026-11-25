import { describe, expect, it } from "vitest";
import "../test-helper.ts";
import { Section } from "../../app/models/section.ts";

describe("SectionTest", () => {
  it("markable returns body content", async () => {
    const section = new Section({ body: "Section Content" });
    expect(await section.markable()).toBe("Section Content");
  });

  it("markable returns nil when body is nil", async () => {
    const section = new Section({ body: null });
    expect(await section.markable()).toBeNull();
  });
});
