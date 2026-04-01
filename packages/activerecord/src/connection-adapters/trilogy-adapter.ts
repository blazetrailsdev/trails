/**
 * Trilogy adapter — connection adapter for MySQL databases via Trilogy.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::TrilogyAdapter
 *
 * Trilogy is GitHub's MySQL-compatible client library. The TrilogyAdapter
 * extends AbstractMysqlAdapter with Trilogy-specific connection handling,
 * similar to how Mysql2Adapter extends it with mysql2-specific handling.
 */

import { AbstractMysqlAdapter } from "./abstract-mysql-adapter.js";

export class TrilogyAdapter extends AbstractMysqlAdapter {
  override get adapterName(): string {
    return "Trilogy";
  }
}
