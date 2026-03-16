import { describe, it } from "vitest";

describe("TransactionInstrumentationTest", () => {
  it.skip("start transaction is triggered when the transaction is materialized", () => {});
  it.skip("start transaction is not triggered for ordinary nested calls", () => {});
  it.skip("start transaction is triggered for requires new", () => {});
  it.skip("transaction instrumentation on commit", () => {});
  it.skip("transaction instrumentation on rollback", () => {});
  it.skip("transaction instrumentation with savepoints", () => {});
  it.skip("transaction instrumentation with restart parent transaction on commit", () => {});
  it.skip("transaction instrumentation with restart parent transaction on rollback", () => {});
  it.skip("transaction instrumentation with unmaterialized restart parent transactions", () => {});
  it.skip("transaction instrumentation with materialized restart parent transactions", () => {});
  it.skip("transaction instrumentation with restart savepoint parent transactions", () => {});
  it.skip("transaction instrumentation with restart savepoint parent transactions on commit", () => {});
  it.skip("transaction instrumentation only fires if materialized", () => {});
  it.skip("transaction instrumentation only fires on rollback if materialized", () => {});
  it.skip("reconnecting after materialized transaction starts new event", () => {});
  it.skip("transaction instrumentation fires before after commit callbacks", () => {});
  it.skip("transaction instrumentation fires before after rollback callbacks", () => {});
  it.skip("transaction instrumentation on failed commit", () => {});
  it.skip("transaction instrumentation on failed rollback", () => {});
  it.skip("transaction instrumentation on failed rollback when unmaterialized", () => {});
  it.skip("transaction instrumentation on broken subscription", () => {});
});
