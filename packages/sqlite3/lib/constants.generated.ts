import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./backup.js";
import * as m1 from "./constants.js";
import * as m2 from "./database.js";
import * as m3 from "./errors.js";
import * as m4 from "./fork-safety.js";
import * as m5 from "./pragmas.js";
import * as m6 from "./resultset.js";
import * as m7 from "./statement.js";
import * as m8 from "./value.js";

defineConstants([
  [() => m3, "AbortException", "SQLite3::AbortException"],
  [() => m3, "AuthorizationException", "SQLite3::AuthorizationException"],
  [() => m0, "Backup", "SQLite3::Backup"],
  [() => m7, "Blob", "SQLite3::Blob"],
  [() => m3, "BusyException", "SQLite3::BusyException"],
  [() => m3, "CantOpenException", "SQLite3::CantOpenException"],
  [() => m1, "Constants", "SQLite3::Constants"],
  [() => m3, "ConstraintException", "SQLite3::ConstraintException"],
  [() => m3, "CorruptException", "SQLite3::CorruptException"],
  [() => m2, "Database", "SQLite3::Database"],
  [() => m2, "FunctionProxy", "SQLite3::Database::FunctionProxy"],
  [() => m3, "EmptyException", "SQLite3::EmptyException"],
  [() => m3, "Exception", "SQLite3::Exception"],
  [() => m4, "ForkSafety", "SQLite3::ForkSafety"],
  [() => m4, "CoreExt", "SQLite3::ForkSafety::CoreExt"],
  [() => m3, "FormatException", "SQLite3::FormatException"],
  [() => m3, "FullException", "SQLite3::FullException"],
  [() => m6, "HashResultSet", "SQLite3::HashResultSet"],
  [() => m3, "InternalException", "SQLite3::InternalException"],
  [() => m3, "InterruptException", "SQLite3::InterruptException"],
  [() => m3, "IOException", "SQLite3::IOException"],
  [() => m3, "LockedException", "SQLite3::LockedException"],
  [() => m3, "MemoryException", "SQLite3::MemoryException"],
  [() => m3, "MismatchException", "SQLite3::MismatchException"],
  [() => m3, "MisuseException", "SQLite3::MisuseException"],
  [() => m3, "NotADatabaseException", "SQLite3::NotADatabaseException"],
  [() => m3, "NotFoundException", "SQLite3::NotFoundException"],
  [() => m3, "PermissionException", "SQLite3::PermissionException"],
  [() => m5, "Pragmas", "SQLite3::Pragmas"],
  [() => m3, "ProtocolException", "SQLite3::ProtocolException"],
  [() => m3, "RangeException", "SQLite3::RangeException"],
  [() => m3, "ReadOnlyException", "SQLite3::ReadOnlyException"],
  [() => m6, "ResultSet", "SQLite3::ResultSet"],
  [() => m3, "SchemaChangedException", "SQLite3::SchemaChangedException"],
  [() => m3, "SQLException", "SQLite3::SQLException"],
  [() => m7, "Statement", "SQLite3::Statement"],
  [() => m3, "TooBigException", "SQLite3::TooBigException"],
  [() => m3, "UnsupportedException", "SQLite3::UnsupportedException"],
  [() => m8, "Value", "SQLite3::Value"],
]);
