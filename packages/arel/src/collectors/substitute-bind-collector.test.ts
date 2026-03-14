import { describe, it, expect, vi } from "vitest";
import { Collectors } from "../index.js";

describe("TestSubstituteBindCollector", () => {
  it("compile", () => {
    const quoter = { quote: (v: unknown) => `<<${String(v)}>>` };
    const collector = new Collectors.SubstituteBindCollector(quoter);
    collector.append("SELECT ");
    collector.addBind("abc");
    expect(collector.value).toBe("SELECT <<abc>>");
  });

  it("quoting is delegated to quoter", () => {
    const quote = vi.fn((v: unknown) => `Q(${String(v)})`);
    const quoter = { quote };
    const collector = new Collectors.SubstituteBindCollector(quoter);
    collector.addBind(5);
    expect(quote).toHaveBeenCalledWith(5);
    expect(collector.value).toBe("Q(5)");
  });
});
