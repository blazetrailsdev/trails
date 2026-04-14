import { describe, it, expect } from "vitest";
import { ConnectionUrlResolver } from "./connection-url-resolver.js";

describe("ConnectionUrlResolver", () => {
  it("parses a standard postgresql URL", () => {
    const hash = new ConnectionUrlResolver(
      "postgresql://foo:bar@localhost:9000/foo_test?pool=5&timeout=3000",
    ).toHash();
    expect(hash).toMatchObject({
      adapter: "postgresql",
      host: "localhost",
      port: 9000,
      database: "foo_test",
      username: "foo",
      password: "bar",
      pool: "5",
      timeout: "3000",
    });
  });

  it("maps postgres scheme to postgresql adapter", () => {
    const hash = new ConnectionUrlResolver("postgres://localhost/foo").toHash();
    expect(hash.adapter).toBe("postgresql");
  });

  it("maps sqlite scheme to sqlite3 adapter", () => {
    const hash = new ConnectionUrlResolver("sqlite://localhost/foo").toHash();
    expect(hash.adapter).toBe("sqlite3");
  });

  it("lowercases the scheme (case-insensitive per RFC 3986)", () => {
    const hash = new ConnectionUrlResolver("Postgres://localhost/foo").toHash();
    expect(hash.adapter).toBe("postgresql");
  });

  it("uses full path as database for sqlite3 opaque URIs", () => {
    const hash = new ConnectionUrlResolver("sqlite3:foo.db").toHash();
    expect(hash.adapter).toBe("sqlite3");
    expect(hash.database).toBe("foo.db");
  });

  it("strips leading slash from non-sqlite database path", () => {
    const hash = new ConnectionUrlResolver("mysql2://localhost/foo_test").toHash();
    expect(hash.database).toBe("foo_test");
  });

  it("decodes percent-encoded password", () => {
    const hash = new ConnectionUrlResolver("postgres://user:pa%40ss@localhost/db").toHash();
    expect(hash.password).toBe("pa@ss");
  });

  it("parses query parameters", () => {
    const hash = new ConnectionUrlResolver(
      "postgres://localhost/db?pool=5&reaping_frequency=2",
    ).toHash();
    expect(hash.pool).toBe("5");
    expect(hash.reaping_frequency).toBe("2");
  });

  it("parses query parameters on opaque URIs", () => {
    const hash = new ConnectionUrlResolver("sqlite3:foo.db?pool=5").toHash();
    expect(hash.database).toBe("foo.db");
    expect(hash.pool).toBe("5");
  });

  it("omits blank values from the hash", () => {
    const hash = new ConnectionUrlResolver("postgres://localhost/db").toHash();
    expect(hash.username).toBeUndefined();
    expect(hash.password).toBeUndefined();
    expect(hash.port).toBeUndefined();
  });

  it("throws on empty URL", () => {
    expect(() => new ConnectionUrlResolver("")).toThrow(/empty/);
  });

  it("redacts credentials from error messages", () => {
    // @ is reserved — this should fail to parse but not leak the password
    expect(() => new ConnectionUrlResolver("postgres://user:secret@[invalid]:99/db")).toThrow(
      /\*\*\*@/,
    );
  });
});
