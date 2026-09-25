#!/usr/bin/env ruby
# frozen_string_literal: true
# Emits a JSON manifest of Rails test model classes.
# Output: [{ package, file, classes: [{ name, parent, tableName, associations, validations, scopes, callbacks, attributes, attrs }] }]
require "json"

MODELS_PATHS_JSON = ENV.fetch("MODELS_PATHS_JSON") do
  abort "extract-ruby-models: MODELS_PATHS_JSON env var not set. Run it via `pnpm parity:fixtures`."
end
MODELS_DIRS =
  begin
    parsed = JSON.parse(MODELS_PATHS_JSON)
    unless parsed.is_a?(Hash) && parsed.values.all? { |v| v.is_a?(String) }
      abort "extract-ruby-models: MODELS_PATHS_JSON must be a JSON object of " \
            "{string: string}; got #{parsed.class}. Run it via `pnpm parity:fixtures`."
    end
    parsed.freeze
  rescue JSON::ParserError => e
    abort "extract-ruby-models: MODELS_PATHS_JSON is not valid JSON (#{e.message}). " \
          "Run it via `pnpm parity:fixtures`."
  end

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

# `has_many :foo, -> { open }, ...` — a scope lambda as the second argument.
def scope_lambda?(line)
  line.match?(/^\w+\s*\(?\s*:\w+\s*,\s*(?:->|lambda\b|proc\b)/)
end

# `attr_reader :a, :b` → ["a", "b"]
def attr_names(line)
  line.sub(/^attr_\w+\s*\(?/, "").scan(/\A\s*:(\w+)|,\s*:(\w+)/).flatten.compact
end

def parse_file(path)
  lines = File.readlines(path, chomp: true)
  classes = []
  stack = []   # [{cls:, depth:}]
  modules = [] # [{name:, depth:}]
  singletons = []
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

    if (m = line.match(/^module\s+(\w+(?:::\w+)*)\s*$/))
      depth += 1
      modules << { name: m[1], depth: depth }
      depth += (opens - 1) - closes
      modules.pop while modules.last && depth < modules.last[:depth]
      next
    end

    if (m = line.match(/^class\s+(\w+(?:::\w+)*)(?:\s*<\s*([\w:]+))?/))
      # Enter the class body at depth+1, then apply remaining tokens on this line.
      # `class` itself counted in opens; remaining opens = opens-1, closes = closes.
      # e.g. `class Foo; end` → depth+1, then -1 → back to parent depth, stack popped.
      depth += 1
      namespace = modules.map { |mod| mod[:name] }.join("::")
      cls = { name: m[1], qualifiedName: namespace.empty? ? m[1] : "#{namespace}::#{m[1]}", parent: m[2], tableName: nil,
              associations: [], validations: [], scopes: [], callbacks: [], attributes: [], attrs: [] }
      stack << { cls: cls, depth: depth }
      classes << cls
      depth += (opens - 1) - closes
      stack.pop while stack.last && depth < stack.last[:depth]
      next
    end

    singleton = line.match?(/^class\s*<<\s*self\b/)
    depth += opens - closes
    singletons << depth if singleton

    # Pop classes whose depth we've left.
    stack.pop while stack.last && depth < stack.last[:depth]
    modules.pop while modules.last && depth < modules.last[:depth]
    singletons.pop while singletons.last && depth < singletons.last

    next if stack.empty?
    cls = stack.last[:cls]

    if (m = line.match(/^self\.table_name\s*=\s*["']([^"']+)["']/))
      cls[:tableName] = m[1]
    elsif (kind = ASSOC_KINDS.find { |k| line =~ /^#{Regexp.escape(k)}\b/ })
      name = first_symbol(line)
      cls[:associations] << { kind: kind, name: name, options: extract_options(line), hasScope: scope_lambda?(line) } if name
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
    elsif singletons.empty? && (m = line.match(/^attr_(reader|writer|accessor)\b/))
      attr_names(line).each { |name| cls[:attrs] << { kind: m[1], name: name } }
    end
  end

  classes
end

result = []
MODELS_DIRS.each do |package, models_dir|
  abort "extract-ruby-models: models dir not found: #{models_dir}\nRun `pnpm vendor:fetch` first." unless Dir.exist?(models_dir)

  files = Dir.glob(File.join(models_dir, "**", "*.rb")).sort
  abort "extract-ruby-models: no .rb files found under #{models_dir}" if files.empty?
  files.each do |f|
    rel = f.delete_prefix(File.expand_path("../..", models_dir) + "/")
    classes = parse_file(f)
    result << { package: package, file: rel, classes: classes } unless classes.empty?
  end
end
puts JSON.generate(result)
