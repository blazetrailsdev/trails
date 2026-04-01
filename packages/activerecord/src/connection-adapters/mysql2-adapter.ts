/**
 * MySQL2 adapter — connection adapter for MySQL databases via mysql2.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2Adapter
 *
 * Re-exports the main adapter from the adapters directory and provides
 * the connection-adapters level entry point expected by the Rails API surface.
 */

export { Mysql2Adapter } from "../adapters/mysql2-adapter.js";
