require "json"

class Ary < Array; end
class Hsh < Hash; end

class Column
  def initialize(name, type) = (@name, @type = name, type)
end

module Geo
  module Kind; end

  class Shape
    def initialize(kind) = @kind = kind
  end
end

class Cache
  attr_reader :version, :columns

  def initialize(version, columns) = (@version, @columns = version, columns)
  def marshal_dump = [@version, @columns]
  def marshal_load(array) = (@version, @columns = array)
end

a = "a"
e = :"é"
shared = Column.new(a, :string)
cycle = []
cycle << cycle
id = -"id"
posts = -"posts"

FIXTURES = {
  "nil" => nil,
  "fixnums" => [0, 122, 123, 65_536, 2**30 - 1, -1, -123, -124, -257, -(2**30)],
  "bigfixnums then link" => [2**30, -(2**30) - 1, 2**62 - 1, a, a],
  "bignums then link" => [2**62, -(2**70), a, a],
  "floats" => [1.0, 100.0, 1.0e-5, 0.00015, -123_456_789.125, 0.0, -0.0, 1.5, 1.5],
  "float inf, -inf, nan" => [Float::INFINITY, -Float::INFINITY, Float::NAN],
  "string utf-8" => "héllo ☃",
  "string binary" => "\xC3\xA9\xFF".b,
  "string us-ascii" => "abc".dup.force_encoding("US-ASCII"),
  "string shift_jis" => "あ".encode("Shift_JIS"),
  "symbols and strings" => [:a, a, :a, a, e, e, true, false],
  "array" => [1, "a", nil, [], {}],
  "array cycle" => cycle,
  "array subclass" => Ary[1],
  "hash" => { "a" => 1, b: [2], 3 => {} },
  "hash string keys" => { "a" => 1, "b" => nil },
  "hash default" => Hash.new(5).merge!("a" => 1),
  "hash default false" => Hash.new(false),
  "hash subclass" => Hsh["a", 1],
  "hash compare_by_identity" => {}.compare_by_identity.merge!(1 => 2),
  "class and module" => [Column, Geo::Shape, Geo::Kind],
  "object nested path" => Geo::Shape.new(:circle),
  "object link" => [shared, shared],
  "user marshal" => [cache = Cache.new(1, { posts => [shared] }), cache],
  "rational" => [half = Rational(1, 2), half, Rational(-3, 4), Rational(2**70, 3)],
  "schema cache" => [20_240_101_000_000, { posts => [Column.new(id, :integer)] }, {}, { posts => id }, { posts => true }, {}],
}

path = File.join(__dir__, "marshal.fixtures.json")
File.write(path, JSON.pretty_generate(FIXTURES.transform_values { |v| Marshal.dump(v).unpack1("H*") }) + "\n")
