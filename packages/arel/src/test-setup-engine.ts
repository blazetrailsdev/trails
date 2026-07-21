import { Table } from "./index.js";
import { ToSql } from "./visitors/to-sql.js";

// Rails runs the Arel test suite inside activerecord, where `Arel::Table.engine`
// is `ActiveRecord::Base` with a live sqlite3 connection (see
// activerecord/test/cases/helper.rb). The arel package cannot import
// activerecord, so the suite supplies the same shape — an engine whose
// connection carries the generic `Visitors::ToSql`, which is what every
// `.toSql()` assertion in this package was written against.
// The adapter memoises its visitor once (`abstract_adapter.rb:155`, mirrored at
// abstract-adapter.ts:654), so hoist a single instance rather than building one
// per access — same identity semantics as a real connection.
const connection = { visitor: new ToSql() };

Table.engine = { connection };
