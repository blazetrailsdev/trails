/**
 * Connection descriptor — identifies a connection pool owner.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionHandler::ConnectionDescriptor
 */

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
}
