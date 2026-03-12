#!/usr/bin/env npx tsx
/**
 * Applies test description renames to match Rails test conventions.
 * Each entry maps: [tsFile, oldDescription, newDescription]
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

// [relative file path, old it() description, new it() description]
const RENAMES: [string, string, string][] = [
  // ==========================================================================
  // Arel
  // ==========================================================================
  // Table
  [
    "packages/arel/src/arel.test.ts",
    "manufactures an Attribute via get()",
    "manufactures an attribute if the symbol names an attribute within the relation",
  ],
  ["packages/arel/src/arel.test.ts", "project returns a SelectManager", "returns a tree manager"],

  // Attribute predicates
  ["packages/arel/src/arel.test.ts", "eq generates =", "should return an equality node"],
  ["packages/arel/src/arel.test.ts", "eq(null) generates IS NULL", "should handle nil"],
  ["packages/arel/src/arel.test.ts", "notEq generates !=", "should create a NotEqual node"],
  ["packages/arel/src/arel.test.ts", "gt generates >", "should create a GreaterThan node"],
  ["packages/arel/src/arel.test.ts", "lt generates <", "should create a LessThan node"],
  ["packages/arel/src/arel.test.ts", "matches generates LIKE", "should create a Matches node"],
  [
    "packages/arel/src/arel.test.ts",
    "doesNotMatch generates NOT LIKE",
    "should create a DoesNotMatch node",
  ],
  ["packages/arel/src/arel.test.ts", "notIn generates NOT IN", "should generate NOT IN in sql"],

  // Ordering
  ["packages/arel/src/arel.test.ts", "asc generates ASC", "should create an Ascending node"],
  ["packages/arel/src/arel.test.ts", "desc generates DESC", "should create a Descending node"],

  // Math operations
  ["packages/arel/src/arel.test.ts", "add generates +", "should handle Addition"],
  ["packages/arel/src/arel.test.ts", "subtract generates -", "should handle Subtraction"],
  ["packages/arel/src/arel.test.ts", "multiply generates *", "should handle Multiplication"],
  ["packages/arel/src/arel.test.ts", "divide generates /", "should handle Division"],

  // SelectManager
  ["packages/arel/src/arel.test.ts", "lock generates FOR UPDATE", "adds a lock node"],
  ["packages/arel/src/arel.test.ts", "inner join", "returns inner join sql"],
  ["packages/arel/src/arel.test.ts", "left outer join", "returns outer join sql"],

  // InsertManager
  ["packages/arel/src/arel.test.ts", "handles null values", "inserts null"],
  ["packages/arel/src/arel.test.ts", "handles boolean false", "inserts false"],

  // UpdateManager
  ["packages/arel/src/arel.test.ts", "generates UPDATE with WHERE", "generates a where clause"],
  ["packages/arel/src/arel.test.ts", "handles null set value", "updates with null"],

  // DeleteManager
  ["packages/arel/src/arel.test.ts", "generates DELETE with WHERE", "uses where values"],

  // Advanced
  ["packages/arel/src/arel.test.ts", "UNION", "should union two managers"],
  ["packages/arel/src/arel.test.ts", "UNION ALL", "should union all"],
  ["packages/arel/src/arel.test.ts", "INTERSECT", "should intersect two managers"],
  ["packages/arel/src/arel.test.ts", "EXCEPT", "should except two managers"],
  ["packages/arel/src/arel.test.ts", "EXISTS wraps subquery", "should create an exists clause"],
  ["packages/arel/src/arel.test.ts", "WITH clause", "should support basic WITH"],
  ["packages/arel/src/arel.test.ts", "WITH RECURSIVE", "should support WITH RECURSIVE"],
  [
    "packages/arel/src/arel.test.ts",
    "attribute.count(true) generates COUNT(DISTINCT ...)",
    "should take a distinct param",
  ],
  ["packages/arel/src/arel.test.ts", "attribute.count()", "should return a count node"],
  ["packages/arel/src/arel.test.ts", "attribute.sum()", "should create a SUM node"],
  ["packages/arel/src/arel.test.ts", "attribute.maximum()", "should create a MAX node"],
  ["packages/arel/src/arel.test.ts", "attribute.minimum()", "should create a Min node"],
  ["packages/arel/src/arel.test.ts", "attribute.average()", "should create a AVG node"],
  ["packages/arel/src/arel.test.ts", "NamedFunction: COUNT(*)", "should visit named functions"],
  ["packages/arel/src/arel.test.ts", "NamedFunction: SUM with alias", "construct with alias"],
  [
    "packages/arel/src/arel.test.ts",
    "attribute compared to subquery",
    "should handle comparing with a subquery",
  ],
  [
    "packages/arel/src/arel.test.ts",
    "OVER with PARTITION BY and ORDER BY",
    "takes a partition and an order",
  ],
  ["packages/arel/src/arel.test.ts", "OVER with empty window", "should use empty definition"],

  // Window framing
  [
    "packages/arel/src/arel.test.ts",
    "ROWS UNBOUNDED PRECEDING",
    "takes a rows frame, unbounded preceding",
  ],

  // Join types
  ["packages/arel/src/arel.test.ts", "StringJoin (raw SQL join)", "returns string join sql"],

  // Case node
  [
    "packages/arel/src/arel.test.ts",
    "generates simple CASE WHEN THEN END",
    "supports simple case expressions",
  ],
  [
    "packages/arel/src/arel.test.ts",
    "generates CASE with operand",
    "supports extended case expressions",
  ],
  [
    "packages/arel/src/arel.test.ts",
    "generates CASE with multiple conditions and else",
    "allows chaining multiple conditions",
  ],

  // Extract node
  ["packages/arel/src/arel.test.ts", "generates EXTRACT(field FROM expr)", "should extract field"],
  ["packages/arel/src/arel.test.ts", "supports .as() aliasing", "should alias the extract"],

  // InfixOperation
  ["packages/arel/src/arel.test.ts", "generates custom infix operation", "construct"],

  // Comment node
  [
    "packages/arel/src/arel.test.ts",
    "generates SQL comment",
    "appends a comment to the generated query",
  ],

  // SelectManager introspection
  [
    "packages/arel/src/arel.test.ts",
    "projections getter returns current projections",
    "reads projections",
  ],
  [
    "packages/arel/src/arel.test.ts",
    "projections setter replaces all projections",
    "overwrites projections",
  ],
  [
    "packages/arel/src/arel.test.ts",
    "constraints returns where conditions",
    "gives me back the where sql",
  ],
  ["packages/arel/src/arel.test.ts", "source returns the FROM source", "should hand back froms"],
  [
    "packages/arel/src/arel.test.ts",
    "orders getter returns ORDER BY expressions",
    "returns order clauses",
  ],
  [
    "packages/arel/src/arel.test.ts",
    "as() returns a TableAlias for subquery aliasing",
    "can be aliased",
  ],

  // Table factory methods
  ["packages/arel/src/arel.test.ts", "alias() creates a TableAlias", "create table alias"],
  ["packages/arel/src/arel.test.ts", "createJoin() creates an InnerJoin node", "create join"],
  [
    "packages/arel/src/arel.test.ts",
    "createStringJoin() creates a StringJoin node",
    "create string join",
  ],
  ["packages/arel/src/arel.test.ts", "createOn() creates an On node", "create on"],

  // InsertManager columns getter
  [
    "packages/arel/src/arel.test.ts",
    "returns columns after insert()",
    "combines columns and values list in order",
  ],

  // UpdateManager introspection
  ["packages/arel/src/arel.test.ts", "key() sets primary key condition", "can be set"],

  // Collectors
  [
    "packages/arel/src/arel.test.ts",
    "Bind collector accumulates binds",
    "compile gathers all bind params",
  ],

  // DeleteManager advanced
  ["packages/arel/src/arel.test.ts", "DELETE with ORDER BY and LIMIT", "handles limit properly"],

  // InsertManager advanced
  [
    "packages/arel/src/arel.test.ts",
    "multi-row INSERT with ValuesList",
    "can create a ValuesList node",
  ],

  // Attribute string/null functions
  ["packages/arel/src/arel.test.ts", "lower() generates LOWER function", "lower"],
  ["packages/arel/src/arel.test.ts", "coalesce() generates COALESCE function", "coalesce"],

  // ToSql Visitor
  [
    "packages/arel/src/arel.test.ts",
    "Grouping produces single layer of parens",
    "wraps nested groupings in brackets only once",
  ],
  ["packages/arel/src/arel.test.ts", "Not applies to expression", "should visit_Not"],
  ["packages/arel/src/arel.test.ts", "SqlLiteral is not quoted", "should not quote sql literals"],
  ["packages/arel/src/arel.test.ts", "handles boolean false", "should handle false"],
  ["packages/arel/src/arel.test.ts", "handles boolean true", "should handle true"],
  [
    "packages/arel/src/arel.test.ts",
    "handles string escaping (single quotes)",
    "should escape strings",
  ],

  // ==========================================================================
  // ActiveModel
  // ==========================================================================
  // Validations - length
  [
    "packages/activemodel/src/activemodel.test.ts",
    "rejects too short",
    "validates length of using minimum",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "rejects too long",
    "validates length of using maximum",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "accepts within range",
    "validates length of using within",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "validates exact length with is",
    "validates length of using is",
  ],

  // Validations - numericality
  [
    "packages/activemodel/src/activemodel.test.ts",
    "accepts numbers",
    "default validates numericality of",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "validates onlyInteger",
    "validates numericality of with integer only",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "validates greaterThan",
    "validates numericality with greater than",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "validates lessThan",
    "validates numericality with less than",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "validates odd",
    "validates numericality with odd",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "validates even",
    "validates numericality with even",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "skips null",
    "validates numericality of with nil allowed",
  ],

  // Validations - inclusion/exclusion/format
  [
    "packages/activemodel/src/activemodel.test.ts",
    "accepts included values",
    "validates inclusion of",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "rejects excluded values",
    "validates exclusion of",
  ],
  ["packages/activemodel/src/activemodel.test.ts", "accepts matching format", "validate format"],

  // Validations - acceptance
  [
    "packages/activemodel/src/activemodel.test.ts",
    "accepts '1' and true",
    "terms of service agreement",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "rejects '0' and false",
    "terms of service agreement no acceptance",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "custom accept values",
    "terms of service agreement with accept value",
  ],

  // Validations - confirmation
  [
    "packages/activemodel/src/activemodel.test.ts",
    "passes when confirmation matches",
    "title confirmation",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "fails when confirmation doesn't match",
    "no title confirmation",
  ],

  // Validations - conditional
  [
    "packages/activemodel/src/activemodel.test.ts",
    "if: skips when condition is false",
    "if validation using block false",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "unless: skips when condition is true",
    "unless validation using block true",
  ],

  // Validations - general
  [
    "packages/activemodel/src/activemodel.test.ts",
    "isInvalid is the inverse of isValid",
    "invalid should be the opposite of valid",
  ],

  // Errors
  [
    "packages/activemodel/src/activemodel.test.ts",
    "add and get",
    "add creates an error object and returns it",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "count and size",
    "size calculates the number of error messages",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "empty and any",
    "detecting whether there are errors with empty?, blank?, include?",
  ],
  ["packages/activemodel/src/activemodel.test.ts", "clear removes all errors", "clear errors"],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "attributeNames returns unique names",
    "attribute_names returns the error attributes",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "fullMessages for base has no prefix",
    "full_message returns the given message when attribute is :base",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "fullMessages for attribute has prefix",
    "full_message returns the given message with the attribute name included",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "details returns error detail objects",
    "details returns added error detail",
  ],

  // Dirty tracking
  [
    "packages/activemodel/src/activemodel.test.ts",
    "tracks changes after writeAttribute",
    "setting attribute will result in change",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "attributeChange returns [old, new]",
    "changes to attribute values",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "changes returns all changes",
    "list of changed attribute keys",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "setting same value does not register change",
    "setting color to same value should not result in change being recorded",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "setting back to original clears the change",
    "resetting attribute",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "multiple changes retain first original value",
    "changing the same attribute multiple times retains the correct original value",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "restoreAttributes reverts all changes",
    "restore_attributes should restore all previous data",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "changesApplied commits changes and records previousChanges",
    "saving should preserve previous changes",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "clears both current and previous changes",
    "clear_changes_information should reset all changes",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "new changes after changesApplied don't affect previousChanges",
    "setting new attributes should not affect previous changes",
  ],

  // Callbacks
  [
    "packages/activemodel/src/activemodel.test.ts",
    "full callback chain: before → around → action → around → after",
    "complete callback chain",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "before callback returning false halts the chain",
    "further callbacks should not be called if before validation throws abort",
  ],

  // Serialization
  [
    "packages/activemodel/src/activemodel.test.ts",
    "serializableHash returns all attributes",
    "method serializable hash should work",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "only filters attributes",
    "method serializable hash should work with only option",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "except excludes attributes",
    "method serializable hash should work with except option",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "methods includes method results",
    "method serializable hash should work with methods option",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "only + methods combined",
    "method serializable hash should work with only and methods",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "include option serializes nested associations",
    "include option with singular association",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "include with options filters nested attributes",
    "include with options",
  ],

  // fromJson
  [
    "packages/activemodel/src/activemodel.test.ts",
    "sets attributes from a JSON string",
    "from_json should work without a root (class attribute)",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "supports includeRoot option",
    "from_json should work with a root (method parameter)",
  ],

  // Naming
  ["packages/activemodel/src/activemodel.test.ts", "singular is underscored", "singular"],
  ["packages/activemodel/src/activemodel.test.ts", "plural adds s", "plural"],
  ["packages/activemodel/src/activemodel.test.ts", "element is underscored", "element"],
  ["packages/activemodel/src/activemodel.test.ts", "collection matches plural", "collection"],
  ["packages/activemodel/src/activemodel.test.ts", "paramKey is underscored", "param key"],
  ["packages/activemodel/src/activemodel.test.ts", "routeKey is plural", "route key"],
  ["packages/activemodel/src/activemodel.test.ts", "i18nKey is underscored", "i18n key"],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "toPartialPath returns conventional path",
    "to_partial_path default implementation returns a string giving a relative path",
  ],

  // Conversion
  [
    "packages/activemodel/src/activemodel.test.ts",
    "returns self",
    "to_model default implementation returns self",
  ],

  // Types
  ["packages/activemodel/src/activemodel.test.ts", "casts string to Date", "type cast date"],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "casts ISO string to Date",
    "type cast datetime and timestamp",
  ],
  ["packages/activemodel/src/activemodel.test.ts", "casts number to string", "type cast decimal"],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "casts NaN string to null",
    "type cast decimal from invalid string",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "registers custom type",
    "a class can be registered for a symbol",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "throws on unknown type",
    "a reasonable error is given when no type is found",
  ],

  // ComparisonValidator
  [
    "packages/activemodel/src/activemodel.test.ts",
    "validates equalTo",
    "validates comparison with equal to using numeric",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "validates otherThan",
    "validates comparison with other than using numeric",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "supports function comparands (like Rails procs)",
    "validates comparison with proc",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "works with dates",
    "validates comparison with greater than using date",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "works with strings",
    "validates comparison with greater than using string",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "skips nil values",
    "validates comparison with nil allowed",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "supports multiple constraints",
    "validates comparison of multiple values",
  ],

  // Numericality comparison operators
  [
    "packages/activemodel/src/activemodel.test.ts",
    "greaterThanOrEqualTo",
    "validates numericality with greater than or equal",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "lessThanOrEqualTo",
    "validates numericality with less than or equal to",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "equalTo",
    "validates numericality with equal to",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "otherThan",
    "validates numericality with other than",
  ],

  // Inclusion/exclusion allowNil
  [
    "packages/activemodel/src/activemodel.test.ts",
    "skips nil by default",
    "validates inclusion of with allow nil",
  ],

  // validates_*_of shorthand
  [
    "packages/activemodel/src/activemodel.test.ts",
    "validatesPresenceOf validates presence",
    "validate presences",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "validatesAbsenceOf validates absence",
    "validates absence of",
  ],

  // Errors enhancements
  [
    "packages/activemodel/src/activemodel.test.ts",
    "added? checks if a specific error was already added",
    "added? defaults message to :invalid",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "delete removes errors for an attribute",
    "delete removes details on given attribute",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "copy/merge copies errors from another instance",
    "merge errors",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "toHash groups messages by attribute",
    "to_hash returns the error messages hash",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "include checks if attribute has errors",
    "include?",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "fullMessage generates a complete message",
    "full_messages creates a list of error messages with the attribute name included",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "returns full messages for a specific attribute",
    "full_messages_for contains all the error messages for the given attribute indifferent",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "checks if error of specific kind exists",
    "of_kind? defaults message to :invalid",
  ],

  // Errors#generateMessage
  [
    "packages/activemodel/src/activemodel.test.ts",
    "generates a message for a type",
    "generate_message works without i18n_scope",
  ],

  // typeForAttribute
  [
    "packages/activemodel/src/activemodel.test.ts",
    "returns the type for a registered attribute",
    ".type_for_attribute returns the registered attribute type",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "returns null for unknown attributes",
    ".type_for_attribute returns the default type when an unregistered attribute is specified",
  ],

  // isPersisted
  [
    "packages/activemodel/src/activemodel.test.ts",
    "returns false for ActiveModel instances",
    "persisted is always false",
  ],

  // ConfirmationValidator caseSensitive
  [
    "packages/activemodel/src/activemodel.test.ts",
    "is case-sensitive by default",
    "title confirmation with case sensitive option true",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "supports caseSensitive: false",
    "title confirmation with case sensitive option false",
  ],

  // validatesWith
  [
    "packages/activemodel/src/activemodel.test.ts",
    "validates using a custom validator class",
    "validation with class that adds errors",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "passes extra options to the validator constructor",
    "passes all configuration options to the validator class",
  ],

  // validatesEach
  [
    "packages/activemodel/src/activemodel.test.ts",
    "validates each attribute with a block function",
    "validates each",
  ],

  // strict validations
  [
    "packages/activemodel/src/activemodel.test.ts",
    "raises an exception instead of adding to errors",
    "strict validation in validates",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "does not throw when validation passes",
    "strict validation not fails",
  ],

  // custom validation contexts
  [
    "packages/activemodel/src/activemodel.test.ts",
    "validates with custom context",
    "with a class that adds errors on create and validating a new model",
  ],
  [
    "packages/activemodel/src/activemodel.test.ts",
    "standard create/update contexts still work",
    "with a class that adds errors on update and validating a new model",
  ],

  // ==========================================================================
  // ActiveRecord
  // ==========================================================================
  // Base / table name
  [
    "packages/activerecord/src/activerecord.test.ts",
    "infers table name from class name",
    "table name guesses",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "allows overriding table name",
    "switching between table name",
  ],

  // Record state
  [
    "packages/activerecord/src/activerecord.test.ts",
    "new record starts as new_record",
    "new record returns boolean",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "is persisted after save",
    "persisted returns boolean",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "is destroyed after destroy",
    "destroyed returns boolean",
  ],

  // Persistence
  [
    "packages/activerecord/src/activerecord.test.ts",
    "save inserts a new record",
    "save valid record",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "save returns false on validation failure",
    "save invalid record",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "create saves and returns the record",
    "create",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "update changes attributes and saves",
    "update object",
  ],
  ["packages/activerecord/src/activerecord.test.ts", "destroy removes the record", "destroy"],

  // Finders
  [
    "packages/activerecord/src/activerecord.test.ts",
    "find throws when not found",
    "find raises record not found exception",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "findBy returns first match",
    "find_by with hash conditions returns the first matching record",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "findBy returns null when no match",
    "find_by returns nil if the record is missing",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "findByBang throws when no match",
    "find_by! raises RecordNotFound if the record is missing",
  ],

  // Reload
  ["packages/activerecord/src/activerecord.test.ts", "reloads attributes from database", "reload"],

  // Callbacks
  [
    "packages/activerecord/src/activerecord.test.ts",
    "before_save returning false halts save",
    "before save throwing abort",
  ],

  // Relation
  ["packages/activerecord/src/activerecord.test.ts", "none returns empty results", "none"],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "updateAll updates all matching records",
    "update all",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "deleteAll removes all matching records",
    "delete all",
  ],

  // updateColumn
  [
    "packages/activerecord/src/activerecord.test.ts",
    "updates a single column without callbacks",
    "update column",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "updates multiple columns without validations",
    "update columns",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "throws on new record",
    "update column should raise exception if new record",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "resets dirty tracking",
    "update column should not leave the object dirty",
  ],

  // Aggregations
  [
    "packages/activerecord/src/activerecord.test.ts",
    "sum returns the sum of a column",
    "should sum field",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "average returns the average of a column",
    "should average field",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "minimum returns the min value",
    "should get minimum of field",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "maximum returns the max value",
    "should get maximum of field",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "sum with where clause",
    "should sum field with conditions",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "sum on none relation returns 0",
    "no queries for empty relation on sum",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "average on none relation returns null",
    "no queries for empty relation on average",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "count with column name ignores nulls",
    "count with column parameter",
  ],

  // Touch
  [
    "packages/activerecord/src/activerecord.test.ts",
    "updates updated_at timestamp",
    "touching a record updates its timestamp",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "touch with named timestamp",
    "touching an attribute updates it",
  ],

  // Increment/decrement
  [
    "packages/activerecord/src/activerecord.test.ts",
    "increment modifies attribute in memory",
    "increment attribute",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "increment with custom amount",
    "increment attribute by",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "decrement modifies attribute in memory",
    "decrement attribute",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "decrement with custom amount",
    "decrement attribute by",
  ],

  // Timestamps
  [
    "packages/activerecord/src/activerecord.test.ts",
    "auto-sets updated_at on update but not created_at",
    "saving a changed record updates its timestamp",
  ],

  // Persistence edge cases
  [
    "packages/activerecord/src/activerecord.test.ts",
    "save on unchanged record is a no-op",
    "update does not run sql if record has not changed",
  ],

  // Callbacks (extended)
  [
    "packages/activerecord/src/activerecord.test.ts",
    "runs before_update only on existing records",
    "update",
  ],
  ["packages/activerecord/src/activerecord.test.ts", "after_destroy runs on destroy", "destroy"],

  // Base (extended)
  [
    "packages/activerecord/src/activerecord.test.ts",
    "save on destroyed record throws",
    "save destroyed object",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "instance delete skips callbacks",
    "delete doesnt run callbacks",
  ],
  ["packages/activerecord/src/activerecord.test.ts", "static delete by ID", "class level delete"],

  // Optimistic locking
  [
    "packages/activerecord/src/activerecord.test.ts",
    "increments lock_version on update",
    "lock existing",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "raises StaleObjectError on version mismatch",
    "lock exception record",
  ],

  // Counter cache
  [
    "packages/activerecord/src/activerecord.test.ts",
    "increments counter on create and decrements on destroy",
    "increment counter",
  ],

  // STI
  [
    "packages/activerecord/src/activerecord.test.ts",
    "auto-sets the type column on save",
    "inheritance save",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "subclass queries filter by type",
    "inheritance condition",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "instantiates the correct subclass from base queries",
    "inheritance find",
  ],

  // UniquenessValidator
  [
    "packages/activerecord/src/activerecord.test.ts",
    "validates uniqueness of an attribute",
    "validate uniqueness",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "validates with scope",
    "validate uniqueness with scope",
  ],

  // Validation contexts
  [
    "packages/activerecord/src/activerecord.test.ts",
    "on: create only runs for new records",
    "valid uses create context when new",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "on: update only runs for existing records",
    "valid uses update context when persisted",
  ],

  // Enum
  [
    "packages/activerecord/src/activerecord.test.ts",
    "defines scopes for each enum value",
    "find via scope",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "defines predicate methods",
    "query state by predicate",
  ],
  ["packages/activerecord/src/activerecord.test.ts", "defines setter methods", "update by setter"],

  // Store
  [
    "packages/activerecord/src/activerecord.test.ts",
    "reads and writes individual store accessors",
    "reading store attributes through accessors",
  ],

  // Batches
  [
    "packages/activerecord/src/activerecord.test.ts",
    "findInBatches yields batches of records",
    "find in batches should return batches",
  ],

  // Transactions
  ["packages/activerecord/src/activerecord.test.ts", "commits on success", "successful"],
  ["packages/activerecord/src/activerecord.test.ts", "rolls back on error", "failing on exception"],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "nested savepoint catches inner errors",
    "force savepoint in nested transaction",
  ],

  // afterCommit
  [
    "packages/activerecord/src/activerecord.test.ts",
    "fires afterCommit inside transaction on commit",
    "call after commit after transaction commits",
  ],

  // insertAll
  [
    "packages/activerecord/src/activerecord.test.ts",
    "inserts multiple records in bulk",
    "insert all",
  ],

  // readonly
  [
    "packages/activerecord/src/activerecord.test.ts",
    "prevents saving a readonly record",
    "cant save readonly record",
  ],

  // table_name_prefix
  [
    "packages/activerecord/src/activerecord.test.ts",
    "applies prefix to inferred table name",
    "table name guesses with prefixes and suffixes",
  ],

  // Aggregation edge cases
  [
    "packages/activerecord/src/activerecord.test.ts",
    "minimum on empty table returns null",
    "no queries for empty relation on minimum",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "maximum on empty table returns null",
    "no queries for empty relation on maximum",
  ],
  [
    "packages/activerecord/src/activerecord.test.ts",
    "sum with where condition",
    "should sum scoped field with conditions",
  ],

  // Bulk operations edge cases
  [
    "packages/activerecord/src/activerecord.test.ts",
    "updateAll does not auto-update updated_at",
    "update column should not modify updated at",
  ],

  // ==========================================================================
  // ActiveRecord - Rails-guided tests
  // ==========================================================================
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "save on destroyed record raises error",
    "save destroyed object",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "create returns record even if validation fails",
    "returns object even if validations failed",
  ],
  ["packages/activerecord/src/rails-guided.test.ts", "destroy returns self", "destroy"],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "delete removes the record without running callbacks",
    "delete doesnt run callbacks",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "class-level delete removes by ID without callbacks",
    "class level delete",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "reload throws when record no longer exists",
    "find via reload",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "deleteAll returns count of deleted records",
    "delete all",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "updateAll returns count of updated records",
    "update all",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "before_save returning false halts create",
    "before save throwing abort",
  ],
  ["packages/activerecord/src/rails-guided.test.ts", "delete bypasses all callbacks", "delete"],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "successful transaction commits",
    "successful",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "exception causes rollback",
    "failing on exception",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "afterCommit fires only on successful commit",
    "call after commit after transaction commits",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "nested savepoint: inner error does not abort outer",
    "force savepoint in nested transaction",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "update_column updates a single attribute",
    "update column",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "update_column does not run callbacks",
    "update column should not use setter method",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "update_columns updates multiple attributes at once",
    "update columns",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "update_columns on a new record raises",
    "update columns should raise exception if new record",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "update_column clears dirty tracking",
    "update column should not leave the object dirty",
  ],
  ["packages/activerecord/src/rails-guided.test.ts", "sum computes the total", "should sum field"],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "average computes the mean",
    "should average field",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "minimum returns the smallest value",
    "should get minimum of field",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "maximum returns the largest value",
    "should get maximum of field",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "find_in_batches yields correct number of batches",
    "find in batches should return batches",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "touch updates updated_at",
    "touching a record updates its timestamp",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "touch with extra attributes",
    "touching an attribute updates it",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "scope returns matching records",
    "scopes with options limit finds to those matching the criteria specified",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "scopes can be chained",
    "scopes are composable",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "increments lock_version on each update",
    "lock existing",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "raises StaleObjectError when lock_version is stale",
    "lock exception record",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "raises on save for readonly records",
    "cant save readonly record",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "increments the counter cache on create",
    "increment counter",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "automatically sets the type column on create",
    "inheritance save",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "subclass queries auto-filter by type",
    "inheritance condition",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "returns instances of the correct subclass from base queries",
    "inheritance find",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "provides scopes for each value",
    "find via scope",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "provides predicate methods",
    "query state by predicate",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "provides setter methods that change the value",
    "update by setter",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "reads stored attributes through accessors",
    "reading store attributes through accessors",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "writes stored attributes through accessors",
    "writing store attributes through accessors",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "insert_all inserts multiple records without callbacks",
    "insert all",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "runs create-only validations only on new records",
    "valid uses create context when new",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "runs update-only validations only on persisted records",
    "valid uses update context when persisted",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "returning false from before_save halts the chain",
    "before save throwing abort",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "find with nonexistent id raises",
    "find raises record not found exception",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "findByBang raises when no match",
    "find_by! raises RecordNotFound if the record is missing",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "findBy returns null when no match",
    "find_by returns nil if the record is missing",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "updateAll updates matching records in bulk",
    "update all",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "deleteAll removes records without callbacks",
    "delete all",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "save on unchanged record is a no-op",
    "update does not run sql if record has not changed",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "created_at is not changed on subsequent saves",
    "saving a unchanged record doesnt update its timestamp",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "increment changes attribute in memory by 1",
    "increment attribute",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "decrement changes attribute in memory by -1",
    "decrement attribute",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "validates uniqueness prevents duplicate",
    "validate uniqueness",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "validates uniqueness with scope",
    "validate uniqueness with scope",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "columnNames returns array of attribute name strings",
    "read attribute names",
  ],
  [
    "packages/activerecord/src/rails-guided.test.ts",
    "columns returns metadata about all attributes",
    "columns",
  ],
];

function main() {
  // Group renames by file
  const byFile = new Map<string, [string, string][]>();
  for (const [file, oldDesc, newDesc] of RENAMES) {
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file)!.push([oldDesc, newDesc]);
  }

  let totalApplied = 0;
  let totalSkipped = 0;

  for (const [relPath, renames] of byFile) {
    const absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath)) {
      console.error(`File not found: ${absPath}`);
      continue;
    }

    let content = fs.readFileSync(absPath, "utf-8");
    let fileApplied = 0;

    for (const [oldDesc, newDesc] of renames) {
      // Match it("...", it.skip("...", or it.todo("...
      // Escape special regex chars in oldDesc
      const escaped = oldDesc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(it(?:\\.skip|\\.todo)?\\()("[^"]*"|'[^']*')`, "g");

      // Find and replace the exact description
      const oldQuoted1 = `"${oldDesc}"`;
      const oldQuoted2 = `'${oldDesc}'`;
      const newQuoted = `"${newDesc.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

      let replaced = false;

      // Try with double quotes
      if (content.includes(oldQuoted1)) {
        // Check it's inside an it() call
        const itPattern1 = `it(${oldQuoted1}`;
        const itSkipPattern1 = `it.skip(${oldQuoted1}`;
        const itTodoPattern1 = `it.todo(${oldQuoted1}`;
        if (
          content.includes(itPattern1) ||
          content.includes(itSkipPattern1) ||
          content.includes(itTodoPattern1)
        ) {
          content = content.replace(itPattern1, `it(${newQuoted}`);
          content = content.replace(itSkipPattern1, `it.skip(${newQuoted}`);
          content = content.replace(itTodoPattern1, `it.todo(${newQuoted}`);
          replaced = true;
        }
      }

      // Try with single quotes
      if (!replaced && content.includes(oldQuoted2)) {
        const itPattern2 = `it(${oldQuoted2}`;
        const itSkipPattern2 = `it.skip(${oldQuoted2}`;
        const itTodoPattern2 = `it.todo(${oldQuoted2}`;
        if (
          content.includes(itPattern2) ||
          content.includes(itSkipPattern2) ||
          content.includes(itTodoPattern2)
        ) {
          content = content.replace(itPattern2, `it(${newQuoted}`);
          content = content.replace(itSkipPattern2, `it.skip(${newQuoted}`);
          content = content.replace(itTodoPattern2, `it.todo(${newQuoted}`);
          replaced = true;
        }
      }

      if (replaced) {
        fileApplied++;
      } else {
        totalSkipped++;
        console.log(`  SKIP: "${oldDesc}" not found in ${relPath}`);
      }
    }

    if (fileApplied > 0) {
      fs.writeFileSync(absPath, content);
      console.log(`${relPath}: ${fileApplied} renames applied`);
      totalApplied += fileApplied;
    }
  }

  console.log(`\nTotal: ${totalApplied} applied, ${totalSkipped} skipped`);
}

main();
