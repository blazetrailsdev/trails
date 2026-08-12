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
  private readonly _name: string;
  private readonly _primary: boolean;

  constructor(name: string, primary: boolean = false) {
    this._name = name;
    this._primary = primary;
  }

  /** Mirrors: ConnectionHandler::ConnectionDescriptor#name
   *  (`abstract/connection_handler.rb:63`) — `primary_class? ? "ActiveRecord::Base" : @name`;
   *  trails spells `ActiveRecord::Base` as `Base`. */
  get name(): string {
    return this.primaryClassQ() ? "Base" : this._name;
  }

  /** Mirrors: ConnectionHandler::ConnectionDescriptor#primary_class?
   *  (`abstract/connection_handler.rb:67`). */
  primaryClassQ(): boolean {
    return this._primary;
  }

  /** Mirrors: ConnectionHandler::ConnectionDescriptor#current_preventing_writes
   *  (`abstract/connection_handler.rb:71`) — `Base.preventing_writes?(@name)`,
   *  the raw name, not the primary-normalized `#name`. */
  currentPreventingWrites(): boolean {
    return isPreventingWrites(this._name);
  }
}
