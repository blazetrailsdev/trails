#!/usr/bin/env ruby
# frozen_string_literal: true

# Extracts test metadata from Rails test files using Ripper.
# Handles three test styles:
#   1. Minitest::Spec: describe/it blocks (used in Arel tests)
#   2. test macro: test "description" do (ActiveModel, ActiveRecord)
#   3. def test_xxx: older-style test methods
#
# Outputs output/rails-tests.json

require "ripper"
require "json"
require "pathname"
require "time"

SCRIPT_DIR = File.dirname(__FILE__)
RAILS_DIR = File.join(SCRIPT_DIR, "..", "api-compare", ".rails-source")
RACK_DIR = File.join(SCRIPT_DIR, "..", "api-compare", ".rack-source")
OUTPUT_DIR = File.join(SCRIPT_DIR, "output")

# Map packages to their test directories
PACKAGE_TEST_DIRS = {
  "arel"          => File.join(RAILS_DIR, "activerecord", "test", "cases", "arel"),
  "activemodel"   => File.join(RAILS_DIR, "activemodel", "test", "cases"),
  "activerecord"  => File.join(RAILS_DIR, "activerecord", "test", "cases"),
  "activesupport" => File.join(RAILS_DIR, "activesupport", "test"),
  "rack"          => File.join(RACK_DIR, "test"),
  "actiondispatch" => File.join(RAILS_DIR, "actionpack", "test"),
}

# Files/directories to skip (infrastructure, not actual tests)
SKIP_PATTERNS = [
  /\/helper\.rb$/,
  /\/support\//,
  /\/fixtures\//,
  /\/test_case\.rb$/,
  /\/abstract_unit\.rb$/,
  /\/config\.rb$/,
  /\/migration\//,  # Migration test infrastructure (not test cases themselves)
]

# Assertion methods to track
ASSERTION_METHODS = %w[
  assert assert_equal assert_not_equal assert_nil assert_not_nil
  assert_raises assert_raise assert_nothing_raised
  assert_match assert_no_match assert_includes assert_not_includes
  assert_empty assert_not_empty assert_respond_to
  assert_instance_of assert_kind_of assert_predicate
  assert_same assert_not_same assert_in_delta assert_in_epsilon
  assert_operator assert_send assert_difference assert_no_difference
  assert_changes assert_no_changes assert_deprecated
  must_equal must_be_nil must_be_like must_be_empty
  must_include must_respond_to must_be_instance_of
  must_raise wont_be_nil wont_equal wont_be_empty
  refute refute_equal refute_nil refute_includes
  expect
].freeze

