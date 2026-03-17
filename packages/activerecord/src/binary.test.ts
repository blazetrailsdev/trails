import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";

describe("BinaryTest", () => {
  function makeModel() {
    const adapter = createTestAdapter();
    class BinaryRecord extends Base {
      static {
        this.attribute("data", "string");
        this.adapter = adapter;
      }
    }
    return BinaryRecord;
  }

  it("mixed encoding", async () => {
    const BinaryRecord = makeModel();
    const input = "hello \u00ff world \u2603";
    const r = await BinaryRecord.create({ data: input });
    const reloaded = await BinaryRecord.find(r.id);
    expect(reloaded.readAttribute("data")).toBe(input);
  });

  it("load save", async () => {
    const BinaryRecord = makeModel();
    const r = await BinaryRecord.create({ data: "binary content" });
    const reloaded = await BinaryRecord.find(r.id);
    expect(reloaded.readAttribute("data")).toBe("binary content");
  });

  it("unicode input casting", async () => {
    const BinaryRecord = makeModel();
    const r = await BinaryRecord.create({ data: "こんにちは" });
    const reloaded = await BinaryRecord.find(r.id);
    expect(reloaded.readAttribute("data")).toBe("こんにちは");
  });
});
