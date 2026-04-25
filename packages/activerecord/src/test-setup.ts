import { afterEach } from "vitest";
import { setToSqlVisitor, Visitors } from "@blazetrails/arel";

// Restore the default Arel visitor after each test so AR tests that set a
// SQLite (or other dialect) adapter via `Base.adapter = ...` don't leak the
// dialect-specific visitor into unrelated arel tests running in the same
// process. Tests that need a dialect visitor for their duration already
// manage it themselves (see node.test.ts's try/finally pattern).
afterEach(() => {
  setToSqlVisitor(Visitors.ToSql);
});
