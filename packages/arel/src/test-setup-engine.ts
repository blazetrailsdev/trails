import { Table } from "./index.js";
import { ToSql } from "./visitors/to-sql.js";

// `Node#toSql()` compiles through `Table.engine`, so the suite must set one.
//
// This is NOT yet what Rails does. Rails' `Arel::Test#setup` assigns
// `Arel::Table.engine = FakeRecord::Base.new` for every Arel test
// (test/cases/arel/helper.rb:19-20), whose connection carries
// `ToSql.new(self)` (fake_record.rb:36) — the quoting double ported here as
// `fakeRecordEngine` (test-helpers/connection.ts). Installing that suite-wide
// is the target state; it changes the expected SQL of every boolean/quoting
// assertion at once, so it is tracked by story
// `arel-suite-engine-is-fake-record-base` rather than done here.
//
// Until then: a generic `Visitors::ToSql`, which is what every `.toSql()`
// assertion in this package was written against. The adapter memoises its
// visitor once (`abstract_adapter.rb:155`, mirrored at abstract-adapter.ts:654),
// so hoist a single instance rather than building one per access.
const connection = { visitor: new ToSql() };

Table.engine = { connection };
