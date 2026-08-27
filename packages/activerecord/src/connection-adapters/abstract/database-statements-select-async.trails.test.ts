import { describe, it, expect, afterEach, vi } from "vitest";
import { Base } from "../../index.js";
import type { AbstractAdapter } from "../abstract-adapter.js";
import { fixtures } from "../../test-fixtures.js";

describe("DatabaseStatements select async kwarg", () => {
  fixtures({});

  function conn(): AbstractAdapter {
    return Base.connection as unknown as AbstractAdapter;
  }

  const spySelectAll = () => vi.spyOn(conn(), "selectAll");

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("select_one forwards async to select_all", async () => {
    const spy = spySelectAll();
    await conn().selectOne("SELECT 1 AS one", "SQL", [], { async: true });
    expect(spy.mock.calls[0][3]).toEqual({ async: true });
  });

  it("select_rows forwards async to select_all", async () => {
    const spy = spySelectAll();
    await conn().selectRows("SELECT 1 AS one", "SQL", [], { async: true });
    expect(spy.mock.calls[0][3]).toEqual({ async: true });
  });

  it("select_value forwards async to select_rows", async () => {
    const spy = vi.spyOn(conn(), "selectRows");
    await conn().selectValue("SELECT 1 AS one", "SQL", [], { async: true });
    expect(spy.mock.calls[0][3]).toEqual({ async: true });
  });

  it("defaults async to false", async () => {
    const spy = spySelectAll();
    await conn().selectOne("SELECT 1 AS one");
    expect(spy.mock.calls[0][3]).toEqual({ async: false });
  });
});
