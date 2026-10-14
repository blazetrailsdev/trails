#!/usr/bin/env ruby
# frozen_string_literal: true
# Emits a JSON manifest of Rails test model classes.
# Output: [{ package, file, classes: [{ name, parent, tableName, tableNamePrefix, abstractClass, pluralizeTableNames, associations, validations, scopes, callbacks, attributes, attrs }] }]
require "json"
require "ripper"

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

# Module name => the string its `def self.table_name_prefix` returns.
TABLE_NAME_PREFIXES = {}

# Every `class` / `module` / `class << self` body in a file, with the lines it
# spans. A parser event fires when its `end` is read, so `lineno` is that line.
class Scopes < Ripper
  attr_reader :scopes

  def initialize(*)
    super
    @scopes = []
  end

  def on_const(tok) = [tok, lineno]
  def on_kw(tok) = [tok, lineno]
  def on_const_path_ref(left, right) = left
  def on_top_const_ref(const) = const

  def on_class(name, _superclass, _body) = scope(:class, name)
  def on_module(name, _body) = scope(:module, name)
  def on_sclass(target, _body) = scope(:sclass, target)

  private
    def scope(kind, head)
      @scopes << { kind: kind, first: head[1], last: lineno }
    end
end

def parse_file(path)
  source = File.read(path)
  lines = source.lines(chomp: true)
  parser = Scopes.new(source)
  parser.parse
  abort "extract-ruby-models: #{path}: does not parse" if parser.error?
  # Outermost first: a later start, or the same start with an earlier end, is nested.
  scopes = parser.scopes.sort_by { |scope| [scope[:first], -scope[:last]] }
  prefix_module = nil
  classes = []

  lines.each.with_index(1) do |raw, lineno|
    line = raw.strip
    enclosing = scopes.select { |scope| scope[:first] <= lineno && lineno <= scope[:last] }

    if (m = line.match(/^module\s+(\w+(?:::\w+)*)\s*$/))
      enclosing.last[:name] = m[1]
      next
    end

    if (m = line.match(/^class\s+(\w+(?:::\w+)*)(?:\s*<\s*([\w:]+))?/))
      namespace = enclosing[0...-1].filter_map { |scope| scope[:name] }.join("::")
      cls = { name: m[1], qualifiedName: namespace.empty? ? m[1] : "#{namespace}::#{m[1]}", parent: m[2], tableName: nil,
              associations: [], validations: [], scopes: [], callbacks: [], attributes: [], attrs: [] }
      enclosing.last[:name] = m[1]
      enclosing.last[:cls] = cls
      classes << cls
      next
    end

    modules = enclosing.select { |scope| scope[:kind] == :module }

    if prefix_module
      m = line.match(/^["']([^"']*)["']$/) or abort "extract-ruby-models: #{path}: unrecognized table_name_prefix body: #{line}"
      TABLE_NAME_PREFIXES[prefix_module] = m[1]
      prefix_module = nil
    elsif line.match?(/^def self\.table_name_prefix\b/)
      prefix_module = modules.map { |mod| mod[:name] }.join("::")
      if (m = line.match(/^def self\.table_name_prefix\s*(?:=|;)\s*["']([^"']*)["']/))
        TABLE_NAME_PREFIXES[prefix_module] = m[1]
        prefix_module = nil
      end
    end

    cls = enclosing.reverse.find { |scope| scope[:cls] }&.fetch(:cls) or next

    if (m = line.match(/^self\.table_name\s*=\s*(?:["']([^"']+)["']|:(\w+))/))
      cls[:tableName] = m[1] || m[2]
    elsif line.match?(/^self\.abstract_class\s*=\s*true\b/)
      cls[:abstractClass] = true
    elsif line.match?(/^self\.pluralize_table_names\s*=\s*false\b/)
      cls[:pluralizeTableNames] = false
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
    elsif enclosing.none? { |scope| scope[:kind] == :sclass } && (m = line.match(/^attr_(reader|writer|accessor)\b/))
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
result.each do |entry|
  entry[:classes].each do |cls|
    mod = TABLE_NAME_PREFIXES.keys.select { |name| cls[:qualifiedName].start_with?("#{name}::") }.max_by(&:size)
    cls[:tableNamePrefix] = TABLE_NAME_PREFIXES[mod] if mod
  end
end
puts JSON.generate(result)
