/**
 * Connection descriptor — identifies a connection pool owner.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionHandler::ConnectionDescriptor
 */

import { isPreventingWrites } from "../../core.js";

export interface ConnectionOwner {
  name: string;
  primaryClassQ(): boolean;
}

export class ConnectionDescriptor {
  readonly name: string;
  readonly isPrimary: boolean;

  constructor(name: string, isPrimary: boolean = false) {
    this.name = name;
    this.isPrimary = isPrimary;
  }

  /** Mirrors: ConnectionHandler::ConnectionDescriptor#current_preventing_writes
   *  (`abstract/connection_handler.rb:71`) — `Base.preventing_writes?(@name)`. */
  currentPreventingWrites(): boolean {
    return isPreventingWrites(this.name);
  }
}
