import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./database.js";
import * as m1 from "./errors.js";
import * as m2 from "./pragmas.js";

defineConstants([
  [m1, "AbortException", "SQLite3::AbortException"],
  [m1, "AuthorizationException", "SQLite3::AuthorizationException"],
  [m1, "BusyException", "SQLite3::BusyException"],
  [m1, "CantOpenException", "SQLite3::CantOpenException"],
  [m1, "ConstraintException", "SQLite3::ConstraintException"],
  [m1, "CorruptException", "SQLite3::CorruptException"],
  [m0, "Database", "SQLite3::Database"],
  [m1, "EmptyException", "SQLite3::EmptyException"],
  [m1, "Exception", "SQLite3::Exception"],
  [m1, "FormatException", "SQLite3::FormatException"],
  [m1, "FullException", "SQLite3::FullException"],
  [m1, "InternalException", "SQLite3::InternalException"],
  [m1, "InterruptException", "SQLite3::InterruptException"],
  [m1, "IOException", "SQLite3::IOException"],
  [m1, "LockedException", "SQLite3::LockedException"],
  [m1, "MemoryException", "SQLite3::MemoryException"],
  [m1, "MismatchException", "SQLite3::MismatchException"],
  [m1, "MisuseException", "SQLite3::MisuseException"],
  [m1, "NotADatabaseException", "SQLite3::NotADatabaseException"],
  [m1, "NotFoundException", "SQLite3::NotFoundException"],
  [m1, "PermissionException", "SQLite3::PermissionException"],
  [m2, "Pragmas", "SQLite3::Pragmas"],
  [m1, "ProtocolException", "SQLite3::ProtocolException"],
  [m1, "RangeException", "SQLite3::RangeException"],
  [m1, "ReadOnlyException", "SQLite3::ReadOnlyException"],
  [m1, "SchemaChangedException", "SQLite3::SchemaChangedException"],
  [m1, "SQLException", "SQLite3::SQLException"],
  [m1, "TooBigException", "SQLite3::TooBigException"],
  [m1, "UnsupportedException", "SQLite3::UnsupportedException"],
]);
