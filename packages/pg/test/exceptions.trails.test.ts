import { StandardError } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { ConnectionBad, Constants, Error, FeatureNotSupported, ServerError } from "../lib/index.js";

describe("PG::Error", () => {
  it("carries connection and result and aliases error to message", () => {
    const connection = {};
    const result = {};
    const err = new ConnectionBad("gone", { connection, result });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(StandardError);
    expect(err.connection).toBe(connection);
    expect(err.result).toBe(result);
    expect(err.error).toBe("gone");
  });

  it("defaults connection and result to nil", () => {
    const err = new Error();
    expect(err.connection).toBeNull();
    expect(err.result).toBeNull();
  });

  it("defines FeatureNotSupported under ServerError", () => {
    expect(new FeatureNotSupported()).toBeInstanceOf(ServerError);
  });
});

describe("PG::Constants", () => {
  it("answers libpq's values", () => {
    expect(Constants.CONNECTION_OK).toBe(0);
    expect(Constants.PQTRANS_INERROR).toBe(3);
    expect(Constants.PG_DIAG_SQLSTATE).toBe("C".charCodeAt(0));
  });
});
