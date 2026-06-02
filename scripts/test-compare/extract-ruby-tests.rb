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
OUTPUT_DIR = File.join(SCRIPT_DIR, "output")

# PACKAGE_TEST_DIRS is fed by the caller via TEST_PATHS_JSON (a JSON map of
# {package_name: absolute_test_dir}). Built by vendor/fetch.ts --print-test-paths
# from vendor/sources.ts so this Ruby script doesn't carry a parallel package
# table that drifts from the registry.
#
# Resolved lazily (inside `run`) so the file can be `require`d by tests
# without the env var set — see scripts/test-compare/extract-gates.test.ts.
def package_test_dirs
  json = ENV.fetch("TEST_PATHS_JSON") do
    abort "extract-ruby-tests.rb: TEST_PATHS_JSON env var not set. Caller must export " \
          "it via `TEST_PATHS_JSON=$(pnpm -s vendor:fetch --print-test-paths)`."
  end
  parsed = JSON.parse(json)
  unless parsed.is_a?(Hash) && parsed.values.all? { |v| v.is_a?(String) }
    abort "extract-ruby-tests.rb: TEST_PATHS_JSON must be a JSON object of " \
          "{string: string}; got #{parsed.class}. Re-run vendor:fetch --print-test-paths."
  end
  parsed
rescue JSON::ParserError => e
  abort "extract-ruby-tests.rb: TEST_PATHS_JSON is not valid JSON (#{e.message}). " \
        "If you set it manually, re-run via `TEST_PATHS_JSON=$(pnpm -s vendor:fetch --print-test-paths)`."
end

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

# ---- Test gating (adapter / feature conditionals) ----
#
# Mirrors scripts/test-compare/gates.ts. We derive, per test, the static
# answer to "under which adapters / DB features does Rails run this?" from
# three sources: the adapters/<db>/ directory, `if/unless current_adapter?`
# wrapping, and in-body `skip "..." (if|unless) <pred>` guards.

ALL_ADAPTERS = %w[mysql postgresql sqlite].freeze

