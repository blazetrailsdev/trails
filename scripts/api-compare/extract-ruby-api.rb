#!/usr/bin/env ruby
# frozen_string_literal: true

# Extracts the public API surface from Rails source using Ripper.
# Outputs output/rails-api.json

require "ripper"
require "json"
require "pathname"
require "time"
require "set"

SCRIPT_DIR = File.dirname(__FILE__)
RAILS_DIR = File.join(SCRIPT_DIR, ".rails-source")
OUTPUT_DIR = File.join(SCRIPT_DIR, "output")

# Map of source directories to package names
PACKAGE_DIRS = {
  "arel" => File.join(RAILS_DIR, "activerecord", "lib", "arel"),
  "activemodel" => File.join(RAILS_DIR, "activemodel", "lib", "active_model"),
  "activerecord" => File.join(RAILS_DIR, "activerecord", "lib", "active_record"),
  "activesupport" => File.join(RAILS_DIR, "activesupport", "lib", "active_support"),
  "actiondispatch" => File.join(RAILS_DIR, "actionpack", "lib", "action_dispatch"),
  "actioncontroller" => File.join(RAILS_DIR, "actionpack", "lib", "action_controller"),
  "actionview" => File.join(RAILS_DIR, "actionview", "lib", "action_view"),
  "trailties" => File.join(RAILS_DIR, "railties", "lib", "rails"),
}

# ---- Param extraction from Ripper AST ----

def extract_params(params_node)
  return [] if params_node.nil?
  return [] unless params_node.is_a?(Array) && params_node[0] == :params

  result = []

  # params node structure:
  # [:params, required, optional, rest, post_required, keywords, keyword_rest, block]
  _, required, optional, rest, _post_required, keywords, keyword_rest, block = params_node

  # Required params
  (required || []).each do |p|
    name = ident_name(p)
    result << { name: name, kind: "required" } if name
  end

  # Optional params (with defaults)
  (optional || []).each do |p|
    if p.is_a?(Array) && p.length >= 2
      name = ident_name(p[0])
      result << { name: name, kind: "optional", default: "..." } if name
    end
  end

  # Rest param (*args)
  if rest && rest != 0
    name = ident_name(rest)
    name = "*" if name.nil?
    result << { name: name, kind: "rest" }
  end

  # Keyword params
  (keywords || []).each do |kw|
    if kw.is_a?(Array) && kw.length >= 2
      name = ident_name(kw[0])
      if name
        # kw[1] is nil for required keywords, non-nil for optional
        if kw[1].nil? || kw[1] == false
          result << { name: name.chomp(":"), kind: "keyword" }
        else
          result << { name: name.chomp(":"), kind: "keyword", default: "..." }
        end
      end
    end
  end

  # Keyword rest (**opts)
  if keyword_rest && keyword_rest != 0
    name = ident_name(keyword_rest)
    name = "**" if name.nil?
    result << { name: name, kind: "keyword_rest" }
  end

  # Block param (&block)
  if block && block != 0
    name = ident_name(block)
    name = "&block" if name.nil?
    result << { name: name, kind: "block" }
  end

  result
end

def ident_name(node)
  return nil if node.nil?
  return node if node.is_a?(String)
  if node.is_a?(Array)
    return node[1] if node[0] == :@ident
    return node[1] if node[0] == :@label
    # For rest params: [:rest_param, [:@ident, "args", [line, col]]]
    if [:rest_param, :blockarg, :kwrest_param].include?(node[0])
      return ident_name(node[1])
    end
  end
  nil
end

# ---- Dependency detection patterns ----
# Each entry maps a dependency name to the constants and identifiers that
# indicate usage. Adding a new dependency is just adding a new key here.
DEPENDENCY_PATTERNS = {
  "arel" => {
    constants: %w[Arel].to_set,
    identifiers: %w[arel_table arel_attribute resolve_arel_attribute arel_column].to_set,
  },
  "activemodel" => {
    constants: %w[ActiveModel].to_set,
    identifiers: Set.new,
  },
  "activesupport" => {
    constants: %w[ActiveSupport].to_set,
    identifiers: Set.new,
  },
}

