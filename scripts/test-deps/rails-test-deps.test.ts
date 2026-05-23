import { describe, it, expect } from "vitest";
import { parseSource } from "./rails-test-deps.js";

describe("parseSource", () => {
  it("captures model requires", () => {
    const src = [
      'require "models/post"',
      'require "models/author"',
      'require "models/post"', // duplicate
      "",
      "class FooTest < ActiveRecord::TestCase",
      "end",
    ].join("\n");
    expect(parseSource(src).requires).toEqual(["author", "post"]);
  });

  it("flattens multi-line fixture declarations across classes", () => {
    const src = [
      "class A < ActiveRecord::TestCase",
      "  fixtures :topics, :companies,",
      '    :developers, "warehouse-things"',
      "end",
      "class B < ActiveRecord::TestCase",
      "  fixtures :posts",
      "end",
    ].join("\n");
    expect(parseSource(src).fixtures).toEqual([
      "companies",
      "developers",
      "posts",
      "topics",
      "warehouse-things",
    ]);
  });

  it("captures set_fixture_class mappings", () => {
    const src = [
      "class X < ActiveRecord::TestCase",
      "  set_fixture_class items: Book, funny_jokes: Joke",
      "end",
    ].join("\n");
    expect(parseSource(src).setFixtureClass).toEqual({ items: "Book", funny_jokes: "Joke" });
  });

  it("attributes per-test fixture records for def test_x", () => {
    const src = [
      "class T < ActiveRecord::TestCase",
      "  fixtures :customers, :posts",
      "  def test_one",
      "    customers(:david).name",
      "    posts(:welcome, :thinking)",
      "  end",
      "  def test_two",
      "    customers(:mary)",
      "  end",
      "end",
    ].join("\n");
    const out = parseSource(src);
    expect(out.tests).toEqual({
      test_one: { fixtures: { customers: ["david"], posts: ["thinking", "welcome"] } },
      test_two: { fixtures: { customers: ["mary"] } },
    });
  });

  it('normalizes `test "..." do` labels', () => {
    const src = [
      "class T < ActiveRecord::TestCase",
      "  fixtures :customers",
      '  test "finds by name" do',
      "    customers(:david)",
      "  end",
      "end",
    ].join("\n");
    expect(Object.keys(parseSource(src).tests)).toEqual(["test_finds_by_name"]);
  });

  it("omits tests with no fixture-accessor calls", () => {
    const src = [
      "class T < ActiveRecord::TestCase",
      "  fixtures :customers",
      "  def test_other",
      "    assert true",
      "  end",
      "end",
    ].join("\n");
    expect(parseSource(src).tests).toEqual({});
  });

  it("does not treat hash-syntax keys as fixture accessors", () => {
    const src = [
      "class T < ActiveRecord::TestCase",
      "  fixtures :customers",
      "  def test_hash",
      "    h = { customers: 1 }",
      "    h[:customers]",
      "  end",
      "end",
    ].join("\n");
    expect(parseSource(src).tests).toEqual({});
  });
});