# Ruby `current_adapter?(:Sym)` argument → normalized adapter family.
ADAPTER_SYMBOL_MAP = {
  "PostgreSQLAdapter" => "postgresql",
  "PostgreSQL" => "postgresql",
  "Mysql2Adapter" => "mysql",
  "Mysql2" => "mysql",
  "TrilogyAdapter" => "mysql",
  "Trilogy" => "mysql",
  "AbstractMysqlAdapter" => "mysql",
  "SQLite3Adapter" => "sqlite",
  "SQLite3" => "sqlite",
}.freeze

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
    @gate_stack = []
    @file_adapter_gate = dir_adapter_gate(rel_path)

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
    when :method_add_block
      process_method_add_block(node)
    when :command
      process_command(node)
    when :method_add_arg
      process_method_add_arg(node)
    when :def
      process_def(node)
    when :class
      process_class(node)
    when :if, :unless, :if_mod, :unless_mod
      process_conditional(node)
    when :program, :bodystmt, :body_stmt, :stmts_add, :stmts_new,
         :begin, :else, :elsif,
         :rescue, :ensure, :while, :until, :case, :when, :module
      node.each { |child| walk(child) if child.is_a?(Array) }
    else
      node.each { |child| walk(child) if child.is_a?(Array) }
    end
  end

  # Handle :method_add_block — wraps a command/fcall with a do_block/brace_block.
  # This is how `describe "foo" do ... end` is parsed: the :command is child [1]
  # and the :do_block with the body is child [2].
  def process_method_add_block(node)
    inner = node[1]
    block = node[2]

    # Check if inner is a command (describe/it/test)
    if inner.is_a?(Array) && inner[0] == :command
      cmd_name = ident_name(inner[1])
      case cmd_name
      when "describe"
        desc = extract_first_string(inner[2])
        if desc
          @describe_stack.push(desc)
          walk(block) if block.is_a?(Array)
          @describe_stack.pop
          return
        end
      when "it"
        # Pass outer node so assertion extraction can walk the block body
        process_it(inner[2], node)
        return
      when "test"
        process_test_macro(inner[2], node)
        return
      end
    end

    # Check if inner is a method_add_arg (parenthesized form)
    if inner.is_a?(Array) && inner[0] == :method_add_arg
      if inner[1].is_a?(Array) && inner[1][0] == :fcall
        cmd_name = ident_name(inner[1][1])
        case cmd_name
        when "describe"
          desc = extract_string_from_arg_paren(inner[2])
          if desc
            @describe_stack.push(desc)
            walk(block) if block.is_a?(Array)
            @describe_stack.pop
            return
          end
        when "it"
          # Pass inner for desc extraction, outer node includes block for assertions
          process_it_paren(inner, node)
          return
        when "test"
          process_test_macro_paren(inner, node)
          return
        end
      end
    end

    # Fallback: walk children
    node.each { |child| walk(child) if child.is_a?(Array) }
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

    @test_cases << add_gate({
      path: path,
      description: desc,
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: line,
      style: "it",
      assertions: assertions,
    }, node)
  end

  def process_it_paren(node, outer_node = nil)
    desc = extract_string_from_arg_paren(node[2])
    return unless desc

    line = extract_line(node)
    body_node = outer_node || node
    assertions = extract_assertions_from_node(body_node)

    path = (@describe_stack + [desc]).join(" > ")

    @test_cases << add_gate({
      path: path,
      description: desc,
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: line,
      style: "it",
      assertions: assertions,
    }, body_node)
  end

  def process_test_macro(args, node)
    desc = extract_first_string(args)
    return unless desc

    line = extract_line(node)
    assertions = extract_assertions_from_block(node)

    path = (@describe_stack + [desc]).join(" > ")

    @test_cases << add_gate({
      path: path,
      description: desc,
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: line,
      style: "test",
      assertions: assertions,
    }, node)
  end

  def process_test_macro_paren(node, outer_node = nil)
    desc = extract_string_from_arg_paren(node[2])
    return unless desc

    line = extract_line(node)
    body_node = outer_node || node
    assertions = extract_assertions_from_node(body_node)

    path = (@describe_stack + [desc]).join(" > ")

    @test_cases << add_gate({
      path: path,
      description: desc,
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: line,
      style: "test",
      assertions: assertions,
    }, body_node)
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

    @test_cases << add_gate({
      path: path,
      description: desc,
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: line,
      style: "def_test",
      assertions: assertions,
    }, node)
  end

  # ---- Test gating (adapter / feature conditionals) ----

  # adapters/<db>/ directory → the adapter family those tests are scoped to.
  def dir_adapter_gate(rel_path)
    case rel_path
    when %r{adapters/postgresql/} then ["postgresql"]
    when %r{adapters/(mysql2|abstract_mysql_adapter|trilogy)/} then ["mysql"]
    when %r{adapters/sqlite3/} then ["sqlite"]
    end
  end

  # Intercept `if/unless current_adapter?(...)` (and modifier forms) so every
  # test in the guarded body inherits the restriction. Walks the else branch
  # ungated.
  def process_conditional(node)
    kind = node[0]
    cond = node[1]
    body = node[2]
    els  = node[3] # nil for *_mod forms
    positive = (kind == :if || kind == :if_mod)
    gate = gate_from_run_condition(cond, positive)

    if gate
      @gate_stack.push(gate)
      walk(body) if body.is_a?(Array)
      @gate_stack.pop
    else
      walk(body) if body.is_a?(Array)
    end
    walk(els) if els.is_a?(Array)
  end

  # Build the gate hash for a test from its dir gate, the enclosing
  # `current_adapter?` stack, and any in-body `skip ... if/unless` guards.
  # Returns the hash (with the gate attached under :gate) so callers can
  # `@test_cases << add_gate(tc, node)`.
  def add_gate(test_case, body_node)
    parts = []
    parts << { adapters: @file_adapter_gate } if @file_adapter_gate
    @gate_stack.each { |g| parts << g }
    sources = []
    sources << "dir" if @file_adapter_gate
    sources << "class" unless @gate_stack.empty?
    body_gate = body_skip_gate(body_node)
    if body_gate
      parts << body_gate
      sources << "body-skip"
    end
    return test_case if parts.empty?

    merged = parts.reduce(nil) { |acc, g| merge_two(acc, g) }
    return test_case if merged.nil? || merged.empty?

    test_case[:gate] = finalize_gate(merged, sources)
    test_case
  end

  # Derive a gate from a condition under which the test RUNS. `positive` is
  # whether the body runs when the condition is true (`if` → true,
  # `unless` → false).
  def gate_from_run_condition(cond, positive)
    acc = { adapter_syms: [], features: [], guards: [] }
    scan_run_condition(cond, acc)

    adapters = acc[:adapter_syms].map { |s| ADAPTER_SYMBOL_MAP[s] }.compact.uniq
    gate = {}
    unless adapters.empty?
      gate[:adapters] = positive ? adapters : (ALL_ADAPTERS - adapters)
    end
    unless acc[:features].empty?
      if positive
        gate[:features] = acc[:features].uniq
      else
        gate[:guards] = (gate[:guards] || []) + acc[:features].map { |f| "no_#{f}" }
      end
    end
    unless acc[:guards].empty?
      gate[:guards] = ((gate[:guards] || []) + acc[:guards]).uniq
    end
    gate.empty? ? nil : gate
  end

  # Scan a condition sexp for adapter / feature / guard predicates.
  def scan_run_condition(node, acc)
    return unless node.is_a?(Array)
    name = call_ident_name(node)
    if name
      if name == "current_adapter?"
        acc[:adapter_syms].concat(extract_symbol_args(node))
      elsif name =~ /\Asupports_.+\?\z/
        acc[:features] << name.sub(/\Asupports_/, "").sub(/\?\z/, "")
      elsif name == "mariadb?"
        acc[:guards] << "mariadb"
      elsif name == "in_memory_db?"
        acc[:guards] << "in_memory_db"
      elsif name == "database_version"
        acc[:guards] << "version"
      end
    end
    node.each { |c| scan_run_condition(c, acc) if c.is_a?(Array) }
  end

  # In-body `skip "..." (if|unless) <pred>` guards (and bare unconditional
  # `skip`). Merged into one gate for the test.
  def body_skip_gate(node)
    gates = []
    find_skip_guards(node, gates)
    return nil if gates.empty?
    gates.reduce(nil) { |acc, g| merge_two(acc, g) }
  end

  def find_skip_guards(node, out)
    return unless node.is_a?(Array)

    if (node[0] == :if_mod || node[0] == :unless_mod) && skip_call?(node[2])
      # `skip unless COND` runs when COND true; `skip if COND` runs when false.
      positive = node[0] == :unless_mod
      g = gate_from_run_condition(node[1], positive)
      out << g if g
      return
    end

    if skip_call?(node)
      out << { guards: ["always_skip"] }
      return
    end

    node.each { |c| find_skip_guards(c, out) if c.is_a?(Array) }
  end

  def skip_call?(node)
    call_ident_name(node) == "skip"
  end

  # Resolve the method/identifier name of a call-ish sexp.
  def call_ident_name(node)
    return nil unless node.is_a?(Array)
    case node[0]
    when :command, :command_call then ident_name(node[1])
    when :fcall, :vcall then ident_name(node[1])
    when :method_add_arg
      node[1].is_a?(Array) && node[1][0] == :fcall ? ident_name(node[1][1]) : nil
    when :method_add_block
      node[1].is_a?(Array) ? call_ident_name(node[1]) : nil
    when :call then ident_name(node[3])
    end
  end

  def extract_symbol_args(node)
    syms = []
    collect_symbols(node, syms)
    syms
  end

  def collect_symbols(node, out)
    return unless node.is_a?(Array)
    if node[0] == :symbol_literal
      name = symbol_name(node[1])
      out << name if name
      return
    end
    node.each { |c| collect_symbols(c, out) if c.is_a?(Array) }
  end

  def symbol_name(node)
    return nil unless node.is_a?(Array)
    ident_name(node[1]) if node[0] == :symbol
  end

  def merge_two(a, b)
    return b.dup if a.nil?
    out = {}
    if a[:adapters] && b[:adapters]
      out[:adapters] = a[:adapters] & b[:adapters]
    elsif a[:adapters] || b[:adapters]
      out[:adapters] = (a[:adapters] || []) | (b[:adapters] || [])
    end
    feats = (a[:features] || []) | (b[:features] || [])
    out[:features] = feats unless feats.empty?
    guards = (a[:guards] || []) | (b[:guards] || [])
    out[:guards] = guards unless guards.empty?
    out
  end

  def finalize_gate(merged, sources)
    out = {}
    out[:adapters] = merged[:adapters].sort if merged.key?(:adapters)
    out[:features] = merged[:features].sort if merged[:features] && !merged[:features].empty?
    out[:guards] = merged[:guards].sort if merged[:guards] && !merged[:guards].empty?
    out[:source] = sources.uniq.sort
    out
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
  package_dirs = package_test_dirs

  # Validate per-package paths (the JSON manifest may include paths the user
  # hasn't fetched yet, e.g. a fresh checkout that skipped pnpm vendor:fetch).
  package_dirs.each do |pkg, dir|
    next if File.directory?(dir)
    abort "Test directory for #{pkg} not found at #{dir}. Run `pnpm vendor:fetch` first."
  end

  Dir.mkdir(OUTPUT_DIR) unless File.directory?(OUTPUT_DIR)

  manifest = {
    source: "ruby",
    generatedAt: Time.now.utc.iso8601,
    packages: {},
  }

  package_dirs.each do |pkg_name, pkg_dir|
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

    # For actiondispatch, exclude controller/ files (handled by actioncontroller)
    if pkg_name == "actiondispatch"
      controller_dir = File.join(pkg_dir, "controller")
      test_files.reject! { |f| f.start_with?(controller_dir) }
    end

    # For actioncontroller, include only controller/ files
    if pkg_name == "actioncontroller"
      controller_dir = File.join(pkg_dir, "controller")
      test_files.select! { |f| f.start_with?(controller_dir) }
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

run if __FILE__ == $PROGRAM_NAME
