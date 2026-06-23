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
OUTPUT_DIR = File.join(SCRIPT_DIR, "output")

# PACKAGE_DIRS is fed by the caller via LIB_PATHS_JSON (a JSON map of
# {package_name: absolute_lib_dir}) — built from vendor/sources.ts by
# `vendor/fetch.ts --print-lib-paths`. This Ruby script no longer carries
# a parallel package table that drifts from the registry; adding a source
# with compareApi !== false in vendor/sources.ts feeds through automatically.
LIB_PATHS_JSON = ENV.fetch("LIB_PATHS_JSON") do
  abort "extract-ruby-api.rb: LIB_PATHS_JSON env var not set. Caller must export " \
        "it via `LIB_PATHS_JSON=$(pnpm -s vendor:fetch --print-lib-paths)`."
end
PACKAGE_DIRS =
  begin
    parsed = JSON.parse(LIB_PATHS_JSON)
    unless parsed.is_a?(Hash) && parsed.values.all? { |v| v.is_a?(String) }
      abort "extract-ruby-api.rb: LIB_PATHS_JSON must be a JSON object of " \
            "{string: string}; got #{parsed.class}. Re-run vendor:fetch --print-lib-paths."
    end
    parsed
  rescue JSON::ParserError => e
    abort "extract-ruby-api.rb: LIB_PATHS_JSON is not valid JSON (#{e.message}). " \
          "If you set it manually, re-run via `LIB_PATHS_JSON=$(pnpm -s vendor:fetch --print-lib-paths)`."
  end

# Cache gate: invalidate on (a) a re-fetch (lockfile mtime bumped), (b) a
# registry edit (sources.ts mtime bumped — covers compareApi flips, libPath
# edits, source add/remove), or (c) an extractor edit (this script's mtime
# bumped — a `git pull` that changes the output shape, e.g. emitting new param
# kinds, sets its mtime past a stale manifest). This is the Ruby counterpart of
# the TS extractor's SCHEMA_VERSION bump. The output is current only when it's
# newer than ALL THREE signals; `API_COMPARE_FORCE=1` always regenerates.
output_path = File.join(OUTPUT_DIR, "rails-api.json")
lockfile_path = ENV.fetch("LOCKFILE_PATH") do
  abort "extract-ruby-api.rb: LOCKFILE_PATH env var not set. Caller must export " \
        "it (e.g. LOCKFILE_PATH=\"$ROOT/vendor/sources.lock.json\")."
end
sources_ts_path = File.join(File.dirname(lockfile_path), "sources.ts")
if ENV["API_COMPARE_FORCE"] != "1" && File.exist?(output_path) &&
   File.exist?(lockfile_path) && File.exist?(sources_ts_path) &&
   File.mtime(output_path) >= File.mtime(lockfile_path) &&
   File.mtime(output_path) >= File.mtime(sources_ts_path) &&
   File.mtime(output_path) >= File.mtime(__FILE__)
  puts "Rails manifest #{output_path} is up to date (set API_COMPARE_FORCE=1 to regenerate)"
  exit 0
end

# ---- Param extraction from Ripper AST ----

def extract_params(params_node)
  return [] if params_node.nil?
  return [] unless params_node.is_a?(Array) && params_node[0] == :params

  result = []

  # params node structure:
  # [:params, required, optional, rest, post_required, keywords, keyword_rest, block]
  _, required, optional, rest, post_required, keywords, keyword_rest, block = params_node

  # Required params
  (required || []).each do |p|
    name = ident_name(p)
    result << { name: name, kind: "required" } if name
  end

  # Optional params (with defaults)
  (optional || []).each do |p|
    if p.is_a?(Array) && p.length >= 2
      name = ident_name(p[0])
      if name
        entry = { name: name, kind: "optional", default: "..." }
        lit = literal_value(p[1])
        entry[:literal] = lit if lit
        result << entry
      end
    end
  end

  # Rest param (*args)
  if rest && rest != 0
    name = ident_name(rest)
    name = "*" if name.nil?
    result << { name: name, kind: "rest" }
  end

  # Post-splat required params: `def m(*args, value)` — `value` is required.
  # Emitted after the rest param to preserve source order.
  (post_required || []).each do |p|
    name = ident_name(p)
    result << { name: name, kind: "required" } if name
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
          entry = { name: name.chomp(":"), kind: "keyword", default: "..." }
          lit = literal_value(kw[1])
          entry[:literal] = lit if lit
          result << entry
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

# Classify a default-value or constant-RHS node as a literal {kind:, value:};
# {kind: "expr"} for non-literals (calls, refs, lambdas), nil when no node.
def literal_value(node)
  return nil if node.nil?
  return { kind: "expr" } unless node.is_a?(Array)
  case node[0]
  when :@int
    { kind: "int", value: node[1] }
  when :@float
    { kind: "float", value: node[1] }
  when :string_literal
    val = string_literal_value(node)
    val.nil? ? { kind: "expr" } : { kind: "string", value: val }
  when :symbol_literal
    inner = node[1]
    name = inner.is_a?(Array) && inner[0] == :symbol ? ident_name(inner[1]) : nil
    name ? { kind: "symbol", value: name } : { kind: "expr" }
  when :var_ref, :var_field
    kw = node[1]
    if kw.is_a?(Array) && kw[0] == :@kw && %w[true false nil].include?(kw[1])
      kw[1] == "nil" ? { kind: "nil" } : { kind: "bool", value: kw[1] == "true" }
    else
      { kind: "expr" }
    end
  when :array
    node[1].nil? ? { kind: "array" } : { kind: "expr" }
  when :hash
    node[1].nil? ? { kind: "hash" } : { kind: "expr" }
  when :unary
    # Ripper splits a negative literal `-1` into `[:unary, :-@, [:@int, "1"]]`.
    # Fold the negation back into the numeric value; anything else stays expr.
    op = node[1]
    inner = node[2]
    if op == :-@ && inner.is_a?(Array) && [:@int, :@float].include?(inner[0])
      { kind: inner[0] == :@int ? "int" : "float", value: "-#{inner[1]}" }
    else
      { kind: "expr" }
    end
  else
    { kind: "expr" }
  end
