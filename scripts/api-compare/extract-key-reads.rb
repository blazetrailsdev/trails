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
# Usage: ruby extract-key-reads.rb '{"<pkg>": "<lib dir>", …}'
# Prints {"<pkg>": {"<file under lib>": {"<def name>": [["<recv>", "<key>"|null], …]}}}.
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

def walk(node, defs)
  return unless node.is_a?(Array)

  name, body = node[1], node[3] if node[0] == :def
  name, body = node[3], node[5] if node[0] == :defs
  if name.is_a?(Array) && name[1].is_a?(String)
    reads = []
    collect(body, reads)
    (defs[name[1]] ||= []).concat(reads) unless reads.empty?
  end
  node.each { |child| walk(child, defs) }
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
