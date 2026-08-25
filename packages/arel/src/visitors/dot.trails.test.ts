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

/**
 * Coverage with no counterpart in `visitors/dot_test.rb`, which builds every
 * statement node bare. These drive the same visitors from manager-built ASTs,
 * where the edges carry real children rather than nils.
 */
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
    const stmt = users.project(star).ast;
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
