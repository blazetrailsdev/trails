import { describe, expect, it } from "vitest";
import { assertNoRubySource } from "./no-ruby-source.js";

describe("assertNoRubySource", () => {
  it("flags Ruby def with parens", () => {
    expect(() => assertNoRubySource("def greet(name)\nend\n")).toThrow(/Ruby-like source/);
  });

  it("flags Ruby def without parens", () => {
    expect(() => assertNoRubySource("def greet\n  puts name\nend")).toThrow(/Ruby-like source/);
  });

  it("flags Ruby class with inheritance", () => {
    expect(() => assertNoRubySource("class Foo < Bar\nend")).toThrow(/Ruby-like source/);
  });

  it("flags Ruby class with namespaced parent name", () => {
    expect(() => assertNoRubySource("class Foo::Bar\nend")).toThrow(/Ruby-like source/);
  });

  it("flags Ruby class inheriting from top-level constant", () => {
    expect(() => assertNoRubySource("class Foo < ::Bar\nend")).toThrow(/Ruby-like source/);
  });

  it("flags Ruby class inheriting from a namespaced parent", () => {
    expect(() => assertNoRubySource("class Foo < A::B::C\nend")).toThrow(/Ruby-like source/);
  });

  it("flags bare Ruby module declaration", () => {
    expect(() => assertNoRubySource("module Foo\nend")).toThrow(/Ruby-like source/);
  });

  it("flags Ruby def self.method", () => {
    expect(() => assertNoRubySource("def self.greet\nend")).toThrow(/Ruby-like source/);
  });

  it("flags Ruby def with bang suffix", () => {
    expect(() => assertNoRubySource("def greet!\nend")).toThrow(/Ruby-like source/);
  });

  it("flags Ruby def with predicate suffix", () => {
    expect(() => assertNoRubySource("def greet?\nend")).toThrow(/Ruby-like source/);
  });

  it("flags Ruby def with setter suffix", () => {
    expect(() => assertNoRubySource("def name=(v)\nend")).toThrow(/Ruby-like source/);
  });

  it("flags Ruby class with trailing comment", () => {
    expect(() => assertNoRubySource("class Foo # a comment\nend")).toThrow(/Ruby-like source/);
  });

  it("flags Ruby class with inline semicolon", () => {
    expect(() => assertNoRubySource("class Foo; end")).toThrow(/Ruby-like source/);
  });

  it("flags Ruby module with inline semicolon", () => {
    expect(() => assertNoRubySource("module Foo; end")).toThrow(/Ruby-like source/);
  });

  it("does not flag TS class with body", () => {
    expect(() => assertNoRubySource("export class Foo {\n  x = 1;\n}\n")).not.toThrow();
  });

  it("does not flag TS class with generics", () => {
    expect(() => assertNoRubySource("export class Foo<T> {\n  x: T;\n}\n")).not.toThrow();
  });

  it("does not flag TS class with whitespace-padded generic brackets", () => {
    expect(() => assertNoRubySource("export class Foo< T > {}\n")).not.toThrow();
  });

  it("does not flag TS class with constrained generic", () => {
    expect(() => assertNoRubySource("class Foo<T extends Bar> {}\n")).not.toThrow();
  });

  it("does not flag TS class with extends clause", () => {
    expect(() => assertNoRubySource("class Foo extends Bar {}\n")).not.toThrow();
  });
});