class TestExtractor
  attr_reader :test_files

  def initialize
    @test_files = []
  end

  def process_file(filepath, package_root)
    source = File.read(filepath)
    sexp = Ripper.sexp(source)
    return unless sexp

    rel_path = Pathname.new(filepath).relative_path_from(Pathname.new(package_root)).to_s

    @current_file = rel_path
    @current_filepath = filepath
    @describe_stack = []
    @test_cases = []
    @source_lines = source.lines

    walk(sexp)

    return if @test_cases.empty?

    # Determine top-level class name from file path
    class_name = File.basename(rel_path, "_test.rb")
      .split("_")
      .map(&:capitalize)
      .join

    @test_files << {
      file: rel_path,
      className: class_name,
      testCases: @test_cases,
      testCount: @test_cases.length,
    }
  end

  private

  def walk(node)
    return unless node.is_a?(Array)

    case node[0]
    when :command
      process_command(node)
    when :method_add_arg
      process_method_add_arg(node)
    when :def
      process_def(node)
    when :class
      process_class(node)
    when :program, :bodystmt, :body_stmt, :stmts_add, :stmts_new,
         :begin, :else, :elsif, :if, :if_mod, :unless, :unless_mod,
         :rescue, :ensure, :while, :until, :case, :when, :module
      node.each { |child| walk(child) if child.is_a?(Array) }
    else
      node.each { |child| walk(child) if child.is_a?(Array) }
    end
  end

  def process_class(node)
    name = const_name(node[1])
    return unless name

    @describe_stack.push(name)
    walk_body(node[3] || node[2])
    @describe_stack.pop
  end

  def process_command(node)
    cmd_name = ident_name(node[1])
    args = node[2]

    case cmd_name
    when "describe"
      process_describe(args, node)
    when "it"
      process_it(args, node)
    when "test"
      process_test_macro(args, node)
    end
  end

  def process_method_add_arg(node)
    # Handle describe("...") { } and it("...") { } with parenthesized args
    if node[1].is_a?(Array) && node[1][0] == :fcall
      cmd_name = ident_name(node[1][1])
      case cmd_name
      when "describe"
        process_describe_paren(node)
      when "it"
        process_it_paren(node)
      when "test"
        process_test_macro_paren(node)
      end
    else
      walk(node[1]) if node[1].is_a?(Array)
      walk(node[2]) if node[2].is_a?(Array)
    end
  end

  def process_describe(args, node)
    desc = extract_first_string(args)
    return unless desc

    line = extract_line(node)
    @describe_stack.push(desc)

    # Walk the block body
    walk_block_body(node)

    @describe_stack.pop
  end

  def process_describe_paren(node)
    desc = extract_string_from_arg_paren(node[2])
    return unless desc

    line = extract_line(node)
    @describe_stack.push(desc)

    # Walk the block body — look for do_block or brace_block in the outer structure
    walk_children(node)

    @describe_stack.pop
  end

  def process_it(args, node)
    desc = extract_first_string(args)
    return unless desc

    line = extract_line(node)
    assertions = extract_assertions_from_block(node)

    path = (@describe_stack + [desc]).join(" > ")

    @test_cases << {
      path: path,
      description: desc,
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: line,
      style: "it",
      assertions: assertions,
    }
  end

  def process_it_paren(node)
    desc = extract_string_from_arg_paren(node[2])
    return unless desc

    line = extract_line(node)
    assertions = extract_assertions_from_node(node)

    path = (@describe_stack + [desc]).join(" > ")

    @test_cases << {
      path: path,
      description: desc,
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: line,
      style: "it",
      assertions: assertions,
    }
  end

  def process_test_macro(args, node)
    desc = extract_first_string(args)
    return unless desc

    line = extract_line(node)
    assertions = extract_assertions_from_block(node)

    path = (@describe_stack + [desc]).join(" > ")

    @test_cases << {
      path: path,
      description: desc,
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: line,
      style: "test",
      assertions: assertions,
    }
  end

  def process_test_macro_paren(node)
    desc = extract_string_from_arg_paren(node[2])
    return unless desc

    line = extract_line(node)
    assertions = extract_assertions_from_node(node)

    path = (@describe_stack + [desc]).join(" > ")

    @test_cases << {
      path: path,
      description: desc,
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: line,
      style: "test",
      assertions: assertions,
    }
  end

  def process_def(node)
    name_node = node[1]
    name = ident_name(name_node)
    return unless name
    return unless name.start_with?("test_")

    # Convert test_foo_bar to "foo bar"
    desc = name.sub(/^test_/, "").tr("_", " ")
    line = extract_line(node)
    assertions = extract_assertions_from_def(node)

    path = (@describe_stack + [desc]).join(" > ")

    @test_cases << {
      path: path,
      description: desc,
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: line,
      style: "def_test",
      assertions: assertions,
    }
  end

  # ---- Assertion extraction ----

  def extract_assertions_from_block(node)
    assertions = []
    find_assertions(node, assertions)
    assertions.uniq
  end

  def extract_assertions_from_node(node)
    assertions = []
    find_assertions(node, assertions)
    assertions.uniq
  end

  def extract_assertions_from_def(node)
    assertions = []
    find_assertions(node, assertions)
    assertions.uniq
  end

  def find_assertions(node, results)
    return unless node.is_a?(Array)

    case node[0]
    when :command, :fcall
      name = ident_name(node[1])
      results << name if name && ASSERTION_METHODS.include?(name)
    when :method_add_arg
      if node[1].is_a?(Array) && node[1][0] == :fcall
        name = ident_name(node[1][1])
        results << name if name && ASSERTION_METHODS.include?(name)
      end
    when :call
      # method.must_equal etc
      name = ident_name(node[3]) if node[3]
      results << name if name && ASSERTION_METHODS.include?(name)
    end

    node.each { |child| find_assertions(child, results) if child.is_a?(Array) }
  end

  # ---- String extraction helpers ----

  def extract_first_string(args)
    return nil unless args.is_a?(Array)
    traverse_for_string(args)
  end

  def extract_string_from_arg_paren(args)
    return nil unless args.is_a?(Array)
    traverse_for_string(args)
  end

  def traverse_for_string(node)
    return nil unless node.is_a?(Array)

    case node[0]
    when :string_literal
      extract_string_content(node)
    when :@tstring_content
      node[1]
    else
      node.each do |child|
        if child.is_a?(Array)
          result = traverse_for_string(child)
          return result if result
        end
      end
      nil
    end
  end

  def extract_string_content(node)
    return nil unless node.is_a?(Array)
    if node[0] == :string_literal
      content = node[1]
      if content.is_a?(Array) && content[0] == :string_content
        parts = content[1..]
        return parts.map { |p| p.is_a?(Array) && p[0] == :@tstring_content ? p[1] : "" }.join
      end
    end
    nil
  end

  # ---- Block walking ----

  def walk_block_body(node)
    # For :command nodes like `describe "foo" do ... end`,
    # we need to find the do_block or brace_block
    # The block is typically the last element or found in the args
    node.each { |child| walk(child) if child.is_a?(Array) }
  end

  def walk_children(node)
    return unless node.is_a?(Array)
    node.each { |child| walk(child) if child.is_a?(Array) }
  end

  def walk_body(node)
    return unless node.is_a?(Array)
    if node[0] == :bodystmt || node[0] == :body_stmt
      node.each { |child| walk(child) if child.is_a?(Array) }
    else
      walk(node)
    end
  end

  # ---- General helpers ----

  def extract_line(node)
    find_line(node) || 0
  end

  def find_line(node)
    return nil unless node.is_a?(Array)
    # Ripper stores location as [line, col] in leaf nodes
    if node.length == 3 && node[2].is_a?(Array) && node[2].length == 2 &&
       node[2][0].is_a?(Integer) && node[2][1].is_a?(Integer)
      return node[2][0]
    end
    node.each do |child|
      if child.is_a?(Array)
        result = find_line(child)
        return result if result
      end
    end
    nil
  end

  def const_name(node)
    return nil unless node.is_a?(Array)
    case node[0]
    when :@const
      node[1]
    when :const_ref
      const_name(node[1])
    when :const_path_ref
      left = const_name(node[1])
      right = const_name(node[2])
      [left, right].compact.join("::")
    when :top_const_ref
      const_name(node[1])
    when :var_ref
      const_name(node[1])
    else
      nil
    end
  end

  def ident_name(node)
    return nil if node.nil?
    return node if node.is_a?(String)
    if node.is_a?(Array)
      return node[1] if node[0] == :@ident
      return node[1] if node[0] == :@const
      return node[1] if node[0] == :@kw
    end
    nil
  end