end

# Plain (non-interpolated) string literal value, or nil when interpolated.
def string_literal_value(node)
  content = node[1]
  return "" unless content.is_a?(Array) && content[0] == :string_content
  str = +""
  content[1..].each do |part|
    return nil unless part.is_a?(Array) && part[0] == :@tstring_content
    str << part[1]
  end
  str
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
  attr_reader :classes, :modules, :file_constants

  def initialize
    @classes = {}
    @modules = {}
    # rel_path → { CONST_NAME => literal_value } for literal-valued constants.
    @file_constants = {}
    @namespace_stack = []
    @visibility_stack = [:public]
    # Tracks whether the current module-scope is under a bare `module_function`
    # directive. Methods defined after such a directive become Ruby module
    # methods (callable as `Mod.foo`) and *private* instance methods on
    # includers. For api-compare purposes we record them as classMethods only:
    # the TS port exposes them as module-level exports, and propagating them
    # as instance methods of every `include`r drowns hosts like
    # `Rack::ContentLength` in 30+ phantom misses.
    @module_function_stack = [false]
    # `VALID_OPTIONS`-named symbol arrays per class FQN, expanded when a method
    # body passes the constant to `assert_valid_keys`. See collect_option_keys.
    @const_symbol_arrays = {}
  end

  # Options-hash reads where only the FIRST symbol arg is the key
  # (`options.fetch(:k, default)`).
  OPTION_READER_METHODS = %w[fetch delete key? has_key? include? member?].to_set

  def process_file(filepath, package_root)
    source = File.read(filepath)
    sexp = Ripper.sexp(source)
    return unless sexp

    rel_path = Pathname.new(filepath).relative_path_from(Pathname.new(package_root)).to_s

    # `# :doc:` is Rails' RDoc directive that documents an otherwise-private
    # method as public API (e.g. controller hooks like `cookies`,
    # `verify_authenticity_token`). Collect the names so process_def can
    # override Ruby visibility — without this, RDoc-public-but-Ruby-private
    # methods land in the privates manifest and falsely hide real public
    # surface from website docs / api:compare.
    @current_doc_methods = Set.new
    source.each_line do |line|
      next unless line =~ /^\s*def\s+(?:self\.)?([\w_!?=]+).*#\s*:doc:/
      @current_doc_methods << $1
    end

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
    when :alias
      process_alias(node)
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
    when :method_add_block
      # `CONST.each do |x| … class_eval "def #{x}…" end` enumerable codegen
      # (e.g. relation/query_methods.rb's VALUE_METHODS loop). Falls through to
      # the generic child-walk when it isn't a recognized codegen loop so normal
      # blocks (`included do … end`, `scope :x do … end`) keep working.
      unless process_each_codegen(node)
        node.each { |child| walk(child) if child.is_a?(Array) }
      end
    when :sclass
      process_sclass(node)
    when :assign
      # Handle `CONST = Struct.new(...) do ... end` — methods defined in the
      # block belong to the struct, not to the enclosing module.
      lhs, rhs = node[1], node[2]
      maybe_record_valid_options(lhs, rhs)
      maybe_record_constant(lhs, rhs)
      # Only enter the struct-class path when:
      #   lhs = [:var_field, [:@const, "Name", ...]]
      #   rhs = [:method_add_block, [:method_add_arg, [:call, Struct, ., :new], ...], block]
      #         where the receiver constant resolves to "Struct"
      struct_call = rhs.is_a?(Array) && rhs[0] == :method_add_block && rhs[1]
      struct_receiver = struct_call && struct_call.is_a?(Array) &&
                        struct_call[0] == :method_add_arg && const_name(struct_call[1])
      is_struct_new = struct_receiver == "Struct"
      if lhs.is_a?(Array) && lhs[0] == :var_field &&
         lhs[1].is_a?(Array) && lhs[1][0] == :@const &&
         is_struct_new
        const_name_str = lhs[1][1]
        block = rhs[2]
        body = block.is_a?(Array) && (block[0] == :do_block || block[0] == :brace_block) ? block[2] : nil
        if body
          @namespace_stack.push(const_name_str)
          @visibility_stack.push(:public)
          fqn = current_fqn
          @classes[fqn] ||= new_class_info(const_name_str, fqn)
          @classes[fqn][:superclass] = "Struct"
          walk_body(body)
          @visibility_stack.pop
          @namespace_stack.pop
        else
          node.each { |child| walk(child) if child.is_a?(Array) }
        end
      else
        node.each { |child| walk(child) if child.is_a?(Array) }
      end
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
    @module_function_stack.push(false)

    fqn = current_fqn
    @modules[fqn] ||= new_class_info(name, fqn)

    walk_body(node[2])

    @module_function_stack.pop
    @visibility_stack.pop
    @namespace_stack.pop
  end

  def process_class(node)
    name = const_name(node[1])
    return unless name

    superclass = const_name(node[2]) if node[2]

    @namespace_stack.push(name)
    @visibility_stack.push(:public)
    @module_function_stack.push(false)

    fqn = current_fqn
    @classes[fqn] ||= new_class_info(name, fqn)
    @classes[fqn][:superclass] = superclass if superclass

    walk_body(node[3] || node[2])

    @module_function_stack.pop
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
    vis = :public if @current_doc_methods&.include?(name)

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
    opt_keys = collect_option_keys(body, params, fqn)
    method_info[:option_keys] = opt_keys unless opt_keys.empty?

    if @in_sclass
      target[:classMethods] << method_info
    elsif @module_function_stack.last && @modules[fqn]
      # Inside a module under `module_function`: record as a module method
      # (Mod.foo). The "private instance method on includer" half of Ruby
      # module_function semantics is intentionally not modelled — see
      # @module_function_stack init comment.
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
    vis = :public if @current_doc_methods&.include?(name)

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
    opt_keys = collect_option_keys(body, params, fqn)
    method_info[:option_keys] = opt_keys unless opt_keys.empty?

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
      # No-args form (`private`) flips the default visibility for the scope.
      # Symbol-args form (`private :foo, :bar`) retroactively marks those
      # named methods — without this, methods defined above as public would
      # stay tagged public, causing them to be misclassified.
      if args.nil? || (args.is_a?(Array) && args[0] == :args_new)
        @visibility_stack[-1] = cmd_name.to_sym
      else
        names = extract_symbol_args(args)
        apply_visibility_to_named(names, cmd_name.to_sym) unless names.empty?
      end
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
    when "class_attribute"
      process_mattr(args, reader: true, writer: true, predicate: true, class_attr: true)
    when "cattr_accessor", "mattr_accessor"
      process_mattr(args, reader: true, writer: true, predicate: false, class_attr: false)
    when "cattr_reader", "mattr_reader"
      process_mattr(args, reader: true, writer: false, predicate: false, class_attr: false)
    when "cattr_writer", "mattr_writer"
      process_mattr(args, reader: false, writer: true, predicate: false, class_attr: false)
    when "scope"
      process_scope(args)
    when "delegate"
      process_delegate(args)
    when "define_column_methods"
      process_define_column_methods(args)
    when "module_function"
      process_module_function(args)
    end
  end

  def process_fcall(node)
    cmd_name = ident_name(node[1])
    case cmd_name
    when "private", "protected", "public"
      @visibility_stack[-1] = cmd_name.to_sym
    when "module_function"
      @module_function_stack[-1] = true
    end
  end

  def process_vcall(node)
    cmd_name = ident_name(node[1])
    case cmd_name
    when "private", "protected", "public"
      @visibility_stack[-1] = cmd_name.to_sym
    when "module_function"
      @module_function_stack[-1] = true
    end
  end

  def process_method_add_arg(node)
    # Handle things like: private(def ...) or public(:method_name)
    if node[1].is_a?(Array) && node[1][0] == :fcall
      cmd_name = ident_name(node[1][1])
      case cmd_name
      when "private", "protected", "public"
        # Either inline `private def foo; end` (recurse so the def is
        # visited under the adjusted visibility) or the paren symbol form
        # `private(:foo, :bar)` which retroactively marks named methods.
        args = node[2]
        names = args.is_a?(Array) ? extract_symbol_args_from_paren(args) : []
        if names.empty?
          prev_vis = @visibility_stack[-1]
          @visibility_stack[-1] = cmd_name.to_sym
          walk(args) if args.is_a?(Array)
          @visibility_stack[-1] = prev_vis
        else
          apply_visibility_to_named(names, cmd_name.to_sym)
        end
      when "attr_reader", "attr_writer", "attr_accessor"
        process_attr_from_arg_paren(node[2], cmd_name)
      when "include"
        process_include_from_arg_paren(node[2])
      when "extend"
        process_extend_from_arg_paren(node[2])
      when "scope"
        process_scope_from_arg_paren(node[2])
      when "class_attribute"
        process_mattr(node[2], reader: true, writer: true, predicate: true, class_attr: true)
      when "cattr_accessor", "mattr_accessor"
        process_mattr(node[2], reader: true, writer: true, predicate: false, class_attr: false)
      when "cattr_reader", "mattr_reader"
        process_mattr(node[2], reader: true, writer: false, predicate: false, class_attr: false)
      when "cattr_writer", "mattr_writer"
        process_mattr(node[2], reader: false, writer: true, predicate: false, class_attr: false)
      when "delegate"
        process_delegate(node[2])
      when "module_function"
        process_module_function(node[2])
      end
    else
      walk(node[1]) if node[1].is_a?(Array)
      walk(node[2]) if node[2].is_a?(Array)
    end
  end

  # Handle `module_function` with arguments: `module_function :foo, :bar`
  # retroactively moves named instance methods to classMethods. Bare
  # `module_function` (no args) is handled in process_fcall/process_vcall
  # via @module_function_stack.
  def process_module_function(args)
    if args.nil? || (args.is_a?(Array) && args[0] == :args_new)
      @module_function_stack[-1] = true
      return
    end
    names = extract_symbol_args(args)
    return if names.empty?
    fqn = current_fqn
    target = @modules[fqn]
    return unless target
    moved, kept = target[:instanceMethods].partition { |m| names.include?(m[:name]) }
    target[:instanceMethods] = kept
    target[:classMethods].concat(moved)
  end

  def apply_visibility_to_named(names, vis)
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    bucket = @in_sclass ? :classMethods : :instanceMethods
    target[bucket].each do |m|
      m[:visibility] = vis.to_s if names.include?(m[:name])
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
    # `class << self; attr_accessor :foo; end` declares singleton accessors;
    # without bucketing into classMethods these would leak as instance methods
    # of every includer.
    bucket = @in_sclass ? :classMethods : :instanceMethods
    names.each do |name|
      if kind == :reader || kind == :accessor
        target[bucket] << {
          name: name,
          visibility: vis.to_s,
          params: [],
          file: @current_file,
        }
      end
      if kind == :writer || kind == :accessor
        target[bucket] << {
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
    bucket = @in_sclass ? :classMethods : :instanceMethods
    names.each do |name|
      if kind == :reader || kind == :accessor
        target[bucket] << {
          name: name,
          visibility: vis.to_s,
          params: [],
          file: @current_file,
        }
      end
      if kind == :writer || kind == :accessor
        target[bucket] << {
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

  # Bare `alias new old` keyword (distinct from the `alias_method` command,
  # which is handled above). Ripper emits `[:alias, new_node, old_node]`;
  # record the new name as a method, like a one-off `alias_method`.
  def process_alias(node)
    new_name = symbol_name(node[1])
    return unless new_name

    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    bucket = @in_sclass ? :classMethods : :instanceMethods
    target[bucket] << {
      name: new_name,
      visibility: current_visibility.to_s,
      params: [],
      file: @current_file,
      notes: "alias",
    }
    maybe_update_module_file(fqn, target)
  end

  # `class_attribute`/`cattr_accessor`/`mattr_accessor` (and their reader/writer
  # variants) metaprogram reader/writer/predicate accessors at both the class
  # and instance level. The static `def` walker can't see them, so their TS
  # ports (`partialInserts`, `defaultShard`, …) look novel without this. The
  # generated NAMES come from the leading positional symbols only
  # (`leading_symbol_args` stops at the options hash, so `default: :foo` is
  # never a method name); the options hash's `instance_*:` flags gate the
  # instance-level accessors. The two macro families gate differently, so the
  # rules below mirror each Rails source exactly:
  #
  # - class_attribute (activesupport core_ext/class/attribute.rb): class reader
  #   & writer always; class `?` only `if instance_predicate`; instance reader
  #   & writer default to `instance_accessor` (so `instance_accessor: false,
  #   instance_reader: true` still yields the instance reader); instance `?`
  #   only `if instance_predicate && instance_reader`. No predicate option ⇒
  #   predicate defaults true.
  # - cattr/mattr (activesupport core_ext/module/attribute_accessors.rb): class
  #   reader/writer always; instance reader/writer only when BOTH
  #   `instance_<x>` and `instance_accessor` are truthy (AND, both default
  #   true); no predicate.
  #
  # All generated methods are public — class_attribute defines them via a fresh
  # `class_eval` string, and mattr/cattr document them as public "even if this
  # method is called with a private or protected access modifier" — so the
  # enclosing visibility is intentionally ignored.
  #
  # NOT modeled: class_attribute inside `class << self` (attribute.rb:106-108
  # concats the delegators into `methods` unconditionally, so the instance
  # reader/writer are always emitted and ignore the `instance_*:` options). No
  # such call exists in the vendored lib, so the @in_sclass bucketing below is
  # faithful in practice.
  def process_mattr(args, reader:, writer:, predicate:, class_attr:)
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    ia = option_bool(args, "instance_accessor")
    ia_val = ia.nil? ? true : ia
    ir = option_bool(args, "instance_reader")
    iw = option_bool(args, "instance_writer")

    if class_attr
      inst_reader = ir.nil? ? ia_val : ir
      inst_writer = iw.nil? ? ia_val : iw
      class_pred = predicate && option_bool(args, "instance_predicate") != false
      inst_pred = class_pred && inst_reader
    else
      inst_reader = (ir != false) && ia_val
      inst_writer = (iw != false) && ia_val
      class_pred = false
      inst_pred = false
    end

    leading_symbol_args(args).each do |name|
      add_mattr_accessor(target, "#{name}", reader, reader && inst_reader, [])
      add_mattr_accessor(target, "#{name}=", writer, writer && inst_writer,
                         [{ name: "value", kind: "required" }])
      add_mattr_accessor(target, "#{name}?", class_pred, inst_pred, [])
    end
    maybe_update_module_file(fqn, target)
  end

  def add_mattr_accessor(target, method_name, on_class, on_instance, params)
    return unless on_class || on_instance
    info = {
      name: method_name,
      visibility: "public",
      params: params,
      file: @current_file,
      notes: "class_attribute",
    }
    target[:classMethods] << info if on_class
    target[:instanceMethods] << info.dup if on_instance
  end

  # Boolean value of a trailing-options-hash key (`instance_writer: false`),
  # or nil when the key is absent or not a literal true/false.
  def option_bool(args, key)
    list = positional_arg_list(args)
    return nil unless list.is_a?(Array)
    list.each do |el|
      next unless el.is_a?(Array) && el[0] == :bare_assoc_hash
      (el[1] || []).each do |assoc|
        next unless assoc.is_a?(Array) && assoc[0] == :assoc_new &&
                    assoc[1].is_a?(Array) && assoc[1][0] == :@label &&
                    assoc[1][1] == "#{key}:"
        v = assoc[2]
        if v.is_a?(Array) && v[0] == :var_ref && v[1].is_a?(Array) && v[1][0] == :@kw
          return v[1][1] == "true"
        end
        return nil
      end
    end
    nil
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

  # `delegate :a, :b, to: :all` generates instance methods `a`/`b` that forward
  # to the target. The leading positional symbols are the generated methods; a
  # leading splat of a symbol-array constant (`delegate(*QUERYING_METHODS, to:
  # :all)`) is expanded via @const_symbol_arrays. Only `… to:` forms are
  # recorded — that's the static-resolvable surface (`delegate_missing_to` and
  # dynamic targets are skipped). `prefix:` (renames to `prefix_method`) and
  # `private:` are NOT modeled — both appear only in doc comments across the
  # vendored lib, so recording bare public names is faithful in practice.
  def process_delegate(args)
    list = positional_arg_list(args)
    names = []
    has_to = false

    visit = lambda do |node|
      return unless node.is_a?(Array)
      case node[0]
      when :symbol_literal, :dyna_symbol
        nm = symbol_name(node)
        names << nm if nm
      when :bare_assoc_hash
        has_to = true if assoc_has_key?(node, "to:")
      when :args_add_star
        # [:args_add_star, before_list, star_arg, *after_args]
        node[1].each { |e| visit.call(e) } if node[1].is_a?(Array)
        star = node[2]
        if star.is_a?(Array) && star[0] == :var_ref &&
           star[1].is_a?(Array) && star[1][0] == :@const
          (@const_symbol_arrays.dig(current_fqn, star[1][1]) || []).each { |s| names << s }
        end
        node[3..].each { |e| visit.call(e) }
      end
    end

    if list.is_a?(Array) && list[0] == :args_add_star
      visit.call(list)
    elsif list.is_a?(Array)
      list.each { |el| visit.call(el) }
    end

    return unless has_to
    return if names.empty?

    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    bucket = @in_sclass ? :classMethods : :instanceMethods
    names.each do |name|
      target[bucket] << {
        name: name,
        visibility: "public",
        params: [],
        file: @current_file,
        notes: "delegate",
      }
    end
    maybe_update_module_file(fqn, target)
  end

  # `define_column_methods :integer, :string, …` (connection_adapters schema
  # definitions) defines one PUBLIC instance method per symbol on the enclosing
  # `ColumnMethods` module via `module_eval "def #{type}(*names, **options) …"`.
  # The symbols ARE the generated method names (no suffix) — this is the column
  # DSL (`t.integer`, `t.json`) that the static extractor can't otherwise see.
  # See RFC 0025 `extractor-capture-enumerable-metaprogrammed-surface`.
  def process_define_column_methods(args)
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    names = extract_symbol_args(args)
    return if names.empty?

    params = [
      { name: "names", kind: "rest" },
      { name: "options", kind: "keyword_rest" },
    ]
    names.each do |name|
      target[:instanceMethods] << {
        name: name,
        visibility: "public",
        params: params,
        file: @current_file,
        notes: "define_column_methods",
      }
    end
    maybe_update_module_file(fqn, target)
  end

  # Models the enumerable `class_eval`/`define_method` codegen loop
  #
  #   Relation::VALUE_METHODS.each do |name|
  #     method_name, _ =
  #       case name
  #       when *Relation::MULTI_VALUE_METHODS  then ["#{name}_values", …]
  #       when *Relation::SINGLE_VALUE_METHODS then ["#{name}_value", …]
  #       when *Relation::CLAUSE_METHODS       then ["#{name}_clause", …]
  #       end
  #     class_eval "def #{method_name}; end; def #{method_name}=(v); end"
  #   end
  #
  # (relation/query_methods.rb:162). The per-element `_value`/`_values`/`_clause`
  # suffix is chosen by a `case` over symbol-array constants defined in a DIFFERENT
  # file (relation.rb) — resolved here via @const_symbol_arrays, which persists
  # across files. Emits the generated reader (and `=` writer, when the template
  # has one) per member. Returns true when it consumed the node.
  def process_each_codegen(node)
    call = node[1]
    return false unless call.is_a?(Array) && call[0] == :call
    return false unless ident_name(call[3]) == "each"

    block = node[2]
    return false unless block.is_a?(Array) &&
                        [:do_block, :brace_block].include?(block[0])
    loop_var = block_param_name(block)
    return false unless loop_var
    # Both `do_block` and `brace_block` carry the body in slot 2 (a `bodystmt`
    # for `do … end`, a plain stmts list for `{ … }`); the recursive visitors
    # below handle either shape.
    body = block[2]

    # Local assigned from the `case` (the class_eval template interpolates it).
    name_local, suffix_map = codegen_name_mapping(body, loop_var)
    return false unless name_local && !suffix_map.empty?

    forms = codegen_def_forms(body, name_local)
    return false if forms.empty?

    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return false unless target

    suffix_map.each do |members, suffix|
      members.each do |member|
        base = "#{member}#{suffix}"
        forms.each do |form|
          method_name = form == :writer ? "#{base}=" : base
          target[:instanceMethods] << {
            name: method_name,
            visibility: "public",
            params: form == :writer ? [{ name: "value", kind: "required" }] : [],
            file: @current_file,
            notes: "class_eval",
          }
        end
      end
    end
    maybe_update_module_file(fqn, target)
    true
  end

  # The block param of a `do`/`{}` block: `[:block_var, [:params, [[:@ident…]]…]]`.
  def block_param_name(block)
    block_var = block[1]
    return nil unless block_var.is_a?(Array) && block_var[0] == :block_var
    params = block_var[1]
    return nil unless params.is_a?(Array) && params[0] == :params
    required = params[1]
    return nil unless required.is_a?(Array) && required[0]
    ident_name(required[0])
  end

  # Find the loop's `<local> = case <loop_var> when *CONST then ["#{loop_var}SUF"…]`
  # assignment. Returns [local_name, [[members, suffix], …]] resolving each
  # `when *CONST` to its symbol members and the literal suffix that follows the
  # `#{loop_var}` interpolation. Both `massign` (`a, b = case…`) and single
  # `assign` are supported.
  def codegen_name_mapping(body, loop_var)
    assign = find_codegen_assign(body)
    return [nil, []] unless assign

    local, rhs = assign
    return [nil, []] unless rhs.is_a?(Array) && rhs[0] == :case

    pairs = []
    when_node = rhs[2]
    while when_node.is_a?(Array) && when_node[0] == :when
      members = when_star_members(when_node[1])
      suffix = when_branch_suffix(when_node[2], loop_var)
      pairs << [members, suffix] if members && !members.empty? && suffix
      when_node = when_node[3]
    end
    [local, pairs]
  end

  # Locate the first `massign`/`assign` whose RHS is a `case`; return
  # [first_lhs_local_name, case_node].
  def find_codegen_assign(body)
    result = nil
    visit = lambda do |n|
      return if result || !n.is_a?(Array)
      if n[0] == :massign || n[0] == :assign
        local = first_assign_local(n[1])
        result = [local, n[2]] if local && n[2].is_a?(Array) && n[2][0] == :case
        return if result
      end
      n.each { |c| visit.call(c) if c.is_a?(Array) }
    end
    visit.call(body)
    result
  end

  # First var-field ident from an `massign` lhs list or a single `assign` lhs.
  def first_assign_local(lhs)
    node = lhs
    node = node[0] if node.is_a?(Array) && node[0].is_a?(Array) # massign list
    return nil unless node.is_a?(Array) && node[0] == :var_field
    ident_name(node[1])
  end

  # Members of a `when *CONST` guard: `[:args_add_star, [], const_ref]`.
  def when_star_members(guard)
    return nil unless guard.is_a?(Array) && guard[0] == :args_add_star
    resolve_const_symbol_array(guard[2])
  end

  # The literal suffix after the `#{loop_var}` interpolation in a branch's first
  # array element, e.g. `["#{name}_values", …]` → `"_values"`.
  def when_branch_suffix(branch_body, loop_var)
    return nil unless branch_body.is_a?(Array)
    first = branch_body[0]
    return nil unless first.is_a?(Array) && first[0] == :array
    elems = first[1]
    return nil unless elems.is_a?(Array) && elems[0].is_a?(Array)
    str = elems[0]
    return nil unless str[0] == :string_literal
    content = str[1]
    return nil unless content.is_a?(Array) && content[0] == :string_content
    parts = content[1..]
    # Expect `[:string_embexpr [loop_var]]` then `[:@tstring_content, suffix]`.
    embexpr = parts.find do |p|
      p.is_a?(Array) && p[0] == :string_embexpr && embexpr_var(p) == loop_var
    end
    return nil unless embexpr
    idx = parts.index(embexpr)
    tail = parts[idx + 1]
    return nil unless tail.is_a?(Array) && tail[0] == :@tstring_content
    tail[1]
  end

  def embexpr_var(node)
    inner = node[1]
    return nil unless inner.is_a?(Array) && inner[0].is_a?(Array)
    ref = inner[0]
    ref.is_a?(Array) && ref[0] == :var_ref ? ident_name(ref[1]) : nil
  end

  # Which `def` forms the class_eval/module_eval template defines relative to the
  # interpolated `name_local`: `:reader` (`def #{name_local}`) and/or `:writer`
  # (`def #{name_local}=`). Reconstructs the template, replacing each
  # `#{name_local}` with a sentinel, then scans for `def <sentinel>` occurrences.
  # The sentinel is NUL (never present in Ruby source), so the `\s+` in the scan
  # can't ambiguously consume it the way a whitespace marker could.
  SENTINEL = " "
  def codegen_def_forms(body, name_local)
    template = codegen_template(body, name_local)
    return [] unless template
    forms = []
    template.scan(/\bdef\s+#{SENTINEL}(=?)/) do |writer|
      forms << (writer[0] == "=" ? :writer : :reader)
    end
    forms.uniq
  end

  # Reconstruct the first `class_eval`/`module_eval` string template, substituting
  # `#{name_local}` interpolations with SENTINEL and dropping other interpolations.
  def codegen_template(body, name_local)
    str_node = nil
    visit = lambda do |n|
      return if str_node || !n.is_a?(Array)
      if [:command, :method_add_arg].include?(n[0])
        meth = n[0] == :command ? ident_name(n[1]) : nil
        if n[0] == :method_add_arg && n[1].is_a?(Array) && n[1][0] == :fcall
          meth = ident_name(n[1][1])
        end
        if %w[class_eval module_eval].include?(meth)
          str_node = first_string_literal(n[0] == :command ? n[2] : n[2])
          return if str_node
        end
      end
      n.each { |c| visit.call(c) if c.is_a?(Array) }
    end
    visit.call(body)
    return nil unless str_node

    content = str_node[1]
    return nil unless content.is_a?(Array) && content[0] == :string_content
    out = +""
    content[1..].each do |part|
      next unless part.is_a?(Array)
      case part[0]
      when :@tstring_content
        out << part[1]
      when :string_embexpr
        out << SENTINEL if embexpr_var(part) == name_local
      end
    end
    out
  end

  def first_string_literal(args)
    found = nil
    visit = lambda do |n|
      return if found || !n.is_a?(Array)
      if n[0] == :string_literal
        found = n
        return
      end
      n.each { |c| visit.call(c) if c.is_a?(Array) }
    end
    visit.call(args)
    found
  end

  # Resolve a constant reference (`Relation::MULTI_VALUE_METHODS` or a bare
  # `CONST`) to its recorded pure-symbol-array members, searching @const_symbol_arrays
  # (which spans files) by matching the container path against stored FQNs.
  def resolve_const_symbol_array(node)
    name = const_name(node)
    return nil unless name
    parts = name.split("::")
    const = parts.last
    container = parts[0...-1].join("::")
    @const_symbol_arrays.each do |fqn, consts|
      next unless consts.key?(const)
      next unless container.empty? || fqn == container || fqn.end_with?("::#{container}")
      return consts[const]
    end
    nil
  end

  # Positional arg list with `arg_paren`/`args_add_block` wrappers peeled off.
  # Returns either the raw Array of arg nodes or an `[:args_add_star, …]` node.
  def positional_arg_list(args)
    node = args
    node = node[1] if node.is_a?(Array) && node[0] == :arg_paren
    node = node[1] if node.is_a?(Array) && node[0] == :args_add_block
    node
  end

  # Symbol args appearing BEFORE the first options hash. `class_attribute :foo,
  # default: :bar` must yield only `[:foo]`, not the `:bar` default value.
  def leading_symbol_args(args)
    list = positional_arg_list(args)
    return [] unless list.is_a?(Array)
    names = []
    list.each do |el|
      break if el.is_a?(Array) && el[0] == :bare_assoc_hash
      next unless el.is_a?(Array) && [:symbol_literal, :dyna_symbol].include?(el[0])
      nm = symbol_name(el)
      names << nm if nm
    end
    names
  end

  def assoc_has_key?(hash_node, label)
    assocs = hash_node[1]
    return false unless assocs.is_a?(Array)
    assocs.any? do |a|
      a.is_a?(Array) && a[0] == :assoc_new &&
        a[1].is_a?(Array) && a[1][0] == :@label && a[1][1] == label
    end
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

  # Record a `VALID_OPTIONS`-named symbol array so a later
  # `assert_valid_keys(VALID_OPTIONS)` can expand it. Handles `[...].freeze`.
  # Source-order dependent: a method defined BEFORE the constant won't see it
  # (the AST is walked top-to-bottom). Ruby places class-scope constants above
  # methods by convention, so this only ever causes a silent miss (consistent
  # with the under-approximation the whole option-key heuristic accepts).
  def maybe_record_valid_options(lhs, rhs)
    return unless lhs.is_a?(Array) && lhs[0] == :var_field
    const = lhs[1]
    return unless const.is_a?(Array) && const[0] == :@const
    return unless rhs.is_a?(Array)
    # `*VALID_OPTIONS` (assert_valid_keys expansion) records via a loose
    # symbol traverse; a pure symbol-array constant (e.g. `QUERYING_METHODS`)
    # additionally feeds `delegate(*CONST, to:)` expansion. Limit the general
    # case to pure symbol arrays so a hash/struct constant can't inject
    # phantom delegate targets.
    unless const[1].include?("VALID_OPTIONS") || pure_symbol_array?(unwrap_freeze(rhs))
      return
    end
    syms = []
    traverse_for_symbols(rhs, syms)
    return if syms.empty?
    (@const_symbol_arrays[current_fqn] ||= {})[const[1]] = syms
  end

  # `[:a, :b, :c]` (optionally `.freeze`d) with every element a literal symbol.
  def pure_symbol_array?(node)
    return false unless node.is_a?(Array) && node[0] == :array
    elems = node[1]
    return false unless elems.is_a?(Array) && !elems.empty?
    elems.all? { |e| e.is_a?(Array) && [:symbol_literal, :dyna_symbol].include?(e[0]) }
  end

  # Record a constant with a literal RHS, keyed file → NAME (unwrapping `.freeze`).
  def maybe_record_constant(lhs, rhs)
    return unless lhs.is_a?(Array) && lhs[0] == :var_field
    const = lhs[1]
    return unless const.is_a?(Array) && const[0] == :@const
    rhs = unwrap_freeze(rhs)
    lit = literal_value(rhs)
    return if lit.nil? || lit[:kind] == "expr"
    (@file_constants[@current_file] ||= {})[const[1]] = lit
  end

  def unwrap_freeze(node) # `[...].freeze` → receiver node; otherwise unchanged
    return node unless node.is_a?(Array)
    # No-paren `.freeze` parses as `[:call, recv, ., freeze]`; the paren form
    # `.freeze()` wraps that call in `[:method_add_arg, call, args]`.
    call = node[0] == :method_add_arg ? node[1] : node
    return node unless call.is_a?(Array) && call[0] == :call
    ident_name(call[3]) == "freeze" ? call[1] : node
  end

  # Advisory option-key collection (see options-keys.ts): the sorted, deduped
  # symbol keys read off an `options`/`opts`/`**kwargs` param in the body. An
  # UNDER-approximation — dynamic access and keys consumed in callees are missed.
  def collect_option_keys(body, params, fqn)
    vars = option_var_names(params)
    return [] if vars.empty?
    keys = []
    consts = @const_symbol_arrays[fqn] || {}
    walk_for_option_keys(body, vars, consts, keys)
    keys.uniq.sort
  end

  def option_var_names(params)
    names = Set.new
    (params || []).each do |p|
      if %w[options opts].include?(p[:name])
        names << p[:name]
      elsif p[:kind] == "keyword_rest" && p[:name] != "**"
        names << p[:name]
      end
    end
    names
  end

  def walk_for_option_keys(node, vars, consts, keys)
    return unless node.is_a?(Array)
    case node[0]
    when :aref
      # options[:foo]
      traverse_for_symbols(node[2], keys) if option_var?(node[1], vars)
    when :method_add_arg, :command_call
      # `options.fetch(:k)` (parens) and `options.assert_valid_keys :a` (no
      # parens). A bare `:call` (`options.keys`) never carries a key arg.
      handle_option_call(node, vars, consts, keys)
    end
    node.each { |child| walk_for_option_keys(child, vars, consts, keys) if child.is_a?(Array) }
  end

  def handle_option_call(node, vars, consts, keys)
    case node[0]
    when :method_add_arg
      inner = node[1]
      return unless inner.is_a?(Array) && inner[0] == :call
      recv = inner[1]
      meth = ident_name(inner[3])
      args = node[2]
    when :command_call
      recv = node[1]
      meth = ident_name(node[3])
      args = node[4]
    else
      return
    end
    return unless meth && option_var?(recv, vars)

    if meth == "assert_valid_keys"
      traverse_for_symbols(args, keys)
      const_refs = []
      traverse_for_consts(args, const_refs)
      const_refs.each { |c| (consts[c] || []).each { |s| keys << s } }
    elsif OPTION_READER_METHODS.include?(meth)
      syms = []
      traverse_for_symbols(args, syms)
      keys << syms.first if syms.first
    end
  end

  def option_var?(node, vars)
    return false unless node.is_a?(Array) && node[0] == :var_ref
    id = ident_name(node[1])
    !id.nil? && vars.include?(id)
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
  # Validate per-package paths (the JSON manifest may include paths the user
  # hasn't fetched yet, e.g. a fresh checkout that skipped pnpm vendor:fetch).
  PACKAGE_DIRS.each do |pkg, dir|
    next if File.directory?(dir)
    abort "Lib directory for #{pkg} not found at #{dir}. Run `pnpm vendor:fetch` first."
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

    # Normalize into the JSON shape. Non-public methods are kept (tagged
    # `internal: true`) so consumers can opt into private-API coverage.
    classes = {}
    extractor.classes.each do |fqn, info|
      classes[fqn] = normalize_class_info(info)
    end

    modules = {}
    extractor.modules.each do |fqn, info|
      modules[fqn] = normalize_class_info(info)
    end

    manifest[:packages][pkg_name] = {
      classes: classes,
      modules: modules,
      fileConstants: extractor.file_constants,
    }
  end

  # Print summary
  manifest[:packages].each do |pkg, data|
    class_count = data[:classes].length
    module_count = data[:modules].length
    all_methods = data[:classes].values.flat_map { |c| c[:instanceMethods] + c[:classMethods] } +
                  data[:modules].values.flat_map { |m| m[:instanceMethods] + m[:classMethods] }
    internal_count = all_methods.count { |m| m[:internal] }
    public_count = all_methods.length - internal_count
    puts "  #{pkg}: #{class_count} classes, #{module_count} modules, " \
         "#{public_count} public methods (#{internal_count} internal)"
  end

  output_path = File.join(OUTPUT_DIR, "rails-api.json")
  File.write(output_path, JSON.pretty_generate(manifest))
  puts "\nWritten to #{output_path}"
end

def tag_internal(methods)
  methods.map do |m|
    if m[:visibility] == "public"
      m
    else
      m.merge(internal: true)
    end
  end
end

def normalize_class_info(info)
  {
    name: info[:name],
    fqn: info[:fqn],
    superclass: info[:superclass],
    file: info[:file],
    includes: info[:includes].uniq,
    extends: info[:extends].uniq,
    instanceMethods: tag_internal(info[:instanceMethods]),
    classMethods: tag_internal(info[:classMethods]),
  }
end

run
