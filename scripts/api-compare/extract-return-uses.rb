# frozen_string_literal: true

# The Ruby half of `pnpm parity:api:returns` (RFC 0156): every method NAME whose
# return value some Rails body or Rails test reads, per package. A read is one
# of four shapes:
#
#   pool = establish_connection(...)     # assignment RHS (also ||=, a, b = …)
#   assert_equal true, assert_not(nil)   # a call argument, kwarg values included
#   establish_connection(...).lease      # a chained receiver
#
# `callArgs` (extract-ruby-api.rb#collect_call_args) records the second and
# third shapes for lib bodies only; it never sees an assignment RHS, and the API
# extractor never walks a test file, which is where `assert_not`'s one reader
# (`activesupport/test/test_case_test.rb:20-28`) lives. So this walks both.
#
# Usage: ruby extract-return-uses.rb '{"<pkg>": ["<dir>", …], …}'
# Prints {"<pkg>": {"<name>": {"count": N, "site": "<file>:<line>"}}}.
require "json"
require "ripper"
require "set"

CALL_WRAPPERS = %i[method_add_arg method_add_block].freeze

# A name Ruby's core classes answer (`each`, `delete`, `call`, `write`) is read
# off an Array, Hash, Proc or IO far more often than off the Rails method that
# shares it, and a name-keyed read cannot tell which, so it attributes nothing.
CORE_NAMES = [Object, Array, Hash, String, Symbol, Integer, Float, Proc, IO, Set, Range]
  .flat_map(&:public_instance_methods).to_set { |m| m.to_s }.freeze

# The name of the call `node` evaluates to, with the line it is spelled on, or
# nil when `node` is not a call. A `:var_ref` is a local, never a call.
def call_name(node)
  return nil unless node.is_a?(Array)

  case node[0]
  when *CALL_WRAPPERS then call_name(node[1])
  when :command, :fcall, :vcall then ident(node[1])
  when :call, :command_call then ident(node[3])
  end
end

def ident(node)
  return nil unless node.is_a?(Array) && %i[@ident @const].include?(node[0])

  [node[1], node[2][0]]
end

# The argument expressions of a call node, kwarg values flattened in.
def call_arguments(node)
  args =
    case node[0]
    when :method_add_arg then node[2]
    when :command then node[2]
    when :command_call then node[4]
    end
  args = args[1] if args.is_a?(Array) && args[0] == :arg_paren
  args = args[1] if args.is_a?(Array) && args[0] == :args_add_block
  return [] unless args.is_a?(Array) && args.first.is_a?(Array)

  args.flat_map do |arg|
    arg.is_a?(Array) && arg[0] == :bare_assoc_hash ? arg[1].map { |assoc| assoc[2] } : [arg]
  end
end

# `assert_nil conn.disconnect!` reads the return only to assert there is none,
# which a void port already satisfies (`trilogy_adapter_test.rb:162`).
def value_reads(node)
  return [] if %i[method_add_arg command].include?(node[0]) && call_name(node)&.first == "assert_nil"

  case node[0]
  when :assign, :massign then [node[2]]
  when :opassign then [node[3]]
  when :call, :command_call then [node[1]] + call_arguments(node)
  when :method_add_arg, :command then call_arguments(node)
  else []
  end
end

def walk(node, file, uses)
  return unless node.is_a?(Array)

  value_reads(node).each do |expr|
    name, line = call_name(expr)
    next if name.nil? || CORE_NAMES.include?(name)

    use = (uses[name] ||= { count: 0, site: "#{file}:#{line}" })
    use[:count] += 1
  end
  node.each { |child| walk(child, file, uses) }
end

roots = JSON.parse(ARGV.fetch(0))
out = roots.to_h do |pkg, dirs|
  uses = {}
  dirs.each do |dir|
    Dir.glob(File.join(dir, "**", "*.rb")).sort.each do |path|
      walk(Ripper.sexp(File.read(path)), path.sub(%r{\A.*/vendor/[^/]+/}, ""), uses)
    end
  end
  [pkg, uses]
end
puts JSON.generate(out)
