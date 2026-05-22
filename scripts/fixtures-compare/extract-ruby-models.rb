#!/usr/bin/env ruby
# frozen_string_literal: true
# Emits a JSON manifest of Rails test model classes.
# Output: [{ file, classes: [{ name, parent, tableName, associations, validations, scopes, callbacks, attributes }] }]
require "json"

SCRIPT_DIR = File.dirname(__FILE__)
ROOT = File.expand_path("../..", SCRIPT_DIR)
MODELS_DIR = File.join(ROOT, "vendor/rails/activerecord/test/models")

ASSOC_KINDS = %w[has_and_belongs_to_many has_many has_one belongs_to].freeze
CALLBACK_KINDS = %w[
  before_validation after_validation
  before_save around_save after_save
  before_create around_create after_create
  before_update around_update after_update
  before_destroy around_destroy after_destroy
  after_commit after_rollback after_touch
].freeze
VALIDATION_MACROS = %w[
  validates
  validates_presence_of validates_uniqueness_of validates_length_of
  validates_inclusion_of validates_exclusion_of validates_format_of
  validates_numericality_of validates_confirmation_of validates_associated
  validates_absence_of validates_comparison_of validates_acceptance_of
].freeze

# Extract the first symbol name from a macro call: `has_many :foo, ...` → "foo"
def first_symbol(line)
  line.match(/\b\w+\s+:(\w+)/i)&.then { |m| m[1] }
end

# Extract simple key: :val / key: "val" / key: 'val' option pairs.
# Skips lambda/proc values and complex expressions.
def extract_options(line)
  opts = {}
  line.scan(/(\w+):\s*(?::(\w+)|"([^"]+)"|'([^']+)')/) do |key, sym, dq, sq|
    opts[key] = sym || dq || sq
  end
  opts
end

def parse_file(path)
  lines = File.readlines(path, chomp: true)
  classes = []
  stack = []   # [{cls:, depth:}]
  depth = 0    # simple brace/do/end depth approximation

  lines.each do |raw|
    line = raw.strip

    # Track nesting depth to know which class we're in.
    # Count `do`, `begin`, `def`, `if`, `unless`, `module`, `class` as +1;
    # `end` as -1. We only need rough depth to detect class end.
    opens = line.scan(/\b(?:do|begin|def|if|unless|module|class|case|for|while|until)\b/).count
    # Inline `if`/`unless` modifiers (trailing) don't open a block.
    opens -= line.scan(/\s+(?:if|unless)\s+/).count if line !~ /^\s*(?:if|unless)\b/
    closes = line.scan(/\bend\b/).count
    # Ruby 3 single-line `def foo = expr` opens `def` but has no `end`.
    # Cancel the `def` from opens (not closes) so net delta stays 0.
    opens -= 1 if line =~ /^\s*def\s+\w[\w?!]*\s*=/ && !line.include?(" end")

    if (m = line.match(/^class\s+(\w+(?:::\w+)*)(?:\s*<\s*([\w:]+))?/))
      # Enter the class body at depth+1, then apply remaining tokens on this line.
      # `class` itself counted in opens; remaining opens = opens-1, closes = closes.
      # e.g. `class Foo; end` → depth+1, then -1 → back to parent depth, stack popped.
      depth += 1
      cls = { name: m[1], parent: m[2], tableName: nil,
              associations: [], validations: [], scopes: [], callbacks: [], attributes: [] }
      stack << { cls: cls, depth: depth }
      classes << cls
      depth += (opens - 1) - closes
      stack.pop while stack.last && depth < stack.last[:depth]
      next
    end

    depth += opens - closes

    # Pop classes whose depth we've left.
    stack.pop while stack.last && depth < stack.last[:depth]

    next if stack.empty?
    cls = stack.last[:cls]

    if (m = line.match(/^self\.table_name\s*=\s*["']([^"']+)["']/))
      cls[:tableName] = m[1]
    elsif (kind = ASSOC_KINDS.find { |k| line =~ /^#{Regexp.escape(k)}\b/ })
      name = first_symbol(line)
      cls[:associations] << { kind: kind, name: name, options: extract_options(line) } if name
    elsif line =~ /^scope\s+:/
      name = first_symbol(line)
      cls[:scopes] << { name: name } if name
    elsif (kind = CALLBACK_KINDS.find { |k| line =~ /^#{Regexp.escape(k)}\b/ })
      target = line.match(/^#{Regexp.escape(kind)}\s+:(\w+)/)&.then { |m| m[1] }
      cls[:callbacks] << { kind: kind, target: target }
    elsif (kind = VALIDATION_MACROS.find { |k| line =~ /^#{Regexp.escape(k)}\b/ })
      name = first_symbol(line)
      cls[:validations] << { kind: kind, attributes: [name].compact, options: extract_options(line) }
    elsif (m = line.match(/^attribute\s+:(\w+),\s*:(\w+)/))
      cls[:attributes] << { name: m[1], type: m[2] }
    end
  end

  classes
end

abort "extract-ruby-models: MODELS_DIR not found: #{MODELS_DIR}\nRun `pnpm vendor:fetch` first." unless Dir.exist?(MODELS_DIR)

files = Dir.glob(File.join(MODELS_DIR, "**", "*.rb")).sort
abort "extract-ruby-models: no .rb files found under #{MODELS_DIR}" if files.empty?
result = []
files.each do |f|
  rel = f.delete_prefix(File.join(ROOT, "vendor/rails/activerecord") + "/")
  classes = parse_file(f)
  result << { file: rel, classes: classes } unless classes.empty?
end
puts JSON.generate(result)
