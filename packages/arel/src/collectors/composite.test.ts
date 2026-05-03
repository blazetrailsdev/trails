import { describe, it, expect } from "vitest";
import { Collectors } from "../index.js";

describe("TestComposite", () => {
  it("composite collector performs multiple collections at once", () => {
    const sql = new Collectors.SQLString();
    const binds = new Collectors.Bind();
    const composite = new Collectors.Composite(sql, binds);

    composite.append("SELECT ");
    composite.addBind(123);

    expect(sql.value).toBe("SELECT ?");
    expect(binds.value).toEqual([123]);
  });

  it("addBind forwards block to both collectors", () => {
    const left = new Collectors.SQLString();
    const calls: number[] = [];
    const right = {
      append: () => right,
      addBind: (_v: unknown, block?: (i: number) => string) => {
        if (block) calls.push(1);
        return right;
      },
    };
    const composite = new Collectors.Composite(left, right);
    composite.addBind(42, (i) => `$${i}`);
    expect(left.value).toBe("$1");
    expect(calls).toEqual([1]);
  });

  it("addBinds forwards block to both collectors", () => {
    const left = new Collectors.SQLString();
    const calls: number[] = [];
    const right = {
      append: () => right,
      addBind: () => right,
      addBinds: (
        _binds: unknown[],
        _proc?: ((v: unknown) => unknown) | null,
        block?: (i: number) => string,
      ) => {
        if (block) calls.push(1);
        return right;
      },
    };
    const composite = new Collectors.Composite(left, right);
    composite.addBinds([1, 2], null, (i) => `$${i}`);
    expect(left.value).toBe("$1, $2");
    expect(calls).toEqual([1]);
  });

  it("retryable on composite collector propagates", () => {
    const sql = new Collectors.SQLString();
    const binds = new Collectors.Bind();
    const composite = new Collectors.Composite(sql, binds);

    expect(composite.retryable).toBe(true);
    sql.retryable = false;
    expect(composite.retryable).toBe(false);

    composite.retryable = true;
    expect(sql.retryable).toBe(true);
  });
});
