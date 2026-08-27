import { describe, it, expect } from "vitest";
import { Attribute as ModelAttribute, ValueType } from "@blazetrails/activemodel";
import { Temporal } from "@blazetrails/date";
import {
  Table,
  star,
  SelectManager,
  InsertManager,
  UpdateManager,
  DeleteManager,
  Nodes,
  Visitors,
} from "../index.js";
import { Node as DotNode } from "./dot.js";

function visitStandalone(value: unknown): string {
  const v = new Visitors.Dot();
  v.compile(new Nodes.SqlLiteral(""));
  (v as unknown as { visit(o: unknown): void }).visit(value);
  return (v as unknown as { toDot(): string }).toDot();
}

describe("Dot (trails-only)", () => {
  const users = new Table("users");
  const dot = new Visitors.Dot();

  it("labels a NamedFunction node", () => {
    const node = new Nodes.NamedFunction("COUNT", [users.get("id")]);
    expect(dot.compile(node)).toMatch('[label="<f0>NamedFunction"]');
  });

  it("walks a With node's Cte children", () => {
    const cte = new Nodes.Cte("t", users.project(users.get("id")).ast);
    const out = dot.compile(new SelectManager().with(cte).project("1").ast);
    expect(out).toMatch('[label="<f0>With"]');
    expect(out).toMatch('[label="<f0>Cte"]');
  });

  it("walks a projected SelectCore", () => {
    const stmt = users.project(star()).ast;
    const out = dot.compile(stmt.cores[0]);
    expect(out).toMatch('[label="<f0>SelectCore"]');
    expect(out).toMatch(/->.*label="projections"/);
  });

  it("walks a manager-built InsertStatement's values", () => {
    const stmt = new InsertManager(users).insert([[users.get("name"), "dean"]]).ast;
    const out = dot.compile(stmt);
    expect(out).toMatch('[label="<f0>InsertStatement"]');
    expect(out).toMatch('[label="<f0>ValuesList"]');
  });

  it("walks a manager-built UpdateStatement's assignments", () => {
    const stmt = new UpdateManager().table(users).set([[users.get("name"), "sam"]]).ast;
    const out = dot.compile(stmt);
    expect(out).toMatch('[label="<f0>UpdateStatement"]');
    expect(out).toMatch('[label="<f0>Assignment"]');
  });

  it("walks a manager-built DeleteStatement's relation", () => {
    const stmt = new DeleteManager().from(users).ast;
    const out = dot.compile(stmt);
    expect(out).toMatch('[label="<f0>DeleteStatement"]');
    expect(out).toMatch('[label="<f0>Table"]');
  });
});

