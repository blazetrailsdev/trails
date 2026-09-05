#!/usr/bin/env ruby
# frozen_string_literal: true

# Extracts the public API surface from Rails source using Ripper.
# Outputs output/rails-api.json

require "ripper"
require "json"
require "pathname"
require "time"
require "set"
require "digest"
require "date"

SCRIPT_DIR = File.dirname(__FILE__)
OUTPUT_DIR = File.join(SCRIPT_DIR, "output")

# Content hash of this extractor, stamped into every manifest header
# (`extractorHash`). The cross-version drift report (drift.ts) compares the
# pinned base and the freshly-extracted target on this value; a mismatch means
# the two were built by different extractor versions, so their diff would
# conflate extractor-version drift with real Rails drift. Content-keyed (not
# mtime) so it's stable across worktrees and re-clones.
EXTRACTOR_HASH = Digest::SHA256.hexdigest(File.read(__FILE__))[0, 16]

# PACKAGE_DIRS is fed by the caller via LIB_PATHS_JSON (a JSON map of
# {package_name: absolute_lib_dir}) — built from vendor/sources.ts by
# `vendor/fetch.ts --print-lib-paths`. This Ruby script no longer carries
# a parallel package table that drifts from the registry; adding a source
# with compareApi !== false in vendor/sources.ts feeds through automatically.
# The env-dependent setup and the auto-run at the bottom are guarded by
# `__FILE__ == $PROGRAM_NAME` so the file can be `require`d from a unit test
# (extract-ruby-api.test.ts) to exercise ApiExtractor directly without the
# LIB_PATHS_JSON/LOCKFILE_PATH env vars or kicking off a full manifest build.
if __FILE__ == $PROGRAM_NAME
  LIB_PATHS_JSON = ENV.fetch("LIB_PATHS_JSON") do
    abort "extract-ruby-api.rb: LIB_PATHS_JSON env var not set. Caller must export " \
          "it via `LIB_PATHS_JSON=$(pnpm --silent vendor:fetch --print-lib-paths)`."
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
            "If you set it manually, re-run via `LIB_PATHS_JSON=$(pnpm --silent vendor:fetch --print-lib-paths)`."
    end

  # A package's top-level entry file (`activerecord/lib/arel.rb`), declared by
  # `libEntryFile` in vendor/sources.ts and fed here the same way PACKAGE_DIRS
  # is. `libPath` names a DIRECTORY, so the gem's own entry file sits outside
  # the `**/*.rb` glob and is invisible without this (RFC 0126). Optional: a
  # package that declares none simply has no entry.
  PACKAGE_ENTRY_FILES =
    begin
      parsed = JSON.parse(ENV.fetch("LIB_ENTRY_FILES_JSON", "{}"))
      unless parsed.is_a?(Hash) && parsed.values.all? { |v| v.is_a?(String) }
        abort "extract-ruby-api.rb: LIB_ENTRY_FILES_JSON must be a JSON object of " \
              "{string: string}; got #{parsed.class}. Re-run vendor:fetch --print-lib-entry-files."
      end
      parsed
    rescue JSON::ParserError => e
      abort "extract-ruby-api.rb: LIB_ENTRY_FILES_JSON is not valid JSON (#{e.message}). " \
            "If you set it manually, re-run via `LIB_ENTRY_FILES_JSON=$(pnpm --silent vendor:fetch --print-lib-entry-files)`."
    end

  # Cache gate: invalidate on (a) a re-fetch (lockfile mtime bumped), (b) a
  # registry edit (sources.ts mtime bumped — covers compareApi flips, libPath
  # edits, source add/remove), or (c) an extractor edit (this script's mtime
  # bumped — a `git pull` that changes the output shape, e.g. emitting new param
  # kinds, sets its mtime past a stale manifest). This is the Ruby counterpart of
  # the TS extractor's SCHEMA_VERSION bump. The output is current only when it's
  # newer than ALL THREE signals; `API_COMPARE_FORCE=1` always regenerates.
  #
  # RUBY_API_OUTPUT_PATH overrides the destination (the cross-version drift
  # report, drift.ts, writes output/rails-api@<ref>.json for an off-pin ref).
  # A custom destination always regenerates — its mtime can't be reasoned about
  # against the canonical lockfile — so the gate is skipped when it's set.
  output_path = ENV.fetch("RUBY_API_OUTPUT_PATH", File.join(OUTPUT_DIR, "rails-api.json"))
  lockfile_path = ENV.fetch("LOCKFILE_PATH") do
    abort "extract-ruby-api.rb: LOCKFILE_PATH env var not set. Caller must export " \
          "it (e.g. LOCKFILE_PATH=\"$ROOT/vendor/sources.lock.json\")."
  end
  sources_ts_path = File.join(File.dirname(lockfile_path), "sources.ts")
  if !ENV.key?("RUBY_API_OUTPUT_PATH") && ENV["API_COMPARE_FORCE"] != "1" && File.exist?(output_path) &&
     File.exist?(lockfile_path) && File.exist?(sources_ts_path) &&
     File.mtime(output_path) >= File.mtime(lockfile_path) &&
     File.mtime(output_path) >= File.mtime(sources_ts_path) &&
     File.mtime(output_path) >= File.mtime(__FILE__)
    puts "Rails manifest #{output_path} is up to date (set API_COMPARE_FORCE=1 to regenerate)"
    exit 0
  end
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

# Names a body tests against the Symbol class — `Symbol === format`,
# `format.is_a?(Symbol)`, `format.kind_of?(Symbol)`. A Symbol default on such a
# param is a discriminator: the Symbol branch is control flow the port has to
# keep, so its TS spelling must carry the leading colon (CLAUDE.md, "Symbols vs
# strings"). See I18n::Backend::Base#localize, i18n/lib/i18n/backend/base.rb:83.
def symbol_discriminated_names(node, names = [])
  return names unless node.is_a?(Array)
  if node[0] == :binary && node[2] == :=== && const_name(node[1]) == "Symbol"
    nm = node[3].is_a?(Array) && node[3][0] == :var_ref ? ident_name(node[3][1]) : nil
    names << nm if nm
  end
  if node[0] == :method_add_arg
    call = node[1]
    meth = call.is_a?(Array) && call[0] == :call ? ident_name(call[3]) : nil
    if %w[is_a? kind_of?].include?(meth) && arg_const_names(node[2]).include?("Symbol")
      recv = call[1]
      nm = recv.is_a?(Array) && recv[0] == :var_ref ? ident_name(recv[1]) : nil
      names << nm if nm
    end
  end
  node.each { |child| symbol_discriminated_names(child, names) }
  names
end

def mark_symbol_discriminated(params, body)
  names = symbol_discriminated_names(body)
  return if names.empty?
  params.each { |p| p[:symbolDiscriminated] = true if names.include?(p[:name]) }
end

def const_name(node)
  return nil unless node.is_a?(Array)
  return node[1] if node[0] == :@const
  node[0] == :var_ref ? const_name(node[1]) : nil
end

def arg_const_names(args)
  return [] unless args.is_a?(Array)
  args.flat_map { |child| child.is_a?(Array) ? [const_name(child)] + arg_const_names(child) : [] }.compact
end

# Normalized body digest for source-hash pinning (RFC 0025). Hashes the def
# BODY sexp only (not the surrounding class), with scanner-token positions
# stripped, so the digest is insensitive to indentation, blank lines, and
# comments (Ripper.sexp already drops comments and whitespace — only the
# `[lineno, column]` position tuples encode layout). A change to the code the
# body actually runs changes the digest; pure formatting/comment churn does
# not. See body-pins.ts / lint-body-pins.ts for the pin lifecycle.
def strip_sexp_positions(node)
  return node unless node.is_a?(Array)
  # Scanner-token position tuple: [Integer, Integer]. Replace with a stable
  # placeholder so its removal can't collapse two structurally distinct sexps.
  return :_pos if node.length == 2 && node[0].is_a?(Integer) && node[1].is_a?(Integer)
  node.map { |child| strip_sexp_positions(child) }
end

def body_digest(body)
  return nil if body.nil?
  Digest::SHA256.hexdigest(strip_sexp_positions(body).inspect)[0, 16]
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

# Packages whose umbrella file (`<libPath>.rb`) defines real methods rather than
# only requires, autoloads and module-level config, and so must be walked in
# full instead of harvested for singleton config alone.
#
# `vendor/i18n/lib/i18n.rb` is where `I18n::Base` — the gem's whole public
# facade — is actually defined: 19 `def`s plus 3 aliases. The config-only scan
# sees only the aliases, so the ported facade is measured against a denominator
# of 3. Rails' umbrella files stay on the config-only path: `active_record.rb`
# and its siblings are autoload manifests whose only method bodies are
# `def self.` boot helpers no trails file ports, and walking them attributes
# those to the umbrella module's junk-drawer entity file as false-missing.
#
# `activerecord/lib/arel.rb` is the same shape as i18n's: `Arel.sql`,
# `Arel.star`, `Arel.arel_node?` and `Arel.fetch_attribute` are defined there
# and ported in `packages/arel/src/arel.ts`, so the config-only scan leaves
# arel.ts scored as having no Rails counterpart at all.
#
# Both are now declared as `libEntryFile` in vendor/sources.ts and walked as
# ordinary package files instead — which is also what gives them a sane
# `file:` (`arel.rb`, not the umbrella scan's `../arel.rb`, which maps to no TS
# file at all). The umbrella path keeps handling the config-only Rails
# framework entry files.

# ---- AST walker ----

