import { Table } from "./index.js";
import { fakeRecordEngine } from "./test-helpers/connection.js";

// Rails' `Arel::Test#setup` assigns `Arel::Table.engine = FakeRecord::Base.new`
// for every Arel test (test/cases/arel/helper.rb:19-20), whose connection
// carries `ToSql.new(self)` (fake_record.rb:36) — the FakeRecord quoting double
// ported as `fakeRecordEngine` (test-helpers/connection.ts). Since `Node#toSql()`
// compiles through `Table.engine`, installing that double suite-wide is what
// makes every bare `.toSql()` render `'t'`/`'f'` for booleans, exactly as Rails'
// arel suite does. This replaces the earlier generic `Visitors::ToSql`, which
// anchored the suite on the connection-less `defaultQuoter` RFC 0007 is deleting.
Table.engine = fakeRecordEngine;
