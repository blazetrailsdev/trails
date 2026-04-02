import { describe, it, expect } from "vitest";
import { Collectors } from "../index.js";

describe("TestBind", () => {
  it("compile gathers all bind params", () => {
    const bind = new Collectors.Bind();
    bind.append("SELECT * FROM users WHERE id = ");
    bind.addBind(42);
    bind.append(" AND name = ");
    bind.addBind("dean");
    expect(bind.value).toEqual([42, "dean"]);
  });
});
