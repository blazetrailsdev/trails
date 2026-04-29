import { describe, it, expect } from "vitest";
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

describe("TestDot", () => {
  const users = new Table("users");
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

  describe("output structure (Rails parity)", () => {
    it("emits the Rails dot.rb header and shape", () => {
      const out = dot.compile(new Nodes.Distinct());
      expect(out).toMatch(/^digraph "Arel" \{\n/);
      expect(out).toContain("node [width=0.375,height=0.25,shape=record];");
      expect(out).toMatch(/\n\}$/);
      // A leaf node: id [label="<f0>Name"];
      expect(out).toMatch(/^\d+ \[label="<f0>Distinct"\];$/m);
    });

    it("emits one edge per visit_edge declaration with the field name as label", () => {
      // Binary -> left, right (two visit_edge calls).
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
      // Single node, no edges.
      const edges = (out.match(/->/g) ?? []).length;
      expect(edges).toBe(0);
    });

    it("escapes embedded double-quotes in side-field labels (quote helper)", () => {
      const node = new Nodes.SqlLiteral('say "hi"');
      const out = dot.compile(node);
      // SqlLiteral is dispatched as visit_String — the value becomes a
      // side-field on the parent node with quote() escaping the `"`.
      expect(out).toContain('say \\"hi\\"');
    });

    it("null/undefined values render as empty side-fields (Rails nil.to_s parity)", () => {
      // Rails dot.rb's quote(field) does field.to_s; nil.to_s is "" — NOT
      // "nil" (which would be inspect). Trails matches that exactly so
      // dot output round-trips against Rails fixtures.
      const v = new Visitors.Dot();
      type Internals = {
        visit(o: unknown): void;
        toDot(): string;
      };
      v.compile(new Nodes.SqlLiteral("seed")); // initialize state
      (v as unknown as Internals).visit(null);
      const out = (v as unknown as Internals).toDot();
      expect(out).toMatch(/<f0>NilClass\|<f1>"/); // no characters between |<f1> and the closing "
      expect(out).not.toContain("null");
      expect(out).not.toContain("undefined");
    });

    it("visitEdge throws on a typo'd field (Rails NoMethodError parity)", () => {
      // Regression: Rails' visit_edge uses public_send which raises
      // NoMethodError on a typo; the TS port silently treated missing
      // properties as undefined, emitting a NilClass leaf and hiding the
      // visitor bug. Now mirrors Rails by failing loudly.
      const v = new Visitors.Dot();
      v.compile(new Nodes.SqlLiteral("seed"));
      type Internals = { visitEdge(o: object, method: string): void };
      const tbl = new Table("users");
      expect(() => (v as unknown as Internals).visitEdge(tbl, "definitelyNotAField")).toThrow(
        /undefined method 'definitelyNotAField' for Table/,
      );
    });

    it("UpdateStatement walks groups and havings (Trails fields)", () => {
      const stmt = new UpdateManager()
        .table(users)
        .set([[users.get("name"), "x"]])
        .group(users.get("dept"))
        .having(users.get("active").eq(true)).ast;
      const out = dot.compile(stmt);
      expect(out).toContain("UpdateStatement");
      expect(out).toMatch(/-> \d+ \[label="groups"\];/);
      expect(out).toMatch(/-> \d+ \[label="havings"\];/);
    });

    it("DeleteStatement walks groups and havings (Trails fields)", () => {
      const stmt = new DeleteManager()
        .from(users)
        .group(users.get("dept"))
        .having(users.get("active").eq(true)).ast;
      const out = dot.compile(stmt);
      expect(out).toContain("DeleteStatement");
      expect(out).toMatch(/-> \d+ \[label="groups"\];/);
      expect(out).toMatch(/-> \d+ \[label="havings"\];/);
    });

    it("repeated equal scalar primitives dedupe onto one DotNode (Rails singleton parity)", () => {
      // Rails' true/false/Integers are singletons with stable object_id, so
      // two visits of `true` reuse one node. Strings still distinct.
      const v = new Visitors.Dot();
      type Internals = { visit(o: unknown): void; toDot(): string };
      v.compile(new Nodes.SqlLiteral("seed"));
      (v as unknown as Internals).visit(true);
      (v as unknown as Internals).visit(true);
      (v as unknown as Internals).visit(42);
      (v as unknown as Internals).visit(42);
      const out = (v as unknown as Internals).toDot();
      // Booleans and numbers each fire a single labeled node — repeats
      // shouldn't allocate new ones.
      const trueMatches = out.match(/<f0>TrueClass\|<f1>true"\];/g) ?? [];
      expect(trueMatches.length).toBe(1);
      const fortyTwoMatches = out.match(/<f0>Integer\|<f1>42"\];/g) ?? [];
      expect(fortyTwoMatches.length).toBe(1);
    });

    it("two Tables sharing a name don't collapse into one node (primitive seen-map fix)", () => {
      // Regression: seen.set(object, node) keyed primitives by value, so
      // two distinct Tables with the same name `"users"` were aliased to
      // a single shared `<f0>String|<f1>users` node. Rails uses
      // object_id which preserves per-instance identity for heap objects.
      const a = new Table("users");
      const b = new Table("users");
      const v = new Visitors.Dot();
      type Internals = { visit(o: unknown): void; toDot(): string };
      v.compile(new Nodes.SqlLiteral("seed"));
      (v as unknown as Internals).visit(a);
      (v as unknown as Internals).visit(b);
      const out = (v as unknown as Internals).toDot();
      // Two Table nodes (one per Table instance) AND two String "users"
      // nodes (one per visit_String, since strings shouldn't dedupe).
      const tableMatches = out.match(/<f0>Table"\];/g) ?? [];
      expect(tableMatches.length).toBe(2);
      const stringUsersMatches = out.match(/<f0>String\|<f1>users"\];/g) ?? [];
      expect(stringUsersMatches.length).toBe(2);
    });

    it("Extract walks expr + field (Trails shape, not Rails' expressions + alias)", () => {
      const node = new Nodes.Extract(users.get("created_at"), "year");
      const out = dot.compile(node);
      expect(out).toContain("Extract");
      expect(out).toMatch(/-> \d+ \[label="expr"\];/);
      expect(out).toMatch(/-> \d+ \[label="field"\];/);
      expect(out).toContain("year");
      // No edges to nil-shaped Rails fields.
      expect(out).not.toMatch(/-> \d+ \[label="expressions"\];/);
      expect(out).not.toMatch(/-> \d+ \[label="alias"\];/);
    });

    it("Exists walks expressions + alias (no spurious distinct edge)", () => {
      const inner = new SelectManager(users).project(users.get("id")).ast;
      const node = new Nodes.Exists(inner);
      const out = dot.compile(node);
      expect(out).toContain("Exists");
      expect(out).toMatch(/-> \d+ \[label="expressions"\];/);
      expect(out).toMatch(/-> \d+ \[label="alias"\];/);
      // Generic Function visitor would have emitted a `distinct` edge.
      expect(out).not.toMatch(/-> \d+ \[label="distinct"\];/);
    });

    it("OptimizerHints renders its hints field (not Unary's null expr)", () => {
      const node = new Nodes.OptimizerHints(["IDX(t1)", "MAX_EXEC_TIME(1000)"]);
      const out = dot.compile(node);
      expect(out).toContain("OptimizerHints");
      expect(out).toMatch(/-> \d+ \[label="hints"\];/);
      expect(out).toContain("IDX(t1)");
      expect(out).toContain("MAX_EXEC_TIME(1000)");
    });

    it("non-Node bind values (ActiveModel::Attribute shape) don't crash", () => {
      // Regression: Dot.visit used to call super.visit on any non-primitive
      // non-array non-plain-object value, throwing UnsupportedVisitError
      // on a class instance the dispatch table didn't know about.
      const fakeAttribute = {
        valueBeforeTypeCast: 42,
      };
      const bind = new Nodes.BindParam(fakeAttribute);
      const out = dot.compile(bind);
      expect(out).toContain("BindParam");
      // visitActiveModelAttribute walks valueBeforeTypeCast.
      expect(out).toMatch(/-> \d+ \[label="valueBeforeTypeCast"\];/);
      expect(out).toContain("42");
    });

    it("visitHash preserves both key and value (Rails parity)", () => {
      // Mirrors Rails dot.rb:227 — visit_Hash emits one edge per entry
      // labeled "pair_<i>" pointing at an Array node, which itself emits
      // index-labeled edges for the [key, value] tuple. Both halves of
      // the entry must end up in the graph.
      const v = new Visitors.Dot();
      type Internals = { visit(o: unknown): void };
      v.compile(new Nodes.SqlLiteral("")); // initialize state
      (v as unknown as Internals).visit({ alpha: "A", beta: "B" });
      const out = (v as unknown as { toDot(): string }).toDot();
      expect(out).toContain('[label="pair_0"]');
      expect(out).toContain('[label="pair_1"]');
      expect(out).toContain("alpha");
      expect(out).toContain("beta");
      expect(out).toContain("A");
      expect(out).toContain("B");
    });
  });
});
