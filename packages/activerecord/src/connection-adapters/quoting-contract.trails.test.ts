import { describe, it, expect } from "vitest";
import type { Quoting } from "./abstract/quoting.js";
import { AbstractAdapter } from "./abstract-adapter.js";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

type _AbstractAdapterIsQuoting = AbstractAdapter extends Quoting ? true : never;
const _abstractAdapterIsQuoting: _AbstractAdapterIsQuoting = true;
void _abstractAdapterIsQuoting;

describe("Quoting interface", () => {
  it("AbstractAdapter implements every Quoting method", () => {
    const adapter = new BetterSQLite3Adapter(":memory:");
    try {
      const q: Quoting = adapter;

      expect(typeof q.quote).toBe("function");
      expect(typeof q.quoteString).toBe("function");
      expect(typeof q.quoteColumnName).toBe("function");
      expect(typeof q.quoteTableName).toBe("function");
      expect(typeof q.quoteColumnName).toBe("function");
      expect(typeof q.quoteTableNameForAssignment).toBe("function");
      expect(typeof q.quoteDefaultExpression).toBe("function");
      expect(typeof q.quotedTrue).toBe("function");
      expect(typeof q.quotedFalse).toBe("function");
      expect(typeof q.unquotedTrue).toBe("function");
      expect(typeof q.unquotedFalse).toBe("function");
      expect(typeof q.quotedBinary).toBe("function");
      expect(typeof q.typeCast).toBe("function");
      expect(typeof q.castBoundValue).toBe("function");
      expect(typeof q.sanitizeAsSqlComment).toBe("function");
    } finally {
      adapter.disconnectBang();
    }
  });

  it("SQLite3Adapter dispatches quote/quotedTrue to its own dialect", () => {
    const adapter = new BetterSQLite3Adapter(":memory:");
    try {
      expect(adapter.quotedTrue()).toBe("1");
      expect(adapter.quotedFalse()).toBe("0");
      expect(adapter.quote(true)).toBe("1");
      expect(adapter.quoteColumnName("foo")).toBe('"foo"');
    } finally {
      adapter.disconnectBang();
    }
  });
});

describe("Quoting::ClassMethods", () => {
  it("every adapter class quotes identifiers on the class", () => {
    expect(PostgreSQLAdapter.quoteColumnName("foo")).toBe('"foo"');
    expect(PostgreSQLAdapter.quoteTableName("foo.bar")).toBe('"foo"."bar"');

    expect(SQLite3Adapter.quoteColumnName("foo")).toBe('"foo"');
    expect(SQLite3Adapter.quoteTableName("foo.bar")).toBe('"foo"."bar"');

    expect(Mysql2Adapter.quoteColumnName("foo")).toBe("`foo`");
    expect(Mysql2Adapter.quoteTableName("foo.bar")).toBe("`foo`.`bar`");
  });

  it("an adapter defining only the class quoter inherits the instance delegators", () => {
    class QuotingOnlyAdapter extends AbstractAdapter {
      static override quoteColumnName(name: string): string {
        return `[${name}]`;
      }
    }
    const adapter = Object.create(QuotingOnlyAdapter.prototype) as QuotingOnlyAdapter;

    expect(adapter.quoteColumnName("foo")).toBe("[foo]");
    expect(adapter.quoteTableName("foo")).toBe("[foo]");
  });
});
