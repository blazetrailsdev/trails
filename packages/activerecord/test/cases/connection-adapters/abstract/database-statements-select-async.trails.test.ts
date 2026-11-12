import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base } from "../../../../lib/index.js";
import type { AbstractAdapter } from "../../../../lib/connection-adapters/abstract-adapter.js";
import { fixtures } from "../../../support/use-fixtures.js";

describe("DatabaseStatements select async kwarg", () => {
  fixtures({});

  let connection: AbstractAdapter;

  beforeEach(async () => {
    connection = (await Base.leaseConnection()) as unknown as AbstractAdapter;
  });

  const spySelectAll = () => vi.spyOn(connection, "selectAll");

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("select_one forwards async to select_all", async () => {
    const spy = spySelectAll();
    await connection.selectOne("SELECT 1 AS one", "SQL", [], { async: true });
    expect(spy.mock.calls[0][3]).toEqual({ async: true });
  });

  it("select_rows forwards async to select_all", async () => {
    const spy = spySelectAll();
    await connection.selectRows("SELECT 1 AS one", "SQL", [], { async: true });
    expect(spy.mock.calls[0][3]).toEqual({ async: true });
  });

  it("select_value forwards async to select_rows", async () => {
    const spy = vi.spyOn(connection, "selectRows");
    await connection.selectValue("SELECT 1 AS one", "SQL", [], { async: true });
    expect(spy.mock.calls[0][3]).toEqual({ async: true });
  });

  it("defaults async to false", async () => {
    const spy = spySelectAll();
    await connection.selectOne("SELECT 1 AS one");
    expect(spy.mock.calls[0][3]).toEqual({ async: false });
  });
});
