# frozen_string_literal: true

require "set"
require "bigdecimal"

# Lowers a native dump (raw AR introspection data) into the neutral
# CanonicalSchema format defined in scripts/parity/canonical/schema.schema.json.
#
# Pure function — no I/O, no side effects.

module Canonicalize
  FILTERED_TABLES = %w[schema_migrations ar_internal_metadata].to_set.freeze
  AUTOINDEX_PREFIX = "sqlite_autoindex_"

  # Maps AR abstract type symbols (col.type) to canonical type strings.
  # D4: throw on any type not in this map.
  AR_TO_CANONICAL = {
    string:   "string",
    text:     "text",
    integer:  "integer",
    bigint:   "bigint",
    float:    "float",
    decimal:  "decimal",
    datetime: "datetime",
    date:     "date",
    time:     "time",
    boolean:  "boolean",
    binary:   "binary",
    json:     "json",
  }.freeze

  # native_dump: Hash<table_name, { columns:, indexes:, primary_key_columns: }>
  # where columns is Array<{ name:, ar_type:, null:, default:, limit:, precision:, scale: }>
  # and indexes is Array<{ name:, columns:, unique:, where: }>
  # and primary_key_columns is Array<String> in PK-position order
  def self.call(native_dump)
    tables = native_dump
      .reject { |name, _| FILTERED_TABLES.include?(name) }
      .sort_by { |name, _| name }
      .map { |name, table| canonicalize_table(name, table) }

    { "version" => 1, "tables" => tables }
  end

  def self.canonicalize_table(name, table)
    pk_cols = table[:primary_key_columns]
    primary_key = case pk_cols.length
    when 0 then nil
    when 1 then pk_cols[0]
    else        pk_cols
    end

    columns = table[:columns].map { |col| canonicalize_column(name, col) }

    indexes = table[:indexes]
      .reject { |idx| idx[:name].start_with?(AUTOINDEX_PREFIX) }
      .sort_by { |idx| idx[:name] }
      .map { |idx| canonicalize_index(name, idx) }

    { "name" => name, "primaryKey" => primary_key, "columns" => columns, "indexes" => indexes }
  end

  def self.canonicalize_column(table_name, col)
    ar_type = col[:ar_type]
    canonical_type = AR_TO_CANONICAL[ar_type] or
      raise "canonicalize: unknown AR type #{ar_type.inspect} on #{table_name}.#{col[:name]} — add it to AR_TO_CANONICAL"

    {
      "name"      => col[:name],
      "type"      => canonical_type,
      "null"      => col[:null],
      "default"   => coerce_default(col[:default]),
      "limit"     => col[:limit],
      "precision" => col[:precision],
      "scale"     => col[:scale],
    }
  end

  def self.canonicalize_index(table_name, idx)
    cols = idx[:columns]
    raise "canonicalize: index #{idx[:name].inspect} on #{table_name} has no columns" if cols.empty?

    {
      "name"    => idx[:name],
      "columns" => cols,
      "unique"  => idx[:unique],
      "where"   => idx[:where],
    }
  end

  # Coerce an AR default value (already deserialized by AR's type system)
  # into a canonical scalar: String | Integer | Float | true | false | nil.
  def self.coerce_default(value)
    return nil if value.nil?
    return value if value == true || value == false
    return value.to_i if value.is_a?(Integer)
    # Float and BigDecimal (AR uses BigDecimal for :decimal columns) → JSON number.
    return value.to_f if value.is_a?(Numeric)
    value.to_s
  end
end
