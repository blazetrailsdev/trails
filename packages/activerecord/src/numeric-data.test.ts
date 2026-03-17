import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";

describe("NumericDataTest", () => {
  function makeModel() {
    const adapter = createTestAdapter();
    class Account extends Base {
      static {
        this.attribute("balance", "float");
        this.attribute("credit_limit", "integer");
        this.adapter = adapter;
      }
    }
    return Account;
  }

  it("big decimal conditions", async () => {
    const Account = makeModel();
    await Account.create({ balance: 42.5, credit_limit: 100 });
    const results = await Account.where({ balance: 42.5 }).toArray();
    expect(results.length).toBe(1);
  });

  it("numeric fields", async () => {
    const Account = makeModel();
    const a = await Account.create({ balance: 100.5, credit_limit: 50 });
    expect(a.readAttribute("balance")).toBe(100.5);
    expect(a.readAttribute("credit_limit")).toBe(50);
  });

  it("numeric fields with scale", async () => {
    const Account = makeModel();
    const a = await Account.create({ balance: 123.456 });
    const val = a.readAttribute("balance") as number;
    expect(typeof val).toBe("number");
    expect(val).toBeCloseTo(123.456);
  });

  it("numeric fields with nan", () => {
    const Account = makeModel();
    const a = new Account({ balance: NaN });
    const val = a.readAttribute("balance");
    expect(val === null || Number.isNaN(val)).toBe(true);
  });
});
