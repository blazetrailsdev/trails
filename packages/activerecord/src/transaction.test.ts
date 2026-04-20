/**
 * Unit tests for the public ActiveRecord::Transaction wrapper.
 * The behavior-in-transaction test suites (transaction-callbacks,
 * transaction-instrumentation, transaction-isolation, transactions)
 * exercise the wrapper indirectly; these pin the direct API shape.
 */

import { describe, it, expect } from "vitest";
import { Transaction } from "./transaction.js";

describe("Transaction (public wrapper, Rails ActiveRecord::Transaction)", () => {
  it("NULL_TRANSACTION is closed + blank + has no uuid", () => {
    const t = Transaction.NULL_TRANSACTION;
    expect(t.isOpen()).toBe(false);
    expect(t.isClosed()).toBe(true);
    expect(t.isBlank()).toBe(true);
    expect(t.uuid()).toBeNull();
  });

  it("afterCommit on a null transaction runs the block immediately", () => {
    const t = Transaction.NULL_TRANSACTION;
    let ran = false;
    t.afterCommit(() => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it("afterRollback on a null transaction is a no-op", () => {
    const t = Transaction.NULL_TRANSACTION;
    let ran = false;
    t.afterRollback(() => {
      ran = true;
    });
    expect(ran).toBe(false);
  });

  it("NULL_TRANSACTION is a shared singleton (matches Rails' frozen constant)", () => {
    expect(Transaction.NULL_TRANSACTION).toBe(Transaction.NULL_TRANSACTION);
  });
});
