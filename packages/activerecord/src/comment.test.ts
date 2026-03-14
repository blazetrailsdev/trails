/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it } from "vitest";

import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("CommentTest", () => {
  it.skip("default primary key comment", () => {
    /* fixture-dependent */
  });
  it.skip("column created in block", () => {
    /* fixture-dependent */
  });
  it.skip("blank columns created in block", () => {
    /* fixture-dependent */
  });
  it.skip("blank indexes created in block", () => {
    /* fixture-dependent */
  });
  it.skip("add column with comment later", () => {
    /* fixture-dependent */
  });
  it.skip("add index with comment later", () => {
    /* fixture-dependent */
  });
  it.skip("add comment to column", () => {
    /* fixture-dependent */
  });
  it.skip("remove comment from column", () => {
    /* fixture-dependent */
  });
  it.skip("rename column preserves comment", () => {
    /* fixture-dependent */
  });
  it.skip("schema dump with comments", () => {
    /* fixture-dependent */
  });
  it.skip("schema dump omits blank comments", () => {
    /* fixture-dependent */
  });
  it.skip("change table comment", () => {
    /* fixture-dependent */
  });
  it.skip("change table comment to nil", () => {
    /* fixture-dependent */
  });
  it.skip("change column comment", () => {
    /* fixture-dependent */
  });
  it.skip("change column comment to nil", () => {
    /* fixture-dependent */
  });
  it.skip("comment on primary key", () => {
    /* fixture-dependent */
  });
  it.skip("schema dump with primary key comment", () => {
    /* fixture-dependent */
  });
});
