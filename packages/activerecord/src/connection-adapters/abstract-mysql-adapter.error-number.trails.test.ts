import { describe, expect, it } from "vitest";

import { NotImplementedError } from "../errors.js";
import { AbstractMysqlAdapter } from "./abstract-mysql-adapter.js";
import { Mysql2Adapter } from "./mysql2-adapter.js";

describe("AbstractMysqlAdapter#errorNumber", () => {
  it("is abstract, and Mysql2Adapter answers the driver's error number", () => {
    const exception = Object.assign(new Error("Duplicate entry"), { errno: 1062 });

    expect(() => AbstractMysqlAdapter.prototype.errorNumber.call({}, exception)).toThrow(
      NotImplementedError,
    );
    expect(new Mysql2Adapter({ host: "localhost" }).errorNumber(exception)).toBe(1062);
  });
});