describe("TestDot", () => {
  const users = new Table("users");
  const dot = new Visitors.Dot();
  it("Arel Nodes And", () => {
    const node = new Nodes.And([users.get("id"), users.get("name")]);
    const out = dot.compile(node);
    expect(out).toContain("And");
    expect(out).toContain('[label="0"]');
    expect(out).toContain('[label="1"]');
  });

  it("Arel Nodes Or", () => {
    const node = new Nodes.Or([users.get("id"), users.get("name")]);
    const out = dot.compile(node);
    expect(out).toContain("Or");
    expect(out).toContain('[label="0"]');
  });

  it("Arel Nodes SqlLiteral", () => {
    const node = new Nodes.SqlLiteral("RAW SQL");
    const out = dot.compile(node);
    expect(out).toContain("RAW SQL");
  });

  describe("output structure (Rails parity)", () => {
    it("emits the Rails dot.rb header and shape", () => {
      const out = dot.compile(new Nodes.Distinct());
      expect(out).toMatch(/^digraph "Arel" \{\n/);
      expect(out).toContain("node [width=0.375,height=0.25,shape=record];");
      expect(out).toMatch(/\n\}$/);
      expect(out).toMatch(/^\d+ \[label="<f0>Distinct"\];$/m);
    });

    it("emits one edge per visit_edge declaration with the field name as label", () => {
      const node = new Nodes.Equality(users.get("id"), new Nodes.SqlLiteral("1"));
      const out = dot.compile(node);
      expect(out).toMatch(/-> \d+ \[label="left"\];/);
      expect(out).toMatch(/-> \d+ \[label="right"\];/);
    });

    it("emits an InfixOperation's three edges in Rails order: operator, left, right", () => {
      const node = new Nodes.InfixOperation("+", users.get("age"), new Nodes.Quoted(1));
      const out = dot.compile(node);
      const operatorPos = out.indexOf('[label="operator"]');
      const leftPos = out.indexOf('[label="left"]');
      const rightPos = out.indexOf('[label="right"]');
      expect(operatorPos).toBeGreaterThan(-1);
      expect(operatorPos).toBeLessThan(leftPos);
      expect(leftPos).toBeLessThan(rightPos);
    });

    it("collapses to a leaf for visit_NoEdges nodes (CurrentRow, Distinct)", () => {
      const out = dot.compile(new Nodes.CurrentRow());
      const edges = (out.match(/->/g) ?? []).length;
      expect(edges).toBe(0);
    });

    it("escapes embedded double-quotes in side-field labels (quote helper)", () => {
      const node = new Nodes.SqlLiteral('say "hi"');
      const out = dot.compile(node);
      expect(out).toContain('say \\"hi\\"');
    });

    it("null/undefined values render as empty side-fields (Rails nil.to_s parity)", () => {
      const v = new Visitors.Dot();
      type Internals = {
        visit(o: unknown): void;
        toDot(): string;
      };
      v.compile(new Nodes.SqlLiteral("seed"));
      (v as unknown as Internals).visit(null);
      const out = (v as unknown as Internals).toDot();
      expect(out).toMatch(/<f0>NilClass\|<f1>"/);
      expect(out).not.toContain("null");
      expect(out).not.toContain("undefined");
    });

    it("primitive leaf visitors stash their value as a side-field (visit_String aliases)", () => {
      const v = new Visitors.Dot();
      type Internals = {
        visitInteger(o: unknown): void;
        visitTrueClass(o: unknown): void;
        visitNilClass(o: unknown): void;
        withNode(node: DotNode, block: () => void): void;
        toDot(): string;
      };
      type WithBigDecimal = Internals & {
        visitBigDecimal(o: unknown): void;
        visitSymbol(o: unknown): void;
      };
      const iv = v as unknown as WithBigDecimal;
      v.compile(new Nodes.SqlLiteral("seed"));
      const node = new DotNode("Integer", 0);
      (v as unknown as { nodes: DotNode[] }).nodes.push(node);
      iv.withNode(node, () => {
        iv.visitInteger(42);
        iv.visitTrueClass(true);
        iv.visitNilClass(null);
        iv.visitBigDecimal("9.99");
        iv.visitSymbol("sym");
      });
      const out = iv.toDot();
      expect(out).toContain("<f0>Integer|<f1>42|<f2>true|<f3>|<f4>9.99|<f5>sym");
    });

    it("visit_Set is aliased to visit_Array (each member becomes an indexed child)", () => {
      const v = new Visitors.Dot();
      type Internals = {
        visitSet(o: ReadonlySet<unknown>): void;
        withNode(node: DotNode, block: () => void): void;
        toDot(): string;
      };
      const iv = v as unknown as Internals;
      v.compile(new Nodes.SqlLiteral("seed"));
      const node = new DotNode("Set", 0);
      (v as unknown as { nodes: DotNode[] }).nodes.push(node);
      iv.withNode(node, () => {
        iv.visitSet(new Set([new Nodes.SqlLiteral("a"), new Nodes.SqlLiteral("b")]));
      });
      const out = iv.toDot();
      expect(out).toMatch(/-> \d+ \[label="0"\];/);
      expect(out).toMatch(/-> \d+ \[label="1"\];/);
    });

    it("raises TypeError on a class with no visitable ancestor (visitor.rb:39)", () => {
      class Money {
        toString(): string {
          return "$5";
        }
      }
      const v = new Visitors.Dot();
      type Internals = { visit(o: unknown): void };
      v.compile(new Nodes.SqlLiteral("seed"));
      expect(() => (v as unknown as Internals).visit(new Money())).toThrow(
        new TypeError("Cannot visit Money"),
      );
    });

    it("a mis-registered dispatch method falls through to an ancestor's handler", () => {
      class Weird extends Nodes.Unary {}
      const v = new Visitors.Dot();
      (v as unknown as { dispatch: Map<unknown, string> }).dispatch.set(Weird, "visitTypoed");
      type Internals = { visit(o: unknown): void };
      v.compile(new Nodes.SqlLiteral("seed"));
      expect(() => (v as unknown as Internals).visit(new Weird(null))).not.toThrow();
    });

    it("Temporal values reach visit_Date / visit_Time instead of raising", () => {
      const v = new Visitors.Dot();
      type Internals = { visit(o: unknown): void; toDot(): string };
      const iv = v as unknown as Internals;
      v.compile(new Nodes.SqlLiteral("seed"));
      iv.visit(Temporal.PlainDate.from("2024-01-02"));
      iv.visit(Temporal.PlainDateTime.from("2024-01-02T03:04:05"));
      iv.visit(Temporal.Instant.from("2024-01-02T03:04:05Z"));
      const out = iv.toDot();
      expect(out).toContain("<f0>Date|<f1>2024-01-02");
      expect(out).toContain("<f0>DateTime|<f1>2024-01-02T03:04:05");
      expect(out).toContain("<f0>Time|<f1>2024-01-02T03:04:05Z");
    });

    it("Temporal types with no Ruby analogue raise rather than becoming Time leaves", () => {
      const v = new Visitors.Dot();
      type Internals = { visit(o: unknown): void };
      const iv = v as unknown as Internals;
      v.compile(new Nodes.SqlLiteral("seed"));
      expect(() => iv.visit(Temporal.Duration.from({ hours: 1 }))).toThrow(TypeError);
      expect(() => iv.visit(Temporal.PlainYearMonth.from("2024-01"))).toThrow(TypeError);
      expect(() => iv.visit(Temporal.PlainMonthDay.from("01-02"))).toThrow(TypeError);
    });

    it("visitEdge throws on a typo'd field (Rails NoMethodError parity)", () => {
      const v = new Visitors.Dot();
      v.compile(new Nodes.SqlLiteral("seed"));
      type Internals = { visitEdge(o: object, method: string): void };
      const tbl = new Table("users");
      expect(() => (v as unknown as Internals).visitEdge(tbl, "definitelyNotAField")).toThrow(
        /undefined method 'definitelyNotAField' for Table/,
      );
    });

    it("UpdateStatement emits Rails' seven edges and no groups/havings", () => {
      const stmt = new UpdateManager()
        .table(users)
        .set([[users.get("name"), "x"]])
        .group([users.get("dept")])
        .having(users.get("active").eq(true)).ast;
      const out = dot.compile(stmt);
      expect(out).toContain("UpdateStatement");
      expect(out).not.toMatch(/-> \d+ \[label="groups"\];/);
      expect(out).not.toMatch(/-> \d+ \[label="havings"\];/);
      expect(out).toMatch(/-> \d+ \[label="values"\];/);
      expect(out).toMatch(/-> \d+ \[label="key"\];/);
    });

    it("DeleteStatement emits Rails' six edges and no groups/havings", () => {
      const stmt = new DeleteManager()
        .from(users)
        .group([users.get("dept")])
        .having(users.get("active").eq(true)).ast;
      const out = dot.compile(stmt);
      expect(out).toContain("DeleteStatement");
      expect(out).not.toMatch(/-> \d+ \[label="groups"\];/);
      expect(out).not.toMatch(/-> \d+ \[label="havings"\];/);
      expect(out).toMatch(/-> \d+ \[label="wheres"\];/);
      expect(out).toMatch(/-> \d+ \[label="key"\];/);
    });

    it("repeated equal scalar primitives dedupe onto one DotNode (Rails singleton parity)", () => {
      const v = new Visitors.Dot();
      type Internals = { visit(o: unknown): void; toDot(): string };
      v.compile(new Nodes.SqlLiteral("seed"));
      (v as unknown as Internals).visit(true);
      (v as unknown as Internals).visit(true);
      (v as unknown as Internals).visit(42);
      (v as unknown as Internals).visit(42);
      const out = (v as unknown as Internals).toDot();
      const trueMatches = out.match(/<f0>TrueClass\|<f1>true"\];/g) ?? [];
      expect(trueMatches.length).toBe(1);
      const fortyTwoMatches = out.match(/<f0>Integer\|<f1>42"\];/g) ?? [];
      expect(fortyTwoMatches.length).toBe(1);
    });

    it("two Tables sharing a name don't collapse into one node (primitive seen-map fix)", () => {
      const a = new Table("users");
      const b = new Table("users");
      const v = new Visitors.Dot();
      type Internals = { visit(o: unknown): void; toDot(): string };
      v.compile(new Nodes.SqlLiteral("seed"));
      (v as unknown as Internals).visit(a);
      (v as unknown as Internals).visit(b);
      const out = (v as unknown as Internals).toDot();
      const tableMatches = out.match(/<f0>Table"\];/g) ?? [];
      expect(tableMatches.length).toBe(2);
      const stringUsersMatches = out.match(/<f0>String\|<f1>users"\];/g) ?? [];
      expect(stringUsersMatches.length).toBe(2);
    });

    it("Extract walks expressions + alias, as Rails does", () => {
      const node = new Nodes.Extract(users.get("created_at"), "year");
      expect(() => dot.compile(node)).toThrow(/undefined method 'expressions' for Extract/);
    });

    it("Exists walks expressions + alias (no spurious distinct edge)", () => {
      const inner = new SelectManager(users).project(users.get("id")).ast;
      const node = new Nodes.Exists(inner);
      const out = dot.compile(node);
      expect(out).toContain("Exists");
      expect(out).toMatch(/-> \d+ \[label="expressions"\];/);
      expect(out).toMatch(/-> \d+ \[label="alias"\];/);
      expect(out).not.toMatch(/-> \d+ \[label="distinct"\];/);
    });

    it("OptimizerHints renders its hints field (not Unary's null expr)", () => {
      const node = new Nodes.OptimizerHints(["IDX(t1)", "MAX_EXEC_TIME(1000)"]);
      const out = dot.compile(node);
      expect(out).toContain("OptimizerHints");
      expect(out).toMatch(/-> \d+ \[label="expr"\];/);
      expect(out).toContain("IDX(t1)");
      expect(out).toContain("MAX_EXEC_TIME(1000)");
    });

    it("non-Node bind values (ActiveModel::Attribute shape) don't crash", () => {
      const attribute = ModelAttribute.fromDatabase("x", 42, new ValueType());
      const bind = new Nodes.BindParam(attribute);
      const out = dot.compile(bind);
      expect(out).toContain("BindParam");
      expect(out).toMatch(/-> \d+ \[label="valueBeforeTypeCast"\];/);
      expect(out).toContain("42");
    });

    it("a non-Attribute object with valueBeforeTypeCast is not visited as an Attribute", () => {
      const out = dot.compile(new Nodes.BindParam({ valueBeforeTypeCast: 42 }));
      expect(out).not.toMatch(/-> \d+ \[label="valueBeforeTypeCast"\];/);
      expect(out).toContain('[label="pair_0"]');
      expect(out).toContain("42");
    });

    it("visitHash preserves both key and value (Rails parity)", () => {
      const out = visitStandalone({ alpha: "A", beta: "B" });
      expect(out).toContain('[label="pair_0"]');
      expect(out).toContain('[label="pair_1"]');
      expect(out).toContain("alpha");
      expect(out).toContain("beta");
      expect(out).toContain("A");
      expect(out).toContain("B");
    });

    it("names a hash node Hash, not the JS ctor name", () => {
      const out = visitStandalone({ alpha: "A" });
      expect(out).toMatch(/\d+ \[label="<f0>Hash"\];/);
      expect(out).not.toContain("<f0>Object");
    });

    it("a record derived from a plain object routes to visit_Hash", () => {
      const derived: Record<string, unknown> = Object.create({ inherited: "nope" });
      derived.alpha = "A";
      const out = visitStandalone(derived);
      expect(out).toContain('[label="pair_0"]');
      expect(out).toContain("alpha");
      expect(out).toContain("A");
      expect(out).not.toContain("inherited");
    });

    it("a null-prototype record routes to visit_Hash", () => {
      const bare: Record<string, unknown> = Object.create(null);
      bare.alpha = "A";
      const out = visitStandalone(bare);
      expect(out).toMatch(/\d+ \[label="<f0>Hash"\];/);
      expect(out).toContain('[label="pair_0"]');
      expect(out).toContain("alpha");
    });

    it("a record derived from a null-prototype record routes to visit_Hash", () => {
      const base: Record<string, unknown> = Object.create(null);
      base.inherited = "nope";
      const derived: Record<string, unknown> = Object.create(base);
      derived.alpha = "A";
      const out = visitStandalone(derived);
      expect(out).toMatch(/\d+ \[label="<f0>Hash"\];/);
      expect(out).toContain('[label="pair_0"]');
      expect(out).toContain("alpha");
      expect(out).not.toContain("inherited");
    });

    it("a record inheriting valueBeforeTypeCast is a Hash, not an attribute", () => {
      const derived: Record<string, unknown> = Object.create({ valueBeforeTypeCast: 42 });
      derived.alpha = "A";
      const out = visitStandalone(derived);
      expect(out).toMatch(/\d+ \[label="<f0>Hash"\];/);
      expect(out).toContain('[label="pair_0"]');
      expect(out).toContain("alpha");
      expect(out).not.toMatch(/-> \d+ \[label="valueBeforeTypeCast"\];/);
    });

    it("a record inheriting a literal constructor key is a Hash", () => {
      const derived: Record<string, unknown> = Object.create({ constructor: "x" });
      derived.alpha = "A";
      const out = visitStandalone(derived);
      expect(out).toMatch(/\d+ \[label="<f0>Hash"\];/);
      expect(out).toContain('[label="pair_0"]');
      expect(out).toContain("alpha");
    });

    it("a class instance with an enumerable constructor member is not a Hash", () => {
      class Config {
        alpha = "A";
      }
      Object.defineProperty(Config.prototype, "constructor", {
        value: Config,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      expect(() => visitStandalone(new Config())).toThrow(/Cannot visit Config/);
    });

    it("a Set emits index-labeled edges like an Array", () => {
      const out = visitStandalone(new Set(["A", "B"]));
      expect(out).toMatch(/\d+ \[label="<f0>Set"\];/);
      expect(out).toContain('[label="0"]');
      expect(out).toContain('[label="1"]');
      expect(out).toContain("A");
      expect(out).toContain("B");
    });

    it("a class instance is not a Hash and keeps its own class name", () => {
      class Config {
        alpha = "A";
      }
      expect(() => visitStandalone(new Config())).toThrow(new TypeError("Cannot visit Config"));
    });
  });
});
