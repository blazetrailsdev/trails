import { describe, it, expect } from "vitest";
import { Attribute as AMAttribute, StringType } from "@blazetrails/activemodel";
import {
  testConnection,
  mysqlTestConnection,
  postgresqlTestConnection,
} from "../test-helpers/connection.js";
import { Table, Nodes, Visitors } from "../index.js";

/**
 * Every unary visit in Rails is a bare `visit o.expr, collector` — the visitor
 * dispatches on the expression's class, so an `ActiveModel::Attribute` bind
 * renders as a placeholder like it does anywhere else. Each case below pins one
 * such site against the Rails line it mirrors.
 */
describe("unary visitors dispatch their expr rather than stringifying it", () => {
  const users = new Table("users");
  const bind = (): AMAttribute => AMAttribute.fromDatabase("name", "x", new StringType());
  const compile = (n: Nodes.Node): string => new Visitors.ToSql(testConnection).compile(n);

  it("Bin visits its expr (to_sql.rb:186-188)", () => {
    expect(compile(new Nodes.Bin(bind()))).toBe("?");
  });

  it("Ascending visits its expr (to_sql.rb:363-365)", () => {
    expect(compile(new Nodes.Ascending(bind()))).toBe("? ASC");
  });

  it("Descending visits its expr (to_sql.rb:367-369)", () => {
    expect(compile(new Nodes.Descending(bind()))).toBe("? DESC");
  });

  it("NullsFirst visits its expr (to_sql.rb:372-375)", () => {
    expect(compile(new Nodes.NullsFirst(bind()))).toBe("? NULLS FIRST");
  });

  it("NullsLast visits its expr (to_sql.rb:377-380)", () => {
    expect(compile(new Nodes.NullsLast(bind()))).toBe("? NULLS LAST");
  });

  it("Group visits its expr (to_sql.rb:382-384)", () => {
    expect(compile(new Nodes.Group(bind()))).toBe("?");
  });

  it("Extract visits its expr (to_sql.rb:400-403)", () => {
    expect(compile(new Nodes.Extract(bind() as unknown as Nodes.Node, "date"))).toBe(
      "EXTRACT(DATE FROM ?)",
    );
  });

  it("On visits its expr (to_sql.rb:564-567)", () => {
    expect(compile(new Nodes.On(bind()))).toBe("ON ?");
  });

  it("UnqualifiedColumn quotes the bare name (to_sql.rb:728-730)", () => {
    expect(compile(new Nodes.UnqualifiedColumn(users.get("name")))).toBe('"name"');
  });

  it("MySQL UnqualifiedColumn visits its expr (mysql.rb:13-15)", () => {
    const sql = new Visitors.MySQL(mysqlTestConnection).compile(
      new Nodes.UnqualifiedColumn(bind() as unknown as Nodes.Node),
    );
    expect(sql).toBe("?");
  });

  it("PostgreSQL DistinctOn visits its expr (postgresql.rb:39-42)", () => {
    const sql = new Visitors.PostgreSQL(postgresqlTestConnection).compile(
      new Nodes.DistinctOn(bind()),
    );
    expect(sql).toBe("DISTINCT ON ( $1 )");
  });
});