# ---- AST walker ----

class ApiExtractor
  attr_reader :classes, :modules

  def initialize
    @classes = {}
    @modules = {}
    @namespace_stack = []
    @visibility_stack = [:public]
  end

  def process_file(filepath, package_root)
    source = File.read(filepath)
    sexp = Ripper.sexp(source)
    return unless sexp

    rel_path = Pathname.new(filepath).relative_path_from(Pathname.new(package_root)).to_s

    @current_file = rel_path
    walk(sexp)

    # Handle dynamic class creation via const_set:
    #   %w{ Foo Bar }.each { |name| const_set(name, Class.new(Superclass)) }
    extract_const_set_classes(source)
  end

  def extract_const_set_classes(source)
    lines = source.lines

    lines.each_with_index do |line, idx|
      next unless line =~ /const_set\s*\(?[^,]+,\s*Class\.new\((\w+)\)/
      superclass = $1
      const_set_indent = line[/^\s*/].length

      # Find the %w{} list by scanning backwards and collecting lines
      names = []
      (0..idx).reverse_each do |i|

        if lines[i] =~ /%w[\{\[\(]/
          collected = lines[i..idx].join
          if collected =~ /%w[\{\[\(]([\w\s]+)[\}\]\)]/
            names = $1.strip.split(/\s+/)
          end
          break
        end
      end
      next if names.empty?

      # Determine enclosing namespace from module declarations only.
      # Find the indentation of the first class declaration to exclude
      # modules that are nested inside classes.
      first_class_indent = const_set_indent
      (0...idx).each do |i|
        if lines[i] =~ /^(\s*)class\s/
          first_class_indent = [$1.length, first_class_indent].min
          break
        end
      end

      namespace_parts = []
      (0...idx).each do |i|

        if lines[i] =~ /^(\s*)module\s+([\w:]+)/
          decl_indent = $1.length
          if decl_indent < first_class_indent
            $2.split("::").each { |part| namespace_parts << part }
          end
        end
      end

      fqn_prefix = namespace_parts.join("::")

      names.each do |name|
        class_fqn = fqn_prefix.empty? ? name : "#{fqn_prefix}::#{name}"
        @classes[class_fqn] ||= new_class_info(name, class_fqn)
        @classes[class_fqn][:superclass] = superclass if superclass
      end
    end
  end

  private

  def current_fqn
    @namespace_stack.join("::")
  end

  def current_visibility
    @visibility_stack.last || :public
  end

  def walk(node)
    return unless node.is_a?(Array)

    case node[0]
    when :module
      process_module(node)
    when :class
      process_class(node)
    when :def
      process_def(node)
    when :defs
      process_defs(node)
    when :command
      process_command(node)
    when :command_call
      process_command(node)
    when :fcall
      process_fcall(node)
    when :vcall
      process_vcall(node)
    when :method_add_arg
      process_method_add_arg(node)
    when :sclass
      process_sclass(node)
    when :program, :bodystmt, :body_stmt, :stmts_add, :stmts_new,
         :begin, :else, :elsif, :if, :if_mod, :unless, :unless_mod,
         :rescue, :ensure, :while, :until, :case, :when
      node.each { |child| walk(child) if child.is_a?(Array) }
    else
      node.each { |child| walk(child) if child.is_a?(Array) }
    end
  end

  def process_module(node)
    name = const_name(node[1])
    return unless name

    @namespace_stack.push(name)
    @visibility_stack.push(:public)

    fqn = current_fqn
    @modules[fqn] ||= new_class_info(name, fqn)

    walk_body(node[2])

    @visibility_stack.pop
    @namespace_stack.pop
  end

  def process_class(node)
    name = const_name(node[1])
    return unless name

    superclass = const_name(node[2]) if node[2]

    @namespace_stack.push(name)
    @visibility_stack.push(:public)

    fqn = current_fqn
    @classes[fqn] ||= new_class_info(name, fqn)
    @classes[fqn][:superclass] = superclass if superclass

    walk_body(node[3] || node[2])

    @visibility_stack.pop
    @namespace_stack.pop
  end

  def process_sclass(node)
    # class << self ... end — methods inside are class methods
    body = node[2]
    old_in_sclass = @in_sclass
    @in_sclass = true
    @visibility_stack.push(:public)
    walk_body(body)
    @visibility_stack.pop
    @in_sclass = old_in_sclass
  end

  def process_def(node)
    name_node = node[1]
    name = ident_name(name_node)
    return unless name

    params = extract_params(find_params(node))
    vis = current_visibility

    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    body = node[3]
    dep_info = detect_deps(body)
    calls = collect_method_calls(body)

    method_info = {
      name: name,
      visibility: vis.to_s,
      params: params,
      file: @current_file,
    }
    method_info[:deps] = dep_info[:deps] unless dep_info[:deps].empty?
    method_info[:depRefs] = dep_info[:depRefs] unless dep_info[:depRefs].empty?
    method_info[:calls] = calls unless calls.empty?

    if @in_sclass
      target[:classMethods] << method_info
    else
      target[:instanceMethods] << method_info
    end

    maybe_update_module_file(fqn, target)
  end

  def process_defs(node)
    # def self.method_name or def obj.method_name
    _receiver = node[1]
    _dot = node[2]
    name_node = node[3]
    name = ident_name(name_node)
    return unless name

    params = extract_params(find_params_defs(node))
    vis = current_visibility

    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    body = node[5]
    dep_info = detect_deps(body)
    calls = collect_method_calls(body)

    method_info = {
      name: name,
      visibility: vis.to_s,
      params: params,
      file: @current_file,
    }
    method_info[:deps] = dep_info[:deps] unless dep_info[:deps].empty?
    method_info[:depRefs] = dep_info[:depRefs] unless dep_info[:depRefs].empty?
    method_info[:calls] = calls unless calls.empty?

    target[:classMethods] << method_info

    maybe_update_module_file(fqn, target)
  end

  # Update module file to where its first method is defined (not where it was first opened)
  def maybe_update_module_file(fqn, target)
    return unless @modules[fqn]
    return if target[:first_method_file]
    target[:first_method_file] = @current_file
    target[:file] = @current_file
  end

  def process_command(node)
    cmd_name = if node[0] == :command
      ident_name(node[1])
    elsif node[0] == :command_call
      ident_name(node[3])
    end
    return unless cmd_name

    args = node[0] == :command ? node[2] : node[4]

    case cmd_name
    when "private", "protected", "public"
      # Check if it's a visibility modifier with no args (changes default)
      # or with args (modifies specific methods)
      if args.nil? || (args.is_a?(Array) && args[0] == :args_new)
        @visibility_stack[-1] = cmd_name.to_sym
      end
      # If it has args, it modifies specific methods — we handle this by
      # not changing default visibility
    when "include"
      process_include(args)
    when "extend"
      process_extend(args)
    when "attr_reader"
      process_attr(args, :reader)
    when "attr_writer"
      process_attr(args, :writer)
    when "attr_accessor"
      process_attr(args, :accessor)
    when "alias_method"
      process_alias_method(args)
    when "scope"
      process_scope(args)
    when "delegate"
      process_delegate(args)
    end
  end

  def process_fcall(node)
    cmd_name = ident_name(node[1])
    case cmd_name
    when "private", "protected", "public"
      @visibility_stack[-1] = cmd_name.to_sym
    end
  end

  def process_vcall(node)
    cmd_name = ident_name(node[1])
    case cmd_name
    when "private", "protected", "public"
      @visibility_stack[-1] = cmd_name.to_sym
    end
  end

  def process_method_add_arg(node)
    # Handle things like: private(def ...) or public(:method_name)
    if node[1].is_a?(Array) && node[1][0] == :fcall
      cmd_name = ident_name(node[1][1])
      case cmd_name
      when "private", "protected", "public"
        # This is the inline form: private def foo; end
        # The method is already defined, we need to mark it
        # For simplicity, handle the case where the arg is a def
        args = node[2]
        if args.is_a?(Array)
          walk(args)
        end
      when "attr_reader", "attr_writer", "attr_accessor"
        process_attr_from_arg_paren(node[2], cmd_name)
      when "include"
        process_include_from_arg_paren(node[2])
      when "extend"
        process_extend_from_arg_paren(node[2])
      when "scope"
        process_scope_from_arg_paren(node[2])
      end
    else
      walk(node[1]) if node[1].is_a?(Array)
      walk(node[2]) if node[2].is_a?(Array)
    end
  end

  def process_include(args)
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    extract_const_args(args).each do |mod_name|
      target[:includes] << mod_name
    end
  end

  def process_include_from_arg_paren(args)
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    extract_const_args_from_paren(args).each do |mod_name|
      target[:includes] << mod_name
    end
  end

  def process_extend(args)
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    extract_const_args(args).each do |mod_name|
      target[:extends] << mod_name
    end
  end

  def process_extend_from_arg_paren(args)
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    extract_const_args_from_paren(args).each do |mod_name|
      target[:extends] << mod_name
    end
  end

  def process_attr(args, kind)
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    vis = current_visibility
    names = extract_symbol_args(args)
    names.each do |name|
      if kind == :reader || kind == :accessor
        target[:instanceMethods] << {
          name: name,
          visibility: vis.to_s,
          params: [],
          file: @current_file,
        }
      end
      if kind == :writer || kind == :accessor
        target[:instanceMethods] << {
          name: "#{name}=",
          visibility: vis.to_s,
          params: [{ name: "value", kind: "required" }],
          file: @current_file,
        }
      end
      maybe_update_module_file(fqn, target)
    end
  end

  def process_attr_from_arg_paren(args, cmd_name)
    kind = case cmd_name
    when "attr_reader" then :reader
    when "attr_writer" then :writer
    when "attr_accessor" then :accessor
    end
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    vis = current_visibility
    names = extract_symbol_args_from_paren(args)
    names.each do |name|
      if kind == :reader || kind == :accessor
        target[:instanceMethods] << {
          name: name,
          visibility: vis.to_s,
          params: [],
          file: @current_file,
        }
      end
      if kind == :writer || kind == :accessor
        target[:instanceMethods] << {
          name: "#{name}=",
          visibility: vis.to_s,
          params: [{ name: "value", kind: "required" }],
          file: @current_file,
        }
      end
      maybe_update_module_file(fqn, target)
    end
  end

  def process_alias_method(args)
    # alias_method :new_name, :old_name — record as a method
    names = extract_symbol_args(args)
    return if names.length < 1

    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    new_name = names[0]
    vis = current_visibility
    target[:instanceMethods] << {
      name: new_name,
      visibility: vis.to_s,
      params: [],
      file: @current_file,
      notes: "alias",
    }
    maybe_update_module_file(fqn, target)
  end

  def process_scope(args)
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    names = extract_symbol_args(args)
    return if names.empty?

    target[:classMethods] << {
      name: names[0],
      visibility: "public",
      params: [],
      file: @current_file,
      notes: "scope",
    }
  end

  def process_scope_from_arg_paren(args)
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    names = extract_symbol_args_from_paren(args)
    return if names.empty?

    target[:classMethods] << {
      name: names[0],
      visibility: "public",
      params: [],
      file: @current_file,
      notes: "scope",
    }
  end

  def process_delegate(args)
    # delegate :method_name, to: :association — skip, too complex
  end

  # ---- Dependency detection ----

  def detect_deps(body_node)
    deps = []
    dep_refs = {}

    DEPENDENCY_PATTERNS.each do |dep_name, patterns|
      refs = []
      collect_dep_refs(body_node, patterns[:constants], patterns[:identifiers], refs)
      unless refs.empty?
        deps << dep_name
        dep_refs[dep_name] = refs.uniq
      end
    end

    { deps: deps, depRefs: dep_refs }
  end

  def collect_method_calls(body_node)
    calls = []
    walk_for_calls(body_node, calls)
    calls.uniq
  end

  def walk_for_calls(node, calls)
    return unless node.is_a?(Array)

    case node[0]
    when :fcall, :vcall
      # Unqualified method call: foo() or foo
      name = ident_name(node[1])
      calls << name if name && !name.start_with?("_") && name =~ /\A[a-z]/
    when :call
      # Qualified method call: obj.foo
      name = ident_name(node[3]) if node[3]
      calls << name if name && !name.start_with?("_") && name =~ /\A[a-z]/
    when :command
      name = ident_name(node[1])
      calls << name if name && !name.start_with?("_") && name =~ /\A[a-z]/
    when :command_call
      name = ident_name(node[3]) if node[3]
      calls << name if name && !name.start_with?("_") && name =~ /\A[a-z]/
    end

    node.each { |child| walk_for_calls(child, calls) if child.is_a?(Array) }
  end

  def collect_dep_refs(node, constants, identifiers, refs)
    return unless node.is_a?(Array)

    case node[0]
    when :const_path_ref
      name = const_name(node)
      if name
        root = name.split("::").first
        refs << name if constants.include?(root)
      end
      return
    when :@const
      refs << node[1] if constants.include?(node[1])
      return
    when :@ident
      refs << node[1] if identifiers.include?(node[1])
      return
    end

    node.each { |child| collect_dep_refs(child, constants, identifiers, refs) if child.is_a?(Array) }
  end

  # ---- Helpers ----

  def new_class_info(name, fqn)
    {
      name: name,
      fqn: fqn,
      superclass: nil,
      file: @current_file,
      includes: [],
      extends: [],
      instanceMethods: [],
      classMethods: [],
    }
  end

  def walk_body(node)
    return unless node.is_a?(Array)
    if node[0] == :bodystmt || node[0] == :body_stmt
      node.each { |child| walk(child) if child.is_a?(Array) }
    else
      walk(node)
    end
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
    when :method_add_arg
      # e.g. `Struct.new(:a, :b)` — capture the receiver const so that
      # `class X < Struct.new(...)` records `X`'s superclass as `Struct`.
      inner = node[1]
      inner.is_a?(Array) && inner[0] == :call ? const_name(inner[1]) : nil
    when :call, :command_call
      # :call     → `Struct.new(:a)` (with parens)
      # :command_call → `Struct.new :a` (no parens)
      const_name(node[1])
    else
      nil
    end
  end

  def find_params(def_node)
    # def node: [:def, name, params_or_paren, body]
    params = def_node[2]
    if params.is_a?(Array) && params[0] == :paren
      params[1]
    else
      params
    end
  end

  def find_params_defs(defs_node)
    # defs node: [:defs, receiver, dot, name, params_or_paren, body]
    params = defs_node[4]
    if params.is_a?(Array) && params[0] == :paren
      params[1]
    else
      params
    end
  end

  def extract_const_args(args)
    results = []
    return results unless args.is_a?(Array)
    traverse_for_consts(args, results)
    results
  end

  def extract_const_args_from_paren(args)
    results = []
    return results unless args.is_a?(Array)
    traverse_for_consts(args, results)
    results
  end

  def traverse_for_consts(node, results)
    return unless node.is_a?(Array)
    case node[0]
    when :const_path_ref, :@const, :var_ref, :top_const_ref, :const_ref
      name = const_name(node)
      results << name if name
    else
      node.each { |child| traverse_for_consts(child, results) }
    end
  end

  def extract_symbol_args(args)
    results = []
    return results unless args.is_a?(Array)
    traverse_for_symbols(args, results)
    results
  end

  def extract_symbol_args_from_paren(args)
    results = []
    return results unless args.is_a?(Array)
    traverse_for_symbols(args, results)
    results
  end

  def traverse_for_symbols(node, results)
    return unless node.is_a?(Array)
    case node[0]
    when :symbol_literal, :dyna_symbol
      name = symbol_name(node)
      results << name if name
    when :@label
      # label like `name:` in keyword args
    else
      node.each { |child| traverse_for_symbols(child, results) }
    end
  end

  def symbol_name(node)
    return nil unless node.is_a?(Array)
    case node[0]
    when :symbol_literal
      inner = node[1]
      return ident_name(inner) if inner.is_a?(Array) && inner[0] == :symbol
      inner.is_a?(Array) ? ident_name(inner[1]) : nil
    when :dyna_symbol
      # Dynamic symbols — skip
      nil
    else
      nil
    end
  end

  def ident_name(node)
    return nil if node.nil?
    return node if node.is_a?(String)
    if node.is_a?(Array)
      return node[1] if node[0] == :@ident
      return node[1] if node[0] == :@label
      return node[1] if node[0] == :@kw
      return node[1] if node[0] == :@const
      return node[1] if node[0] == :@op
      if [:rest_param, :blockarg, :kwrest_param].include?(node[0])
        return ident_name(node[1])
      end
      if node[0] == :symbol
        return ident_name(node[1])
      end
    end
    nil
  end
end

# ---- Main ----

def run
  unless File.directory?(RAILS_DIR)
    abort "Rails source not found at #{RAILS_DIR}. Run fetch-rails.sh first."
  end

  Dir.mkdir(OUTPUT_DIR) unless File.directory?(OUTPUT_DIR)

  manifest = {
    source: "ruby",
    generatedAt: Time.now.utc.iso8601,
    packages: {},
  }

  PACKAGE_DIRS.each do |pkg_name, pkg_dir|
    next unless File.directory?(pkg_dir)

    extractor = ApiExtractor.new
    rb_files = Dir.glob(File.join(pkg_dir, "**", "*.rb")).sort

    puts "Processing #{pkg_name}: #{rb_files.length} files..."

    rb_files.each do |filepath|
      extractor.process_file(filepath, pkg_dir)
    end

    # Filter to only public methods
    classes = {}
    extractor.classes.each do |fqn, info|
      classes[fqn] = filter_public(info)
    end

    modules = {}
    extractor.modules.each do |fqn, info|
      modules[fqn] = filter_public(info)
    end

    manifest[:packages][pkg_name] = {
      classes: classes,
      modules: modules,
    }
  end

  # Print summary
  manifest[:packages].each do |pkg, data|
    class_count = data[:classes].length
    module_count = data[:modules].length
    method_count = data[:classes].values.sum { |c| c[:instanceMethods].length + c[:classMethods].length } +
                   data[:modules].values.sum { |m| m[:instanceMethods].length + m[:classMethods].length }
    puts "  #{pkg}: #{class_count} classes, #{module_count} modules, #{method_count} public methods"
  end

  output_path = File.join(OUTPUT_DIR, "rails-api.json")
  File.write(output_path, JSON.pretty_generate(manifest))
  puts "\nWritten to #{output_path}"
end

def filter_public(info)
  {
    name: info[:name],
    fqn: info[:fqn],
    superclass: info[:superclass],
    file: info[:file],
    includes: info[:includes].uniq,
    extends: info[:extends].uniq,
    instanceMethods: info[:instanceMethods].select { |m| m[:visibility] == "public" },
    classMethods: info[:classMethods].select { |m| m[:visibility] == "public" },
  }
end

run
