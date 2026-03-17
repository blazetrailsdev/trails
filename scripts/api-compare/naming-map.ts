// Naming convention conversions between Ruby and TypeScript

/** Convert snake_case to camelCase */
export function snakeToCamel(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

/** Convert Ruby predicate method (ends with ?) to TS form */
export function rubyPredicateToTs(name: string): string {
  if (!name.endsWith("?")) return name;
  const base = name.slice(0, -1);
  // Special cases
  if (base === "nil") return "isNull";
  if (base === "valid") return "isValid";
  if (base === "invalid") return "isInvalid";
  if (base === "persisted") return "isPersisted";
  if (base === "new_record") return "isNewRecord";
  if (base === "destroyed") return "isDestroyed";
  if (base === "changed") return "isChanged";
  if (base === "frozen") return "isFrozen";
  if (base === "blank") return "isBlank";
  if (base === "present") return "isPresent";
  if (base === "empty") return "isEmpty";
  if (base === "readonly") return "isReadonly";
  // General pattern: foo_bar? -> isFooBar
  return "is" + snakeToCamel(base).replace(/^./, (c) => c.toUpperCase());
}

/** Convert Ruby bang method (ends with !) to TS form */
export function rubyBangToTs(name: string): string {
  if (!name.endsWith("!")) return name;
  const base = name.slice(0, -1);
  return snakeToCamel(base) + "Bang";
}

/** Full conversion of a Ruby method name to expected TS name */
export function rubyMethodToTs(name: string): string | null {
  // Manual overrides
  const override = METHOD_OVERRIDES[name];
  if (override !== undefined) return override;

  // Handle predicate methods
  if (name.endsWith("?")) {
    return rubyPredicateToTs(name);
  }

  // Handle bang methods
  if (name.endsWith("!")) {
    return rubyBangToTs(name);
  }

  // Handle setter methods
  if (name.endsWith("=")) {
    const base = name.slice(0, -1);
    // For attr setters, the TS side uses set accessors with the camelCase name
    return snakeToCamel(base);
  }

  // Standard snake_case -> camelCase
  return snakeToCamel(name);
}

/** Methods that have non-standard mappings or should be skipped */
const METHOD_OVERRIDES: Record<string, string | null> = {
  // Skip — Ruby fundamentals
  initialize: "constructor",
  to_ary: null,
  to_a: null,
  to_s: "toString",
  to_str: "toString",
  to_i: null,
  to_f: null,
  to_h: null,
  to_hash: null,
  to_json: "toJSON",
  to_sql: "toSql",
  inspect: null,
  dup: null,
  clone: null,
  freeze: null,
  hash: null,
  "eql?": "equals",
  "equal?": null,
  "respond_to?": null,
  "respond_to_missing?": null,
  method_missing: null,
  send: null,
  class: null,
  object_id: null,
  tap: null,
  then: null,
  yield_self: null,
  instance_variable_get: null,
  instance_variable_set: null,
  instance_variables: null,
  "is_a?": null,
  "kind_of?": null,
  "nil?": null,

  // Operator-like
  "[]": "get",
  "[]=": "set",
  "<<": null,
  "<=>": null,
  "==": "equals",
  "===": null,
  "!=": null,
  "+": null,
  "-": null,
  "*": null,
  "/": null,
  "%": null,
  "&": null,
  "|": null,
  "^": null,
  "~": null,
  "!": null,
  "!~": null,
  "=~": null,
  ">>": null,
  "~@": null,

  // --- Step 1: Fix naming map false negatives ---
  // Methods that exist in TS but the auto-mapping gets wrong
  "include?": "include",
  "added?": "added",
  "of_kind?": "ofKind",
  "copy!": "copy",
  "merge!": "merge",
  "structurally_compatible?": "structurallyCompatible",
  "exists?": "exists",
  left_outer_joins: "leftOuterJoins",
  "table_exists?": "tableExists",
  "column_exists?": "columnExists",
  "attribute_changed?": "attributeChanged",
  "attribute_previously_changed?": "attributePreviouslyChanged",
  "has_changes_to_save?": "hasChangesToSave",
  "will_save_change_to_attribute?": "willSaveChangeToAttribute",
  "saved_change_to_attribute?": "savedChangeToAttribute",
  "attribute_present?": "attributePresent",
  "attribute_changed_in_place?": "attributeChangedInPlace",
  "changed?": "changed",

  // --- Step 2: Skip Ruby-internal methods (null = no TS equivalent) ---

  // Ruby object lifecycle
  initialize_copy: null,
  initialize_dup: null,
  init_attributes: null,
  encode_with: null,
  init_with: null,
  init_with_attributes: null,
  pretty_print: null,

  // Arel internals
  engine: null,
  "engine=": null,
  type_cast_for_database: null,
  type_caster: null,
  "able_to_type_cast?": null,
  quoted_array: null,
  to_dot: null,

  // AR connection infrastructure
  connection_handler: null,
  "connection_handler=": null,
  configurations: null,
  "configurations=": null,
  connected_to_stack: null,
  current_role: null,
  current_shard: null,
  current_preventing_writes: null,
  "preventing_writes?": null,
  connection_class: null,
  "connection_class=": null,
  "connection_class?": null,
  connection_class_for_self: null,
  connection: null,
  connection_pool: null,

  // AR internal lifecycle
  "before_committed!": null,
  "committed!": null,
  "rolledback!": null,
  with_transaction_returning_status: null,
  "trigger_transactional_callbacks?": null,
  "custom_validation_context?": null,
  populate_with_current_scope_attributes: null,
  initialize_internals_callback: null,
  "strict_loading_violation!": null,

  // AR internal class methods
  find_by_sql: null,
  async_find_by_sql: null,
  _query_by_sql: null,
  _load_from_sql: null,
  count_by_sql: null,
  async_count_by_sql: null,
  _exec_scope: null,
  "application_record_class?": null,
  asynchronous_queries_session: null,
  asynchronous_queries_tracker: null,
  full_inspect: null,

  // _-prefixed internal attrs
  "_inheritance_column=": null,
  _new_record_before_last_commit: null,
  "_new_record_before_last_commit=": null,

  // AR internal instance methods
  strict_loading_mode: null,
  "strict_loading_n_plus_one_only?": null,
  "strict_loading_all?": null,
  "locking_enabled?": null,
  normalize_attribute: null,
  destroy_association_async_job: null,
  "destroy_association_async_job=": null,
  derive_join_table_name: null,

  // Relation bang (!) mutating variants — our Relation returns new instances
  "includes!": null,
  "eager_load!": null,
  "preload!": null,
  "_select!": null,
  "with!": null,
  "with_recursive!": null,
  "reselect!": null,
  "group!": null,
  "regroup!": null,
  "order!": null,
  "reorder!": null,
  "unscope!": null,
  "joins!": null,
  "left_outer_joins!": null,
  "where!": null,
  "invert_where!": null,
  "and!": null,
  "or!": null,
  "having!": null,
  "limit!": null,
  "offset!": null,
  "lock!": null,
  "none!": null,
  "readonly!": null,
  "strict_loading!": null,
  "create_with!": null,
  "from!": null,
  "distinct!": null,
  "extending!": null,
  "optimizer_hints!": null,
  "reverse_order!": null,
  "skip_query_cache!": null,
  "skip_preloading!": null,
  "annotate!": null,
  "uniq!": null,
  "excluding!": null,
  "references!": null,

  // Relation internals
  predicate_builder: null,
  skip_preloading_value: null,
  "skip_preloading_value=": null,
  bind_attribute: null,
  cache_key: null,
  compute_cache_key: null,
  cache_version: null,
  compute_cache_version: null,
  cache_key_with_version: null,
  joined_includes_values: null,
  values: null,
  values_for_queries: null,
  "empty_scope?": null,
  "has_limit_or_offset?": null,
  alias_tracker: null,
  preload_associations: null,
  construct_join_dependency: null,
  "raise_record_not_found_exception!": null,
  scoping: null,
  "scheduled?": null,
  "eager_loading?": null,
  "null_relation?": null,

  // Migration internals
  delegate: null,
  "delegate=": null,
  execution_strategy: null,
  exec_migration: null,
  write: null,
  announce: null,
  say: null,
  say_with_time: null,
  suppress_messages: null,
  copy: null,
  next_migration_number: null,
  table_name_options: null,
  native_database_types: null,
  table_options: null,
  table_comment: null,
  table_alias_for: null,
  data_sources: null,
  "data_source_exists?": null,
  dump_schema_information: null,
  internal_string_options_for_primary_key: null,
  assume_migrated_upto_version: null,
  type_to_sql: null,
  columns_for_distinct: null,
  distinct_relation_for_primary_key: null,
  update_table_definition: null,
  add_index_options: null,
  index_algorithm: null,
  quoted_columns_for_index: null,
  "options_include_default?": null,
  create_schema_dumper: null,
  "use_foreign_keys?": null,
  schema_creation: null,
  bulk_change_table: null,
  valid_table_definition_options: null,
  valid_column_definition_options: null,
  valid_primary_key_options: null,
  max_index_name_size: null,
  inherited: null,
  current_version: null,
  "valid_version_format?": null,
  nearest_delegate: null,
  "check_all_pending!": null,
  "load_schema_if_pending!": null,
  "maintain_test_schema!": null,
  "disable_ddl_transaction!": null,
  check_pending_migrations: null,
  proper_table_name: null,

  // Table name= — readonly in TS
  "name=": null,
  // Migration version= — readonly getter in TS
  "version=": null,

  // Additional internal/unimplemented Ruby methods
  build_create_table_definition: null,
  build_create_join_table_definition: null,
  build_add_column_definition: null,
  build_change_column_default_definition: null,
  build_create_index_definition: null,
  "index_name_exists?": null,
  "foreign_key_exists?": null,
  foreign_key_column_for: null,
  foreign_key_options: null,
  check_constraints: null,
  add_check_constraint: null,
  check_constraint_options: null,
  remove_check_constraint: null,
  "check_constraint_exists?": null,
  remove_constraint: null,
  change_table_comment: null,
  change_column_comment: null,
  disable_ddl_transaction: null,
  "disable_ddl_transaction=": null,
  "eql?": null,
  type_for_attribute: null,
  extended: null,
  attribute_writer_missing: null,
  define_model_callbacks: null,
  "inheritance_column=": null,
  "association_cached?": null,
  // Ruby class macros that appear as instance methods in the manifest
  validates_with: null,
  // Errors#initialize takes base, but our constructor is parameterless (errors created internally)
  "view_exists?": null,
  "index_exists?": null,
  "[]=": null,
  "[]": null,
};

/** Maps a Ruby fully-qualified class/module name to package:ClassName in our TS codebase */
export const CLASS_MAP: Record<string, string> = {
  // Arel
  "Arel::Table": "arel:Table",
  "Arel::SelectManager": "arel:SelectManager",
  "Arel::InsertManager": "arel:InsertManager",
  "Arel::UpdateManager": "arel:UpdateManager",
  "Arel::DeleteManager": "arel:DeleteManager",
  "Arel::Attributes::Attribute": "arel:Attribute",
  "Arel::Predications": "arel:Attribute", // mixed into Attribute
  "Arel::OrderPredications": "arel:Attribute",
  "Arel::AliasPredication": "arel:Attribute",
  "Arel::Math": "arel:Attribute",
  "Arel::Expressions": "arel:Attribute",
  "Arel::Nodes::Node": "arel:Node",
  "Arel::Nodes::SelectStatement": "arel:SelectStatement",
  "Arel::Nodes::InsertStatement": "arel:InsertStatement",
  "Arel::Nodes::UpdateStatement": "arel:UpdateStatement",
  "Arel::Nodes::DeleteStatement": "arel:DeleteStatement",
  "Arel::Nodes::SelectCore": "arel:SelectCore",
  "Arel::Nodes::SqlLiteral": "arel:SqlLiteral",
  "Arel::Nodes::And": "arel:And",
  "Arel::Nodes::Or": "arel:Or",
  "Arel::Nodes::Not": "arel:Not",
  "Arel::Nodes::Grouping": "arel:Grouping",
  "Arel::Nodes::Equality": "arel:Equality",
  "Arel::Nodes::NotEqual": "arel:NotEqual",
  "Arel::Nodes::GreaterThan": "arel:GreaterThan",
  "Arel::Nodes::GreaterThanOrEqual": "arel:GreaterThanOrEqual",
  "Arel::Nodes::LessThan": "arel:LessThan",
  "Arel::Nodes::LessThanOrEqual": "arel:LessThanOrEqual",
  "Arel::Nodes::In": "arel:In",
  "Arel::Nodes::NotIn": "arel:NotIn",
  "Arel::Nodes::Between": "arel:Between",
  "Arel::Nodes::Matches": "arel:Matches",
  "Arel::Nodes::DoesNotMatch": "arel:DoesNotMatch",
  "Arel::Nodes::Binary": "arel:Binary",
  "Arel::Nodes::Unary": "arel:Unary",
  "Arel::Nodes::JoinSource": "arel:JoinSource",
  "Arel::Nodes::InnerJoin": "arel:InnerJoin",
  "Arel::Nodes::OuterJoin": "arel:OuterJoin",
  "Arel::Nodes::StringJoin": "arel:StringJoin",
  "Arel::Nodes::Union": "arel:Union",
  "Arel::Nodes::UnionAll": "arel:UnionAll",
  "Arel::Nodes::Intersect": "arel:Intersect",
  "Arel::Nodes::Except": "arel:Except",
  "Arel::Nodes::With": "arel:With",
  "Arel::Nodes::WithRecursive": "arel:WithRecursive",
  "Arel::Nodes::TableAlias": "arel:TableAlias",
  "Arel::Nodes::Case": "arel:Case",
  "Arel::Nodes::Exists": "arel:Exists",
  "Arel::Nodes::Distinct": "arel:Distinct",
  "Arel::Nodes::Offset": "arel:Offset",
  "Arel::Nodes::Limit": "arel:Limit",
  "Arel::Nodes::Lock": "arel:Lock",
  "Arel::Nodes::Ascending": "arel:Ascending",
  "Arel::Nodes::Descending": "arel:Descending",
  "Arel::Nodes::Window": "arel:Window",
  "Arel::Nodes::NamedWindow": "arel:NamedWindow",
  "Arel::Nodes::Quoted": "arel:Quoted",
  "Arel::Nodes::Casted": "arel:Casted",
  "Arel::Nodes::BindParam": "arel:BindParam",
  "Arel::Nodes::NamedFunction": "arel:NamedFunction",
  "Arel::Nodes::Comment": "arel:Comment",
  "Arel::Nodes::Lateral": "arel:Lateral",
  "Arel::Nodes::Regexp": "arel:Regexp",
  "Arel::Nodes::NotRegexp": "arel:NotRegexp",
  "Arel::Nodes::IsDistinctFrom": "arel:IsDistinctFrom",
  "Arel::Nodes::IsNotDistinctFrom": "arel:IsNotDistinctFrom",
  "Arel::Crud": "arel:SelectManager", // Crud methods are on manager classes
  "Arel::FactoryMethods": "arel:Table", // FactoryMethods mixed into Table

  // ActiveModel
  "ActiveModel::Model": "activemodel:Model",
  "ActiveModel::Dirty": "activemodel:Model",
  "ActiveModel::Validations": "activemodel:Model",
  "ActiveModel::Callbacks": "activemodel:Model",
  "ActiveModel::Attributes": "activemodel:Model",
  "ActiveModel::AttributeAssignment": "activemodel:Model",
  "ActiveModel::Serialization": "activemodel:Model",
  "ActiveModel::Conversion": "activemodel:Model",
  "ActiveModel::AttributeMethods": "activemodel:Model",
  "ActiveModel::Errors": "activemodel:Errors",
  "ActiveModel::Naming": "activemodel:ModelName",
  "ActiveModel::Name": "activemodel:ModelName",
  "ActiveModel::Type::String": "activemodel:StringType",
  "ActiveModel::Type::Integer": "activemodel:IntegerType",
  "ActiveModel::Type::Float": "activemodel:FloatType",
  "ActiveModel::Type::Boolean": "activemodel:BooleanType",
  "ActiveModel::Type::Date": "activemodel:DateType",
  "ActiveModel::Type::DateTime": "activemodel:DateTimeType",
  "ActiveModel::Type::Decimal": "activemodel:DecimalType",
  "ActiveModel::Validations::PresenceValidator": "activemodel:PresenceValidator",
  "ActiveModel::Validations::LengthValidator": "activemodel:LengthValidator",
  "ActiveModel::Validations::NumericalityValidator": "activemodel:NumericalityValidator",
  "ActiveModel::Validations::InclusionValidator": "activemodel:InclusionValidator",
  "ActiveModel::Validations::ExclusionValidator": "activemodel:ExclusionValidator",
  "ActiveModel::Validations::FormatValidator": "activemodel:FormatValidator",
  "ActiveModel::Validations::AcceptanceValidator": "activemodel:AcceptanceValidator",
  "ActiveModel::Validations::ConfirmationValidator": "activemodel:ConfirmationValidator",
  "ActiveModel::Validations::ComparisonValidator": "activemodel:ComparisonValidator",
  "ActiveModel::Validations::AbsenceValidator": "activemodel:AbsenceValidator",

  // ActiveRecord
  "ActiveRecord::Base": "activerecord:Base",
  "ActiveRecord::Persistence": "activerecord:Base",
  "ActiveRecord::Core": "activerecord:Base",
  "ActiveRecord::Querying": "activerecord:Base",
  "ActiveRecord::Scoping": "activerecord:Base",
  "ActiveRecord::Inheritance": "activerecord:Base",
  "ActiveRecord::ModelSchema": "activerecord:Base",
  "ActiveRecord::AttributeAssignment": "activerecord:Base",
  "ActiveRecord::Callbacks": "activerecord:Base",
  "ActiveRecord::Transactions": "activerecord:Base",
  "ActiveRecord::Validations": "activerecord:Base",
  "ActiveRecord::Locking::Optimistic": "activerecord:Base",
  "ActiveRecord::Locking::Pessimistic": "activerecord:Base",
  "ActiveRecord::Integration": "activerecord:Base",
  "ActiveRecord::Relation": "activerecord:Relation",
  "ActiveRecord::QueryMethods": "activerecord:Relation",
  "ActiveRecord::FinderMethods": "activerecord:Relation",
  "ActiveRecord::Calculations": "activerecord:Relation",
  "ActiveRecord::SpawnMethods": "activerecord:Relation",
  "ActiveRecord::Batches": "activerecord:Relation",
  "ActiveRecord::Migration": "activerecord:Migration",
  "ActiveRecord::ConnectionAdapters::SchemaStatements": "activerecord:Migration",
  "ActiveRecord::Associations::CollectionProxy": "activerecord:CollectionProxy",
  "ActiveRecord::Reflection::AssociationReflection": "activerecord:AssociationReflection",

  // ActiveSupport
  "ActiveSupport::BacktraceCleaner": "activesupport:BacktraceCleaner",
  "ActiveSupport::BroadcastLogger": "activesupport:BroadcastLogger",
  "ActiveSupport::Cache::MemoryStore": "activesupport:MemoryStore",
  "ActiveSupport::Cache::NullStore": "activesupport:NullStore",
  "ActiveSupport::Cache::FileStore": "activesupport:FileStore",
  "ActiveSupport::CurrentAttributes": "activesupport:CurrentAttributes",
  "ActiveSupport::Deprecation": "activesupport:Deprecation",
  "ActiveSupport::Duration": "activesupport:Duration",
  "ActiveSupport::ErrorReporter": "activesupport:ErrorReporter",
  "ActiveSupport::HashWithIndifferentAccess": "activesupport:HashWithIndifferentAccess",
  "ActiveSupport::Inflector::Inflections": "activesupport:Inflections",
  "ActiveSupport::Logger": "activesupport:Logger",
  "ActiveSupport::MessageEncryptor": "activesupport:MessageEncryptor",
  "ActiveSupport::MessageVerifier": "activesupport:MessageVerifier",
  "ActiveSupport::TimeWithZone": "activesupport:TimeWithZone",
  "ActiveSupport::TimeZone": "activesupport:TimeZone",
  "ActiveSupport::Notifications::Event": "activesupport:Event",
  "ActiveSupport::Notifications": "activesupport:Notifications",
  "ActiveSupport::ParameterFilter": "activesupport:ParameterFilter",
  "ActiveSupport::SafeBuffer": "activesupport:SafeBuffer",
  "ActiveSupport::KeyGenerator": "activesupport:KeyGenerator",
  "ActiveSupport::CachingKeyGenerator": "activesupport:CachingKeyGenerator",
  "ActiveSupport::OrderedHash": "activesupport:OrderedHash",
  "ActiveSupport::StringInquirer": "activesupport:StringInquirer",
  "ActiveSupport::OrderedOptions": "activesupport:OrderedOptions",
  "ActiveSupport::InheritableOptions": "activesupport:InheritableOptions",

  // ActionController
  "ActionController::Metal": "actioncontroller:Metal",
  "ActionController::Base": "actioncontroller:Base",
  "ActionController::API": "actioncontroller:API",
};

/**
 * Ruby modules that contribute methods to a given TS class.
 * Used to resolve the full method set of a class.
 */
export const MODULE_CONTRIBUTIONS: Record<string, string[]> = {
  "arel:Table": ["Arel::Table", "Arel::FactoryMethods", "Arel::AliasPredication"],
  "arel:Attribute": [
    "Arel::Attributes::Attribute",
    "Arel::Predications",
    "Arel::OrderPredications",
    "Arel::AliasPredication",
    "Arel::Math",
    "Arel::Expressions",
  ],
  "arel:SelectManager": [
    "Arel::SelectManager",
    "Arel::Crud",
    "Arel::FactoryMethods",
    "Arel::TreeManager",
  ],
  "arel:InsertManager": ["Arel::InsertManager", "Arel::TreeManager"],
  "arel:UpdateManager": ["Arel::UpdateManager", "Arel::TreeManager"],
  "arel:DeleteManager": ["Arel::DeleteManager", "Arel::TreeManager"],
  "activemodel:Model": [
    "ActiveModel::Model",
    "ActiveModel::Dirty",
    "ActiveModel::Validations",
    "ActiveModel::Callbacks",
    "ActiveModel::Attributes",
    "ActiveModel::AttributeAssignment",
    "ActiveModel::Serialization",
    "ActiveModel::Conversion",
    "ActiveModel::AttributeMethods",
    "ActiveModel::Access",
  ],
  "activemodel:Errors": ["ActiveModel::Errors"],
  "activerecord:Base": [
    "ActiveRecord::Base",
    "ActiveRecord::Persistence",
    "ActiveRecord::Core",
    "ActiveRecord::Querying",
    "ActiveRecord::Scoping",
    "ActiveRecord::Inheritance",
    "ActiveRecord::ModelSchema",
    "ActiveRecord::AttributeAssignment",
    "ActiveRecord::Callbacks",
    "ActiveRecord::Transactions",
    "ActiveRecord::Validations",
    "ActiveRecord::Locking::Optimistic",
    "ActiveRecord::Locking::Pessimistic",
    "ActiveRecord::Integration",
    "ActiveRecord::Associations",
    "ActiveRecord::CounterCache",
    "ActiveRecord::Timestamp",
    "ActiveRecord::Normalization",
  ],
  "activerecord:Relation": [
    "ActiveRecord::Relation",
    "ActiveRecord::QueryMethods",
    "ActiveRecord::FinderMethods",
    "ActiveRecord::Calculations",
    "ActiveRecord::SpawnMethods",
    "ActiveRecord::Batches",
  ],
  "activerecord:Migration": [
    "ActiveRecord::Migration",
    "ActiveRecord::ConnectionAdapters::SchemaStatements",
  ],
  "activesupport:Duration": ["ActiveSupport::Duration"],
  "activesupport:HashWithIndifferentAccess": ["ActiveSupport::HashWithIndifferentAccess"],
  "activesupport:TimeWithZone": ["ActiveSupport::TimeWithZone"],
  "activesupport:TimeZone": ["ActiveSupport::TimeZone"],
  "activesupport:Notifications": ["ActiveSupport::Notifications"],
  "activesupport:MemoryStore": ["ActiveSupport::Cache::MemoryStore", "ActiveSupport::Cache::Store"],
  "activesupport:NullStore": ["ActiveSupport::Cache::NullStore", "ActiveSupport::Cache::Store"],
  "activesupport:FileStore": ["ActiveSupport::Cache::FileStore", "ActiveSupport::Cache::Store"],
  "actioncontroller:Metal": ["ActionController::Metal"],
  "actioncontroller:Base": [
    "ActionController::Base",
    "ActionController::Metal",
    "ActionController::ConditionalGet",
    "ActionController::Live",
  ],
  "actioncontroller:API": ["ActionController::API", "ActionController::Metal"],
};
