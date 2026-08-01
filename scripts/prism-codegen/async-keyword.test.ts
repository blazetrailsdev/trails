import { describe, it, expect } from "vitest";
import { generateFromSource } from "./index.js";

async function gen(ruby: string, asyncMethods: string[]): Promise<string> {
  const { code } = await generateFromSource(ruby, new Set(asyncMethods));
  return code;
}

describe("async keyword", () => {
  it("keeps async on a def whose body awaits", async () => {
    const code = await gen("class R\n  def a\n    size()\n  end\nend\n", ["a", "size"]);
    expect(code).toContain("await this.size()");
    expect(code).toContain("async a()");
  });

  it("drops async from a def the receiver rule left await-free", async () => {
    const code = await gen("class R\n  def a\n    rows.size\n  end\nend\n", ["a", "size"]);
    expect(code).not.toContain("await");
    expect(code).not.toContain("async a()");
    expect(code).toContain("a() {");
  });

  it("drops async from a def the manifest names but that never awaits", async () => {
    const code = await gen("class R\n  def a\n    1\n  end\nend\n", ["a"]);
    expect(code).not.toContain("async a()");
  });

  it("keeps async when only one of several calls awaits", async () => {
    const ruby = "class R\n  def a\n    rows.size\n    size()\n  end\nend\n";
    expect(await gen(ruby, ["a", "size"])).toContain("async a()");
  });

  it("looks through nested control flow for the await", async () => {
    const ruby = "class R\n  def a\n    if b\n      size()\n    end\n  end\nend\n";
    expect(await gen(ruby, ["a", "size"])).toContain("async a()");
  });

  it("leaves a constructor alone", async () => {
    const code = await gen("class R\n  def initialize\n    @a = 1\n  end\nend\n", ["constructor"]);
    expect(code).not.toContain("async constructor");
  });
});
