import type { ArelConnection } from "../visitors/connection.js";
import {
  defaultQuoter,
  mysqlDefaultQuoter,
  postgresqlDefaultQuoter,
} from "../visitors/default-quoter.js";

/**
 * Explicit connections for Arel visitor construction in tests.
 *
 * Rails' Arel tests build visitors with a real connection —
 * `Visitors::ToSql.new Table.engine.lease_connection`
 * (`arel/nodes/sql_literal_test.rb:10`, `arel/visitors/sqlite_test.rb:9`), where
 * `Arel::Table.engine` is `ActiveRecord::Base`. Rails has no connection-less
 * visitor path at all: `Node#to_sql` and `TreeManager#to_sql` both go through
 * `engine.with_connection { |c| c.visitor.accept(...) }`
 * (`arel/nodes/node.rb:148-153`, `arel/tree_manager.rb:53`).
 *
 * trails cannot copy that literally here: `@blazetrails/activerecord` depends on
 * `@blazetrails/arel`, so arel-side tests importing a real adapter back would be
 * circular. Rails has no such constraint — Arel and ActiveRecord ship in one gem.
 * So arel's own tests use these stubs, while activerecord's tests supply the real
 * adapter as Rails does.
 *
 * The point of routing through this module is that the connection is *explicit at
 * the call site*: no visitor silently falls back to a default. The underlying
 * `defaultQuoter` values are the invention RFC 0007 is deleting — once every call
 * site names its connection, the visitor constructor defaults go away and these
 * bindings become the only reference, at which point they collapse into this file.
 *
 * @internal
 */
export const testConnection: ArelConnection = defaultQuoter;

/** MySQL-dialect test connection. See {@link testConnection}. @internal */
export const mysqlTestConnection: ArelConnection = mysqlDefaultQuoter;

/** PostgreSQL-dialect test connection. See {@link testConnection}. @internal */
export const postgresqlTestConnection: ArelConnection = postgresqlDefaultQuoter;
