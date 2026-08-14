/**
 * trails-only regression coverage for the `async:` kwarg on the select family.
 *
 * Rails' select_one/select_value/select_rows forward `async:` down to
 * select_all (database_statements.rb:85, :90, :102), which is what turns a
 * `load_async` relation into a FutureResult. trails previously dropped the
 * kwarg at every one of those call sites, so a caller asking for an async
 * select reached select_all with no record of having asked. Rails' own
 * coverage lives in relation/load_async_test.rb, which is fully excluded
 * (scripts/parity/unported-files/unscoped.ts) because it asserts
 * FutureResult/scheduled? semantics — the forwarding itself still needs a home.
 */
import { describe, it, expect, vi } from "vitest";
import { Base } from "../../index.js";
import type { AbstractAdapter } from "../abstract-adapter.js";
import { fixtures } from "../../test-fixtures.js";

describe("DatabaseStatements select async kwarg", () => {
  fixtures({});

  function conn(): AbstractAdapter {
    return Base.connection as unknown as AbstractAdapter;
  }

  // Spy on the instance, not the prototype: the fixture harness restores its
  // own property and would shadow a prototype spy so it never fires.
  const spySelectAll = () => vi.spyOn(conn(), "selectAll");

  it("select_one forwards async to select_all", async () => {
    const spy = spySelectAll();
    try {
      await conn().selectOne("SELECT 1 AS one", "SQL", [], { async: true });
      expect(spy.mock.calls[0][3]).toEqual({ async: true });
    } finally {
      spy.mockRestore();
    }
  });

  it("select_rows forwards async to select_all", async () => {
    const spy = spySelectAll();
    try {
      await conn().selectRows("SELECT 1 AS one", "SQL", [], { async: true });
      expect(spy.mock.calls[0][3]).toEqual({ async: true });
    } finally {
      spy.mockRestore();
    }
  });

  it("select_value forwards async to select_rows", async () => {
    const spy = vi.spyOn(conn(), "selectRows");
    try {
      await conn().selectValue("SELECT 1 AS one", "SQL", [], { async: true });
      expect(spy.mock.calls[0][3]).toEqual({ async: true });
    } finally {
      spy.mockRestore();
    }
  });

  it("defaults async to false", async () => {
    const spy = spySelectAll();
    try {
      await conn().selectOne("SELECT 1 AS one");
      expect(spy.mock.calls[0][3]).toEqual({ async: false });
    } finally {
      spy.mockRestore();
    }
  });
});
