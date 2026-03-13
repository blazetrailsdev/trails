import { describe, it, expect } from "vitest";
import { Collectors } from "../index.js";

describe("Arel", () => {
  describe("sql-string", () => {
    it("returned sql uses utf8 encoding", () => {
      const collector = new Collectors.SQLString();
      collector.append("SELECT");
      const result = collector.value;
      expect(typeof result).toBe("string");
    });

    it("compile", () => {
      const collector = new Collectors.SQLString();
      collector.append("SELECT ");
      collector.append("1");
      expect(collector.value).toBe("SELECT 1");
    });
  });
});
