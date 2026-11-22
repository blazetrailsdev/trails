import { rbModName } from "@blazetrails/ruby-compat";
import { SQLite3 } from "./namespaces.js";
import "./constants.js";
import type { EngineErrors } from "./database.js";

export class Exception extends Error {
  code: number | null = null;

  sql: string | null = null;

  sqlOffset = -1;

  #message: string;

  constructor(message?: string) {
    super(message);
    this.name = rbModName(new.target) ?? new.target.name;
    this.#message = message ?? this.name;
    delete (this as { message?: string }).message;
  }

  override get message(): string {
    return [this.#message, this.sqlError()].filter((s) => s != null).join(":\n");
  }

  /** @internal */
  private sqlError(): string | null {
    if (this.sql == null) return null;
    if (!(this.sqlOffset >= 0)) return this.sql.replace(/\r?\n$/, "");

    let offset = this.sqlOffset;
    return this.sql
      .split(/(?<=\n)/)
      .flatMap((line) => {
        if (offset >= 0 && line.length > offset) {
          const blanks = " ".repeat(offset);
          offset = -1;
          return [line.replace(/\r?\n$/, ""), blanks + "^"];
        } else {
          offset -= line.length;
          return line.replace(/\r?\n$/, "");
        }
      })
      .join("\n");
  }
}

export class SQLException extends Exception {}

export class InternalException extends Exception {}

export class PermissionException extends Exception {}

export class AbortException extends Exception {}

export class BusyException extends Exception {}

export class LockedException extends Exception {}

export class MemoryException extends Exception {}

export class ReadOnlyException extends Exception {}

export class InterruptException extends Exception {}

export class IOException extends Exception {}

export class CorruptException extends Exception {}

export class NotFoundException extends Exception {}

export class FullException extends Exception {}

export class CantOpenException extends Exception {}

export class ProtocolException extends Exception {}

export class EmptyException extends Exception {}

export class SchemaChangedException extends Exception {}

export class TooBigException extends Exception {}

export class ConstraintException extends Exception {}

export class MismatchException extends Exception {}

export class MisuseException extends Exception {}

export class UnsupportedException extends Exception {}

export class AuthorizationException extends Exception {}

export class FormatException extends Exception {}

export class RangeException extends Exception {}

export class NotADatabaseException extends Exception {}

SQLite3.AbortException = AbortException;
SQLite3.AuthorizationException = AuthorizationException;
SQLite3.BusyException = BusyException;
SQLite3.CantOpenException = CantOpenException;
SQLite3.ConstraintException = ConstraintException;
SQLite3.CorruptException = CorruptException;
SQLite3.EmptyException = EmptyException;
SQLite3.Exception = Exception;
SQLite3.FormatException = FormatException;
SQLite3.FullException = FullException;
SQLite3.InternalException = InternalException;
SQLite3.InterruptException = InterruptException;
SQLite3.IOException = IOException;
SQLite3.LockedException = LockedException;
SQLite3.MemoryException = MemoryException;
SQLite3.MismatchException = MismatchException;
SQLite3.MisuseException = MisuseException;
SQLite3.NotADatabaseException = NotADatabaseException;
SQLite3.NotFoundException = NotFoundException;
SQLite3.PermissionException = PermissionException;
SQLite3.ProtocolException = ProtocolException;
SQLite3.RangeException = RangeException;
SQLite3.ReadOnlyException = ReadOnlyException;
SQLite3.SchemaChangedException = SchemaChangedException;
SQLite3.SQLException = SQLException;
SQLite3.TooBigException = TooBigException;
SQLite3.UnsupportedException = UnsupportedException;

const { ErrorCode } = SQLite3.Constants;

export function status2klass(status: number): typeof Exception | null {
  switch (status & 0xff) {
    case ErrorCode.OK:
      return null;
    case ErrorCode.ERROR:
      return SQLException;
    case ErrorCode.INTERNAL:
      return InternalException;
    case ErrorCode.PERM:
      return PermissionException;
    case ErrorCode.ABORT:
      return AbortException;
    case ErrorCode.BUSY:
      return BusyException;
    case ErrorCode.LOCKED:
      return LockedException;
    case ErrorCode.NOMEM:
      return MemoryException;
    case ErrorCode.READONLY:
      return ReadOnlyException;
    case ErrorCode.INTERRUPT:
      return InterruptException;
    case ErrorCode.IOERR:
      return IOException;
    case ErrorCode.CORRUPT:
      return CorruptException;
    case ErrorCode.NOTFOUND:
      return NotFoundException;
    case ErrorCode.FULL:
      return FullException;
    case ErrorCode.CANTOPEN:
      return CantOpenException;
    case ErrorCode.PROTOCOL:
      return ProtocolException;
    case ErrorCode.EMPTY:
      return EmptyException;
    case ErrorCode.SCHEMA:
      return SchemaChangedException;
    case ErrorCode.TOOBIG:
      return TooBigException;
    case ErrorCode.CONSTRAINT:
      return ConstraintException;
    case ErrorCode.MISMATCH:
      return MismatchException;
    case ErrorCode.MISUSE:
      return MisuseException;
    case ErrorCode.NOLFS:
      return UnsupportedException;
    case ErrorCode.AUTH:
      return AuthorizationException;
    case ErrorCode.FORMAT:
      return FormatException;
    case ErrorCode.RANGE:
      return RangeException;
    case ErrorCode.NOTADB:
      return NotADatabaseException;
    default:
      return Exception;
  }
}

/** @noRailsEquivalent CONVERGEABLE sqlite3-libsql-engines */
function nativeStatus(error: unknown): number | null {
  const { rawCode } = (error ?? {}) as Record<string, unknown>;
  if (typeof rawCode === "number") return rawCode & 0xff;
  return null;
}

/** @noRailsEquivalent CONVERGEABLE sqlite3-libsql-engines */
const nativeErrors: EngineErrors = {
  errcode: nativeStatus,
  errmsg: (error) => (error as { message: string }).message,
};

export function rbSqlite3Raise(error: unknown, db: EngineErrors = nativeErrors): never {
  const errcode = db.errcode(error);
  const status = errcode == null ? null : errcode & 0xff;
  const klass = status == null ? null : status2klass(status);
  if (klass == null) throw error;

  const exception = new klass(db.errmsg(error));
  exception.code = status;
  exception.cause = error;

  throw exception;
}

export function rbSqlite3RaiseWithSql(
  error: unknown,
  sql: string | null,
  db: EngineErrors = nativeErrors,
): never {
  const errcode = db.errcode(error);
  const status = errcode == null ? null : errcode & 0xff;
  const klass = status == null ? null : status2klass(status);
  if (klass == null) throw error;

  const exception = new klass(db.errmsg(error));
  exception.code = status;
  exception.cause = error;
  if (sql != null) {
    exception.sql = sql;
    exception.sqlOffset = -1;
  }

  throw exception;
}
