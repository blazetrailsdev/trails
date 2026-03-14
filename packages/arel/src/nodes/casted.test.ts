import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";

describe("#hash", () => {
  const users = new Table("users");
  it("is equal when eql? returns true", () => {
    const attr = users.get("age");
    const a = new Nodes.Casted(1, attr);
    const b = new Nodes.Casted(1, attr);
    expect(a.eql(b)).toBe(true);
    expect(a.hash()).toBe(b.hash());
  });
});
