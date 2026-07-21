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
    expect(um.toSql()).toContain("2026-04-30");
  });
});
