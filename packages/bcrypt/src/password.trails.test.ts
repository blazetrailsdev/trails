import { describe, expect, it } from "vitest";
import { Engine, Password } from "./index.js";

describe("BCrypt::Password", () => {
  it("create falls back to Engine.cost for a nil or false cost", () => {
    try {
      Engine.cost = 5;
      expect(Password.create("secret", { cost: null }).cost).toBe(5);
      expect(Password.create("secret", { cost: false }).cost).toBe(5);
      expect(Password.create("secret", { cost: 4 }).version).toBe("2a");
    } finally {
      Engine.cost = null;
    }
  });
});
