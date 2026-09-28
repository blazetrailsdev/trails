import { SQLite3Constants } from "../sqlite-adapter.js";

export class Exception extends Error {
  code: number | null = null;

  sql: string | null = null;

  sqlOffset = -1;

  #message: string;

  constructor(message?: string) {
    super(message);
    this.name = new.target.name;
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

for (const [name, klass] of Object.entries({
  Exception,
  SQLException,
  InternalException,
  PermissionException,
  AbortException,
  BusyException,
  LockedException,
  MemoryException,
  ReadOnlyException,
  InterruptException,
  IOException,
  CorruptException,
  NotFoundException,
  FullException,
  CantOpenException,
  ProtocolException,
  EmptyException,
  SchemaChangedException,
  TooBigException,
  ConstraintException,
  MismatchException,
  MisuseException,
  UnsupportedException,
  AuthorizationException,
  FormatException,
  RangeException,
  NotADatabaseException,
})) {
  Object.defineProperty(klass, "name", { value: `SQLite3::${name}` });
}

const { ErrorCode } = SQLite3Constants;

/** @noRailsEquivalent PERMANENT */
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

/** @noRailsEquivalent PERMANENT */
function nativeStatus(error: unknown): number | null {
  const { errcode, rawCode, code } = (error ?? {}) as Record<string, unknown>;
  if (typeof errcode === "number") return errcode & 0xff;
  if (typeof rawCode === "number") return rawCode & 0xff;
  if (typeof code === "string" && code.startsWith("SQLITE_")) {
    return ErrorCode[code.split("_")[1] as keyof typeof ErrorCode] ?? null;
  }
  return null;
}

/** @noRailsEquivalent PERMANENT */
export function rbSqlite3Raise(error: unknown): never {
  const status = nativeStatus(error);
  const klass = status == null ? null : status2klass(status);
  if (klass == null) throw error;

  const exception = new klass((error as Error).message);
  exception.code = status;

  throw exception;
}

/** @noRailsEquivalent PERMANENT */
export function rbSqlite3RaiseWithSql(error: unknown, sql: string | null): never {
  const status = nativeStatus(error);
  const klass = status == null ? null : status2klass(status);
  if (klass == null) throw error;

  const exception = new klass((error as Error).message);
  exception.code = status;
  if (sql) {
    exception.sql = sql;
    exception.sqlOffset = -1;
  }

  throw exception;
}
