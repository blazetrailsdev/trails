import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  Table,
  sql,
  star,
  SelectManager,
  InsertManager,
  UpdateManager,
  DeleteManager,
  Nodes,
  Visitors,
  Collectors,
} from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("substitute-bind-collector", () => {
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
});
