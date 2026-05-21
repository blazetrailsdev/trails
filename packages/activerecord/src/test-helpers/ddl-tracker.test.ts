import { describe, it, expect } from "vitest";
import { parseCreateTableColumns } from "./ddl-tracker.js";

describe("parseCreateTableColumns", () => {
  it("extracts simple columns from a MySQL CREATE TABLE", () => {
    const sql =
      "CREATE TABLE IF NOT EXISTS `metrics` " +
      "(`id` bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, `score` bigint, `label` varchar(255))";
    expect([...parseCreateTableColumns(sql)]).toEqual(["id", "score", "label"]);
  });

  it("extracts columns from a PG CREATE TABLE", () => {
    const sql =
      'CREATE TABLE "metrics" ' +
      '("id" SERIAL PRIMARY KEY, "score" bigint, "label" text, "score_2" numeric(10,2))';
    expect([...parseCreateTableColumns(sql)]).toEqual(["id", "score", "label", "score_2"]);
  });

  it("ignores commas inside nested type parentheses", () => {
    const sql = 'CREATE TABLE "t" ("id" SERIAL, "amount" DECIMAL(10,2), "name" VARCHAR(50))';
    expect([...parseCreateTableColumns(sql)]).toEqual(["id", "amount", "name"]);
  });

  it("skips table-level constraints", () => {
    const sql =
      'CREATE TABLE "t" ("id" int, "name" text, ' +
      'PRIMARY KEY ("id"), UNIQUE ("name"), ' +
      'FOREIGN KEY ("other_id") REFERENCES "u" ("id"), ' +
      'CONSTRAINT chk CHECK ("id" > 0))';
    expect([...parseCreateTableColumns(sql)]).toEqual(["id", "name"]);
  });

  it("handles a single-quoted DEFAULT containing a close paren", () => {
    const sql = "CREATE TABLE `t` (`id` int, `label` varchar(10) DEFAULT ')(', `n` int)";
    expect([...parseCreateTableColumns(sql)]).toEqual(["id", "label", "n"]);
  });

  it("handles doubled single-quote escape inside a DEFAULT", () => {
    const sql = "CREATE TABLE `t` (`id` int, `label` varchar(10) DEFAULT 'it''s )', `n` int)";
    expect([...parseCreateTableColumns(sql)]).toEqual(["id", "label", "n"]);
  });

  it("falls back to {id} when there is no parenthesized body", () => {
    expect([...parseCreateTableColumns("CREATE TABLE `t`")]).toEqual(["id"]);
  });

  it("falls back to {id} when the SQL is unrelated", () => {
    expect([...parseCreateTableColumns("INSERT INTO t VALUES (1)")]).toEqual(["id"]);
  });

  it("falls back to {id} when the body never closes", () => {
    expect([...parseCreateTableColumns("CREATE TABLE `t` (`id` int")]).toEqual(["id"]);
  });

  it("accepts unquoted identifiers", () => {
    const sql = "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, status TEXT)";
    expect([...parseCreateTableColumns(sql)]).toEqual(["id", "name", "status"]);
  });
});
