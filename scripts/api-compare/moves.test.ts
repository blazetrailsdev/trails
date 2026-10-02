import { describe, expect, it } from "vitest";
import { relocationsByRoute, type FileResult } from "./moves.js";

describe("relocationsByRoute", () => {
  const host = "connection-adapters/abstract-adapter.ts";
  const mixin = "connection-adapters/abstract/database-statements.ts";
  const move = {
    rubyModule: "ActiveRecord::ConnectionAdapters::AbstractAdapter",
    expectedFile: host,
  };

  it("leaves out a mixin member ported in the file Rails defines it in", () => {
    const files: FileResult[] = [
      {
        rubyFile: "connection_adapters/abstract_adapter.rb",
        expectedTsFile: host,
        moves: [
          {
            ...move,
            tsName: "openTransactions",
            rubyName: "open_transactions",
            actualFile: mixin,
            inDefiningFile: true,
          },
        ],
      },
    ];
    expect(relocationsByRoute(files).size).toBe(0);
  });

  it("keeps a member whose body sits outside the file Rails defines it in", () => {
    const files: FileResult[] = [
      {
        rubyFile: "connection_adapters/abstract_adapter.rb",
        expectedTsFile: host,
        moves: [
          { ...move, tsName: "isActive", rubyName: "active?", actualFile: mixin },
          {
            ...move,
            tsName: "openTransactions",
            rubyName: "open_transactions",
            actualFile: mixin,
            inDefiningFile: true,
          },
        ],
      },
    ];
    const routes = relocationsByRoute(files);
    expect([...routes.keys()]).toEqual([`${mixin} → ${host}`]);
    expect(routes.get(`${mixin} → ${host}`)?.map((m) => m.tsName)).toEqual(["isActive"]);
  });
});
