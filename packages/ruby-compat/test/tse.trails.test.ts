import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { fsAdapterConfig, getFs, getPath, registerFsAdapter } from "../lib/fs-adapter.js";
import { TSE } from "../lib/tse.js";

describe("TSE#result", () => {
  it("imports the compiled template through the registered path adapter's pathToFileURL", async () => {
    const root = mkdtempSync(join(tmpdir(), "trails-tse-"));
    writeFileSync(
      join(root, "greeting.tt.js"),
      "export default async function () { return `hello ${this.name}`; }\n",
    );
    const previous = fsAdapterConfig.adapter;
    registerFsAdapter("virtual-urls", getFs(), {
      ...getPath(),
      pathToFileURL: (p: string) => pathToFileURL(join(root, p.replace(/^\/virtual\//, ""))),
    });
    fsAdapterConfig.adapter = "virtual-urls";
    try {
      const tse = new TSE("");
      tse.filename = "/virtual/greeting.tt";
      expect(await tse.result({ receiver: { name: "trails" } })).toBe("hello trails");
    } finally {
      fsAdapterConfig.adapter = previous;
    }
  });
});
