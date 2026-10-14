# frozen_string_literal: true

# The Ruby half of `pnpm parity:api:key-reads` (RFC 0190): every `h[k]` a
# method body reads off a NAMED receiver, per `def`.
#
#   options[:only_path]     # ["options", "only_path"]
#   @config[:adapter]       # ["@config", "adapter"]
#   html_options["class"]   # ["html_options", nil]
#
# `h[k]` is an `:aref` node, not a call, so extract-ruby-api.rb records it only
# as the skeleton token `ref:get`, which carries neither the receiver nor the
# key. A receiver is named when it is a local, an ivar or a receiverless reader
# (`:var_ref` / `:vcall`); the key is recorded when it is one literal Symbol
# and is nil otherwise. `h[k] = v` is an `:aref_field` and is not a read.
#
# A body is keyed by its owner — the enclosing class/module's full name — and
# its seat: `def self.x` and a `def` inside `class << self` are `class`, any
# other `def` is `instance`; a `def` in a `ClassMethods` module is its
# parent's, on the `class` seat, as compare.ts reads it, and a
# `Name = Struct.new … do` block is `Name`'s. So two classes' `def call` in one file, or
# `def self.x` beside `def x`, are separate bodies. `params` is the def's
# positional parameters, then its `**kwrest`, which is how a port that
# destructures a Hash parameter is credited.
#
# Usage: ruby extract-key-reads.rb '{"<pkg>": "<lib dir>", …}'
# Prints {"<pkg>": {"<file under lib>": {"<def name>":
#   [{"owner": "<A::B>", "seat": "class"|"instance", "params": […],
#     "reads": [["<recv>", "<key>"|null], …]}, …]}}}.
require "json"
require "ripper"

NAME_TOKENS = %i[@ident @ivar].freeze

def receiver_name(node)
  return nil unless node.is_a?(Array) && %i[var_ref vcall].include?(node[0])

  inner = node[1]
  inner.is_a?(Array) && NAME_TOKENS.include?(inner[0]) ? inner[1] : nil
end

def symbol_key(args)
  return nil unless args.is_a?(Array) && args[0] == :args_add_block

  keys = args[1]
  return nil unless keys.is_a?(Array) && keys.length == 1

  key = keys[0]
  return nil unless key.is_a?(Array) && key[0] == :symbol_literal && key[1].is_a?(Array)

  token = key[1][1]
  token.is_a?(Array) && token[1].is_a?(String) ? token[1] : nil
end

def collect(node, reads)
  return unless node.is_a?(Array)

  if node[0] == :aref
    recv = receiver_name(node[1])
    reads << [recv, symbol_key(node[2])] if recv
  end
  node.each { |child| collect(child, reads) }
end

def const_name(node)
  case node && node[0]
  when :const_ref, :top_const_ref then node[1][1]
  when :var_ref then node[1][0] == :@const ? node[1][1] : nil
  when :const_path_ref
    outer = const_name(node[1])
    outer && "#{outer}::#{node[2][1]}"
  end
end

def param_names(params)
  params = params[1] if params.is_a?(Array) && params[0] == :paren
  return [] unless params.is_a?(Array) && params[0] == :params

  positional = (params[1] || []).map { |p| p[1] } + (params[2] || []).map { |p| p[0][1] }
  kwrest = params[6].is_a?(Array) && params[6][0] == :kwrest_param && params[6][1] ? [params[6][1][1]] : []
  positional + kwrest
end

def walk(node, defs, owner = [], singleton = false)
  return unless node.is_a?(Array)

  case node[0]
  when :class, :module
    name = const_name(node[1])
    return node.each { |child| walk(child, defs, owner, singleton) } unless name

    return walk(node.last, defs, owner + [name], false)
  when :sclass
    return walk(node.last, defs, owner, true)
  when :assign
    target = node[1]
    if target.is_a?(Array) && target[0] == :var_field && target[1].is_a?(Array) && target[1][0] == :@const
      return walk(node[2], defs, owner + [target[1][1]], false)
    end
  end
  name, params, body = node[1], node[2], node[3] if node[0] == :def
  name, params, body = node[3], node[4], node[5] if node[0] == :defs
  if name.is_a?(Array) && name[1].is_a?(String)
    reads = []
    collect(body, reads)
    unless reads.empty?
      class_methods = owner.length > 1 && owner.last == "ClassMethods"
      (defs[name[1]] ||= []) << {
        owner: (class_methods ? owner[0...-1] : owner).join("::"),
        seat: singleton || class_methods || node[0] == :defs ? "class" : "instance",
        params: param_names(params),
        reads: reads
      }
    end
  end
  node.each { |child| walk(child, defs, owner, singleton) }
end

out = JSON.parse(ARGV.fetch(0)).to_h do |pkg, dir|
  files = Dir.glob(File.join(dir, "**", "*.rb")).sort.to_h do |path|
    defs = {}
    walk(Ripper.sexp(File.read(path)), defs)
    [path.delete_prefix("#{dir}/"), defs]
  end
  [pkg, files.reject { |_, defs| defs.empty? }]
end
puts JSON.generate(out)
