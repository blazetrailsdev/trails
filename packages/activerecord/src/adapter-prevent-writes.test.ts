import { describe, it } from "vitest";

describe("AdapterPreventWritesTest", () => {
  it.skip("preventing writes predicate", () => {});
  it.skip("doesnt error when a select query has encoding errors", () => {});
  it.skip("doesnt error when a select query has encoding errors", () => {});
  it.skip("doesnt error when a read query with a cte is called while preventing writes", () => {});
  it.skip("doesnt error when a select query starting with a slash star comment is called while preventing writes", () => {});
  it.skip("errors when an insert query prefixed by a slash star comment is called while preventing writes", () => {});
  it.skip("doesnt error when a select query starting with double dash comments is called while preventing writes", () => {});
  it.skip("errors when an insert query prefixed by a double dash comment is called while preventing writes", () => {});
  it.skip("errors when an insert query prefixed by a multiline double dash comment is called while preventing writes", () => {});
  it.skip("errors when an insert query prefixed by a slash star comment containing read command is called while preventing writes", () => {});
  it.skip("errors when an insert query prefixed by a double dash comment containing read command is called while preventing writes", () => {});
});
