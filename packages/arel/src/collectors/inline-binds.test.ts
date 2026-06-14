import { describe, it, expect } from "vitest";
import { InlineBinds } from "./inline-binds.js";
import { BindParam } from "../nodes/bind-param.js";

const quoter = (v: unknown) => `<${String(v)}>`;

describe("InlineBinds", () => {
  it("inlines a quoted casted value during traversal", () => {
    const c = new InlineBinds(quoter);
    c.append("a = ");
    c.addBind(5);
    expect(c.value).toBe("a = <5>");
  });

  it("leaves a BindParam node as a placeholder", () => {
    const c = new InlineBinds(quoter);
    c.append("a = ");
    c.addBind(new BindParam(5));
    expect(c.value).toBe("a = ?");
  });

  it("keeps placeholder numbering across inlined and deferred binds", () => {
    // A $N block (PostgreSQL bindBlock) must still advance its index past an
    // inlined casted value, so the following BindParam renders $2, not $1.
    const block = (i: number) => `$${i}`;
    const c = new InlineBinds(quoter);
    c.append("a = ");
    c.addBind(5, block);
    c.append(" AND b = ");
    c.addBind(new BindParam(9), block);
    expect(c.value).toBe("a = <5> AND b = $2");
  });

  it("addBinds inlines each casted element and resolves valueForDatabase", () => {
    const c = new InlineBinds(quoter);
    c.append("IN (");
    c.addBinds([1, { valueForDatabase: () => "db" }]);
    c.append(")");
    expect(c.value).toBe("IN (<1>, <db>)");
  });
});
