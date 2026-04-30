import { describe, it, expect } from "vitest";
import type { Quoting } from "./abstract/quoting-interface.js";
import { AbstractAdapter } from "./abstract-adapter.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

// Compile-time guard: AbstractAdapter (the base, not a subclass) must
// itself satisfy Quoting. A subclass-only assignment would let a
// missing-on-base / present-on-subclass method slip through. This is a
// pure type-level check — `never` resolves only when the conditional
// `extends` succeeds, so any failure is a compile error, not a runtime
// reference.
type _AbstractAdapterIsQuoting = AbstractAdapter extends Quoting ? true : never;
const _abstractAdapterIsQuoting: _AbstractAdapterIsQuoting = true;
void _abstractAdapterIsQuoting;

/**
 * Pin the Quoting contract: every adapter exposes the full surface
 * dispatching to its own dialect. Per-adapter behavioral tests live in
 * the per-module quoting.test.ts files; this test asserts the
 * structural contract and dispatches a single value through each
 * adapter so the whole interface is exercised end-to-end.
 *
 * PG/MySQL adapters require a live driver to instantiate, so this
 * file uses SQLite as the structural witness — the interface is
 * checked at compile time on AbstractAdapter (which all adapters
 * extend), and runtime dispatch is exercised on SQLite (the only
 * adapter that overrides bool literals away from the abstract default).
 */
describe("Quoting interface", () => {
  it("AbstractAdapter implements every Quoting method", () => {
    const adapter = new SQLite3Adapter(":memory:");
    try {
      // Compile-time guard: SQLite3Adapter (extends AbstractAdapter)
      // is assignable to Quoting. If the interface adds a method that
      // AbstractAdapter doesn't implement, this assignment fails.
      const q: Quoting = adapter;

      expect(typeof q.quote).toBe("function");
      expect(typeof q.quoteString).toBe("function");
      expect(typeof q.quoteIdentifier).toBe("function");
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
    const adapter = new SQLite3Adapter(":memory:");
    try {
      // SQLite is the only adapter whose quotedTrue diverges from the
      // abstract default. Pinning this here confirms the dispatch
      // resolves to the SQLite override, not AbstractAdapter's default.
      expect(adapter.quotedTrue()).toBe("1");
      expect(adapter.quotedFalse()).toBe("0");
      expect(adapter.quote(true)).toBe("1");
      expect(adapter.quoteIdentifier("foo")).toBe('"foo"');
    } finally {
      adapter.disconnectBang();
    }
  });
});
