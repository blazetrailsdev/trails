import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./backup.js";
import * as m1 from "./database.js";
import * as m2 from "./errors.js";
import * as m3 from "./pragmas.js";

defineConstants([
  [m2, "AbortException", "SQLite3::AbortException"],
  [m2, "AuthorizationException", "SQLite3::AuthorizationException"],
  [m0, "Backup", "SQLite3::Backup"],
  [m2, "BusyException", "SQLite3::BusyException"],
  [m2, "CantOpenException", "SQLite3::CantOpenException"],
  [m2, "ConstraintException", "SQLite3::ConstraintException"],
  [m2, "CorruptException", "SQLite3::CorruptException"],
  [m1, "Database", "SQLite3::Database"],
  [m2, "EmptyException", "SQLite3::EmptyException"],
  [m2, "Exception", "SQLite3::Exception"],
  [m2, "FormatException", "SQLite3::FormatException"],
  [m2, "FullException", "SQLite3::FullException"],
  [m2, "InternalException", "SQLite3::InternalException"],
  [m2, "InterruptException", "SQLite3::InterruptException"],
  [m2, "IOException", "SQLite3::IOException"],
  [m2, "LockedException", "SQLite3::LockedException"],
  [m2, "MemoryException", "SQLite3::MemoryException"],
  [m2, "MismatchException", "SQLite3::MismatchException"],
  [m2, "MisuseException", "SQLite3::MisuseException"],
  [m2, "NotADatabaseException", "SQLite3::NotADatabaseException"],
  [m2, "NotFoundException", "SQLite3::NotFoundException"],
  [m2, "PermissionException", "SQLite3::PermissionException"],
  [m3, "Pragmas", "SQLite3::Pragmas"],
  [m2, "ProtocolException", "SQLite3::ProtocolException"],
  [m2, "RangeException", "SQLite3::RangeException"],
  [m2, "ReadOnlyException", "SQLite3::ReadOnlyException"],
  [m2, "SchemaChangedException", "SQLite3::SchemaChangedException"],
  [m2, "SQLException", "SQLite3::SQLException"],
  [m2, "TooBigException", "SQLite3::TooBigException"],
  [m2, "UnsupportedException", "SQLite3::UnsupportedException"],
]);
