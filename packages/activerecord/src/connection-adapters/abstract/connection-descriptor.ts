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
   *  (`abstract/connection_handler.rb:63`) — `primary_class? ? "ActiveRecord::Base" : @name`,
   *  the literal Rails hardcodes there. It is also what Rails'
   *  `connection_specification_name` answers for a primary class (`Base.name`,
   *  `connection_handling.rb:316-320`), which is why the pool key a descriptor
   *  names and the one a model looks a pool up by are the same string — so
   *  trails spells both with the Rails literal rather than with its own
   *  `Base.name`. */
  get name(): string {
    return this.primaryClassQ() ? "ActiveRecord::Base" : this._name;
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
