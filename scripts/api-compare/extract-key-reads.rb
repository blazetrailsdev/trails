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
# other `def` is `instance`; a `Name = Struct.new … do` block is `Name`'s. A
# body's reads stop at a nested `def`, which is its own body. So two classes' `def call` in one file, or
# `def self.x` beside `def x`, are separate bodies. `params` is the def's
# positional parameters, then its `**kwrest`, which is how a port that
# destructures a Hash parameter is credited.
#
# `includes` maps an owner to the modules it `include`s or `extend`s, each
# name as written (a leading `::` is absolute), which is what lets a pair
# owned by the includer read the module's body.
#
# Usage: ruby extract-key-reads.rb '{"<pkg>": "<lib dir>", …}'
# Prints {"<pkg>": {"defs": {"<file under lib>": {"<def name>":
#   [{"owner": "<A::B>", "seat": "class"|"instance", "params": […],
#     "reads": [["<recv>", "<key>"|null], …]}, …]}},
#   "includes": {"<A::B>": [{"kind": "include"|"extend", "module": "<C>"}, …]}}}.
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
  return unless node.is_a?(Array) && !%i[def defs].include?(node[0])

  if node[0] == :aref
    recv = receiver_name(node[1])
    reads << [recv, symbol_key(node[2])] if recv
  end
  node.each { |child| collect(child, reads) }
end

def const_path(node)
  case node && node[0]
  when :const_ref then [node[1][1]]
  when :top_const_ref then ["", node[1][1]]
  when :var_ref then node[1][0] == :@const ? [node[1][1]] : nil
  when :const_path_ref
    outer = const_path(node[1])
    outer && outer + [node[2][1]]
  end
end

# The owner path a `class`/`module` header opens. `::A` is absolute; `A::B`
# resolves its head lexically, against the nearest enclosing owner named `A`.
def nested_owner(owner, node)
  path = const_path(node)
  return nil unless path
  return path.drop(1) if path.first == ""

  head = owner.rindex(path.first) if path.length > 1
  head ? owner[0...head] + path : owner + path
end

def param_names(params)
  params = params[1] if params.is_a?(Array) && params[0] == :paren
  return [] unless params.is_a?(Array) && params[0] == :params

  positional = (params[1] || []).map { |p| p[1] } + (params[2] || []).map { |p| p[0][1] }
  kwrest = params[6].is_a?(Array) && params[6][0] == :kwrest_param && params[6][1] ? [params[6][1][1]] : []
  positional + kwrest
end

def walk(node, defs, includes, owner = [], singleton = false)
  return unless node.is_a?(Array)

  if node[0] == :command && %w[include extend].include?(node[1][1]) && node[2].is_a?(Array)
    (node[2][1] || []).each do |arg|
      path = const_path(arg)
      next unless path

      (includes[owner.join("::")] ||= []) << { kind: node[1][1], module: path.join("::") }
    end
  end
  case node[0]
  when :class, :module
    nested = nested_owner(owner, node[1])
    return node.each { |child| walk(child, defs, includes, owner, singleton) } unless nested

    return walk(node.last, defs, includes, nested, false)
  when :sclass
    return walk(node.last, defs, includes, owner, true)
  when :assign
    target = node[1]
    if target.is_a?(Array) && target[0] == :var_field && target[1].is_a?(Array) && target[1][0] == :@const
      return walk(node[2], defs, includes, owner + [target[1][1]], false)
    end
  end
  name, params, body = node[1], node[2], node[3] if node[0] == :def
  name, params, body = node[3], node[4], node[5] if node[0] == :defs
  if name.is_a?(Array) && name[1].is_a?(String)
    reads = []
    collect(body, reads)
    unless reads.empty?
      (defs[name[1]] ||= []) << {
        owner: owner.join("::"),
        seat: singleton || node[0] == :defs ? "class" : "instance",
        params: param_names(params),
        reads: reads
      }
    end
  end
  node.each { |child| walk(child, defs, includes, owner, singleton) }
end

out = JSON.parse(ARGV.fetch(0)).to_h do |pkg, dir|
  includes = {}
  files = Dir.glob(File.join(dir, "**", "*.rb")).sort.to_h do |path|
    defs = {}
    walk(Ripper.sexp(File.read(path)), defs, includes)
    [path.delete_prefix("#{dir}/"), defs]
  end
  [pkg, { defs: files.reject { |_, defs| defs.empty? }, includes: includes }]
end
puts JSON.generate(out)
