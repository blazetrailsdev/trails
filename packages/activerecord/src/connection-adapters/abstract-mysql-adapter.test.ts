import { describe, it, expect } from "vitest";
import { Column } from "./mysql/column.js";

function makeColumn(opts: { autoIncrement?: boolean; defaultFunction?: string | null } = {}) {
  return new Column("id", null, { sqlType: "bigint" }, false, {
    autoIncrement: opts.autoIncrement ?? false,
    defaultFunction: opts.defaultFunction ?? null,
  });
}

describe("AbstractMysqlAdapter#returnValueAfterInsert", () => {
  it("returns true for auto-increment column when INSERT RETURNING not supported", async () => {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype) as any;
    adapter.supportsInsertReturning = () => false;
    expect(adapter.returnValueAfterInsert(makeColumn({ autoIncrement: true }))).toBe(true);
  });

  it("returns false for non-auto-increment column when INSERT RETURNING not supported", async () => {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype) as any;
    adapter.supportsInsertReturning = () => false;
    expect(adapter.returnValueAfterInsert(makeColumn({ autoIncrement: false }))).toBe(false);
  });

  it("returns true for auto-populated column (default function) when INSERT RETURNING supported", async () => {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype) as any;
    adapter.supportsInsertReturning = () => true;
    expect(adapter.returnValueAfterInsert(makeColumn({ defaultFunction: "uuid()" }))).toBe(true);
  });

  it("returns false for plain column when INSERT RETURNING supported", async () => {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype) as any;
    adapter.supportsInsertReturning = () => true;
    expect(adapter.returnValueAfterInsert(makeColumn())).toBe(false);
  });
});
