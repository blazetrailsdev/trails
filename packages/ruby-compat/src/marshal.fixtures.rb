# Regenerate with `ruby packages/ruby-compat/src/marshal.fixtures.rb` (the
# `ruby` on PATH, 3.3). Writes marshal.fixtures.json: each name's
# `Marshal.dump` bytes as hex, which marshal.trails.test.ts dumps.
require "json"

class Pt
  def initialize(x, name) = (@x, @name = x, name)
end

module Geo
  class Shape
    def initialize(kind) = @kind = kind
  end
end

class SqlTypeMetadata
  def initialize(sql_type) = (@sql_type, @type = sql_type, :integer)
end

class Column
  def initialize(name, sql_type, null) = (@name, @sql_type_metadata, @null = name, SqlTypeMetadata.new(sql_type), null)
end

a = "a"
shared = Pt.new(1, a)
cycle = []
cycle << cycle
id = -"id"
posts = -"posts"

FIXTURES = {
  "nil" => nil,
  "true" => true,
  "false" => false,
  "fixnum 0" => 0,
  "fixnum 122" => 122,
  "fixnum 123" => 123,
  "fixnum 256" => 256,
  "fixnum 65536" => 65_536,
  "fixnum 2**30 - 1" => 2**30 - 1,
  "fixnum -1" => -1,
  "fixnum -123" => -123,
  "fixnum -124" => -124,
  "fixnum -257" => -257,
  "fixnum -2**30" => -(2**30),
  "bigfixnum 2**30" => 2**30,
  "bigfixnum -2**30 - 1" => -(2**30) - 1,
  "bigfixnum 2**62 - 1" => 2**62 - 1,
  "bigfixnum then link" => [2**40, a, a],
  "bignum 2**62" => 2**62,
  "bignum -2**70" => -(2**70),
  "bignum then link" => [2**70, a, a],
  "float 1.5" => 1.5,
  "float 1.0" => 1.0,
  "float 0.0 and -0.0" => [0.0, -0.0],
  "float 100.0" => 100.0,
  "float 1e-5" => 1.0e-5,
  "float 0.00015" => 0.00015,
  "float -123456789.125" => -123_456_789.125,
  "float inf, -inf, nan" => [Float::INFINITY, -Float::INFINITY, Float::NAN],
  "float link" => [1.5, 1.5],
  "string empty" => "",
  "string utf-8" => "héllo ☃",
  "string link" => [a, a],
  "symbol utf-8" => :"é",
  "symlink" => %i[a b a],
  "array" => [1, "a", nil, [true, false], []],
  "array cycle" => cycle,
  "hash" => { "a" => 1, b: [2], 3 => {} },
  "hash default" => Hash.new(5).merge!("a" => 1),
  "object" => Pt.new(1, "a"),
  "object nested path" => Geo::Shape.new(:circle),
  "object link" => [shared, shared],
  "schema cache" => [
    20_240_101_000_000,
    { posts => [Column.new(id, -"integer", false), Column.new(-"title", -"varchar", true)] },
    {},
    { posts => id },
    { posts => true },
    {},
  ],
}.freeze

path = File.join(__dir__, "marshal.fixtures.json")
File.write(path, JSON.pretty_generate(FIXTURES.transform_values { |v| Marshal.dump(v).unpack1("H*") }) + "\n")
