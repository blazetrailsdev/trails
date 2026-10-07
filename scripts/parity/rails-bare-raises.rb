# frozen_string_literal: true

# Reads each Ruby file named in ARGV with Ripper and prints
# `{ path => [[owner, method, class, "bare" | "message"], ...] }`: every `raise` /
# `fail` naming a class, with the module or class and the `def` (or literal-named
# `define_method`) it sits in. rails-bare-raises.ts folds the rows.

require "json"
require "ripper"

class BareRaiseScan
  attr_reader :rows

  def initialize
    @rows = []
  end

  def walk(node, owner, methods)
    return unless node.is_a?(Array)

    case node[0]
    when :class, :module
      name = const_path(node[1])
      owner = [owner, name].compact.join("::") if name
      methods = []
    when :def
      methods = [node[1][1]]
    when :defs
      methods = [node[3][1]]
    when :method_add_block
      name = define_method_name(node[1])
      methods = [name, *methods] if name
    when :command
      record(node[2], owner, methods) if raise?(node[1])
    when :method_add_arg
      record(node[2], owner, methods) if node[1].is_a?(Array) && node[1][0] == :fcall && raise?(node[1][1])
    end
    node.each { |child| walk(child, owner, methods) }
  end

  private
    def raise?(ident)
      ident.is_a?(Array) && ident[0] == :@ident && %w[raise fail].include?(ident[1])
    end

    def const_path(node)
      return nil unless node.is_a?(Array)

      case node[0]
      when :const_ref, :var_ref, :top_const_ref then node[1][0] == :@const ? node[1][1] : nil
      when :const_path_ref then [const_path(node[1]), node[2][1]].compact.join("::")
      end
    end

    def define_method_name(call)
      return nil unless call.is_a?(Array)

      ident, args = call[0] == :command ? call[1..2] : (call[0] == :method_add_arg ? [call[1][1], call[2]] : nil)
      return nil unless ident.is_a?(Array) && ident[1] == "define_method"

      first = arguments(args)&.first
      return nil unless first.is_a?(Array)
      return first[1][1][1] if first[0] == :symbol_literal && first[1][1].is_a?(Array)

      parts = first[0] == :string_literal ? first[1][1..] : nil
      parts[0][1] if parts && parts.length == 1 && parts[0][0] == :@tstring_content
    end

    def arguments(args)
      args = args[1] if args.is_a?(Array) && args[0] == :arg_paren
      return args if args.is_a?(Array) && args[0].is_a?(Array)

      args.is_a?(Array) && args[0] == :args_add_block && args[1].is_a?(Array) ? args[1] : nil
    end

    def record(args, owner, methods)
      list = arguments(args)
      first = list&.first
      return unless first.is_a?(Array)

      message = list.length > 1
      if first[0] == :method_add_arg && first[1].is_a?(Array) && first[1][0] == :call
        message ||= !first[2].is_a?(Array) || !first[2][1].nil?
        first = first[1]
      elsif first[0] == :command_call
        message = true
      end
      if %i[call command_call].include?(first[0])
        return unless first[3].is_a?(Array) && first[3][1] == "new"

        first = first[1]
      end
      klass = const_path(first)&.split("::")&.last
      return unless klass&.match?(/[a-z]/)

      methods.each { |method| @rows << [owner, method, klass, message ? "message" : "bare"] }
    end
end

out = {}
ARGV.each do |file|
  scan = BareRaiseScan.new
  scan.walk(Ripper.sexp(File.read(file)), nil, [])
  out[file] = scan.rows unless scan.rows.empty?
end
puts JSON.generate(out)