end

# ---- Main ----

def run
  unless File.directory?(RAILS_DIR)
    abort "Rails source not found at #{RAILS_DIR}. Run fetch-rails-tests.sh first."
  end

  Dir.mkdir(OUTPUT_DIR) unless File.directory?(OUTPUT_DIR)

  manifest = {
    source: "ruby",
    generatedAt: Time.now.utc.iso8601,
    packages: {},
  }

  PACKAGE_TEST_DIRS.each do |pkg_name, pkg_dir|
    unless File.directory?(pkg_dir)
      puts "Skipping #{pkg_name}: directory not found at #{pkg_dir}"
      next
    end

    extractor = TestExtractor.new

    # Find test files, excluding arel tests from the activerecord package
    # (they belong to the arel package)
    test_files = Dir.glob(File.join(pkg_dir, "**", "*_test.rb")) +
                 Dir.glob(File.join(pkg_dir, "**", "test_*.rb")) +
                 Dir.glob(File.join(pkg_dir, "**", "spec_*.rb"))
    test_files.uniq!

    # For activerecord, exclude arel test files (handled by arel package)
    if pkg_name == "activerecord"
      arel_dir = File.join(pkg_dir, "arel")
      test_files.reject! { |f| f.start_with?(arel_dir) }
    end

    # Apply skip patterns
    test_files.reject! do |filepath|
      SKIP_PATTERNS.any? { |pattern| filepath =~ pattern }
    end

    test_files.sort!

    puts "Processing #{pkg_name}: #{test_files.length} test files..."

    test_files.each do |filepath|
      extractor.process_file(filepath, pkg_dir)
    end

    total_tests = extractor.test_files.sum { |f| f[:testCount] }

    manifest[:packages][pkg_name] = {
      files: extractor.test_files,
      totalTests: total_tests,
    }

    puts "  #{pkg_name}: #{extractor.test_files.length} files, #{total_tests} tests"
  end

  # Print summary
  total = manifest[:packages].values.sum { |p| p[:totalTests] }
  puts "\nTotal: #{total} tests across #{manifest[:packages].values.sum { |p| p[:files].length }} files"

  output_path = File.join(OUTPUT_DIR, "rails-tests.json")
  File.write(output_path, JSON.pretty_generate(manifest))
  puts "Written to #{output_path}"
end

run
