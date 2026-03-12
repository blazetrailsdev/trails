import { describe, it, expect, beforeEach } from "vitest";
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

  describe("dot", () => {
    const dot = new Visitors.Dot();

    it("named function", () => {
      const node = new Nodes.NamedFunction("COUNT", [users.get("id")]);
      const out = dot.compile(node);
      expect(out).toContain("NamedFunction");
    });

    it("Arel Nodes BindParam", () => {
      const node = new Nodes.BindParam();
      const out = dot.compile(node);
      expect(out).toContain("BindParam");
    });

    it("ActiveModel Attribute", () => {
      const node = users.get("id");
      const out = dot.compile(node);
      expect(out).toContain("Attribute");
    });

    it("Arel Nodes CurrentRow", () => {
      const node = new Nodes.CurrentRow();
      const out = dot.compile(node);
      expect(out).toContain("CurrentRow");
    });

    it("Arel Nodes Distinct", () => {
      const node = new Nodes.Distinct();
      const out = dot.compile(node);
      expect(out).toContain("Distinct");
    });

    it("Arel Nodes Case and friends", () => {
      const node = new Nodes.Case(users.get("status")).when("active", "A").else("Z");
      const out = dot.compile(node);
      expect(out).toContain("Case");
    });

    it("Arel Nodes InfixOperation", () => {
      const node = new Nodes.InfixOperation("+", users.get("age"), new Nodes.Quoted(1));
      const out = dot.compile(node);
      expect(out).toContain("InfixOperation");
    });

    it("Arel Nodes RegExp", () => {
      const node = new Nodes.Regexp(users.get("name"), new Nodes.Quoted("a.*"));
      const out = dot.compile(node);
      expect(out).toContain("Regexp");
    });

    it("Arel Nodes NotRegExp", () => {
      const node = new Nodes.NotRegexp(users.get("name"), new Nodes.Quoted("a.*"));
      const out = dot.compile(node);
      expect(out).toContain("NotRegexp");
    });

    it("Arel Nodes UnaryOperation", () => {
      const node = new Nodes.UnaryOperation("NOT ", users.get("active"));
      const out = dot.compile(node);
      expect(out).toContain("UnaryOperation");
    });

    it("Arel Nodes With", () => {
      const cte = new Nodes.Cte("t", users.project(users.get("id")).ast);
      const stmt = new SelectManager().with(cte).project("1").ast;
      const out = dot.compile(stmt);
      expect(out).toContain("With");
      expect(out).toContain("Cte");
    });

    it("Arel Nodes SelectCore", () => {
      const stmt = users.project(star).ast;
      const out = dot.compile(stmt.cores[0]);
      expect(out).toContain("SelectCore");
    });

    it("Arel Nodes SelectStatement", () => {
      const stmt = users.project(star).ast;
      const out = dot.compile(stmt);
      expect(out).toContain("SelectStatement");
    });

    it("Arel Nodes InsertStatement", () => {
      const stmt = new InsertManager(users).insert([[users.get("name"), "dean"]]).ast;
      const out = dot.compile(stmt);
      expect(out).toContain("InsertStatement");
    });

    it("Arel Nodes UpdateStatement", () => {
      const stmt = new UpdateManager().table(users).set([[users.get("name"), "sam"]]).ast;
      const out = dot.compile(stmt);
      expect(out).toContain("UpdateStatement");
    });

    it("Arel Nodes DeleteStatement", () => {
      const stmt = new DeleteManager().from(users).ast;
      const out = dot.compile(stmt);
      expect(out).toContain("DeleteStatement");
    });
  });
});
