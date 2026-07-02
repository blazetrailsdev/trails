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

# Is `name` an assertion call? Matched by PREFIX (not a fixed list), the twin of
# TS isAssertionCallee (extract-ts-core.ts), so both sides count the full breadth
# of Rails assertions: the `assert_*`/`refute_*` families incl. custom helpers
# (assert_queries_count, assert_no_queries, assert_cycle, …) a whitelist kept
# missing, the `must_*`/`wont_*` spec forms, and `expect`. The `(_|\z)`/`_`
# anchors keep look-alikes (`asserted`, `assertion`) out.
def assertion_method?(name)
  return false unless name
  name == "expect" ||
    name.match?(/\A(assert|refute)(_|\z)/) ||
    name.match?(/\A(must|wont)_/)
end

# Depth cap for recursive helper expansion (see count_assertions). The twin of
# TS MAX_HELPER_DEPTH (extract-ts-core.ts). Deep enough for real helper chains
# (`do_dump_index_tests_for_schema` → `do_dump_index_assertions_for_one_index`)
# without runaway recursion; the per-path `visiting` list already breaks cycles.
MAX_HELPER_DEPTH = 5

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
    # Modules that define `def test_*` (e.g. an `ActiveSupport::Concern` mixed
    # into a test case) are not test cases themselves — their tests run once per
    # including class, inheriting that class's gate. Collect them here keyed by
    # name; `@module_collect` is the live bucket while walking a module body.
    @modules = {}
    @module_collect = nil
    @module_includes = {}
    @module_def_gates = {}

    # Same-file non-assertion helper `def`s, keyed by name → body node, so a test
    # that delegates its assertions to a helper (e.g. `test_copy_table`,
    # `do_dump_index_tests_for_schema`) folds the helper's asserts into its count.
    # The TS twin collects top-level functions (extract-ts-core.ts collectHelpers).
    # Pre-collected before walk() so a helper defined below its caller still
    # resolves. File-scoped (not per-class) — a documented static approximation.
    @helper_defs = {}
    collect_helper_defs(sexp)

    walk(sexp)

    flush_collected_modules

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
    when :module
      process_module(node)
    when :if, :unless, :if_mod, :unless_mod, :elsif
      process_conditional(node)
    when :program, :bodystmt, :body_stmt, :stmts_add, :stmts_new,
         :begin, :else,
         :rescue, :ensure, :while, :until, :case, :when
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
    # A class body always emits its `def test_*` directly (even a class nested
    # inside a module is a real test case), so suspend any module collection.
    prev = @module_collect
    @module_collect = nil
    walk_body(node[3] || node[2])
    @module_collect = prev
    @describe_stack.pop
  end

  # `module Foo ... end` — when its body defines `def test_*`, the module is a
  # mixin, not a test case. Stash those tests under the module name; they are
  # materialized (with the including class's gate) wherever the module is
  # `include`d. Non-test module bodies (nested classes, helpers) walk normally.
  def process_module(node)
    name = const_name(node[1])
    prev = @module_collect
    @module_collect = []
    walk_body(node[2])
    collected = @module_collect
    @module_collect = prev
    if name && !collected.empty?
      @modules[name] = (@modules[name] || []) + collected
      # Remember the gate in force at the definition site, used as a fallback for
      # a module that is never `include`d in this file (mixed in from elsewhere,
      # or defined under an `if supports_X?` it textually sits inside) so it keeps
      # its definition-site gate rather than emitting ungated.
      @module_def_gates[name] ||= @gate_stack.dup
    end
  end

  # `include SomeModule` inside a class body — record the enclosing gate so the
  # module's tests inherit it when flushed. The tests are emitted once (bare),
  # which the comparator suffix-matches to the FIRST including class block, so
  # the FIRST include's gate wins. Crucially this means a module mixed into an
  # ungated class first (e.g. `TransactionCallbacksTests` into the unconditional
  # `TransactionTest`) stays ungated even if a later include is gated — those
  # tests really do run on every adapter.
  def process_include(args, node)
    name = const_name_from_args(args)
    return unless name
    @module_includes[name] ||= @gate_stack.dup
  end

  # Emit every collected mixin module's tests once (bare — no class ancestor, as
  # before), but stamped with the gate of the class(es) it is `include`d into.
  # A module mixed into a class under `if supports_views?` thus yields tests
  # gated `features:[views]`, matching the class's own `def test_*`.
  def flush_collected_modules
    @modules.each do |name, tests|
      gate_stack = @module_includes[name] || @module_def_gates[name] || []
      saved = @gate_stack
      @gate_stack = gate_stack
      tests.each { |t| @test_cases << materialize_module_test(t) }
      @gate_stack = saved
    end
  end

  def materialize_module_test(t)
    path = (@describe_stack + [t[:description]]).join(" > ")
    add_gate({
      path: path,
      description: t[:description],
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: t[:line],
      style: "def_test",
      assertions: t[:assertions],
      assertionCount: t[:assertion_count],
      assertionKinds: t[:assertion_kinds],
      assertionValues: t[:assertion_values],
    }, nil, body_gate: t[:body_gate])
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
    when "include"
      process_include(args, node)
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
    assertion_kinds, assertion_values = collect_assertion_kinds(node)

    path = (@describe_stack + [desc]).join(" > ")

    @test_cases << add_gate({
      path: path,
      description: desc,
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: line,
      style: "it",
      assertions: assertion_kinds.uniq,
      assertionCount: assertion_kinds.length,
      assertionKinds: assertion_kinds,
      assertionValues: assertion_values,
    }, node)
  end

  def process_it_paren(node, outer_node = nil)
    desc = extract_string_from_arg_paren(node[2])
    return unless desc

    line = extract_line(node)
    body_node = outer_node || node
    assertion_kinds, assertion_values = collect_assertion_kinds(body_node)

    path = (@describe_stack + [desc]).join(" > ")

    @test_cases << add_gate({
      path: path,
      description: desc,
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: line,
      style: "it",
      assertions: assertion_kinds.uniq,
      assertionCount: assertion_kinds.length,
      assertionKinds: assertion_kinds,
      assertionValues: assertion_values,
    }, body_node)
  end

  def process_test_macro(args, node)
    desc = extract_first_string(args)
    return unless desc

    line = extract_line(node)
    assertion_kinds, assertion_values = collect_assertion_kinds(node)

    path = (@describe_stack + [desc]).join(" > ")

    @test_cases << add_gate({
      path: path,
      description: desc,
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: line,
      style: "test",
      assertions: assertion_kinds.uniq,
      assertionCount: assertion_kinds.length,
      assertionKinds: assertion_kinds,
      assertionValues: assertion_values,
    }, node)
  end

  def process_test_macro_paren(node, outer_node = nil)
    desc = extract_string_from_arg_paren(node[2])
    return unless desc

    line = extract_line(node)
    body_node = outer_node || node
    assertion_kinds, assertion_values = collect_assertion_kinds(body_node)

    path = (@describe_stack + [desc]).join(" > ")

    @test_cases << add_gate({
      path: path,
      description: desc,
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: line,
      style: "test",
      assertions: assertion_kinds.uniq,
      assertionCount: assertion_kinds.length,
      assertionKinds: assertion_kinds,
      assertionValues: assertion_values,
    }, body_node)
  end

  def process_def(node)
    name_node = node[1]
    name = ident_name(name_node)
    return unless name
    return unless name.start_with?("test_")
    # Minitest invokes test methods with no arguments, so a `def test_*` that
    # declares a *required* parameter (e.g. the private helper
    # `test_lock_free(lock_name)`) can never be run as a test — skip it so it
    # doesn't register as a phantom missing test. Methods callable with zero
    # args (only-default positionals, *rest, keyword-with-default, &block) are
    # still real tests — e.g. `test_copy_table(from = "customers")` — and are
    # kept.
    return if def_has_required_params?(node[2])

    # Convert test_foo_bar to "foo bar"
    desc = name.sub(/^test_/, "").tr("_", " ")
    line = extract_line(node)
    assertion_kinds, assertion_values = collect_assertion_kinds(node)

    # Inside a mixin module body: stash, don't emit. Materialized at end of file
    # by flush_collected_modules, with the include-site gate from process_include.
    if @module_collect
      # Capture the in-body `skip … if/unless` gate now — the raw sexp isn't
      # retained past collection, so it can't be recomputed at materialization.
      @module_collect << {
        description: desc, line: line, assertions: assertion_kinds.uniq,
        assertion_count: assertion_kinds.length, assertion_kinds: assertion_kinds,
        assertion_values: assertion_values,
        body_gate: body_skip_gate(node)
      }
      return
    end

    path = (@describe_stack + [desc]).join(" > ")

    @test_cases << add_gate({
      path: path,
      description: desc,
      ancestors: @describe_stack.dup,
      file: @current_file,
      line: line,
      style: "def_test",
      assertions: assertion_kinds.uniq,
      assertionCount: assertion_kinds.length,
      assertionKinds: assertion_kinds,
      assertionValues: assertion_values,
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
    # Body runs when COND is true for if/elsif, false for unless.
    positive = kind != :unless && kind != :unless_mod
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

  # Attach a :gate to a test_case from its dir gate, the enclosing
  # `current_adapter?` stack, and any in-body `skip ... if/unless` guards.
  # `body_gate` defaults to `:compute` (derive from `body_node`); module tests
  # pass their precomputed in-body skip gate instead, since the sexp is gone.
  def add_gate(test_case, body_node, body_gate: :compute)
    parts = []
    parts << { adapters: @file_adapter_gate } if @file_adapter_gate
    @gate_stack.each { |g| parts << g }
    sources = []
    sources << "dir" if @file_adapter_gate
    sources << "class" unless @gate_stack.empty?
    body_gate = body_skip_gate(body_node) if body_gate == :compute
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
  # whether the body runs when the condition is true (`if` → true, `unless` → false).
  def gate_from_run_condition(cond, positive)
    acc = { adapter_syms: [], neg_adapter_syms: [], features: [], guards: [], has_or: false }
    scan_run_condition(cond, acc)

    adapters = acc[:adapter_syms].map { |s| ADAPTER_SYMBOL_MAP[s] }.compact.uniq
    neg_adapters = acc[:neg_adapter_syms].map { |s| ADAPTER_SYMBOL_MAP[s] }.compact.uniq
    gate = {}
    # A POSITIVE adapter set isn't sound — and must be dropped — when the
    # condition mixes it with a feature/guard (`supports_X? && current_adapter?`
    # could be `&&` or `||`; the run-on set differs), or with a negated adapter
    # under `||` (`current_adapter?(:A) || !current_adapter?(:B)` is the
    # complement of B, not A). A pure positive `||` (`A || B`) stays sound — it
    # is the union the concat already collected.
    mixed = !adapters.empty? &&
            (!(acc[:features].empty? && acc[:guards].empty?) ||
             (acc[:has_or] && !neg_adapters.empty?))
    if !adapters.empty? && !mixed
      gate[:adapters] = positive ? adapters : (ALL_ADAPTERS - adapters)
    end
    # A NEGATED adapter predicate (`!current_adapter?(:X)`) in a pure conjunction
    # (`&&`, no `||`) is a sound adapter EXCLUSION that composes with a feature
    # gate: e.g. `end if supports_insert_returning? && !current_adapter?(:SQLite3Adapter)`
    # runs on every adapter that supports the feature, minus SQLite. We can only
    # emit it on the run-when-true (`if`) path; under `unless` the negation turns
    # the conjunction into a disjunction that isn't expressible as one adapter set.
    if positive && !neg_adapters.empty? && !acc[:has_or]
      base = gate[:adapters] || ALL_ADAPTERS
      gate[:adapters] = base - neg_adapters
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

  # Scan a condition sexp for adapter / feature / guard predicates. `negated`
  # tracks the boolean parity of `!`/`not` wrappers so a `!current_adapter?(...)`
  # is recorded as an adapter EXCLUSION rather than an inclusion.
  def scan_run_condition(node, acc, negated = false)
    return unless node.is_a?(Array)
    if node[0] == :unary && (node[1] == :! || node[1] == :not)
      scan_run_condition(node[2], acc, !negated)
      return
    end
    # `||`/`or` anywhere makes the run-on adapter set a disjunction; record it so
    # a negated-adapter exclusion isn't unsoundly emitted from a compound.
    acc[:has_or] = true if node[0] == :binary && (node[2] == :"||" || node[2] == :or)
    name = call_ident_name(node)
    if name
      # Once a predicate is identified, stop: recursing into its own receiver/args
      # would re-match the same call (e.g. the `:fcall` inside a `:method_add_arg`)
      # and double-count it.
      if name == "current_adapter?"
        (negated ? acc[:neg_adapter_syms] : acc[:adapter_syms]).concat(extract_symbol_args(node))
        return
      elsif name =~ /\Asupports_.+\?\z/
        acc[:features] << name.sub(/\Asupports_/, "").sub(/\?\z/, "")
        return
      elsif name == "prepared_statements" || name == "prepared_statements?"
        # A runtime predicate (per-connection config) the extractor cannot
        # evaluate statically. Recording it as a guard makes any compound that
        # mixes it with an adapter predicate (e.g. adapter_test.rb's
        # `unless PG || (SQLite3 && !prepared_statements)`) a non-comparable
        # gate — rather than silently dropping the qualifier and over/under-
        # restricting the adapter set.
        acc[:guards] << "prepared_statements"
        return
      elsif name == "mariadb?"
        acc[:guards] << "mariadb"
        return
      elsif name == "in_memory_db?"
        acc[:guards] << "in_memory_db"
        return
      elsif name == "database_version"
        acc[:guards] << "version"
        return
      elsif name == "respond_to?" && connection_receiver?(node)
        # `connection.respond_to?(:reset_pk_sequence!)` — a capability probe the
        # extractor can't evaluate statically. Record one guard per probed
        # method (stripped of its `!`/`?` suffix) so the wrapper is captured.
        extract_symbol_args(node).each do |s|
          acc[:guards] << "respond_to_#{s.sub(/[!?]+\z/, "")}"
        end
        return
      elsif name.end_with?("?") && connection_receiver?(node)
        # Any other connection capability predicate, e.g.
        # `connection.savepoint_errors_invalidate_transactions?`. Captured as a
        # guard (incomparable but not unconditional), so a faithful TS gate on
        # the same wrapper isn't flagged over-gated.
        acc[:guards] << name.sub(/\?\z/, "")
        return
      end
    end
    node.each { |c| scan_run_condition(c, acc, negated) if c.is_a?(Array) }
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

    case node[0]
    when :if_mod, :unless_mod
      # `skip ... if/unless COND` — modifier form. `unless` runs when COND true.
      if skip_call?(node[2])
        g = gate_from_run_condition(node[1], node[0] == :unless_mod)
        out << g if g
        return
      end
      find_skip_guards(node[2], out) # body only — never scan the condition
      return
    when :if, :unless, :elsif
      # Block form `if/unless COND; skip; end`: a `skip` reached only under COND
      # is gated by it, NOT always_skip. (`elsif` gated by its own COND only.)
      cond, body, els = node[1], node[2], node[3]
      if stmts_have_skip?(body)
        g = gate_from_run_condition(cond, node[0] == :unless)
        out << g if g
      else
        find_skip_guards(body, out)
      end
      find_skip_guards(els, out)
      return
    end

    if skip_call?(node)
      out << { guards: ["always_skip"] }
      return
    end

    node.each { |c| find_skip_guards(c, out) if c.is_a?(Array) }
  end

  # Does the conditional body's immediate statement list contain a bare `skip`?
  def stmts_have_skip?(body)
    return false unless body.is_a?(Array)
    return true if skip_call?(body)
    body.any? { |s| s.is_a?(Array) && skip_call?(s) }
  end

  # minitest `skip` is always a bare call — never a method on a receiver.
  # Excluding receiver forms avoids false matches on unrelated `.skip` methods
  # (Arel's OFFSET builder, a user-defined `klass.skip`). Contrast
  # `call_ident_name`, kept permissive so `@connection.supports_json?` matches.
  def skip_call?(node)
    return false unless node.is_a?(Array)
    case node[0]
    when :command, :fcall, :vcall
      ident_name(node[1]) == "skip"
    when :method_add_arg
      node[1].is_a?(Array) && node[1][0] == :fcall && ident_name(node[1][1]) == "skip"
    else
      false
    end
  end

  # Resolve the method name of a call-ish sexp. For receiver forms the method
  # name is the third child, not the receiver in the first.
  def call_ident_name(node)
    return nil unless node.is_a?(Array)
    case node[0]
    when :command then ident_name(node[1])
    when :command_call then ident_name(node[3])
    when :fcall, :vcall then ident_name(node[1])
    when :method_add_arg
      # Recurse so a receiver call with args — `conn.respond_to?(:x)` parses as
      # `[:method_add_arg, [:call, ...], [:arg_paren, ...]]` — resolves to its
      # method name, not just the parenless `:fcall` form.
      node[1].is_a?(Array) ? call_ident_name(node[1]) : nil
    when :method_add_block
      node[1].is_a?(Array) ? call_ident_name(node[1]) : nil
    when :call then ident_name(node[3])
    end
  end

  # Receiver sexp of a call-ish node (nil for argument-less fcalls / vcalls).
  def call_receiver(node)
    return nil unless node.is_a?(Array)
    case node[0]
    when :call, :command_call then node[1]
    when :method_add_arg, :method_add_block then call_receiver(node[1])
    end
  end

  CONNECTION_RECEIVER_IDENTS = %w[connection lease_connection conn @connection].freeze

  # Is this call's receiver DIRECTLY a database connection? Recognizes the idioms
  # used to reach one in Rails tests — `@connection`, `connection`,
  # `lease_connection`, `conn`, `ActiveRecord::Base.lease_connection` — so a
  # capability predicate (`respond_to?(:x)`,
  # `savepoint_errors_invalidate_transactions?`) on it can be captured as a guard
  # rather than treated as an opaque conditional. Only the receiver's TERMINAL
  # method/ident is checked, so `connection.transaction_isolation_levels.include?`
  # (an `Array#include?`, not a connection capability) is correctly excluded.
  def connection_receiver?(node)
    name = receiver_terminal_name(call_receiver(node))
    !name.nil? && CONNECTION_RECEIVER_IDENTS.include?(name)
  end

  # The trailing method/ident of a receiver chain — `lease_connection` for
  # `ActiveRecord::Base.lease_connection`, `@connection` for the ivar.
  def receiver_terminal_name(node)
    return nil unless node.is_a?(Array)
    case node[0]
    when :@ident, :@const, :@ivar then node[1]
    when :var_ref, :vcall then receiver_terminal_name(node[1])
    when :call, :command_call then ident_name(node[3])
    when :method_add_arg, :method_add_block then receiver_terminal_name(node[1])
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
    # Empty `adapters` (contradictory gates → "runs on no adapter") is kept
    # distinct from an absent key (= "runs on all").
    out[:adapters] = merged[:adapters].sort if merged.key?(:adapters)
    out[:features] = merged[:features].sort if merged[:features] && !merged[:features].empty?
    out[:guards] = merged[:guards].sort if merged[:guards] && !merged[:guards].empty?
    out[:source] = sources.uniq.sort
    out
  end

  # Ripper shapes a method's parameter list as the 3rd `:def` child: either a
  # bare `[:params, ...]` (no parens) or `[:paren, [:params, ...]]`. The
  # `:params` slots are [reqd, optional, rest, post, keywords, kwrest, block].
  # Only required parameters stop minitest from invoking the method with zero
  # args: required positionals (`reqd`), required post-splat positionals
  # (`post`), and keyword args declared without a default (Ripper records their
  # value as `false`). Optional/default/rest/block params leave the method
  # zero-arg-callable, so they don't disqualify it as a test.
  def def_has_required_params?(params_node)
    return false unless params_node.is_a?(Array)
    inner = params_node[0] == :paren ? params_node[1] : params_node
    return false unless inner.is_a?(Array) && inner[0] == :params
    reqd, _optional, _rest, post, keywords, = inner.drop(1)
    return true if reqd.is_a?(Array) && !reqd.empty?
    return true if post.is_a?(Array) && !post.empty?
    return true if keywords.is_a?(Array) && keywords.any? { |_label, default| default == false }
    false
  end

  # ---- Assertion extraction ----

  # Raw (non-deduped) count of assertion calls in a test body, folding in calls
  # to same-file non-assertion helpers (recursively, depth-capped, with a
  # per-path cycle guard). This counts every call incl. helper-delegated ones,
  # which is what test:compare's assertion-count comparison needs (exact-count
  # parity with the Rails counterpart). See extract-ts-core.ts for the TS twin.
  def count_assertions(node)
    count_assertions_expanded(node, [], 0)
  end

  # Recursively count assertion calls, expanding self-calls (fcall/vcall/command,
  # i.e. implicit `self`) to known same-file helpers. Blocks passed to a helper
  # are counted lexically (they sit in the test body); the helper's OWN body is
  # expanded once per call site. `visiting` is the current recursion path (cycle
  # guard); `depth` is bounded by MAX_HELPER_DEPTH. Loops/`yield` are counted
  # statically (as written), not per runtime iteration — matching the TS side.
  def count_assertions_expanded(node, visiting, depth)
    return 0 unless node.is_a?(Array)

    count = 0
    name = self_call_name(node)
    if name
      if assertion_method?(name)
        count += 1
      elsif depth < MAX_HELPER_DEPTH && @helper_defs.key?(name) && !visiting.include?(name)
        visiting.push(name)
        count += count_assertions_expanded(@helper_defs[name], visiting, depth + 1)
        visiting.pop
      end
    elsif receiver_call_assertion?(node)
      # `x.must_equal y` / `sql.must_be_like %{…}` — receiver-form assertions
      # (never expanded as helpers, but still counted).
      count += 1
    end

    node.each { |child| count += count_assertions_expanded(child, visiting, depth) if child.is_a?(Array) }
    count
  end

  # Name of an implicit-`self` call (fcall/vcall/command) at this node, else nil.
  # These are the only shapes eligible for helper expansion.
  def self_call_name(node)
    case node[0]
    when :command, :fcall, :vcall
      ident_name(node[1])
    end
  end

  # Is this node a receiver-form (`:call`/`:command_call`) assertion call?
  def receiver_call_assertion?(node)
    return false unless node[0] == :call || node[0] == :command_call
    node[3] && assertion_method?(ident_name(node[3]))
  end

  # Collect every same-file `def name` → body node (node[3] is the bodystmt).
  # Includes `test_*` methods too: a test method is itself a valid helper when
  # another test delegates to it (e.g. `test_copy_table`).
  def collect_helper_defs(node)
    return unless node.is_a?(Array)
    if node[0] == :def
      name = ident_name(node[1])
      @helper_defs[name] = node[3] if name && node[3]
    end
    node.each { |child| collect_helper_defs(child) if child.is_a?(Array) }
  end

  # Raw (non-deduped) list of assertion *kind* tokens (method names) in a test
  # body — one per call, same length as (and same helper expansion / cycle guard
  # / depth cap as) count_assertions. Feeds test:compare's assertion-kind
  # histogram (assertion-kinds.ts); `assertions` is this list deduped.
  #
  # Returns `[kinds, values]`: `values` is a lockstep array (one per kind) of the
  # assertion's literal expected-value token (see literal_token) or nil for a
  # non-literal argument. Feeds the literal expected-VALUE comparison
  # (assertion-values.ts). Value capture is additive — it never changes which
  # kinds are recorded, so count/kind lockstep is untouched.
  def collect_assertion_kinds(node)
    kinds = []
    values = []
    collect_assertion_kinds_expanded(node, kinds, values, [], 0, nil)
    [kinds, values]
  end

  # Kind-collecting twin of count_assertions_expanded: same self-call / helper /
  # receiver-form handling, but records each assertion's method name instead of
  # bumping a counter. Kept in lockstep so assertionKinds.length == assertionCount.
  #
  # `pending_args` threads a parenthesized call's arg node down from its
  # `:method_add_arg` parent to the inner `:fcall`/`:call` where the name is
  # recorded, so `assert_equal(5, foo)` / `foo.must_equal(5)` can capture their
  # expected value without moving the (lockstep-critical) recording site. The
  # `:command` (`assert_equal 5, foo`) and `:command_call` (`foo.must_equal 5`)
  # forms carry their args on the node directly (node[2] / node[4]).
  def collect_assertion_kinds_expanded(node, results, values, visiting, depth, pending_args)
    return unless node.is_a?(Array)

    name = self_call_name(node)
    if name
      if assertion_method?(name)
        # A parenthesized call `assert_equal(a, b)` is `[:method_add_arg,
        # [:fcall, ...], ...]`; self_call_name matches the inner :fcall, and the
        # recursion below descends into it — so the wrapper is not double-counted.
        results << name
        args = node[0] == :command ? node[2] : pending_args
        values << literal_token(expected_arg(args, name))
      elsif depth < MAX_HELPER_DEPTH && @helper_defs.key?(name) && !visiting.include?(name)
        visiting.push(name)
        collect_assertion_kinds_expanded(@helper_defs[name], results, values, visiting, depth + 1, nil)
        visiting.pop
      end
    elsif receiver_call_assertion?(node)
      # `x.must_equal y` / `x.must_equal(y)` — receiver-form assertions (never
      # expanded as helpers, but still recorded). The expected value is the sole
      # positional argument: `:command_call` carries it at node[4] directly, the
      # parenthesized `:call` form gets it threaded via `pending_args` from its
      # `:method_add_arg` parent (mirroring the self-call path).
      rname = ident_name(node[3])
      results << rname
      args = node[0] == :command_call ? node[4] : pending_args
      values << literal_token(expected_arg(args, rname))
    end

    # Thread a `:method_add_arg`'s arg node (node[2]) to its `:fcall`/`:call`
    # callee (node[1]) so the value is available at the recording site, then
    # recurse the args normally. Every other node recurses its children unchanged.
    if node[0] == :method_add_arg && node[1].is_a?(Array) && %i[fcall call].include?(node[1][0])
      collect_assertion_kinds_expanded(node[1], results, values, visiting, depth, node[2])
      collect_assertion_kinds_expanded(node[2], results, values, visiting, depth, nil)
    else
      node.each do |child|
        collect_assertion_kinds_expanded(child, results, values, visiting, depth, nil) if child.is_a?(Array)
      end
    end
  end

  # Assertion method names whose comparable expected value is NOT the first
  # positional argument. `assert_includes(collection, member)` /
  # `refute_includes(...)` assert membership — the value is the second arg (the
  # member), lining up with trails' `expect(collection).toContain(member)`.
  INCLUDES_ASSERTIONS = %w[
    assert_includes assert_not_includes refute_includes
  ].freeze

  # The expected-value argument node for a `name` assertion, from its arg list
  # node (`:arg_paren` or `:args_add_block`), or nil. Index 0 for most mapped
  # assertions; index 1 for the `*_includes` membership family.
  def expected_arg(args_node, name)
    list = positional_args(args_node)
    return nil unless list
    idx = INCLUDES_ASSERTIONS.include?(name) ? 1 : 0
    list[idx]
  end

  # Positional argument nodes from an `:arg_paren` / `:args_add_block` wrapper, or
  # nil when the shape isn't a plain positional list.
  def positional_args(node)
    return nil unless node.is_a?(Array)
    inner = node[0] == :arg_paren ? node[1] : node
    return nil unless inner.is_a?(Array) && inner[0] == :args_add_block
    inner[1].is_a?(Array) ? inner[1] : nil
  end

  # Normalize a literal argument node to a tagged token shared with the TS twin
  # (extract-ts-core.ts literalToken): `n:<num>` int/float (incl. negative),
  # `s:<text>` string, `s:<name>` symbol (folded to the string token —
  # symbol-vs-string is not a fidelity divergence), `b:true`/`b:false`, `x:nil`.
  # Anything else (variable, method call, array/hash/regex) → nil (non-literal).
  def literal_token(node)
    return nil unless node.is_a?(Array)
    case node[0]
    when :@int, :@float
      "n:#{node[1]}"
    when :unary
      # `-3` / `-1.5` — unary minus over a numeric leaf; other unaries are non-literal.
      node[1] == :-@ && node[2].is_a?(Array) && %i[@int @float].include?(node[2][0]) ? "n:-#{node[2][1]}" : nil
    when :string_literal
      content = extract_string_content(node)
      content ? "s:#{content}" : nil
    when :symbol_literal
      sym = node[1]
      sym.is_a?(Array) && sym[0] == :symbol && sym[1].is_a?(Array) ? "s:#{ident_name(sym[1])}" : nil
    when :var_ref
      kw = node[1]
      if kw.is_a?(Array) && kw[0] == :@kw
        { "true" => "b:true", "false" => "b:false", "nil" => "x:nil" }[kw[1]]
      end
    end
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

  # First constant referenced in an arg list — the module name in
  # `include SomeModule` (`[:args_add_block, [[:var_ref, [:@const, ...]]], …]`).
  def const_name_from_args(args)
    return nil unless args.is_a?(Array)
    if %i[var_ref const_ref const_path_ref top_const_ref].include?(args[0])
      return const_name(args)
    end
    args.each do |child|
      if child.is_a?(Array)
        result = const_name_from_args(child)
        return result if result
      end
    end
    nil
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

    gated = extractor.test_files.sum { |f| f[:testCases].count { |t| t[:gate] } }
    suffix = gated.positive? ? " (#{gated} adapter/feature-gated)" : ""
    puts "  #{pkg_name}: #{extractor.test_files.length} files, #{total_tests} tests#{suffix}"
  end

  # Print summary
  total = manifest[:packages].values.sum { |p| p[:totalTests] }
  files = manifest[:packages].values.sum { |p| p[:files].length }
  gated = manifest[:packages].values.sum { |p| p[:files].sum { |f| f[:testCases].count { |t| t[:gate] } } }
  puts "\nTotal: #{total} tests across #{files} files (#{gated} adapter/feature-gated)"

  output_path = File.join(OUTPUT_DIR, "rails-tests.json")
  File.write(output_path, JSON.pretty_generate(manifest))
  puts "Written to #{output_path}"
end

run if __FILE__ == $PROGRAM_NAME
