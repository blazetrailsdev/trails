import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Table, UpdateManager } from "./index.js";

// TS-only: pins the slot/dispatch distinction that justifies the Temporal arms
// of `NodeOrValue` (nodes/binary.ts). Rails aliases visit_Time/visit_Date to
// `unsupported` (to_sql.rb:844/836), but Assignment quotes a non-Node right
// instead of visiting it (to_sql.rb:637-639), so this path renders.
describe("UpdateManager#set with a temporal value", () => {
  it("quotes the value through Assignment rather than dispatching visit_Time", () => {
    const users = new Table("users");
    const um = new UpdateManager();
    um.table(users);
    um.set([[users.get("created_at"), Temporal.Instant.from("2026-04-30T12:34:56Z")]]);
    // Full SQL, not a substring: a bare or ISO-8601 literal would still contain
    // the date, but only the quoted `quoted_date` form (quoting.rb:184) proves the value went
    // through quote() rather than reaching a visitor.
    expect(um.toSql()).toBe('UPDATE "users" SET "created_at" = \'2026-04-30 12:34:56\'');
  });
});
