import { bench, describe } from "vitest";
import { Table } from "../index.js";

const users = new Table("users");
const id = users.get("id");
const name = users.get("name");

describe("node construction hot path", () => {
  bench("Node#not / #or / #and", () => {
    const eq = id.eq(1);
    void eq.not();
    void eq.or(name.eq("x"));
    void eq.and(name.eq("x"));
  });

  bench("Predications#eq (Nodes.build_quoted)", () => {
    void id.eq(1);
  });

  bench("NotIn#invert / NotEqual#invert", () => {
    void id.notIn([1, 2]).invert();
    void id.notEq(1).invert();
  });
});