class ApiExtractor
  attr_reader :classes, :modules, :file_constants, :file_hash_keys

  def initialize
    @in_on_load = 0
    @classes = {}
    @modules = {}
    # rel_path → { CONST_NAME => literal_value }. Non-literal RHSs (hashes with
    # content, regexps, procs, `Struct.new`) are recorded as {kind: "expr"} so
    # the map is a complete declared-constant *name* index for extra-surface
    # scoring; the literal-value diff (compare.ts) skips "expr" on either side.
    @file_constants = {}
    # rel_path → Set of constant names whose RHS is an Array or Hash LITERAL,
    # whatever its elements are (see collection_constant_receiver?).
    @file_collection_constants = {}
    # rel_path → Set of constant names whose RHS is a Hash LITERAL — the Hash
    # half of @file_collection_constants, which conflates the two (see
    # receiver_kind: `MIME_TYPES.fetch` is provably `Hash#fetch`).
    @file_hash_constants = {}
    # rel_path → Set of Ruby Hash KEY names declared in that file: the literal
    # keys of a Hash-constant assignment (`PARSING`, xml_mini.rb:67-88) and the
    # Symbol keys an options hash is read by in a method body (`@options.fetch(
    # :escape_html_entities, …)`, json/encoding.rb:62). A key is a Ruby-side
    # NAME even though it is not a declaration, so a faithful port spelling it
    # as an object-literal key or an options-interface field is not invented
    # surface — extra-surface unions this pool into the file's allowed set.
    @file_hash_keys = {}
    # >0 while walking the body of a `module_eval` / `class_eval` /
    # `Module.new` block, where `self` is a Ruby Module (see
    # module_eval_self_call?).
    @module_eval_depth = 0
    # The named-capture locals bound by the method body currently being walked
    # (see named_capture_locals).
    @capture_locals = Set.new
    # call name => Set of receiver kinds seen at its sites in the method body
    # currently being walked (see receiver_kind).
    @call_receivers = {}
    # The locals of that body that are provably a Hash (see hash_typed_locals).
    @hash_locals = Set.new
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
    # The `attr_reader`/`attr_writer`/`attr_accessor` names declared on the
    # class body currently being walked, innermost last. See
    # collect_attr_declarations / attr_reader_read?.
    @attr_names_stack = [Set.new]
    # `VALID_OPTIONS`-named symbol arrays per class FQN, expanded when a method
    # body passes the constant to `assert_valid_keys`. See collect_option_keys.
    @const_symbol_arrays = {}
    @const_symbol_hash_keys = {}
    # `include`/`extend` statements grouped per statement, keyed [fqn, :includes]
    # / [fqn, :extends]. The flat `info[:includes]` the manifest emits loses
    # statement boundaries, but Ruby's ancestor order needs them: a LATER
    # `include` beats an earlier one, while within one `include A, B` the FIRST
    # argument wins. Internal only — never emitted. See ancestor_methods.
    @include_groups = {}
    # When true we're scanning a top-level umbrella file (e.g. active_record.rb)
    # one level above libPath. We only harvest module-level singleton config
    # (`singleton_class.attr_accessor` …) from it and redirect that config onto
    # `<Module>::Base` — the entity that ports it as statics — rather than the
    # umbrella module's junk-drawer entity file. Everything else in the umbrella
    # (requires, autoloads, `def self.` helpers) is skipped. See scan_umbrella_file.
    @scanning_umbrella = false
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
    # surface from website docs / parity:api.
    @current_doc_methods = Set.new
    source.each_line do |line|
      next unless line =~ /^\s*def\s+(?:self\.)?([\w_!?=]+).*#\s*:doc:/
      @current_doc_methods << $1
    end

    @current_file = rel_path
    @current_line = 0
    walk(sexp)

    # Handle dynamic class creation via const_set:
    #   %w{ Foo Bar }.each { |name| const_set(name, Class.new(Superclass)) }
    # Skipped for umbrella scans — only singleton config is harvested there.
    extract_const_set_classes(source) unless @scanning_umbrella
  end

  # Scan a top-level umbrella file (e.g. `lib/active_record.rb`, one level above
  # the package's libPath and therefore never reached by the `**/*.rb` glob).
  # Only module-level singleton config is harvested — both the
  # `singleton_class.attr_accessor`/`attr_reader`/`attr_writer` command form
  # (what `active_record.rb` uses today) and the equivalent
  # `class << self; attr_accessor; end` block form — and attributed to
  # `<Module>::Base` (the trails entity that ports it as statics) so it credits
  # against those statics instead of leaking into the umbrella module's
  # entity-file bucket (the junk-drawer `deprecator.rb`). Must run AFTER the
  # package's own files so the `<Module>::Base` class already exists in `@classes`.
  #
  # A gem whose entry file defines real methods declares it as `libEntryFile`
  # in vendor/sources.ts instead, and is walked by process_file like any other
  # package file.
  def scan_umbrella_file(filepath, package_root)
    @scanning_umbrella = true
    process_file(filepath, package_root)
  ensure
    @scanning_umbrella = false
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

    # Track the source line of the construct being visited so every recorded
    # method carries a position. Without it `class << self` blocks placed above
    # the instance methods (e.g. active_model/attribute.rb:7-24) can't be
    # interleaved back into Rails source order by manifest consumers.
    #
    # INVARIANT: a recorder must read `@current_line` BEFORE walking children.
    # This is set on the way IN and never restored on the way OUT, so after a
    # nested walk it holds the deepest line last visited, not the line of the
    # construct being recorded. Every recorder today satisfies this (process_def
    # /process_defs use non-walking helpers for deps/calls/digest; the
    # process_command and method_add_block codegen recorders all fire before
    # descending) — keep it that way, or capture the line into a local first.
    line = first_line(node)
    @current_line = line if line

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
      maybe_record_hash_const_update(node)
      process_method_add_arg(node)
    when :method_add_block
      # `CONST.each do |x| … class_eval "def #{x}…" end` enumerable codegen
      # (e.g. relation/query_methods.rb's VALUE_METHODS loop). Falls through to
      # the generic child-walk when it isn't a recognized codegen loop so normal
      # blocks (`included do … end`, `scope :x do … end`) keep working.
      #
      # `define_method`/`alias_method` metaprogramming is recorded alongside:
      # the literal-name form here, and the loop-unrolled interpolated form via
      # process_each_metaprogramming. Both leave the generic descent intact.
      process_each_metaprogramming(node)
      # When the call part is a recorded `define_method`, descend into the block
      # only: re-walking the call would reach process_method_add_arg's
      # define_method arm and record the same method a second time.
      consumed_call = process_define_method_block(node)
      unless process_each_codegen(node)
        @in_on_load += 1 if on_load_block?(node)
        (consumed_call ? [node[2]] : node).each { |child| walk(child) if child.is_a?(Array) }
        @in_on_load -= 1 if on_load_block?(node)
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
      # `CONST = Struct.new(...)` carries the same generated members whether or
      # not a `do … end` body follows it (schema_definitions.rb:113-121 has five
      # blockless ones), so both forms enter the struct-class path.
      struct_call = struct_new_call(rhs)
      if lhs.is_a?(Array) && lhs[0] == :var_field &&
         lhs[1].is_a?(Array) && lhs[1][0] == :@const &&
         struct_call
        const_name_str = lhs[1][1]
        block = rhs[0] == :method_add_block ? rhs[2] : nil
        body = block.is_a?(Array) && (block[0] == :do_block || block[0] == :brace_block) ? block[2] : nil
        @namespace_stack.push(const_name_str)
        @visibility_stack.push(:public)
        fqn = current_fqn
        @classes[fqn] ||= new_class_info(const_name_str, fqn)
        @classes[fqn][:superclass] = "Struct"
        synthesize_struct_members(fqn, struct_call)
        walk_body(body) if body
        @visibility_stack.pop
        @namespace_stack.pop
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

    @attr_names_stack.push(collect_attr_declarations(node[2]))
    walk_body(node[2])
    @attr_names_stack.pop

    @module_function_stack.pop
    @visibility_stack.pop
    @namespace_stack.pop
  end

  def process_class(node)
    name = const_name(node[1])
    return unless name

    superclass = qualified_const_name(node[2]) if node[2]

    @namespace_stack.push(name)
    @visibility_stack.push(:public)
    @module_function_stack.push(false)

    fqn = current_fqn
    @classes[fqn] ||= new_class_info(name, fqn)
    @classes[fqn][:superclass] = superclass if superclass
    synthesize_struct_members(fqn, node[2]) if superclass == "Struct"

    body = node[3] || node[2]
    @attr_names_stack.push(collect_attr_declarations(body))
    walk_body(body)
    @attr_names_stack.pop

    @module_function_stack.pop
    @visibility_stack.pop
    @namespace_stack.pop
  end

  # The `Struct.new(...)` call node of a `CONST = Struct.new(…)` RHS, bare or
  # block-suffixed; nil otherwise. A dynamic member list is not matched —
  # struct_member_names resolves only inline symbols and a `*CONST` splat.
  #
  # Both call shapes count: `:method_add_arg` is the parenthesised
  # `Struct.new(:a, :b)`, `:command_call` the paren-less
  # `Struct.new :a, :b` (actionpack/lib/action_dispatch/http/response.rb:434).
  def struct_new_call(rhs)
    return nil unless rhs.is_a?(Array)
    call = rhs[0] == :method_add_block ? rhs[1] : rhs
    return nil unless call.is_a?(Array) &&
                      (call[0] == :method_add_arg || call[0] == :command_call)
    const_name(call[1]) == "Struct" ? call : nil
  end

  # `class Attribute < Struct.new :relation, :name` (arel/attributes/attribute.rb:5)
  # generates a reader and a writer per member, plus an `initialize` taking the
  # members positionally (by keyword under `keyword_init: true`). None of them
  # appear in the source as `def`s.
  def synthesize_struct_members(fqn, struct_new_node)
    target = @classes[fqn]
    return unless target
    names = struct_member_names(struct_new_node)
    return if names.empty?

    names.each do |name|
      target[:instanceMethods] << {
        name: name,
        visibility: "public",
        params: [],
        file: @current_file,
        line: @current_line,
        reader: true,
        notes: "struct",
      }
      target[:instanceMethods] << {
        name: "#{name}=",
        visibility: "public",
        params: [{ name: "value", kind: "required" }],
        file: @current_file,
        line: @current_line,
        notes: "struct",
      }
    end
    # Both arms are optional: `Struct.new(:a, :b).new` and its keyword_init
    # twin both accept zero arguments, leaving the members nil.
    kind = keyword_init?(struct_new_node) ? "keyword" : "optional"
    target[:instanceMethods] << {
      name: "initialize",
      visibility: "public",
      params: names.map { |name| { name: name, kind: kind, default: "..." } },
      file: @current_file,
      line: @current_line,
      notes: "struct",
    }
  end

  # The member names of a `Struct.new(...)` call. Inline symbols
  # (`Struct.new :relation, :name`, arel/attributes/attribute.rb:5) are read
  # straight off the args; `Struct.new(*RFC4646_SUBTAGS)`
  # (i18n/locale/tag/rfc4646.rb:14) names them through a symbol-array constant
  # instead, resolved the same way the codegen loops resolve theirs.
  def struct_member_names(struct_new_node)
    names = extract_symbol_args(struct_new_node)
    return names unless names.empty?
    splatted_const_members(struct_new_node) || names
  end

  # The members of the first `*CONST` splat under `node`, or nil when there is
  # none or it does not resolve to a symbol array.
  def splatted_const_members(node)
    return nil unless node.is_a?(Array)
    if node[0] == :args_add_star
      members = resolve_const_symbol_array(const_name(node[2]))
      return members if members
    end
    node.each do |child|
      next unless child.is_a?(Array)
      found = splatted_const_members(child)
      return found if found
    end
    nil
  end

  # True for `Struct.new(:a, :b, keyword_init: true)`, whose generated
  # `initialize` takes the members as keywords rather than positionally.
  def keyword_init?(node)
    return false unless node.is_a?(Array)
    if node[0] == :assoc_new && node[1].is_a?(Array) && node[1][0] == :@label &&
       node[1][1] == "keyword_init:"
      value = node[2]
      return value.is_a?(Array) && value[0] == :var_ref &&
             value[1].is_a?(Array) && value[1][1] == "true"
    end
    node.any? { |child| child.is_a?(Array) && keyword_init?(child) }
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
    # In an umbrella scan we only harvest `singleton_class.attr_*` config; the
    # `def self.` helpers in the umbrella (eager_load!, disconnect_all!, …) are
    # not ported as Base statics and would surface as false-missing.
    return if @scanning_umbrella

    name_node = node[1]
    name = ident_name(name_node)
    return unless name

    params = extract_params(find_params(node))
    vis = current_visibility
    vis = :public if @current_doc_methods&.include?(name)

    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    method_info = {
      name: name,
      visibility: vis.to_s,
      params: params,
      file: @current_file,
      line: @current_line,
    }
    record_body_facts(method_info, node[3], find_params(node), fqn)

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
    return if @scanning_umbrella

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

    method_info = {
      name: name,
      visibility: vis.to_s,
      params: params,
      file: @current_file,
      line: @current_line,
    }
    record_body_facts(method_info, node[5], find_params_defs(node), fqn)

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

    # `singleton_class.attr_accessor :foo` declares singleton (class) accessors
    # on the enclosing module/class, the same as `class << self; attr_accessor`.
    # Top-level Rails module config (writing_role, reading_role, …) uses this
    # form; without forcing the class bucket they leak as instance methods.
    on_singleton = node[0] == :command_call && singleton_class_receiver?(node[1])

    # Umbrella scans harvest only module-level singleton config; ignore every
    # other command (include/extend/scope/visibility/…) in the umbrella file.
    # Singleton accessors arrive either as `singleton_class.attr_*` (on_singleton)
    # or as a plain `attr_*` inside a `class << self` block (@in_sclass); both
    # are class-level config and must be kept.
    if @scanning_umbrella
      singleton_attr =
        (on_singleton || @in_sclass) && %w[attr_reader attr_writer attr_accessor].include?(cmd_name)
      return unless singleton_attr
    end

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
      process_attr(args, :reader, force_class: on_singleton)
    when "attr_writer"
      process_attr(args, :writer, force_class: on_singleton)
    when "attr_accessor"
      process_attr(args, :accessor, force_class: on_singleton)
    when "alias_method"
      process_alias_method(args)
    when "define_method"
      # Block-less bare-command form, `define_method :foo, &blk`. The block
      # forms (`define_method :foo do … end`, `define_method(:foo) { … }`) do
      # NOT arrive here: they are method_add_block nodes consumed by
      # process_define_method_block, which needs the block to read the params
      # off. This arm and the method_add_arg one below it exist so the two
      # block-less shapes are handled as symmetrically as alias_method's.
      process_define_method(args, nil)
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
    when "define_model_callbacks"
      process_define_model_callbacks(args)
    when "delegate"
      process_delegate(args)
    when "def_delegators", "def_delegator"
      process_def_delegators(args)
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
      when "define_model_callbacks"
        process_define_model_callbacks(node[2])
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
      when "def_delegators", "def_delegator"
        process_def_delegators(node[2])
      when "module_function"
        process_module_function(node[2])
      when "define_method"
        # Block-less parenthesized form, `define_method(:foo, some_proc)` —
        # the counterpart of process_command's bare-command arm. The far
        # commoner `define_method(:foo) { … }` is a method_add_block instead,
        # and the descent guard in walk keeps it from reaching here twice.
        process_define_method(node[2], nil)
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

  # `ActiveSupport.on_load(:active_job) { include ActiveRecord::Railties::JobRuntime }`
  # (railtie.rb:271-273) includes the module into ActiveJob::Base when that
  # framework loads — NOT into the lexically enclosing Railtie. Attributing it
  # to `current_fqn` credits the module's methods to a class Rails never puts
  # them on, so `include`/`extend` inside an on_load block records nothing.
  def on_load_block?(node)
    return false unless node.is_a?(Array) && node[0] == :method_add_block
    call = node[1]
    found = false
    walker = lambda do |n|
      return if found || !n.is_a?(Array)
      found = true if n[0] == :@ident && n[1] == "on_load"
      n.each { |c| walker.call(c) if c.is_a?(Array) }
    end
    walker.call(call)
    found
  end

  def process_include(args)
    return if @in_on_load.positive?
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    names = extract_const_args(args, keep_absolute: true)
    names.each { |mod_name| target[:includes] << mod_name }
    (@include_groups[[fqn, :includes]] ||= []) << names if names.any?
  end

  def process_include_from_arg_paren(args)
    return if @in_on_load.positive?
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    names = extract_const_args_from_paren(args, keep_absolute: true)
    names.each { |mod_name| target[:includes] << mod_name }
    (@include_groups[[fqn, :includes]] ||= []) << names if names.any?
  end

  def process_extend(args)
    return if @in_on_load.positive?
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    names = extract_const_args(args, keep_absolute: true)
    names.each { |mod_name| target[:extends] << mod_name }
    (@include_groups[[fqn, :extends]] ||= []) << names if names.any?
  end

  def process_extend_from_arg_paren(args)
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    names = extract_const_args_from_paren(args, keep_absolute: true)
    names.each { |mod_name| target[:extends] << mod_name }
    (@include_groups[[fqn, :extends]] ||= []) << names if names.any?
  end

  # Is `recv` a `singleton_class` receiver — either the bare
  # `singleton_class.attr_accessor` (vcall) or the explicit
  # `self.singleton_class.attr_accessor` (a `:call` whose method is
  # `singleton_class`)?
  def singleton_class_receiver?(recv)
    return false unless recv.is_a?(Array)
    case recv[0]
    when :vcall, :var_ref, :fcall
      ident_name(recv[1]) == "singleton_class"
    when :call
      # [:call, <receiver>, :".", method_ident]
      ident_name(recv[3]) == "singleton_class"
    else
      false
    end
  end

  def process_attr(args, kind, force_class: false)
    fqn = current_fqn

    # In an umbrella scan, redirect a module-level `singleton_class.attr_*` onto
    # `<Module>::Base` — the entity trails ports it to as statics — so it credits
    # against those statics instead of the umbrella module's entity-file bucket.
    redirect_fqn = umbrella_base_redirect(fqn, force_class)
    # Umbrella scans harvest ONLY config that redirects to a `<Module>::Base`.
    # Without a Base to credit it (e.g. `ActiveSupport.error_reporter`, whose
    # module has no `::Base`), recording it would leak onto the umbrella module's
    # entity-file bucket as false-missing — so skip it entirely, leaving that
    # surface exactly as it was before the umbrella was scanned.
    return if @scanning_umbrella && !redirect_fqn
    target = redirect_fqn ? @classes[redirect_fqn] : (@classes[fqn] || @modules[fqn])
    return unless target

    # Redirected config is always a class (singleton) accessor; otherwise keep
    # the original bucketing. `class << self; attr_accessor :foo; end` declares
    # singleton accessors; without bucketing into classMethods these would leak
    # as instance methods of every includer. `force_class` covers the
    # `singleton_class.attr_accessor` command form, with the same singleton effect.
    bucket = (redirect_fqn || @in_sclass || force_class) ? :classMethods : :instanceMethods
    # Group redirected methods under the Base entity's file, not the umbrella's.
    file = redirect_fqn ? (target[:file] || @current_file) : @current_file

    vis = current_visibility
    names = extract_symbol_args(args)
    names.each do |name|
      if kind == :reader || kind == :accessor
        entry = {
          name: name,
          visibility: vis.to_s,
          params: [],
          file: file,
          line: @current_line,
          reader: true,
        }
        entry[:umbrellaConfig] = true if redirect_fqn
        target[bucket] << entry
      end
      if kind == :writer || kind == :accessor
        entry = {
          name: "#{name}=",
          visibility: vis.to_s,
          params: [{ name: "value", kind: "required" }],
          file: file,
          line: @current_line,
        }
        entry[:umbrellaConfig] = true if redirect_fqn
        target[bucket] << entry
      end
      maybe_update_module_file(fqn, target) unless redirect_fqn
    end
  end

  # During an umbrella scan, a module-level singleton accessor (the
  # `singleton_class.attr_*` command form sets `force_class`; the
  # `class << self; attr_*; end` block form sets `@in_sclass`) on a module that
  # has a `<Module>::Base` class is config trails ports as Base statics; return
  # that Base FQN so the accessor is attributed there. Nil otherwise.
  def umbrella_base_redirect(fqn, force_class)
    return nil unless @scanning_umbrella && (force_class || @in_sclass)
    base = "#{fqn}::Base"
    @classes.key?(base) ? base : nil
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
          line: @current_line,
          reader: true,
        }
      end
      if kind == :writer || kind == :accessor
        target[bucket] << {
          name: "#{name}=",
          visibility: vis.to_s,
          params: [{ name: "value", kind: "required" }],
          file: @current_file,
          line: @current_line,
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
    entry = {
      name: new_name,
      visibility: vis.to_s,
      params: [],
      file: @current_file,
      line: @current_line,
      notes: "alias",
    }
    # Record the aliased target so resolve_aliases! can copy its real param
    # list — the alias has the target's arity, not zero. (See resolve_aliases!.)
    entry[:alias_target] = names[1] if names[1]
    # Bucket on @in_sclass like process_alias: `alias_method` inside
    # `class << self` aliases a CLASS method (e.g. ActiveSupport::JSON's
    # singleton `alias_method :dump, :encode`), so both the alias and its
    # resolve target live in classMethods.
    bucket = @in_sclass ? :classMethods : :instanceMethods
    target[bucket] << entry
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
    entry = {
      name: new_name,
      visibility: current_visibility.to_s,
      params: [],
      file: @current_file,
      line: @current_line,
      notes: "alias",
    }
    # Record the aliased target so resolve_aliases! can copy its real param
    # list — the alias has the target's arity, not zero. (See resolve_aliases!.)
    old_name = symbol_name(node[2])
    entry[:alias_target] = old_name if old_name
    target[bucket] << entry
    maybe_update_module_file(fqn, target)
  end

  # Resolve the two ways one bucket can end up holding the same name twice.
  #
  # A `Struct.new(...)` accessor lives on the anonymous struct SUPERCLASS, so
  # anything the class body defines under that name overrides it —
  # `Rfc4646 < Struct.new(*RFC4646_SUBTAGS)` (i18n rfc4646.rb:14) inherits a
  # plain `language` reader and then replaces four of the seven with
  # `define_method(name) { self[name].send(format) }` (rfc4646.rb:32-34). The
  # body's definition wins, and the struct accessor is dropped: keeping the
  # inherited no-body reader instead would tell the call gate those four
  # accessors make no calls, when Rails' make a format-dependent `send`.
  #
  # Then drop a `define_method` entry when a literal `def` of the same name
  # already occupies the bucket. Ruby source can define a method both ways in
  # mutually exclusive branches the extractor walks unconditionally — rack's
  # `utils.rb:183` picks `define_method(:escape_html, ERB…)` or `def
  # escape_html` off an `if defined?(ERB::Escape)` — and only one of the two is
  # ever live. The literal `def` wins: it carries the deps, calls and body
  # digest a metaprogrammed entry has no way to supply.
  public def dedupe_define_methods!
    (@classes.to_a + @modules.to_a).each do |_fqn, info|
      [:instanceMethods, :classMethods].each do |bucket|
        if info[bucket].any? { |m| m[:notes] == "struct" }
          defined_in_body = info[bucket].each_with_object(Set.new) do |m, acc|
            acc << m[:name] unless m[:notes] == "struct"
          end
          info[bucket].reject! { |m| m[:notes] == "struct" && defined_in_body.include?(m[:name]) }
        end
        next unless info[bucket].any? { |m| m[:notes] == "define_method" }
        literal = info[bucket].each_with_object(Set.new) do |m, acc|
          acc << m[:name] unless m[:notes]
        end
        info[bucket].reject! { |m| m[:notes] == "define_method" && literal.include?(m[:name]) }
      end
    end
  end

  # Aliases are recorded with empty params (the `alias`/`alias_method` form
  # names no parameters), but at runtime an alias shares its target method's
  # arity. A faithful TS port spells the delegator with the real parameters, so
  # the advisory arity check would false-flag the alias as a mismatch
  # (ruby min:0,max:0 vs ts min:N,max:N). Resolve each alias to its target's
  # param list — searching the same class/module bucket — so the comparison
  # sees the true arity. Runs after all package files are processed (targets may
  # be in a different file of a reopened class) and iterates to follow alias
  # chains (`alias a b; alias b c`). Cross-class/inherited targets that aren't in
  # the package stay empty (best-effort — the static walker can't see another
  # gem's source) and are left WITHOUT the `aliasResolved` flag, which is what
  # distinguishes them from an alias whose target legitimately takes zero
  # arguments. Drops the transient `alias_target` key afterward so it never
  # reaches the manifest.
  # Public: invoked by `run` per package and by the extractor unit test.
  public def resolve_aliases!
    all = @classes.merge(@modules)
    # Candidate table per (fqn, bucket): the bucket's own methods first, then —
    # second resolution stage — the methods reachable through the ancestors the
    # extractor recorded (`include`d modules and the superclass chain for
    # instance methods, `extend`ed modules for class methods). `||=` keeps a
    # same-bucket definition winning over any inherited one, mirroring Ruby's
    # method lookup. Built once and reused across passes.
    tables = {}
    all.each do |fqn, info|
      [:instanceMethods, :classMethods].each do |bucket|
        by_name = {}
        info[bucket].each { |m| by_name[m[:name]] ||= m }
        ancestor_methods(fqn, info, bucket, all).each { |m| by_name[m[:name]] ||= m }
        tables[[fqn, bucket]] = by_name
      end
    end

    # Fixpoint over ALL buckets at once, not per class: an alias may resolve to
    # an alias in an ancestor that is itself still unresolved, so a single
    # hash-ordered sweep would read an empty target and give up. Each
    # non-breaking pass resolves at least one previously-unresolved alias (and
    # resolved ones are skipped afterwards via `aliasResolved`), so the
    # unresolved count strictly decreases and the loop always terminates — no
    # arbitrary iteration cap.
    loop do
      changed = false
      all.each do |fqn, info|
        [:instanceMethods, :classMethods].each do |bucket|
          by_name = tables[[fqn, bucket]]
          info[bucket].each do |m|
            next unless m[:notes] == "alias" && m[:alias_target]
            next if m[:aliasResolved]
            tgt = by_name[m[:alias_target]]
            next unless tgt && tgt[:params]
            # A target that is ITSELF an as-yet-unresolved alias carries a
            # placeholder, not its real arity — wait for a later pass to fill it.
            next if tgt[:notes] == "alias" && !tgt[:aliasResolved]
            # A `delegate`-generated target NEVER gains a real arity (it forwards
            # to something the static walker can't see), so its empty params are a
            # placeholder too. Resolving against it would stamp `aliasResolved` on
            # a `[0-0]` that means "unknown", re-arming the very false mismatches
            # this skip exists to remove — one hop removed, through the alias.
            # Leaving the alias unresolved makes it forward-like in its own right,
            # which is exactly what it is.
            next if tgt[:notes] == "delegate"
            m[:params] = tgt[:params].map(&:dup)
            # Records that the target WAS found, even when it legitimately takes
            # no arguments. Without this flag an alias to a zero-arg method is
            # shape-identical to one whose target was never found, and consumers
            # (arity.ts `isForwardingRubyEntry`) would drop a genuinely checkable
            # pair as if its arity were unknown.
            m[:aliasResolved] = true
            changed = true
          end
        end
      end
      break unless changed
    end

    all.each_value do |info|
      [:instanceMethods, :classMethods].each do |bucket|
        info[bucket].each { |m| m.delete(:alias_target) }
      end
    end
  end

  # Methods an alias in `fqn`'s `bucket` can resolve against beyond its own
  # bucket, walking the ancestors the extractor recorded. For instance methods
  # that's the superclass chain plus each `include`d module's instance methods
  # (a module's own `include` is followed transitively); for class methods it's
  # the superclass chain plus each `extend`ed module's INSTANCE methods, since
  # `extend Foo` promotes Foo's instance methods to singleton methods.
  # Ancestors outside the package simply aren't in `all`, so their aliases stay
  # empty-param — best-effort, exactly as before.
  def ancestor_methods(fqn, info, bucket, all, seen = nil)
    seen ||= {}
    return [] if seen[fqn]
    seen[fqn] = true

    out = []
    # Mixins BEFORE the superclass: Ruby inserts included modules between the
    # class and its superclass, so an included override beats an inherited
    # definition. Statement order is reversed (a later `include` wins) while
    # names within one statement keep source order (`include A, B` puts A
    # first) — the ancestor order `Module#include` actually produces.
    mixin_key = bucket == :classMethods ? :extends : :includes
    mixin_groups = @include_groups[[fqn, mixin_key]] || [info[mixin_key]]
    mixin_groups.reverse_each do |group|
      group.each do |mod_name|
        found = lookup_ancestor(mod_name, fqn, all)
        next unless found
        out.concat(found[1][:instanceMethods])
        out.concat(ancestor_methods(found[0], found[1], :instanceMethods, all, seen))
      end
    end
    sup = lookup_ancestor(info[:superclass], fqn, all)
    if sup
      out.concat(sup[1][bucket])
      out.concat(ancestor_methods(sup[0], sup[1], bucket, all, seen))
    end
    out
  end

  # Resolve a `class X < Sup` / `include Mod` constant reference written inside
  # `from_fqn` to a recorded `[fqn, info]`. Tries the name as an absolute FQN
  # first, then as relative to each enclosing lexical scope (Ruby's own constant
  # lookup order), so `include Delegation` inside `ActiveRecord::Relation`
  # finds `ActiveRecord::Delegation`.
  def lookup_ancestor(name, from_fqn, all)
    return nil unless name

    # A leading `::` forces an absolute lookup: Ruby skips every lexical scope
    # and resolves against the top level only, so `include ::Foo` inside
    # `A::B` binds to `::Foo` even when `A::Foo` exists.
    if name.start_with?("::")
      absolute = name.delete_prefix("::")
      return all[absolute] ? [absolute, all[absolute]] : nil
    end

    # Resolved lexically — innermost enclosing scope outwards, top level LAST.
    # Checking `all[name]` up front would bind `include Delegation` inside
    # `ActiveRecord::Relation` to a top-level `::Delegation` in preference to
    # `ActiveRecord::Delegation`, which is the opposite of Ruby's rule.
    parts = from_fqn.split("::")
    while parts.any?
      candidate = (parts + [name]).join("::")
      return [candidate, all[candidate]] if all[candidate]
      parts.pop
    end
    all[name] ? [name, all[name]] : nil
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
      line: @current_line,
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

  # `define_model_callbacks :save, :create` (activemodel/lib/active_model/callbacks.rb:109-126)
  # metaprograms one singleton method per (type, callback) pair —
  # `before_save`, `around_save`, `after_save`, … — via
  # `_define_<type>_model_callback`'s `klass.define_singleton_method`
  # (callbacks.rb:129-152). There is no `def before_save` anywhere in the `.rb`
  # for the `def` walker to find, so the faithful TS port of every one of them
  # reads as invented surface without this.
  #
  # The generated NAMES come from the leading positional symbols only
  # (`leading_symbol_args` stops at the options hash, so `only: :after` is never
  # a callback name), and the TYPES from `Array(options.delete(:only))`
  # (callbacks.rb:117), defaulting to `[:before, :around, :after]`
  # (callbacks.rb:114). A `only:` that is not a literal symbol or literal array
  # of symbols records nothing, so an unresolvable port stays novel.
  #
  # All three are singleton methods on the caller, so they land in
  # `classMethods` — and the caller is the class/module lexically enclosing the
  # macro, including the `included do` block AR calls it from
  # (activerecord/lib/active_record/callbacks.rb:412-416), which is the same
  # bucketing `class_attribute` already gets there.
  CALLBACK_TYPES = %w[before around after].freeze

  def process_define_model_callbacks(args)
    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return unless target

    only = option_symbols(args, "only")
    types = only.nil? ? CALLBACK_TYPES : only & CALLBACK_TYPES
    return if types.empty?

    leading_symbol_args(args).each do |callback|
      types.each do |type|
        target[:classMethods] << {
          name: "#{type}_#{callback}",
          visibility: "public",
          params: [
            { name: "args", kind: "rest" },
            { name: "options", kind: "keyword_rest" },
            { name: "block", kind: "block" },
          ],
          file: @current_file,
          line: @current_line,
          notes: "define_model_callbacks",
        }
      end
    end
    maybe_update_module_file(fqn, target)
  end

  # Symbol value(s) of a trailing-options-hash key, in the two shapes Ruby's
  # `Array(...)` coercion collapses: a bare symbol (`only: :after`) and an array
  # literal of symbols (`only: [:before, :after]`). Nil when the key is absent;
  # `[]` when it is present but not one of those literal shapes, so a caller
  # cannot mistake "unreadable" for "defaulted".
  def option_symbols(args, key)
    list = positional_arg_list(args)
    return nil unless list.is_a?(Array)
    list.each do |el|
      next unless el.is_a?(Array) && el[0] == :bare_assoc_hash
      (el[1] || []).each do |assoc|
        next unless assoc.is_a?(Array) && assoc[0] == :assoc_new &&
                    assoc[1].is_a?(Array) && assoc[1][0] == :@label &&
                    assoc[1][1] == "#{key}:"
        v = assoc[2]
        return [] unless v.is_a?(Array)
        return [symbol_name(v)].compact if %i[symbol_literal dyna_symbol].include?(v[0])
        return [] unless v[0] == :array
        elements = v[1]
        return [] unless elements.is_a?(Array)
        return elements.filter_map { |e| symbol_name(e) }
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
      line: @current_line,
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
      line: @current_line,
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
        line: @current_line,
        notes: "delegate",
      }
    end
    maybe_update_module_file(fqn, target)
  end

  # Forwardable's `def_delegators :@errors, :each, :clear, :empty?, :size, :uniq!`
  # generates one public instance method per symbol AFTER the accessor, each
  # forwarding to the target. The accessor is the first positional argument and
  # is an ivar (`:@errors`) or a reader name; only ivar accessors appear in the
  # vendored lib, so the leading `@`-prefixed symbol is dropped and every
  # remaining symbol is recorded. `def_delegator :@a, :b, :c` (aliasing form)
  # takes the same path: the alias is the last symbol, and recording both `b`
  # and `c` would invent surface, so only the ivar is dropped and the rest are
  # kept — faithful for the two call sites that exist
  # (activemodel/lib/active_model/errors.rb:103, nested_error.rb:20).
  def process_def_delegators(args)
    list = positional_arg_list(args)
    names = []

    visit = lambda do |node|
      return unless node.is_a?(Array)
      case node[0]
      when :symbol_literal, :dyna_symbol
        nm = symbol_name(node)
        names << nm if nm
      end
    end

    list.each { |el| visit.call(el) } if list.is_a?(Array) && list[0] != :args_add_star
    names.reject! { |nm| nm.start_with?("@") }
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
        line: @current_line,
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
        line: @current_line,
        notes: "define_column_methods",
      }
    end
    maybe_update_module_file(fqn, target)
  end

  # `define_method "<name>" do … end` / `define_method(:name) { … }` with a name
  # that is a plain literal. The block's parameters become the method's params,
  # so a metaprogrammed method carries the same arity information a literal
  # `def` would. A name that isn't a bare literal (an interpolation, a local
  # variable, a constant) is skipped, never guessed — the loop-unrolled
  # interpolation case is handled by process_each_metaprogramming instead.
  def process_define_method_block(node)
    name, args = meta_call_parts(node[1])
    return false unless name == "define_method"
    process_define_method(args, block_params_node(node[2]), block_body_node(node[2]))
  end

  def process_define_method(args, params_node, body = nil)
    # Umbrella scans harvest only module-level singleton config (see
    # process_def); anything else recorded there surfaces as false-missing.
    return false if @scanning_umbrella

    list = positional_arg_list(args)
    return false unless list.is_a?(Array)
    name = literal_method_name(list[0])
    return false unless name

    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return false unless target

    record_metaprogrammed_method(fqn, target, name, extract_params(params_node), "define_method",
                                 body: body, params_node: params_node)
    maybe_update_module_file(fqn, target)
    true
  end

  # Unrolls a literal-array `.each` loop that metaprograms methods whose names
  # interpolate the loop variable (abstract_controller/callbacks.rb:230):
  #
  #   [:before, :after, :around].each do |callback|
  #     define_method "#{callback}_action" do |*names, &blk| … end
  #     alias_method :"append_#{callback}_action", :"#{callback}_action"
  #   end
  #
  # Emits one entry per generated name (twelve, above). Only names that derive
  # from the loop variable are unrolled — an interpolation of it, or the bare
  # variable itself: a loop-invariant literal name would otherwise be recorded
  # once per member, and it is already picked up by the plain
  # define_method/alias_method recorders during the generic descent. Returns
  # true when it emitted anything.
  def process_each_metaprogramming(node)
    return false if @scanning_umbrella

    call = node[1]
    return false unless call.is_a?(Array) && call[0] == :call
    return false unless ident_name(call[3]) == "each"
    members = each_loop_members(call[1])
    return false unless members && !members.empty?

    block = node[2]
    return false unless block.is_a?(Array) &&
                        [:do_block, :brace_block].include?(block[0])
    loop_var = block_param_name(block)
    return false unless loop_var

    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return false unless target

    emitted = false
    each_metaprogramming_call(block[2]) do |kind, args, params_node, body|
      list = positional_arg_list(args)
      next unless list.is_a?(Array)
      members.each do |member|
        name = unrolled_name(list[0], loop_var, member)
        next unless name
        if kind == "define_method"
          record_metaprogrammed_method(fqn, target, name, extract_params(params_node), "define_method",
                                       body: body, params_node: params_node)
        else
          old = list[1] && unrolled_name(list[1], loop_var, member)
          record_metaprogrammed_method(fqn, target, name, [], "alias", alias_target: old)
        end
        emitted = true
      end
    end
    maybe_update_module_file(fqn, target) if emitted
    emitted
  end

  def record_metaprogrammed_method(fqn, target, name, params, notes, alias_target: nil, body: nil, params_node: nil)
    entry = {
      name: name,
      visibility: current_visibility.to_s,
      params: params,
      file: @current_file,
      line: @current_line,
      notes: notes,
    }
    record_body_facts(entry, body, params_node, fqn) if body
    # Same as process_alias_method: the alias inherits the target's arity, so
    # record the target for resolve_aliases! to copy params from.
    entry[:alias_target] = alias_target if alias_target
    # Same bucketing rule as process_def: `class << self` and `module_function`
    # both make the generated method a class method.
    on_class = @in_sclass || (@module_function_stack.last && @modules[fqn])
    target[on_class ? :classMethods : :instanceMethods] << entry
  end

  # The body-derived half of a method entry: every fact the manifest carries
  # about a method body, so a `define_method`-generated entry is
  # indistinguishable from a `def`-written one rather than reading as a
  # zero-call, dep-less, option-key-less method (RFC 0126). Both the literal
  # `def` paths and the metaprogrammed one go through here, so the two cannot
  # drift back apart.
  def record_body_facts(entry, body, params_node, fqn)
    mark_symbol_discriminated(entry[:params], body)
    dep_info = detect_deps(body)
    calls, weak_calls, call_receivers = collect_method_calls(body, params_node)
    entry[:deps] = dep_info[:deps] unless dep_info[:deps].empty?
    entry[:depRefs] = dep_info[:depRefs] unless dep_info[:depRefs].empty?
    entry[:calls] = calls unless calls.empty?
    entry[:weakCalls] = weak_calls unless weak_calls.empty?
    entry[:callReceivers] = call_receivers unless call_receivers.empty?
    call_args = collect_call_args(body)
    entry[:callArgs] = call_args unless call_args.empty?
    skeleton = collect_method_skeleton(body)
    entry[:skeleton] = skeleton unless skeleton.empty?
    opt_keys = collect_option_keys(body, entry[:params], fqn)
    entry[:option_keys] = opt_keys unless opt_keys.empty?
    record_file_hash_keys(opt_keys)
    record_file_hash_keys(collect_ivar_option_keys(body))
    digest = body_digest(body)
    entry[:bodyDigest] = digest if digest
  end

  # Members of an `.each` receiver, whichever way it is spelled: a literal
  # `[:a, :b]` / `%w[a b]` array (time_with_zone.rb:440), a constant resolving
  # to a symbol array (relation.rb's VALUE_METHODS), or a constant resolving to
  # a symbol-keyed Hash, whose KEYS are the members (rfc4646.rb:32). Keeping
  # receiver resolution here — rather than in each recorder — is what makes
  # receiver kind and template kind (`define_method` vs `class_eval`)
  # independent instead of a hard-wired pair.
  def each_loop_members(node)
    literal_array_members(node) ||
      resolve_const_symbol_array(const_name(node)) ||
      resolve_const_symbol_hash_keys(const_name(node))
  end

  # Members of a literal `[:a, :b]` / `%w[a b]` receiver, as strings. Any
  # non-literal element (a constant, a splat, an interpolation) disqualifies the
  # whole array — an unrollable loop must be fully known.
  def literal_array_members(node)
    return nil unless node.is_a?(Array) && node[0] == :array
    elems = node[1]
    return nil unless elems.is_a?(Array)
    members = []
    elems.each do |el|
      name = literal_method_name(el)
      return nil unless name
      members << name
    end
    members
  end

  # A bare literal name: `:foo`, `"foo"`, or a `%w[]`/`%i[]` element. Returns
  # nil for anything interpolated or computed.
  def literal_method_name(node)
    return nil unless node.is_a?(Array)
    case node[0]
    when :symbol_literal
      symbol_name(node)
    when :@tstring_content
      node[1]
    when :string_literal, :dyna_symbol
      content = node[1]
      return nil unless content.is_a?(Array) && content[0] == :string_content
      parts = content[1..]
      return nil unless parts.length == 1
      part = parts[0]
      part.is_a?(Array) && part[0] == :@tstring_content ? part[1] : nil
    end
  end

  # Resolve a name node for one unrolled loop member. Every part must be either
  # literal text or an interpolation of exactly `loop_var`, and at least one
  # such interpolation must be present; anything else returns nil.
  def unrolled_name(node, loop_var, member)
    return nil unless node.is_a?(Array)
    # `define_method(name)` passes the loop variable itself rather than
    # interpolating it (rfc4646.rb:33), so the member IS the method name.
    return member if node[0] == :var_ref && ident_name(node[1]) == loop_var
    return nil unless [:string_literal, :dyna_symbol].include?(node[0])
    content = node[1]
    return nil unless content.is_a?(Array) && content[0] == :string_content
    out = +""
    saw_var = false
    content[1..].each do |part|
      return nil unless part.is_a?(Array)
      case part[0]
      when :@tstring_content
        out << part[1]
      when :string_embexpr
        return nil unless embexpr_var(part) == loop_var
        saw_var = true
        out << member
      else
        return nil
      end
    end
    saw_var && !out.empty? ? out : nil
  end

  # Yield each `define_method`/`alias_method` call in a loop body as
  # [command_name, args_node, block_params_node]. Does not descend into literal
  # `def`s (those are the extractor's normal business, not codegen).
  def each_metaprogramming_call(node, &blk)
    return unless node.is_a?(Array)
    return if [:def, :defs].include?(node[0])
    if node[0] == :method_add_block
      name, args = meta_call_parts(node[1])
      if name
        yield name, args, block_params_node(node[2]), block_body_node(node[2])
        return
      end
    else
      name, args = meta_call_parts(node)
      if name
        yield name, args, nil, nil
        return
      end
    end
    node.each { |child| each_metaprogramming_call(child, &blk) if child.is_a?(Array) }
  end

  # [command_name, args_node] when `node` is a `define_method`/`alias_method`
  # call in either the command (`define_method :x`) or paren
  # (`define_method(:x)`) form; [nil, nil] otherwise.
  def meta_call_parts(node)
    return [nil, nil] unless node.is_a?(Array)
    case node[0]
    when :command
      name = ident_name(node[1])
      %w[define_method alias_method].include?(name) ? [name, node[2]] : [nil, nil]
    when :method_add_arg
      fcall = node[1]
      return [nil, nil] unless fcall.is_a?(Array) && fcall[0] == :fcall
      name = ident_name(fcall[1])
      %w[define_method alias_method].include?(name) ? [name, node[2]] : [nil, nil]
    else
      [nil, nil]
    end
  end

  # The `[:params, …]` node of a `do`/`{}` block, or nil when it takes none.
  def block_params_node(block)
    return nil unless block.is_a?(Array) &&
                      [:do_block, :brace_block].include?(block[0])
    block_var = block[1]
    return nil unless block_var.is_a?(Array) && block_var[0] == :block_var
    params = block_var[1]
    params.is_a?(Array) && params[0] == :params ? params : nil
  end

  # The statement list of a `do`/`{}` block — the generated method's body, for
  # a `define_method(name) { … }`. See record_body_facts.
  def block_body_node(block)
    return nil unless block.is_a?(Array) &&
                      [:do_block, :brace_block].include?(block[0])
    block[2]
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
    if name_local.nil? || suffix_map.empty?
      # No intermediate `<local> = case …` mapping: the template interpolates
      # the loop variable directly, so the receiver's own members are the
      # method names and there is no suffix
      # (`%w(year mon …).each { class_eval "def #{method_name}…" }`,
      # time_with_zone.rb:440-448).
      members = each_loop_members(call[1])
      return false unless members && !members.empty?
      name_local = loop_var
      suffix_map = [[members, ""]]
    end

    forms = codegen_def_forms(body, name_local)
    return false if forms.empty?

    fqn = current_fqn
    target = @classes[fqn] || @modules[fqn]
    return false unless target

    template = codegen_template(body, name_local)

    suffix_map.each do |members, suffix|
      members.each do |member|
        base = "#{member}#{suffix}"
        defs = codegen_template_defs(template, base)
        forms.each do |suffix_in_def, form|
          name = "#{base}#{suffix_in_def}"
          method_name = form == :writer ? "#{name}=" : name
          entry = {
            name: method_name,
            visibility: "public",
            params: form == :writer ? [{ name: "value", kind: "required" }] : [],
            file: @current_file,
            line: @current_line,
            notes: "class_eval",
          }
          generated = defs[method_name]
          record_body_facts(entry, generated[:body], generated[:params], fqn) if generated
          target[:instanceMethods] << entry
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
    resolve_const_symbol_array(const_name(guard[2]))
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
  # interpolated `name_local`, as [literal_suffix, :reader|:writer] pairs:
  # `def #{name_local}` is ["", :reader], `def #{name_local}=` is ["", :writer]
  # and `def #{name_local}_polymorphic_url` (polymorphic_routes.rb:158) is
  # ["_polymorphic_url", :reader]. Reconstructs the template, replacing each
  # `#{name_local}` with a sentinel, then scans for `def <sentinel>` occurrences.
  # The sentinel is NUL (never present in Ruby source), so the `\s+` in the scan
  # can't ambiguously consume it the way a whitespace marker could.
  SENTINEL = "\0"
  def codegen_def_forms(body, name_local)
    template = codegen_template(body, name_local)
    return [] unless template
    forms = []
    template.scan(/\bdef\s+#{SENTINEL}(\w*[?!]?)(=?)/) do |suffix, writer|
      forms << [suffix, writer == "=" ? :writer : :reader]
    end
    forms.uniq
  end

  # The `def`s a class_eval string template generates for one member, keyed by
  # generated method name, as `{ body:, params: }` — the same two nodes
  # process_def hands record_body_facts, so a template-written body carries the
  # calls, call args, skeleton and digest a literal `def` does (RFC 0126).
  # `command_recorder.rb:125-131` generates 43 methods this way, each whose body
  # is `record(:"#{method}", args, &block)`.
  #
  # The template is reconstructed with SENTINEL standing in for the interpolated
  # name (see codegen_template), so substituting `member_name` back in yields the
  # source Ruby would have evaluated. A template that does not parse standalone —
  # a fragment, an unbalanced `end`, a dropped interpolation that was carrying
  # syntax — records no body facts rather than being guessed at. Line numbers
  # inside the re-parse are meaningless; the entry keeps the class_eval call
  # site's `@current_line`.
  def codegen_template_defs(template, member_name)
    return {} unless template
    sexp =
      begin
        Ripper.sexp(template.gsub(SENTINEL, member_name))
      rescue StandardError, SyntaxError
        nil
      end
    return {} unless sexp
    out = {}
    collect_template_defs(sexp, out)
    out
  end

  def collect_template_defs(node, out)
    return unless node.is_a?(Array)
    if node[0] == :def
      name = ident_name(node[1])
      out[name] ||= { body: node[3], params: find_params(node) } if name
    end
    node.each { |child| collect_template_defs(child, out) if child.is_a?(Array) }
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
          str_node = first_string_literal(n[2])
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

  # The recorded pure-symbol-array members of a constant.
  def resolve_const_symbol_array(name)
    resolve_const_members(name, @const_symbol_arrays)
  end

  # The recorded symbol keys of a Hash constant.
  def resolve_const_symbol_hash_keys(name)
    resolve_const_members(name, @const_symbol_hash_keys)
  end

  # Resolve a constant name (`Relation::MULTI_VALUE_METHODS` or a bare `CONST`)
  # to its recorded members in `store` (which spans files) by matching the
  # container path against stored FQNs. A leading `::` forces an absolute
  # lookup: the container is anchored to the top level (`fqn == container`, or
  # the empty top level for `::CONST`) and the relative `end_with?` suffix match
  # is skipped, honouring Ruby's rule that `::Foo::KEYS` binds to top-level
  # `Foo`, never a nested `X::Foo`.
  def resolve_const_members(name, store)
    return nil unless name
    absolute = name.start_with?("::")
    name = name[2..-1] if absolute
    parts = name.split("::")
    const = parts.last
    container = parts[0...-1].join("::")
    store.each do |fqn, consts|
      next unless consts.key?(const)
      if absolute
        next unless container.empty? ? fqn.empty? : fqn == container
      else
        next unless container.empty? || fqn == container || fqn.end_with?("::#{container}")
      end
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

  # `raise Foo.new(msg)` and `raise Foo, msg` are the same raise written two
  # ways, and the port spells BOTH `throw new Foo(msg)` — so the `new` is a
  # position the two spellings disagree on. Evaluation order puts the
  # argument's `new` immediately before the `raise` that consumes it, which is
  # exactly this occurrence; drop it, as extract-ts-api.ts#isThrownConstruction
  # drops the TS half. Any OTHER `new` in the body still counts, and the two
  # extractors have to agree here or a raise pins `new` at the front of one
  # sequence and nowhere in the other.
  def drop_raised_new(calls)
    calls.each_with_index.reject { |name, i| name == "new" && calls[i + 1] == "raise" }
         .map(&:first)
  end

  # `/…(?<name>…)/ =~ expr` ASSIGNS each named capture to a local variable, and
  # only in that order — a regexp literal on the LEFT (ruby/re.c, documented at
  # doc/regexp.rdoc "Named Captures"). Ripper does not track that binding, so a
  # later bare `size` parses as a `:vcall` and would read as a receiverless
  # call, manufacturing a call-set row no faithful port can ever satisfy: the
  # port of a capture local IS a local
  # (activerecord/lib/active_record/connection_adapters/mysql/schema_dumper.rb:13-14).
  #
  # Recorded as the walk REACHES the `=~`, never precomputed over the body: the
  # binding only reaches the rest of the method, so a bare `size` written BEFORE
  # it is still the receiverless call Ripper parsed.
  def note_capture_locals(node)
    return unless node[0] == :binary && node[2] == :=~ && node[1].is_a?(Array) &&
                  node[1][0] == :regexp_literal

    regexp_literal_source(node[1]).scan(/\(\?<([a-zA-Z_]\w*)>/) { |(name)| @capture_locals << name }
  end

  # The static text of a `:regexp_literal` — interpolated parts carry no
  # capture name we could read, so they are simply skipped.
  def regexp_literal_source(node)
    parts = node[1]
    return "" unless parts.is_a?(Array)

    parts.filter_map { |part| part[1] if part.is_a?(Array) && part[0] == :@tstring_content }
         .join
  end

  def with_capture_locals
    outer = @capture_locals
    @capture_locals = Set.new
    yield
  ensure
    @capture_locals = outer
  end

  # A bare `:vcall` naming a capture local is a variable READ, not a call.
  def capture_local?(name)
    @capture_locals.include?(name)
  end

  # Returns [calls, weak_calls, call_receivers]: the de-duplicated call names,
  # the subset whose EVERY occurrence had an inert receiver (see
  # walk_for_calls), and the receiver kinds each name's sites had (RFC 0129,
  # see receiver_kind).
  def collect_method_calls(body_node, params_node = nil)
    calls = []
    weak = []
    receivers = {}
    with_capture_locals do
      with_call_receivers(body_node, params_node) do
        walk_for_calls(body_node, calls, weak)
        calls = drop_raised_new(calls)
        receivers = call_receiver_kinds(calls.uniq)
      end
    end
    total = calls.tally
    weak_calls = weak.tally.select { |name, n| total[name] == n }.keys
    [calls.uniq, weak_calls, receivers]
  end

  def with_call_receivers(body_node, params_node)
    outer_receivers = @call_receivers
    outer_hash_locals = @hash_locals
    @call_receivers = {}
    @hash_locals = hash_typed_locals(body_node, params_node)
    yield
  ensure
    @call_receivers = outer_receivers
    @hash_locals = outer_hash_locals
  end

  # call name => its sites' receiver kinds, SORTED. A name whose every
  # occurrence was an unqualified (implicit-self) call is omitted — that is most
  # of them, and the field exists to say what a QUALIFIED receiver was — but a
  # name called both ways still records `self` beside the other kinds, so a
  # consumer keying on the kind set sees every occurrence or none, the same
  # all-sites discipline `weak_calls` has.
  def call_receiver_kinds(names)
    kinds = {}
    names.each do |name|
      seen = @call_receivers[name]
      next if seen.nil? || seen == Set["self"]

      kinds[name] = seen.to_a.sort
    end
    kinds
  end

  # The coarse receiver kind of one call SITE (RFC 0129). `calls` records names
  # alone, so `options.fetch` (a Hash) and `cache.fetch`
  # (`ActiveSupport::Cache::Store`) are one call to every consumer; the kind is
  # what lets the ruby-compat table admit a row keyed `Hash#fetch` without
  # crediting the Rails one. Only shapes Ripper PROVES are named for their
  # class — a literal, or a local hash_typed_locals proved — and everything
  # else is recorded by shape (`local`, `ivar`, `const`, `expr`), never guessed
  # at, so a row keyed `hash` can only ever match a Hash.
  def receiver_kind(recv)
    return self_receiver_kind if recv.nil?
    return "expr" unless recv.is_a?(Array)

    case recv[0]
    when :hash, :bare_assoc_hash then "hash"
    when :array then "array"
    when :string_literal then "string"
    when :symbol_literal, :dyna_symbol then "symbol"
    when :regexp_literal then "regexp"
    when :@int, :@float then "numeric"
    when :var_ref then var_ref_receiver_kind(recv[1])
    when :const_path_ref, :top_const_ref then "const"
    else "expr"
    end
  end

  # The `:var_ref` half of receiver_kind. Ripper emits `:@ident` under a
  # `:var_ref` only for an in-scope LOCAL — a bare method call on self is a
  # `:vcall`, which receiver_kind leaves an `expr` — so the name spaces below
  # cannot collide. Same discriminator inert_receiver? reads.
  def var_ref_receiver_kind(inner)
    return "expr" unless inner.is_a?(Array)

    case inner[0]
    when :@ident then @hash_locals.include?(inner[1]) ? "hash" : "local"
    when :@ivar then "ivar"
    when :@const then hash_constant?(inner[1]) ? "hash" : "const"
    when :@kw then inner[1] == "self" ? self_receiver_kind : "expr"
    else "expr"
    end
  end

  # An implicit (or explicit `self`) receiver inside a `core_ext` file that
  # reopens `Hash` IS a Hash — `core_ext_file?` is the same fact the weak-call
  # verdict reads (core_receiver_call?), and the namespace stack proves WHICH
  # class the file reopens, so a `core_ext` file for another class is
  # unaffected and keeps `self`.
  def self_receiver_kind
    core_ext_file? && @namespace_stack.last == "Hash" ? "hash" : "self"
  end

  # A constant THIS FILE assigns a hash literal — `MIME_TYPES` (rack/mime.rb:8),
  # `STATUS_CODES` (rack/utils.rb) — so `MIME_TYPES.fetch(ext)` is provably
  # `Hash#fetch`. A constant declared elsewhere is not proven and stays `const`.
  def hash_constant?(name)
    (@file_hash_constants[@current_file] || Set.new).include?(name)
  end

  # The body's locals that are provably a Hash: a `**opts` parameter, an
  # optional parameter defaulting to a hash literal (`def initialize(options =
  # {})`), and a local whose EVERY assignment in the body is a hash literal.
  # One assignment of anything else disqualifies the name, which is what keeps
  # `hash` a proof rather than a guess — an `options = other_thing` reassignment
  # leaves the local a plain `local`.
  def hash_typed_locals(body_node, params_node)
    assigned = {}
    hash_param_names(params_node).each { |name| assigned[name] = true }
    note_hash_assignments(body_node, assigned)
    assigned.select { |_name, hashy| hashy }.keys.to_set
  end

  # `**opts`, `options = {}` and `b: {}` — the parameter shapes whose value IS a
  # Hash on entry. A `*args` rest is an Array and a required parameter is
  # anything.
  def hash_param_names(params_node)
    return [] unless params_node.is_a?(Array) && params_node[0] == :params

    _, _required, optional, _rest, _post, keywords, keyword_rest, _block = params_node
    names = (optional || []).filter_map do |p|
      ident_name(p[0]) if p.is_a?(Array) && p[1].is_a?(Array) && p[1][0] == :hash
    end
    names.concat((keywords || []).filter_map { |kw|
      ident_name(kw[0])&.chomp(":") if kw.is_a?(Array) && kw[1].is_a?(Array) && kw[1][0] == :hash
    })
    names << ident_name(keyword_rest) if keyword_rest && keyword_rest != 0
    names.compact
  end

  # Every `x = …` / `x ||= …` in the body, recording whether the value is a hash
  # literal. A `:massign` target is recorded UNKNOWN rather than skipped: its
  # value is one element of an unwalked right-hand side.
  def note_hash_assignments(node, assigned)
    return unless node.is_a?(Array)

    case node[0]
    when :assign, :opassign
      name = assign_target_local(node[1])
      value = node[2]
      hashy = value.is_a?(Array) && %i[hash bare_assoc_hash].include?(value[0])
      assigned[name] = (assigned.fetch(name, true) && hashy) if name
    when :massign
      each_massign_target(node[1]) { |name| assigned[name] = false }
    end
    node.each { |child| note_hash_assignments(child, assigned) if child.is_a?(Array) }
  end

  # The local a `:var_field` assignment target names, or nil for an ivar,
  # constant, index or attribute target — none of which is a local at all.
  def assign_target_local(target)
    return nil unless target.is_a?(Array) && target[0] == :var_field

    inner = target[1]
    inner[1] if inner.is_a?(Array) && inner[0] == :@ident
  end

  def each_massign_target(targets, &block)
    return unless targets.is_a?(Array)

    name = assign_target_local(targets)
    return block.call(name) if name

    targets.each { |child| each_massign_target(child, &block) if child.is_a?(Array) }
  end

  # Every syntactic call site in the body, in source order, with its argument
  # descriptors (RFC 0025 §1). Kept beside collect_method_calls rather than
  # folded into it: `calls` is a de-duplicated NAME set, so it drops both the
  # repeats and the zero-argument sites the argument comparator has to see.
  def collect_call_args(body_node)
    sites = []
    with_capture_locals { walk_for_call_args(body_node, sites) }
    sites
  end

  SKELETON_IF_NODES = %i[if elsif unless if_mod unless_mod ifop when in].freeze
  SKELETON_LOOP_NODES = %i[while until while_mod until_mod for].freeze
  SKELETON_LOGICAL_OPS = [:"||", :"&&", :and, :or].freeze

  # The body's ordered control + call skeleton — `if` / `loop` / `try` /
  # `rescue` / `throw`, `new:Const` and `ref:<name>` reaches, in source order and WITH
  # duplicates. The TS counterpart is extract-ts-api.ts#extractSkeleton and the
  # vocabulary is deliberately identical; `calls` cannot stand in for it,
  # because `calls.uniq` drops both the repeats and the control flow.
  #
  # Three places where Ripper's shape has to be converged rather than
  # transcribed. `try` tokens on the `:bodystmt`, not on the `:rescue`/`:ensure`
  # clause Ripper hangs off its later slots, or it would land AFTER the
  # protected calls where the TS TryStatement puts it before them. And `raise`
  # tokens as `throw` rather than `ref:raise`, to line up with the port's
  # `throw new X(...)` — a ThrowStatement on the TS side, never a call. And a
  # modifier `rescue` tokens as `try`, which Ripper hangs off `:rescue_mod`
  # rather than a `:bodystmt` (RFC 0113).
  #
  # Arms are counted per CLAUSE, not per statement (RFC 0113): a `case` itself
  # emits nothing and each of its `:when` (or `:in`) clauses emits one `if`,
  # so a six-arm
  # `case` reads as six arms against the six `case` clauses of its `switch`
  # port or the six arms of its `if`/`elsif` chain port; and each `:rescue`
  # clause of a `:bodystmt` emits one `rescue` after that `:bodystmt`'s `try`,
  # against the TS `catch`'s `instanceof` arms. Ripper chains both clause
  # kinds through the clause's own last slot, so the ordinary child descent
  # already visits every one of them exactly once.
  def collect_method_skeleton(body_node)
    tokens = []
    with_capture_locals { walk_for_skeleton(body_node, tokens) }
    tokens
  end

  def walk_for_skeleton(node, tokens)
    return unless node.is_a?(Array)

    kind = node[0]
    if SKELETON_IF_NODES.include?(kind)
      tokens << "if"
    elsif SKELETON_LOOP_NODES.include?(kind)
      tokens << "loop"
    elsif kind == :bodystmt && (node[2] || node[4])
      tokens << "try"
    elsif kind == :rescue
      tokens << "rescue"
    elsif kind == :rescue_mod
      tokens << "try"
      tokens << "rescue"
    elsif kind == :binary && SKELETON_LOGICAL_OPS.include?(node[2])
      walk_for_skeleton(node[1], tokens)
      tokens << "if"
      walk_for_skeleton(node[3], tokens)
      return
    elsif kind == :opassign && SKELETON_LOGICAL_OPS.include?(op_assign_op(node[2]))
      tokens << "if"
    elsif kind == :aref
      # Receiver, then the `[]` reach, then the index — as
      # extract-ts-api.ts#extractSkeleton emits an ElementAccessExpression.
      walk_for_skeleton(node[1], tokens)
      tokens << "ref:get"
      walk_for_skeleton(node[2], tokens)
      return
    elsif %i[fcall vcall command].include?(kind)
      name = ident_name(node[1])
      skeleton_push_name(tokens, name, nil) unless kind == :vcall && capture_local?(name)
    elsif %i[call command_call].include?(kind)
      # Receiver before the call it receives, matching
      # extract-ts-api.ts#extractSkeleton; the two orders must agree.
      walk_for_skeleton(node[1], tokens)
      skeleton_push_name(tokens, node[3] ? ident_name(node[3]) : nil, node[1])
      node.drop(4).each { |child| walk_for_skeleton(child, tokens) if child.is_a?(Array) }
      return
    elsif %i[super zsuper].include?(kind)
      tokens << "ref:super"
    end

    node.each { |child| walk_for_skeleton(child, tokens) if child.is_a?(Array) }
    note_capture_locals(node)
  end

  # Ripper wraps an op-assign operator in an `:op` node on newer parsers and
  # hands it bare on older ones.
  def op_assign_op(op)
    op.is_a?(Array) ? op[1] : op
  end

  def skeleton_push_name(tokens, name, recv)
    return unless name

    if name == "raise"
      tokens << "throw"
    elsif name == "new"
      const = skeleton_const_name(recv)
      tokens << (const ? "new:#{const}" : "ref:new")
    else
      tokens << "ref:#{name}"
    end
  end

  def skeleton_const_name(recv)
    return nil unless recv.is_a?(Array)
    return recv[1][1] if recv[0] == :var_ref && recv[1].is_a?(Array) && recv[1][0] == :@const
    return skeleton_const_name(recv[2]) if recv[0] == :const_path_ref

    recv[0] == :@const ? recv[1] : nil
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

  # Record a constant keyed file → NAME (unwrapping `.freeze`). A non-literal
  # RHS still gets an entry, as {kind: "expr"} — the name is what extra-surface
  # scoring needs, and "expr" is already the uncomparable marker for literals.
  # Whether a Ripper node is the receiver `self`.
  def self_ref?(node)
    node.is_a?(Array) && node[0] == :var_ref && node[1].is_a?(Array) &&
      node[1][0] == :@kw && node[1][1] == "self"
  end

  # `self::OPTION_NAMES = [...]` inside a `Struct.new do ... end` body
  # (connection_adapters/abstract/schema_definitions.rb:79) is a constant
  # assignment like any other — it just reaches Ripper as a `const_path_field`
  # rather than a `var_field`, which used to drop it from the allow-set and
  # leave its faithful TS port scoring as novel surface.
  def maybe_record_constant(lhs, rhs)
    const =
      if lhs.is_a?(Array) && lhs[0] == :var_field
        lhs[1]
      elsif lhs.is_a?(Array) && lhs[0] == :const_path_field && self_ref?(lhs[1])
        lhs[2]
      end
    return unless const.is_a?(Array) && const[0] == :@const
    rhs = unwrap_freeze(rhs)
    maybe_record_collection_constant(const[1], rhs)
    maybe_record_symbol_hash_keys(const[1], rhs)
    record_file_hash_keys(literal_hash_keys(rhs))
    lit = literal_value(rhs)
    return if lit.nil?
    (@file_constants[@current_file] ||= {})[const[1]] = lit
  end

  # Record a Hash constant whose keys are all literal symbols, keyed the same
  # way @const_symbol_arrays is, so an `each` loop over it resolves to its keys:
  # `RFC4646_FORMATS.each do |name, format| define_method(name) …`
  # (i18n/locale/tag/rfc4646.rb:32-34) installs one method per key. Kept
  # separate from @const_symbol_arrays so a hash can't inject phantom
  # `delegate(*CONST, to:)` targets.
  def maybe_record_symbol_hash_keys(name, rhs)
    return unless rhs.is_a?(Array) && rhs[0] == :hash
    assocs = rhs[1]
    assocs = assocs[1] if assocs.is_a?(Array) && assocs[0] == :assoclist_from_args
    return unless assocs.is_a?(Array) && !assocs.empty?
    keys = []
    assocs.each do |assoc|
      return unless assoc.is_a?(Array) && assoc[0] == :assoc_new
      key = assoc_symbol_key(assoc[1])
      return unless key
      keys << key
    end
    (@const_symbol_hash_keys[current_fqn] ||= {})[name] = keys
  end

  # Ruby ivars an options hash is conventionally held in, so the Symbol keys
  # read off one are the method's option-key names even though no parameter
  # carries them: `JSONGemEncoder#options` is `@options`, read as
  # `@options.fetch(:escape_html_entities, …)` (json/encoding.rb:62).
  OPTION_IVAR_NAMES = %w[@options @opts].to_set

  def record_file_hash_keys(keys)
    return if keys.nil? || keys.empty?
    (@file_hash_keys[@current_file] ||= Set.new).merge(keys)
  end

  # Hash mutators that ADD keys to their receiver, so the keys of their literal
  # argument are keys of the receiver: `PARSING.update("double" => …,
  # "dateTime" => …)` (active_support/xml_mini.rb:90-93) gives PARSING two names
  # its `PARSING = {...}` assignment (xml_mini.rb:62) never mentions.
  HASH_CONST_UPDATE_METHODS = %w[update merge!].freeze

  # Keys a Hash constant gains AFTER its assignment. Kept lexical, like every
  # other collection-constant read here: the receiver must be a constant THIS
  # file assigns a hash literal to (`hash_constant?`), and a computed key is
  # skipped while its literal siblings still count. An `update` on anything else
  # records nothing, so an unresolvable port stays novel.
  def maybe_record_hash_const_update(node)
    call = node[1]
    return unless call.is_a?(Array) && call[0] == :call
    recv = call[1]
    return unless recv.is_a?(Array) && recv[0] == :var_ref &&
                  recv[1].is_a?(Array) && recv[1][0] == :@const
    return unless hash_constant?(recv[1][1])
    return unless HASH_CONST_UPDATE_METHODS.include?(ident_name(call[3]))
    paren = node[2]
    return unless paren.is_a?(Array) && paren[0] == :arg_paren
    args = paren[1]
    args = args[1] if args.is_a?(Array) && args[0] == :args_add_block
    return unless args.is_a?(Array)
    args.each { |arg| record_file_hash_keys(literal_hash_keys(arg)) }
  end

  # A Hash literal, in either of the two shapes Ripper produces: braced
  # (`{ a: 1 }`) and bare (`update(a: 1)`, an argument-position hash). Both hold
  # their `assoc_new` list at node[1], so one reader covers them.
  LITERAL_HASH_NODES = %i[hash bare_assoc_hash].freeze

  # Every literal key of a Hash literal, in EITHER Ruby spelling — a Symbol
  # (`:date =>` / `date:`) or a String (`"base64Binary" =>`, xml_mini.rb:83).
  # Unlike maybe_record_symbol_hash_keys, which needs the whole hash to be
  # symbol-keyed before it can stand in for a constant's member list, this is
  # per-KEY: a computed key is skipped and its literal siblings still count.
  def literal_hash_keys(node)
    return [] unless node.is_a?(Array) && LITERAL_HASH_NODES.include?(node[0])
    assocs = node[1]
    assocs = assocs[1] if assocs.is_a?(Array) && assocs[0] == :assoclist_from_args
    return [] unless assocs.is_a?(Array)
    assocs.filter_map do |assoc|
      next unless assoc.is_a?(Array) && assoc[0] == :assoc_new
      key = assoc[1]
      assoc_symbol_key(key) ||
        (key.is_a?(Array) && key[0] == :string_literal ? string_literal_value(key) : nil)
    end
  end

  def collect_ivar_option_keys(body)
    keys = []
    walk_for_option_keys(body, OPTION_IVAR_NAMES, {}, keys)
    keys.uniq
  end

  # A Hash key that is a Ruby Symbol, in either spelling: `:language =>` parses
  # as a `symbol_literal`, `language:` as a `@label` carrying its trailing colon.
  def assoc_symbol_key(node)
    return nil unless node.is_a?(Array)
    return node[1].chomp(":") if node[0] == :@label
    symbol_name(node)
  end

  # An Array/Hash literal RHS, recorded by SYNTACTIC kind rather than through
  # literal_value — that folds every non-empty collection to {kind: "expr"},
  # and what the receiver verdict below needs is the collection type, not the
  # elements (`[Encoding::UTF_8, …]` is still an Array).
  COLLECTION_LITERAL_NODES = %i[array hash].freeze

  def maybe_record_collection_constant(name, rhs)
    return unless rhs.is_a?(Array) && COLLECTION_LITERAL_NODES.include?(rhs[0])
    (@file_collection_constants[@current_file] ||= Set.new) << name
    (@file_hash_constants[@current_file] ||= Set.new) << name if rhs[0] == :hash
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
      traverse_for_consts(args, const_refs, keep_absolute: true)
      const_refs.each do |c|
        members = c.start_with?("::") ? resolve_const_symbol_array(c) : consts[c]
        (members || []).each { |s| keys << s }
      end
    elsif OPTION_READER_METHODS.include?(meth)
      syms = []
      traverse_for_symbols(args, syms)
      keys << syms.first if syms.first
    end
  end

  # `options` / `opts` (a local or param, `:@ident`) and `@options` / `@opts`
  # (an ivar) both read as `:var_ref`; the ivar arm carries its leading `@`, so
  # the two name spaces cannot collide inside one `vars` set.
  def option_var?(node, vars)
    return false unless node.is_a?(Array) && node[0] == :var_ref
    inner = node[1]
    return false unless inner.is_a?(Array)
    id = inner[0] == :@ivar ? inner[1] : ident_name(inner)
    !id.nil? && vars.include?(id)
  end

  # Receiver shapes whose method call says nothing about our port (RFC 0083):
  # a plain-Ruby `xs.first` / `opts.fetch` / `[].merge` collides by NAME with an
  # unrelated ported method and makes the wide gate demand the port call it.
  # Only PROVABLY inert receivers qualify — Ripper emits `:var_ref` with an
  # `:@ident` only for an in-scope LOCAL VARIABLE (a bare method call on self is
  # `:vcall`), and a literal receiver is inert by construction. Everything else
  # (`self.x`, ivars, constants, method chains) stays recorded: those are the
  # genuine calls to ported collaborators the gate exists to see.
  INERT_RECEIVER_LITERALS = %i[array hash string_literal symbol_literal dyna_symbol @int].freeze

  def inert_receiver?(recv)
    return false unless recv.is_a?(Array)
    return true if INERT_RECEIVER_LITERALS.include?(recv[0])
    return false unless recv[0] == :var_ref

    inner = recv[1]
    inner.is_a?(Array) && inner[0] == :@ident
  end

  # RFC 0108: inside a `core_ext/**` body, `self` IS the Ruby core object being
  # reopened, so a call naming a Ruby CORE method is a call to Ruby, not to a
  # ported trails collaborator — the gate matches a body call by NAME only, so
  # `size.div` collided with `Duration#div`, `count`/`first` with
  # `Relation#count`/`#first`, `unpack` with `Cache::Entry.unpack`. Same shape
  # as inert_receiver?: the RECEIVER says the call is not a ported-method call.
  #
  # Membership is asked of Ruby itself rather than hard-coded — the extractor
  # loads no Rails, so these classes are pristine core here — which keeps the
  # set exact as Ruby versions move. A core_ext body calling a SIBLING
  # ActiveSupport extension (`blank?`, `in_groups`, `to_fs`) names no core
  # method and is still recorded.
  CORE_MONKEY_PATCH_CLASSES = [
    Array, Hash, String, Symbol, Integer, Float, Numeric, Rational, Complex,
    Range, Regexp, Enumerable, Comparable, Module, Class, Object, Kernel,
    NilClass, TrueClass, FalseClass, Proc, Method, Exception, Struct,
    Time, Date, DateTime, File, IO, Dir, Marshal, Math, Process, Thread,
    Random, Encoding,
  ].freeze

  CORE_METHOD_NAMES = CORE_MONKEY_PATCH_CLASSES.flat_map { |klass|
    klass.public_instance_methods(true) + klass.singleton_methods(true)
  }.map(&:to_s).to_set.freeze

  # Ruby core/stdlib class constants no trails file ports as a class of its own,
  # so `Module.new` / `Marshal.load` is Ruby, not a ported collaborator, wherever
  # it appears. `Time`, `Date`, `String`, `Array`, … are deliberately absent:
  # trails does port those concepts, so a call on that constant can be a real
  # port call.
  #
  # This list is an only-shrink burndown of the receivers trails cannot yet
  # spell, not a permanent rule. A receiver leaves the moment ruby-compat can
  # spell it — `IO`, `Process`, and now `File` and `Dir` already have — and
  # nothing is ever added back to quiet a red run.
  CORE_CLASS_RECEIVERS = %w[
    Module Class Proc Kernel Marshal ObjectSpace GC Thread
    Mutex Encoding Random Signal Struct Method
  ].to_set.freeze

  def core_ext_file?
    !@current_file.nil? && @current_file.include?("core_ext/")
  end

  def core_class_receiver?(recv)
    return false unless recv.is_a?(Array) && recv[0] == :var_ref

    inner = recv[1]
    inner.is_a?(Array) && inner[0] == :@const && CORE_CLASS_RECEIVERS.include?(inner[1])
  end

  # A CONSTANT whose value is an Array or Hash literal in the same file is as
  # inert a receiver as the literal written in place (INERT_RECEIVER_LITERALS):
  # `ALLOWED_ENCODINGS_FOR_TRANSLITERATE.include?(string.encoding)`
  # (inflector/transliterate.rb:66, constant at :12) is Array#include?, not a
  # call to a ported trails `include?`.
  def collection_constant_receiver?(recv)
    return false unless recv.is_a?(Array) && recv[0] == :var_ref

    inner = recv[1]
    return false unless inner.is_a?(Array) && inner[0] == :@const

    (@file_collection_constants[@current_file] || Set.new).include?(inner[1])
  end

  # Inside a `module_eval` / `class_eval` / `Module.new { … }` block, `self` is
  # a Ruby Module, so an UNQUALIFIED call naming a Module method is Ruby
  # metaprogramming rather than a ported collaborator —
  # `deprecate_methods` (deprecation/method_wrappers.rb:35-49) calls
  # `define_method` / `redefine_method` there, and the port assigns the wrapper
  # onto the object instead. `redefine_method` and
  # `silence_redefinition_of_method` are ActiveSupport's own Module extensions
  # (core_ext/module/redefine_method.rb), so Ruby cannot be asked for them.
  # Module's OWN methods only (`false`): the inherited half is Object/Kernel,
  # whose names (`raise`, `send`, `respond_to?`) a block body calls for the
  # ordinary reasons any body does.
  MODULE_EVAL_SELF_METHODS = (
    Module.instance_methods(false) + Module.private_instance_methods(false)
  ).map(&:to_s).to_set.merge(%w[redefine_method silence_redefinition_of_method]).freeze

  MODULE_EVAL_CALL_NAMES = %w[module_eval class_eval module_exec class_exec].to_set.freeze

  def module_eval_self_call?(name, recv)
    recv.nil? && @module_eval_depth > 0 && MODULE_EVAL_SELF_METHODS.include?(name)
  end

  # The callee of a `:method_add_block` whose block body runs with a Module as
  # `self`: `x.module_eval do … end`, a bare `class_eval { … }`, `Module.new { … }`.
  def module_eval_block?(callee)
    return false unless callee.is_a?(Array)

    call = callee[0] == :method_add_arg ? callee[1] : callee
    return false unless call.is_a?(Array)

    case call[0]
    when :call, :command_call
      name = ident_name(call[3])
      return true if MODULE_EVAL_CALL_NAMES.include?(name)
      name == "new" && const_name(call[1]) == "Module"
    when :fcall, :vcall, :command
      MODULE_EVAL_CALL_NAMES.include?(ident_name(call[1]))
    else
      false
    end
  end

  def with_module_eval(entering)
    @module_eval_depth += 1 if entering
    yield
  ensure
    @module_eval_depth -= 1 if entering
  end

  def core_receiver_call?(name, recv)
    return true if module_eval_self_call?(name, recv)
    return false unless CORE_METHOD_NAMES.include?(name)

    core_ext_file? || (!recv.nil? && (core_class_receiver?(recv) || collection_constant_receiver?(recv)))
  end

  # `Proc.new { ... }` ports to an arrow function, which names no callee at all,
  # so the `new` recorded here could never be satisfied by any TS body. The
  # discriminator is the RECEIVER, not the name: `Foo.new` is a real call the TS
  # side already satisfies (extract-ts-api.ts records `constructor` for every
  # `new X()`, and rubyMethodToTs("new") is ["constructor"]), so this verdict is
  # per-SITE — a body with both `Proc.new` and `Foo.new` still records the second.
  def proc_new_receiver?(recv)
    return false unless recv.is_a?(Array) && recv[0] == :var_ref

    inner = recv[1]
    inner.is_a?(Array) && inner[0] == :@const && inner[1] == "Proc"
  end

  # `weak` collects the occurrences whose receiver was inert; a name only
  # becomes a weak CALL when no non-inert occurrence exists (collect_method_calls).
  def walk_for_calls(node, calls, weak)
    return unless node.is_a?(Array)

    case node[0]
    when :method_add_arg, :fcall, :vcall, :call, :command, :command_call
      callee, args = split_call_node(node)
      walk_call_in_order(callee, args, calls, weak)
      return
    when :super, :zsuper
      # super(args) is [:super, ...]; bare super is [:zsuper]. Both chain to
      # the parent method; record as "super" so calls-parity can flag a ported
      # override that drops the super call. Its arguments precede it, as every
      # other call's do — the TS `super(...)` is an ordinary CallExpression.
      lambdas = []
      node.drop(1).each { |child| walk_arg_node(child, calls, weak, lambdas) }
      calls << "super"
      lambdas.each { |lambda_node| walk_for_calls(lambda_node, calls, weak) }
      return
    when :method_add_block
      # Same order as the plain child walk this used to fall through to — the
      # call first, then its block body — but the body is walked knowing whose
      # `self` it runs under (module_eval_self_call?).
      walk_for_calls(node[1], calls, weak)
      with_module_eval(module_eval_block?(node[1])) do
        node.drop(2).each { |child| walk_for_calls(child, calls, weak) if child.is_a?(Array) }
      end
      return
    end

    node.each { |child| walk_for_calls(child, calls, weak) if child.is_a?(Array) }
    note_capture_locals(node)
  end

  # Decompose a call-ish Ripper node into [callee_node, argument_nodes] — the
  # argument list hangs off a different slot in each of Ripper's five call
  # shapes. nil when the node is not a call.
  def split_call_node(node)
    return nil unless node.is_a?(Array)

    case node[0]
    when :method_add_arg then [node[1], node.drop(2)]
    when :command then [[:fcall, node[1]], node.drop(2)]
    when :command_call then [node[0, 4], node.drop(4)]
    when :fcall, :vcall, :call then [node, []]
    end
  end

  # Receiver, then the ARGUMENTS, then the call itself — Ruby's EVALUATION
  # order, matching extract-ts-api.ts#collectCalls; the two orders must agree.
  # Recording evaluation rather than lexical order makes the sequence invariant
  # to hoisting: `add_to_target(build_record(x))` and the port's
  # `const r = await buildRecord(x); addToTarget(r)` — the hoist an `await`
  # forces — record the same two names in the same order.
  #
  # A BLOCK is not walked here: `:method_add_block` falls through to the plain
  # child walk, so a block body lands AFTER the name of the call it hangs off.
  # That is the port's order too — Rails' `xs.each do … end` is normally a
  # `for` loop, whose body follows the iterated expression — and the TS side
  # defers function-expression arguments for exactly this reason.
  def walk_call_in_order(callee, args, calls, weak)
    name = nil
    recv = nil
    case callee[0]
    when :fcall, :vcall
      # Unqualified method call: foo() or foo
      name = ident_name(callee[1])
      name = nil if callee[0] == :vcall && capture_local?(name)
    when :call, :command_call
      # Qualified method call: obj.foo
      recv = callee[1]
      walk_for_calls(recv, calls, weak)
      name = ident_name(callee[3]) if callee[3]
    else
      # Not a plain call node (`foo[1](2)`, a chained `method_add_arg`, …) —
      # walk it whole; its arguments still follow.
      walk_for_calls(callee, calls, weak)
    end

    lambdas = []
    args.each { |child| walk_arg_node(child, calls, weak, lambdas) }

    # The call-set half of record_call_site's reader-receiver verdict: the
    # receiver walk above has already recorded the reader's own name, which is
    # the one the port's direct invocation spells, so recording `call` on top of
    # it demands a callee no faithful port writes (RFC 0108).
    name = nil if name == "call" && recv && attr_reader_receiver_name(recv)

    if name && !name.start_with?("_") && name =~ /\A[a-z]/ &&
       !(name == "new" && recv && proc_new_receiver?(recv))
      calls << name
      (@call_receivers[name] ||= Set.new) << receiver_kind(recv)
      weak << name if (recv && inert_receiver?(recv)) || core_receiver_call?(name, recv)
    end

    lambdas.each { |lambda_node| walk_for_calls(lambda_node, calls, weak) }
  end

  # Ripper's argument wrappers — structure, never a call of their own.
  ARG_WRAPPER_NODES = %i[
    arg_paren args args_new args_add args_add_star args_add_block
    bare_assoc_hash assoc_new assoc_splat
  ].freeze

  # An argument subtree, with lambda literals collected rather than walked: a
  # `-> { … }` argument (`scope :active, -> { where(…) }`) is a block in
  # everything but Ripper's node name, and the port spells it as the callback
  # argument extract-ts-api.ts#collectCalls defers — so its body follows the
  # call name there, and must here.
  def walk_arg_node(node, calls, weak, lambdas)
    return unless node.is_a?(Array)

    kind = node[0]
    if kind == :lambda
      lambdas << node
    elsif kind.is_a?(Array) || ARG_WRAPPER_NODES.include?(kind)
      node.each { |child| walk_arg_node(child, calls, weak, lambdas) if child.is_a?(Array) }
    else
      walk_for_calls(node, calls, weak)
    end
  end

  # `attr_writer` is deliberately absent: it declares `foo=` and no `foo`, so a
  # bare `foo` in the body is a real method the class defines some other way
  # (the `@foo ||= …` lazy reader beside a writer is the common pair), and
  # suppressing it would hide a call the port must make.
  ATTR_DECLARATION_COMMANDS = %w[attr_reader attr_accessor].freeze

  # The attribute names a class body declares with `attr_reader` /
  # `attr_accessor`, collected up front rather than as the walk reaches them:
  # `association_scope.rb:52` declares `value_transformation` above its readers,
  # but nothing in Ruby requires that order.
  #
  # Nested `class`/`module` bodies are NOT descended into — their declarations
  # belong to their own scope, which gets its own stack frame — but `class <<
  # self` is, since those readers are read from the same file's class methods.
  def collect_attr_declarations(node, names = Set.new)
    return names unless node.is_a?(Array)
    return names if %i[class module def defs].include?(node[0])

    args =
      case node[0]
      when :command
        node[2] if ATTR_DECLARATION_COMMANDS.include?(ident_name(node[1]))
      when :method_add_arg
        node[2] if node[1].is_a?(Array) && node[1][0] == :fcall &&
                   ATTR_DECLARATION_COMMANDS.include?(ident_name(node[1][1]))
      end
    extract_symbol_args(args).each { |name| names << name } if args

    node.each { |child| collect_attr_declarations(child, names) if child.is_a?(Array) }
    names
  end

  # A bare `value_transformation` in a body that declares it `attr_reader` is an
  # ATTRIBUTE READ, not a method call — Ruby just has no other spelling for one.
  # Its port is a getter or a plain field, and reading one emits no call node on
  # the TS side, so emitting one here pairs the surviving TS calls against the
  # wrong Ruby ones and reports an argument mismatch against a faithful port
  # (RFC 0108). Only the 0-arg, block-less, implicit-receiver (or `self.`) form
  # qualifies: `record.association(association)` (branch.rb:84) passes arguments
  # and stays a call, as does the same name on any other receiver.
  def attr_reader_read?(callee, args, flags)
    names = @attr_names_stack.last
    return false if names.nil? || names.empty?
    return false if flags.include?("block")
    return false unless empty_arg_list?(args)

    case callee[0]
    when :vcall, :fcall then names.include?(ident_name(callee[1]))
    when :call
      return false unless self_receiver?(callee[1])
      name = callee[3].is_a?(Array) ? ident_name(callee[3]) : nil
      !name.nil? && names.include?(name)
    else false
    end
  end

  # The name of the `attr_reader` a bare receiver reads, or nil. A stored Proc
  # is invoked as `value_transformation.call(value)` (association_scope.rb:78)
  # because Ruby has no other spelling for it; the port's callable field is
  # invoked directly, `this.valueTransformation(value)`. So the two bodies do
  # the same one thing, and the site belongs under the READER's name on both
  # sides — recording `call` demands a TS callee that a faithful port cannot
  # write (RFC 0108).
  def attr_reader_receiver_name(recv)
    return nil unless recv.is_a?(Array)

    names = @attr_names_stack.last
    return nil if names.nil? || names.empty?

    name =
      case recv[0]
      when :vcall, :fcall then ident_name(recv[1])
      when :call
        self_receiver?(recv[1]) && recv[3].is_a?(Array) ? ident_name(recv[3]) : nil
      end
    name if name && names.include?(name)
  end

  def empty_arg_list?(args)
    return true if args.nil?
    return false unless args.is_a?(Array)
    return true if args.empty? || args[0] == :args_new
    return empty_arg_list?(args[1]) if args[0] == :arg_paren
    return empty_arg_list?(args[1]) if args[0] == :args_add_block && !args[2].is_a?(Array)
    false
  end

  def self_receiver?(recv)
    return false unless recv.is_a?(Array) && recv[0] == :var_ref

    inner = recv[1]
    inner.is_a?(Array) && inner[0] == :@kw && inner[1] == "self"
  end

  # The argument half of walk_for_calls (RFC 0025 §1). Every syntactic call
  # site is recorded exactly ONCE: record_call_site is terminal — it walks the
  # receiver, emits the site, then walks the arguments — so a `:method_add_arg`
  # wrapping an `:fcall` never re-enters the inner node the naive traversal
  # would record a second time.
  def walk_for_call_args(node, sites)
    return unless node.is_a?(Array)

    case node[0]
    when :method_add_arg, :method_add_block, :command, :command_call, :call, :fcall, :vcall,
         :super, :zsuper
      record_call_site(node, sites, [])
    else
      node.each { |child| walk_for_call_args(child, sites) if child.is_a?(Array) }
      note_capture_locals(node)
    end
  end

  # Ripper hangs the argument node off a different slot per call shape: `node[2]`
  # for `:command` and `:method_add_arg`, `node[4]` for `:command_call`,
  # `node[1]` for `:super`, and nothing at all for a paren-less `:call`.
  def record_call_site(node, sites, flags)
    case node[0]
    when :method_add_block
      # `each { … }` — the block flags the call it wraps, and its body is walked
      # after the site so the stream stays in source order.
      record_call_site(node[1], sites, flags + ["block"])
      with_module_eval(module_eval_block?(node[1])) do
        node.drop(2).each { |child| walk_for_call_args(child, sites) if child.is_a?(Array) }
      end
      return
    when :method_add_arg then callee, args = node[1], node[2]
    when :command then callee, args = node, node[2]
    when :command_call then callee, args = node, node[4]
    when :super then callee, args = node, node[1]
    when :zsuper then callee, args, flags = node, nil, flags + ["zsuper"]
    else callee, args = node, nil
    end

    walk_for_call_args(callee[1], sites) if callee[0] == :call || callee[0] == :command_call

    name = call_site_name(callee)
    name = nil if callee[0] == :vcall && capture_local?(name)
    # The argument half of walk_for_calls' `Proc.new` verdict: the call-set gate
    # has already agreed the site can never be satisfied, so recording it here
    # would let the argument gate flag a site the other extractor says is gone.
    name = nil if name == "new" && (callee[0] == :call || callee[0] == :command_call) &&
                  proc_new_receiver?(callee[1])
    name = nil if name && attr_reader_read?(callee, args, flags)
    if name == "call" && (callee[0] == :call || callee[0] == :command_call)
      name = attr_reader_receiver_name(callee[1]) || name
    end
    if name
      site_flags = flags.dup
      # The per-SITE half of walk_for_calls' `weak` tally, from the same
      # inert_receiver? verdict: `xs.map` says nothing about the port. Recorded
      # per site rather than folded into a per-method weak NAME set, because a
      # name that is weak at one site can be a genuine ported-collaborator call
      # at another (`Nodes::Union.new` in select_manager.rb#union), and a name
      # filter drops both.
      qualified = callee[0] == :call || callee[0] == :command_call
      site_flags << "weak" if (qualified && inert_receiver?(callee[1])) ||
                              core_receiver_call?(name, qualified ? callee[1] : nil)
      descriptors = describe_args(args, site_flags)
      site = { name: name, args: descriptors, flags: site_flags.uniq }
      if callee[0] == :call || callee[0] == :command_call
        recv = describe_arg(callee[1], site_flags)
        site[:recv] = recv if recv && recv != "?"
      end
      sites << site
    end

    walk_for_call_args(args, sites)
  end

  # The same name filter walk_for_calls applies, so the two streams pair up.
  def call_site_name(callee)
    return "super" if callee[0] == :super || callee[0] == :zsuper

    name =
      if callee[0] == :call || callee[0] == :command_call
        callee[3].is_a?(Array) ? ident_name(callee[3]) : nil
      else
        ident_name(callee[1])
      end
    return nil unless name && !name.start_with?("_") && name =~ /\A[a-z]/
    name
  end

  def describe_args(node, flags)
    return [] unless node.is_a?(Array)
    return [] if node.empty?

    case node[0]
    when :arg_paren then describe_args(node[1], flags)
    when :args_add_block
      if node[2].is_a?(Array)
        flags << "blockpass"
        # What was block-passed, so call-args.ts#tsBlockArgIndex can find it in
        # the TS list the port forwards it through. Described against a scratch
        # flag list: the block itself must not flag the call.
        flags << "blockarg=#{describe_arg(node[2], [])}"
      end
      describe_args(node[1], flags)
    when :args_add_star
      flags << "splat"
      describe_args(node[1], flags) + ["*splat"] +
        node.drop(3).map { |child| describe_arg(child, flags) }
    else
      # A plain argument list is a bare Array of argument nodes.
      return node.map { |child| describe_arg(child, flags) } if node[0].is_a?(Array)
      [describe_arg(node, flags)]
    end
  end

  # `unary<desc>`, `binop:<op>`, `ternary`, `array`, `hash`, `str-interp` and
  # `?` are the OPAQUE descriptors of RFC 0025 §1 — emitted as-is so the
  # comparator can recognise and skip the site rather than guess at it.
  def describe_arg(node, flags)
    return "?" unless node.is_a?(Array)

    case node[0]
    when :@int, :@float, :@rational, :@imaginary then "num:#{node[1]}"
    when :@label then "sym:#{node[1].chomp(":")}"
    when :@kw
      case node[1]
      when "true", "false" then "bool:#{node[1]}"
      when "nil" then "nil"
      else "id:#{node[1]}"
      end
    when :@ident, :@ivar, :@gvar, :@cvar then "id:#{node[1]}"
    when :@const then "const:#{node[1]}"
    when :var_ref, :var_field, :top_const_ref then describe_arg(node[1], flags)
    when :const_path_ref then describe_arg(node[2], flags)
    when :string_literal then describe_string(node[1])
    when :symbol_literal then "sym:#{ident_name(node[1]) || "?"}"
    when :dyna_symbol
      literal = describe_string(node[1])
      literal.start_with?("str:") ? "sym:#{literal.delete_prefix("str:")}" : "?"
    when :vcall, :fcall then "id:#{ident_name(node[1]) || "?"}"
    when :call, :command, :command_call, :method_add_arg, :method_add_block
      name = nested_call_name(node)
      name ? "call:#{name}" : "?"
    when :array then "array"
    when :hash then describe_hash(node[1], flags)
    when :bare_assoc_hash then describe_kwargs(node[1], flags) || "hash"
    when :binary then "binop:#{node[2]}"
    when :unary then describe_unary(node, flags)
    when :ifop then "ternary"
    when :paren then describe_args(node[1], flags).first || "?"
    else "?"
    end
  end

  # Ripper splits `-1` into `[:unary, :-@, [:@int, "1"]]`. Fold the negation
  # back into the value — the fold `literal_value` already applies on the
  # DEFAULT path — so `foo(-1)` compares as `num:-1` rather than taking the
  # whole call site out of the argument gate. Any other unary stays opaque.
  def describe_unary(node, flags)
    inner = node[2]
    if node[1] == :-@ && inner.is_a?(Array) && [:@int, :@float].include?(inner[0])
      "num:-#{inner[1]}"
    else
      "unary#{describe_arg(inner, flags)}"
    end
  end

  # Nested calls are recorded by NAME only (RFC 0025 §1); `Foo.new` reads as
  # `constructor`, matching what `new Foo()` already credits on the TS side.
  def nested_call_name(node)
    case node[0]
    when :method_add_arg, :method_add_block then nested_call_name(node[1])
    when :command then ident_name(node[1])
    when :call, :command_call
      name = node[3].is_a?(Array) ? ident_name(node[3]) : nil
      name == "new" ? "constructor" : name
    when :fcall, :vcall then ident_name(node[1])
    end
  end

  # `[:string_content, part…]` for a `:string_literal`, a bare part list for a
  # `:dyna_symbol`. An interpolated part makes the whole value opaque.
  def describe_string(node)
    return "?" unless node.is_a?(Array)

    parts = node[0] == :string_content ? node.drop(1) : node
    return "?" unless parts.is_a?(Array)
    return "str:" if parts.empty?
    return "str-interp" unless parts.all? { |p| p.is_a?(Array) && p[0] == :@tstring_content }
    "str:#{escape_descriptor_text(parts.map { |p| p[1] }.join)}"
  end

  # The four grammar delimiters, so a string VALUE carrying one does not read as
  # one. Rationale and the inverse: call-args.ts#unescapeDescriptorText.
  def escape_descriptor_text(text)
    text.gsub(/[%,={}]/) { |c| format("%%%02X", c.ord) }
  end

  # A braced `{ … }` is the ObjectLiteralExpression the port writes, and the TS
  # extractor reads that as `kwargs{…}` — so a hash whose keys are all
  # keyword-shaped has to read the same here or every such site is a guaranteed
  # cross-language mismatch. Anything else (string, dynamic or no keys) is the
  # opaque `hash` of RFC 0025 §1.
  def describe_hash(node, flags)
    return "hash" unless node.is_a?(Array) && node[0] == :assoclist_from_args
    describe_kwargs(node[1], flags) || "hash"
  end

  # nil when the assoc list is not keyword-shaped, so the caller can fall back
  # to the opaque descriptor rather than emit a `kwargs{}` full of `?`.
  def describe_kwargs(assocs, flags)
    return nil unless assocs.is_a?(Array) && !assocs.empty?

    pairs = assocs.map do |assoc|
      return nil unless assoc.is_a?(Array)
      case assoc[0]
      when :assoc_new
        key = assoc_key_name(assoc[1])
        return nil unless key
        "#{key}=#{describe_arg(assoc[2], flags)}"
      when :assoc_splat
        flags << "splat"
        "**splat"
      else return nil
      end
    end
    "kwargs{#{pairs.join(",")}}"
  end

  # `k:` and `:k =>` both spell the bare identifier key a TS object literal has.
  def assoc_key_name(key)
    return nil unless key.is_a?(Array)
    return key[1].chomp(":") if key[0] == :@label
    ident_name(key[1]) if key[0] == :symbol_literal
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

  # Earliest source line under `node`. Ripper's SCANNER events carry a
  # `[lineno, column]` tuple as their last element (e.g.
  # `[:@ident, "from_database", [7, 8]]`); parser events don't, so recurse
  # until one turns up.
  #
  # The scanner-event gate (`:@`-prefixed head) is what makes this exact rather
  # than a guess: shape alone ("last element is a 2-Integer array") would also
  # match any parser event that happened to end in one, and silently yield a
  # line from the wrong subtree. Only scanner events ever carry positions, so
  # checking the head costs nothing and removes the ambiguity.
  def first_line(node)
    return nil unless node.is_a?(Array)

    head = node[0]
    if head.is_a?(Symbol) && head.to_s.start_with?("@")
      tail = node.last
      if tail.is_a?(Array) && tail.length == 2 &&
         tail[0].is_a?(Integer) && tail[1].is_a?(Integer)
        return tail[0]
      end
    end

    node.each do |child|
      line = first_line(child)
      return line if line
    end
    nil
  end

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

  def extract_const_args(args, keep_absolute: false)
    results = []
    return results unless args.is_a?(Array)
    traverse_for_consts(args, results, keep_absolute: keep_absolute)
    results
  end

  def extract_const_args_from_paren(args, keep_absolute: false)
    results = []
    return results unless args.is_a?(Array)
    traverse_for_consts(args, results, keep_absolute: keep_absolute)
    results
  end

  # `keep_absolute` preserves the leading `::` of an absolute reference
  # (`include ::Foo`) so `lookup_ancestor` can honour Ruby's rule that `::`
  # bypasses lexical scope. Off by default: other callers key into hashes of
  # bare constant names and must keep seeing `Foo`.
  def traverse_for_consts(node, results, keep_absolute: false)
    return unless node.is_a?(Array)
    case node[0]
    when :const_path_ref, :@const, :var_ref, :top_const_ref, :const_ref
      name = keep_absolute ? qualified_const_name(node) : const_name(node)
      results << name if name
    else
      node.each { |child| traverse_for_consts(child, results, keep_absolute: keep_absolute) }
    end
  end

  # `const_name` with a leading `::` restored when the reference was written
  # absolutely — `::Foo` and `::A::B` both keep the marker; `A::B` does not.
  def qualified_const_name(node)
    name = const_name(node)
    return nil unless name
    absolute_const_ref?(node) ? "::#{name}" : name
  end

  # True when the leftmost element of a constant reference is `::`. Ripper
  # nests the qualifier leftwards, so `::A::B` is
  # `const_path_ref(top_const_ref(A), B)` and the relative `A::B` is
  # `const_path_ref(var_ref(A), B)` — recursing on node[1] separates them.
  # (`:top_const_path_ref` is not a Ripper event; `Ripper::PARSER_EVENTS`
  # defines only `:top_const_ref` and `:top_const_field`.)
  def absolute_const_ref?(node)
    return false unless node.is_a?(Array)
    case node[0]
    when :top_const_ref
      true
    when :const_path_ref, :var_ref, :const_ref
      absolute_const_ref?(node[1])
    else
      false
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
    extractorHash: EXTRACTOR_HASH,
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

    # Scan the top-level umbrella file (`<libPath>.rb`, one level above the
    # package's libPath and outside the glob above) for module-level singleton
    # config and attribute it to `<Module>::Base`. Done last so that Base class
    # already exists. See ApiExtractor#scan_umbrella_file.
    entry_file = PACKAGE_ENTRY_FILES[pkg_name]
    if entry_file
      # Walked relative to its own directory, so it records as `arel.rb` — the
      # path `packages/arel/src/arel.ts` maps onto — rather than the umbrella
      # scan's `../arel.rb`, which matches no TS file.
      abort "Entry file for #{pkg_name} not found at #{entry_file}." unless File.file?(entry_file)
      extractor.process_file(entry_file, File.dirname(entry_file))
    else
      umbrella_file = "#{pkg_dir.sub(%r{/\z}, '')}.rb"
      extractor.scan_umbrella_file(umbrella_file, pkg_dir) if File.file?(umbrella_file)
    end

    # Drop define_method entries a literal `def` in the same bucket supersedes.
    extractor.dedupe_define_methods!

    # Fill alias param lists from their targets now that every file in the
    # package has been seen (a reopened class may define the target elsewhere).
    extractor.resolve_aliases!

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
      fileHashKeys: extractor.file_hash_keys.transform_values { |ks| ks.to_a.sort },
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

  output_path = ENV.fetch("RUBY_API_OUTPUT_PATH", File.join(OUTPUT_DIR, "rails-api.json"))
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

run if __FILE__ == $PROGRAM_NAME
