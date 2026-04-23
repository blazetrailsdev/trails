# frozen_string_literal: true

require "minitest/autorun"
require_relative "canonicalize"

class CanonicalizeTest < Minitest::Test
  # Build a minimal NativeTable hash for test fixtures
  def col(name, ar_type, null: true, default: nil, limit: nil, precision: nil, scale: nil)
    { name: name, ar_type: ar_type, null: null, default: default,
      limit: limit, precision: precision, scale: scale }
  end

  def table(columns:, indexes: [], primary_key_columns: [])
    { columns: columns, indexes: indexes, primary_key_columns: primary_key_columns }
  end

  # --- type mapping ---

  def test_maps_trivial_fixture_columns
    native = {
      "users" => table(
        columns: [
          col("id",         :integer,  null: true),
          col("email",      :text,     null: false),
          col("name",       :text,     null: true),
          col("score",      :float,    null: true),
          col("avatar",     :binary,   null: true),
          col("created_at", :datetime, null: false),
          col("active",     :integer,  null: false, default: 1),
        ],
        primary_key_columns: ["id"],
      ),
    }

    result = Canonicalize.call(native)

    assert_equal 1, result["version"]
    assert_equal 1, result["tables"].length
    t = result["tables"][0]
    assert_equal "users", t["name"]
    assert_equal "id", t["primaryKey"]
    assert_equal %w[id email name score avatar created_at active], t["columns"].map { |c| c["name"] }
    assert_equal "integer",  t["columns"][0]["type"]
    assert_equal "float",    t["columns"][3]["type"]
    assert_equal "binary",   t["columns"][4]["type"]
    assert_equal "datetime", t["columns"][5]["type"]
    assert_equal 1,          t["columns"][6]["default"]
    assert_equal [],         t["indexes"]
  end

  # --- column ordering ---

  def test_preserves_column_declaration_order
    native = {
      "things" => table(columns: [col("z", :text), col("a", :text), col("m", :text)]),
    }
    t = Canonicalize.call(native)["tables"][0]
    assert_equal %w[z a m], t["columns"].map { |c| c["name"] }
  end

  # --- table sorting ---

  def test_sorts_tables_by_name
    native = {
      "zebra" => table(columns: [col("id", :integer)], primary_key_columns: ["id"]),
      "apple" => table(columns: [col("id", :integer)], primary_key_columns: ["id"]),
    }
    names = Canonicalize.call(native)["tables"].map { |t| t["name"] }
    assert_equal %w[apple zebra], names
  end

  # --- filters ---

  def test_filters_schema_migrations_and_ar_internal_metadata
    native = {
      "users"                => table(columns: [col("id", :integer)], primary_key_columns: ["id"]),
      "schema_migrations"    => table(columns: [col("version", :string, null: false)]),
      "ar_internal_metadata" => table(columns: [col("key", :string, null: false)]),
    }
    names = Canonicalize.call(native)["tables"].map { |t| t["name"] }
    assert_equal ["users"], names
  end

  def test_filters_sqlite_autoindex_and_sorts_remaining_indexes
    native = {
      "posts" => table(
        columns: [col("id", :integer)],
        primary_key_columns: ["id"],
        indexes: [
          { name: "sqlite_autoindex_posts_1", columns: ["title"],      unique: true,  where: nil },
          { name: "idx_posts_z",              columns: ["created_at"], unique: false, where: nil },
          { name: "idx_posts_a",              columns: ["author_id"],  unique: false, where: nil },
        ],
      ),
    }
    t = Canonicalize.call(native)["tables"][0]
    assert_equal %w[idx_posts_a idx_posts_z], t["indexes"].map { |i| i["name"] }
  end

  # --- primary key shapes ---

  def test_single_column_pk
    native = { "t" => table(columns: [col("id", :integer)], primary_key_columns: ["id"]) }
    assert_equal "id", Canonicalize.call(native)["tables"][0]["primaryKey"]
  end

  def test_composite_pk_as_array_in_position_order
    native = {
      "taggings" => table(
        columns: [col("tag_id", :integer, null: false), col("taggable_id", :integer, null: false)],
        primary_key_columns: ["tag_id", "taggable_id"],
      ),
    }
    assert_equal ["tag_id", "taggable_id"], Canonicalize.call(native)["tables"][0]["primaryKey"]
  end

  def test_pk_position_order_overrides_column_declaration_order
    # Simulates PRIMARY KEY (b, a) where a appears first in the table definition.
    native = {
      "items" => table(
        columns: [col("a", :integer, null: false), col("b", :integer, null: false)],
        primary_key_columns: ["b", "a"],
      ),
    }
    assert_equal ["b", "a"], Canonicalize.call(native)["tables"][0]["primaryKey"]
  end

  def test_no_pk_table
    native = { "logs" => table(columns: [col("message", :text)]) }
    assert_nil Canonicalize.call(native)["tables"][0]["primaryKey"]
  end

  # --- default coercion ---

  def test_integer_default
    native = { "t" => table(columns: [col("count", :integer, null: false, default: 0)]) }
    assert_equal 0, Canonicalize.call(native)["tables"][0]["columns"][0]["default"]
  end

  def test_string_default
    native = { "t" => table(columns: [col("status", :string, null: false, default: "active")]) }
    assert_equal "active", Canonicalize.call(native)["tables"][0]["columns"][0]["default"]
  end

  def test_nil_default
    native = { "t" => table(columns: [col("note", :text, null: true, default: nil)]) }
    assert_nil Canonicalize.call(native)["tables"][0]["columns"][0]["default"]
  end

  # --- error cases ---

  def test_raises_on_unknown_ar_type
    native = { "t" => table(columns: [col("x", :unknowntype)]) }
    err = assert_raises(RuntimeError) { Canonicalize.call(native) }
    assert_match(/unknown AR type.*unknowntype/, err.message)
  end

  def test_raises_on_index_with_no_columns
    native = {
      "t" => table(
        columns: [col("id", :integer)],
        indexes: [{ name: "bad_idx", columns: [], unique: false, where: nil }],
      ),
    }
    err = assert_raises(RuntimeError) { Canonicalize.call(native) }
    assert_match(/no columns/, err.message)
  end
end
