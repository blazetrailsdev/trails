# ActiveRecord Internal Call Graph — Work Stream 1

> Auto-generated 2026-04-07 from `lint-calls.ts` output (`call-lint.json`)
> Property-access false positives and Ruby-specific calls are filtered out.
> Rows should be verified before acting — same-name entries (e.g., `transaction` calling `transaction`) may be false positives.

## Summary

|                                             | Count |
| ------------------------------------------- | ----- |
| Total methods with mismatches               | 893   |
| Easy fixes (method exists, just not called) | 22    |
| Larger refactors                            | 871   |
| Files affected                              | 160   |

## Easy Fixes

These methods exist in the codebase but aren't called where Rails calls them.

| File                                     | Method               | Missing Call                                |
| ---------------------------------------- | -------------------- | ------------------------------------------- |
| `associations/association.ts`            | `reload`             | clearQueryCache (clear_query_cache)         |
| `associations/collection-association.ts` | `destroyAll`         | destroy (destroy)                           |
| `associations/collection-proxy.ts`       | `create`             | create (create)                             |
| `associations/collection-proxy.ts`       | `createBang`         | createBang (create!)                        |
| `associations/collection-proxy.ts`       | `deleteAll`          | deleteAll (delete_all)                      |
| `associations/collection-proxy.ts`       | `delete`             | resetScope (reset_scope)                    |
| `associations/collection-proxy.ts`       | `destroy`            | destroy (destroy), resetScope (reset_scope) |
| `associations/collection-proxy.ts`       | `clear`              | deleteAll (delete_all)                      |
| `reflection.ts`                          | `buildScope`         | create (create)                             |
| `relation.ts`                            | `firstOrCreate`      | create (create)                             |
| `relation.ts`                            | `firstOrCreateBang`  | createBang (create!)                        |
| `relation.ts`                            | `findOrInitializeBy` | findBy (find_by)                            |
| `relation.ts`                            | `records`            | load (load)                                 |
| `relation.ts`                            | `destroyAll`         | reset (reset)                               |
| `relation.ts`                            | `delete`             | deleteAll (delete_all), where (where)       |
| `relation.ts`                            | `destroy`            | destroy (destroy)                           |
| `relation.ts`                            | `deleteBy`           | deleteAll (delete_all)                      |
| `relation.ts`                            | `reload`             | load (load)                                 |
| `relation.ts`                            | `aliasTracker`       | create (create)                             |
| `relation/batches/batch-enumerator.ts`   | `updateAll`          | updateAll (update_all)                      |
| `transactions.ts`                        | `transaction`        | transaction (transaction)                   |

## Refactors by File

Methods where the missing calls require new infrastructure or deeper changes.

### `associations.ts` (5 methods)

- **`association`** — associationInstanceGet (association_instance_get), associationClass (association_class), associationInstanceSet (association_instance_set)
- **`hasMany`** — build (build), addReflection (add_reflection)
- **`hasOne`** — build (build), addReflection (add_reflection)
- **`belongsTo`** — build (build), addReflection (add_reflection)
- **`hasAndBelongsToMany`** — throughModel (through_model), constSet (const_set), privateConstant (private_constant), middleReflection (middle_reflection), defineCallbacks (define_callbacks)

### `associations/association.ts` (10 methods)

- **`constructor`** — checkValidityBang (check_validity!), reset (reset), resetScope (reset_scope)
- **`scope`** — disableJoins (disable_joins), create (create), currentScope (current_scope), spawn (spawn), globalCurrentScope (global_current_scope)
- **`setStrictLoading`** — isStrictLoadingNPlusOneOnly (strict_loading_n_plus_one_only?), strictLoadingBang (strict_loading!), strictLoadingMode (strict_loading_mode)
- **`setInverseInstance`** — inversedFrom (inversed_from)
- **`setInverseInstanceFromQueries`** — inversedFromQueries (inversed_from_queries)
- **`removeInverseInstance`** — inversedFrom (inversed_from)
- **`extensions`** — defaultExtensions (default_extensions), scopeFor (scope_for), unscoped (unscoped)
- **`loadTarget`** — isFindTarget (find_target?), findTarget (find_target), reset (reset)
- **`asyncLoadTarget`** — isStaleTarget (stale_target?), isFindTarget (find_target?), findTarget (find_target), loadedBang (loaded!)
- **`initializeAttributes`** — changedAttributeNamesToSave (changed_attribute_names_to_save), exceptBang (except!), scopeForCreate (scope_for_create)

### `associations/belongs-to-association.ts` (6 methods)

- **`handleDependency`** — destroy (destroy), isPolymorphic (polymorphic?), enqueueDestroyAssociation (enqueue_destroy_association), id (id)
- **`default`** — reader (reader), instanceExec (instance_exec)
- **`decrementCountersBeforeLastSave`** — isPolymorphic (polymorphic?), attributeBeforeLastSave (attribute_before_last_save), polymorphicClassFor (polymorphic_class_for), updateCountersViaScope (update_counters_via_scope)
- **`isTargetChanged`** — isAttributeChanged (attribute_changed?), isNewRecord (new_record?)
- **`isTargetPreviouslyChanged`** — isAttributePreviouslyChanged (attribute_previously_changed?)
- **`isSavedChangeToTarget`** — isSavedChangeToAttribute (saved_change_to_attribute?)

### `associations/belongs-to-polymorphic-association.ts` (4 methods)

- **`klass`** — polymorphicClassFor (polymorphic_class_for)
- **`isTargetChanged`** — isAttributeChanged (attribute_changed?)
- **`isTargetPreviouslyChanged`** — isAttributePreviouslyChanged (attribute_previously_changed?)
- **`isSavedChangeToTarget`** — isSavedChangeToAttribute (saved_change_to_attribute?)

### `associations/builder/association.ts` (1 method)

- **`build`** — isDangerousAttributeMethod (dangerous_attribute_method?), createReflection (create_reflection), defineAccessors (define_accessors), defineCallbacks (define_callbacks), defineValidations (define_validations)

### `associations/collection-association.ts` (17 methods)

- **`reader`** — ensureKlassExistsBang (ensure_klass_exists!), isStaleTarget (stale_target?), reload (reload), create (create), resetScope (reset_scope)
- **`idsReader`** — pluck (pluck)
- **`idsWriter`** — compactBlank (compact_blank), mapBang (map!), cast (cast), valuesAt (values_at), where (where)
- **`reset`** — compareByIdentity (compare_by_identity)
- **`find`** — raiseRecordNotFoundExceptionBang (raise_record_not_found_exception!)
- **`build`** — build (build)
- **`concat`** — isNewRecord (new_record?), skipStrictLoading (skip_strict_loading), loadTarget (load_target), concatRecords (concat_records), transaction (transaction)
- **`deleteAll`** — deleteOrNullifyAllRecords (delete_or_nullify_all_records)
- **`size`** — isFindTarget (find_target?), loadTarget (load_target), countRecords (count_records)
- **`isEmpty`** — hasActiveCachedCounter (has_active_cached_counter?), isZero (zero?), isExists (exists?)
- **`replace`** — raiseOnTypeMismatchBang (raise_on_type_mismatch!), skipStrictLoading (skip_strict_loading), loadTarget (load_target), isNewRecord (new_record?), replaceRecords (replace_records)
- **`isInclude`** — isNewRecord (new_record?), isIncludeInMemory (include_in_memory?), zip (zip), id (id), isExists (exists?)
- **`loadTarget`** — isFindTarget (find_target?), findTarget (find_target)
- **`addToTarget`** — replaceOnTarget (replace_on_target)
- **`scope`** — noneBang (none!)
- **`isNullScope`** — isNewRecord (new_record?)
- **`isFindFromTarget`** — isStrictLoading (strict_loading?), isStrictLoadingAll (strict_loading_all?), isNewRecord (new_record?), isChanged (changed?)

### `associations/collection-proxy.ts` (11 methods)

- **`constructor`** — extend (extend)
- **`loadTarget`** — loadTarget (load_target)
- **`last`** — isFindFromTarget (find_from_target?), loadTarget (load_target)
- **`take`** — isFindFromTarget (find_from_target?), loadTarget (load_target)
- **`build`** — build (build)
- **`replace`** — replace (replace)
- **`destroyAll`** — destroyAll (destroy_all), resetScope (reset_scope)
- **`calculate`** — isNullScope (null_scope?), calculate (calculate)
- **`pluck`** — isNullScope (null_scope?), pluck (pluck)
- **`reload`** — reload (reload), proxyAssociation (proxy_association), resetScope (reset_scope)
- **`reset`** — reset (reset), proxyAssociation (proxy_association), resetScope (reset_scope)

### `associations/errors.ts` (3 methods)

- **`constructor`** — classify (classify)
- **`constructor`** — sourceReflectionNames (source_reflection_names), toSentence (to_sentence)
- **`constructor`** — hasOne (has_one?), isCollection (collection?)

### `associations/has-many-association.ts` (1 method)

- **`handleDependency`** — downcase (downcase), humanAttributeName (human_attribute_name), add (add), errors (errors), throw (throw)

### `associations/has-many-through-association.ts` (1 method)

- **`constructor`** — compareByIdentity (compare_by_identity)

### `associations/has-one-association.ts` (2 methods)

- **`handleDependency`** — downcase (downcase), humanAttributeName (human_attribute_name), add (add), errors (errors), throw (throw)
- **`delete`** — destroy (destroy), isDestroyed (destroyed?), throw (throw), queryConstraintsList (query_constraints_list), enqueueDestroyAssociation (enqueue_destroy_association)

### `associations/join-dependency.ts` (3 methods)

- **`constructor`** — makeTree (make_tree), build (build)
- **`constructor`** — node (node), alias (alias)
- **`columnAliases`** — node (node), as (as), alias (alias)

### `associations/join-dependency/join-association.ts` (3 methods)

- **`joinConstraints`** — chain (chain), reverseEach (reverse_each), joinScope (join_scope), joinsBang (joins!), constructJoinDependency (construct_join_dependency)
- **`isReadonly`** — scopeFor (scope_for), unscoped (unscoped), baseKlass (base_klass)
- **`isStrictLoading`** — scopeFor (scope_for), unscoped (unscoped), baseKlass (base_klass)

### `associations/join-dependency/join-base.ts` (1 method)

- **`isMatch`** — baseKlass (base_klass)

### `associations/join-dependency/join-part.ts` (4 methods)

- **`each`** — children (children)
- **`eachChildren`** — children (children), eachChildren (each_children)
- **`extractRecord`** — alias (alias)
- **`instantiate`** — instantiate (instantiate), baseKlass (base_klass)

### `associations/nested-error.ts` (1 method)

- **`constructor`** — computeAttribute (compute_attribute)

### `associations/preloader.ts` (1 method)

- **`call`** — loaders (loaders)

### `associations/preloader/association.ts` (2 methods)

- **`constructor`** — isEmptyScope (empty_scope?)
- **`constructor`** — populateKeysToLoadAndAlreadyLoadedRecords (populate_keys_to_load_and_already_loaded_records)

### `associations/preloader/batch.ts` (2 methods)

- **`constructor`** — baseClass (base_class)
- **`call`** — associateRecordsFromUnscoped (associate_records_from_unscoped), baseClass (base_class), futureClasses (future_classes), runnableLoaders (runnable_loaders), groupAndLoadSimilar (group_and_load_similar)

### `associations/preloader/branch.ts` (1 method)

- **`constructor`** — buildChildren (build_children)

### `associations/singular-association.ts` (1 method)

- **`reader`** — ensureKlassExistsBang (ensure_klass_exists!), isStaleTarget (stale_target?), reload (reload)

### `attribute-methods.ts` (15 methods)

- **`hasAttribute`** — attributeAliases (attribute_aliases)
- **`attributePresent`** — attributeAliases (attribute_aliases)
- **`accessedFields`** — accessed (accessed)
- **`dangerousAttributeMethods`** — toSet (to_set), instanceMethods (instance_methods), privateInstanceMethods (private_instance_methods)
- **`initializeGeneratedModules`** — constSet (const_set), privateConstant (private_constant), include (include)
- **`aliasAttribute`** — batch (batch), generatedAttributeMethods (generated_attribute_methods), generateAliasAttributeMethods (generate_alias_attribute_methods)
- **`generateAliasAttributeMethods`** — attributeMethodPatterns (attribute_method_patterns), aliasAttributeMethodDefinition (alias_attribute_method_definition), clear (clear), attributeMethodPatternsCache (attribute_method_patterns_cache)
- **`aliasAttributeMethodDefinition`** — isAbstractClass (abstract_class?), hasAttribute (has_attribute?), defineAttributeMethodPattern (define_attribute_method_pattern)
- **`defineAttributeMethods`** — isBaseClass (base_class?), defineAttributeMethods (define_attribute_methods), isAbstractClass (abstract_class?), loadSchema (load_schema), attributeNames (attribute_names)
- **`generateAliasAttributes`** — generateAliasAttributes (generate_alias_attributes), batch (batch), generatedAttributeMethods (generated_attribute_methods), aliasesByAttributeName (aliases_by_attribute_name), generateAliasAttributeMethods (generate_alias_attribute_methods)
- **`isInstanceMethodAlreadyImplemented`** — isDangerousAttributeMethod (dangerous_attribute_method?), isMethodDefinedWithin (method_defined_within?), instanceMethod (instance_method)
- **`isMethodDefinedWithin`** — isPrivateMethodDefined (private_method_defined?), instanceMethod (instance_method)
- **`isDangerousClassMethod`** — method (method)
- **`isAttributeMethod`** — isTableExists (table_exists?), columnNames (column_names), deleteSuffix (delete_suffix)
- **`hasAttribute`** — attributeAliases (attribute_aliases), attributeTypes (attribute_types)

### `attribute-methods/before-type-cast.ts` (4 methods)

- **`readAttributeBeforeTypeCast`** — attributeAliases (attribute_aliases), attributeBeforeTypeCast (attribute_before_type_cast)
- **`readAttributeForDatabase`** — attributeAliases (attribute_aliases), attributeForDatabase (attribute_for_database)
- **`attributesBeforeTypeCast`** — valuesBeforeTypeCast (values_before_type_cast)
- **`attributesForDatabase`** — valuesForDatabase (values_for_database)

### `attribute-methods/composite-primary-key.ts` (6 methods)

- **`isPrimaryKeyValuesPresent`** — id (id)
- **`id`** — zip (zip)
- **`idBeforeTypeCast`** — attributeBeforeTypeCast (attribute_before_type_cast)
- **`idWas`** — attributeWas (attribute_was)
- **`idInDatabase`** — attributeInDatabase (attribute_in_database)
- **`idForDatabase`** — valueForDatabase (value_for_database)

### `attribute-methods/dirty.ts` (12 methods)

- **`isSavedChangeToAttribute`** — isChanged (changed?), mutationsBeforeLastSave (mutations_before_last_save)
- **`savedChangeToAttribute`** — changeToAttribute (change_to_attribute), mutationsBeforeLastSave (mutations_before_last_save)
- **`attributeBeforeLastSave`** — originalValue (original_value), mutationsBeforeLastSave (mutations_before_last_save)
- **`isSavedChanges`** — isAnyChanges (any_changes?), mutationsBeforeLastSave (mutations_before_last_save)
- **`savedChanges`** — changes (changes), mutationsBeforeLastSave (mutations_before_last_save)
- **`isWillSaveChangeToAttribute`** — isChanged (changed?), mutationsFromDatabase (mutations_from_database)
- **`attributeChangeToBeSaved`** — changeToAttribute (change_to_attribute), mutationsFromDatabase (mutations_from_database)
- **`attributeInDatabase`** — originalValue (original_value), mutationsFromDatabase (mutations_from_database)
- **`isHasChangesToSave`** — isAnyChanges (any_changes?), mutationsFromDatabase (mutations_from_database)
- **`changesToSave`** — changes (changes), mutationsFromDatabase (mutations_from_database)
- **`changedAttributeNamesToSave`** — changedAttributeNames (changed_attribute_names), mutationsFromDatabase (mutations_from_database)
- **`attributesInDatabase`** — changedValues (changed_values), mutationsFromDatabase (mutations_from_database)

### `attribute-methods/primary-key.ts` (9 methods)

- **`toKey`** — id (id)
- **`isPrimaryKeyValuesPresent`** — id (id)
- **`idBeforeTypeCast`** — attributeBeforeTypeCast (attribute_before_type_cast)
- **`idWas`** — attributeWas (attribute_was)
- **`idInDatabase`** — attributeInDatabase (attribute_in_database)
- **`idForDatabase`** — valueForDatabase (value_for_database)
- **`quotedPrimaryKey`** — adapterClass (adapter_class)
- **`resetPrimaryKey`** — isBaseClass (base_class?), getPrimaryKey (get_primary_key), baseClass (base_class)
- **`getPrimaryKey`** — primaryKeyPrefixType (primary_key_prefix_type), isTableExists (table_exists?), primaryKeys (primary_keys), schemaCache (schema_cache)

### `attribute-methods/query.ts` (1 method)

- **`queryAttribute`** — queryCastAttribute (query_cast_attribute)

### `attribute-methods/time-zone-conversion.ts` (2 methods)

- **`deserialize`** — convertTimeToTimeZone (convert_time_to_time_zone)
- **`cast`** — setTimeZoneWithoutConversion (set_time_zone_without_conversion), userInputInTimeZone (user_input_in_time_zone), isInfinite (infinite?), cast (cast)

### `connection-adapters/abstract-adapter.ts` (40 methods)

- **`constructor`** — symbolizeKeys (symbolize_keys), logger (logger), clockGettime (clock_gettime), arelVisitor (arel_visitor), buildStatementPool (build_statement_pool)
- **`defaultTimezone`** — defaultTimezone (default_timezone)
- **`isPreventingWrites`** — connectionDescriptor (connection_descriptor), currentPreventingWrites (current_preventing_writes)
- **`preparedStatements`** — preparedStatementsDisabledCache (prepared_statements_disabled_cache)
- **`isValidType`** — nativeDatabaseTypes (native_database_types)
- **`lease`** — isInUse (in_use?), context (context)
- **`connectionDescriptor`** — connectionDescriptor (connection_descriptor)
- **`role`** — role (role)
- **`shard`** — shard (shard)
- **`schemaCache`** — schemaCache (schema_cache), forLoneConnection (for_lone_connection), schemaReflection (schema_reflection)
- **`expire`** — isInUse (in_use?), context (context), clockGettime (clock_gettime)
- **`stealBang`** — isInUse (in_use?), context (context)
- **`secondsIdle`** — isInUse (in_use?), clockGettime (clock_gettime)
- **`secondsSinceLastActivity`** — clockGettime (clock_gettime)
- **`unpreparedStatement`** — isAdd (add?), preparedStatementsDisabledCache (prepared_statements_disabled_cache)
- **`isDatabaseExists`** — connectBang (connect!)
- **`isReturnValueAfterInsert`** — isAutoPopulated (auto_populated?)
- **`isAsyncEnabled`** — supportsConcurrentConnections (supports_concurrent_connections?), asyncQueryExecutor (async_query_executor), asyncExecutor (async_executor)
- **`isAdvisoryLocksEnabled`** — supportsAdvisoryLocks (supports_advisory_locks?)
- **`reconnectBang`** — connectionRetries (connection_retries), retryDeadline (retry_deadline), clockGettime (clock_gettime), reconnect (reconnect), enableLazyTransactionsBang (enable_lazy_transactions!)
- **`disconnectBang`** — resetTransaction (reset_transaction)
- **`resetBang`** — attemptConfigureConnection (attempt_configure_connection)
- **`throwAwayBang`** — remove (remove)
- **`clearCacheBang`** — reset (reset), clear (clear)
- **`verifyBang`** — isActive (active?), attemptConfigureConnection (attempt_configure_connection), clockGettime (clock_gettime)
- **`connectBang`** — verifyBang (verify!)
- **`rawConnection`** — withRawConnection (with_raw_connection), disableLazyTransactionsBang (disable_lazy_transactions!)
- **`defaultUniquenessComparison`** — eq (eq)
- **`caseSensitiveComparison`** — eq (eq)
- **`caseInsensitiveComparison`** — columnForAttribute (column_for_attribute), canPerformCaseInsensitiveComparisonFor (can_perform_case_insensitive_comparison_for?), eq (eq), lower (lower), relation (relation)
- **`close`** — checkin (checkin)
- **`isDefaultIndexType`** — using (using)
- **`buildInsertSql`** — isSkipDuplicates (skip_duplicates?), isUpdateDuplicates (update_duplicates?), into (into), valuesList (values_list)
- **`databaseVersion`** — serverVersion (server_version)
- **`schemaVersion`** — currentVersion (current_version), migrationContext (migration_context)
- **`typeCastConfigToInteger`** — isMatch (match?)
- **`buildReadQueryRegexp`** — union (union)
- **`findCmdAndExec`** — stat (stat), isFile (file?), isExecutable (executable?), exec (exec), abort (abort)
- **`registerClassWithPrecision`** — registerType (register_type), extractPrecision (extract_precision)
- **`extendedTypeMap`** — registerClassWithPrecision (register_class_with_precision), aliasType (alias_type)

### `connection-adapters/abstract-mysql-adapter.ts` (52 methods)

- **`getDatabaseVersion`** — getFullVersion (get_full_version), versionString (version_string)
- **`isMariadb`** — isMatch (match?), fullVersion (full_version)
- **`supportsIndexSortOrder`** — isMariadb (mariadb?)
- **`supportsExpressionIndex`** — isMariadb (mariadb?)
- **`supportsCheckConstraints`** — isMariadb (mariadb?)
- **`supportsVirtualColumns`** — isMariadb (mariadb?)
- **`supportsOptimizerHints`** — isMariadb (mariadb?)
- **`supportsCommonTableExpressions`** — isMariadb (mariadb?)
- **`supportsInsertReturning`** — isMariadb (mariadb?)
- **`returnValueAfterInsert`** — supportsInsertReturning (supports_insert_returning?), isAutoPopulated (auto_populated?), isAutoIncrement (auto_increment?)
- **`getAdvisoryLock`** — queryValue (query_value), quote (quote)
- **`releaseAdvisoryLock`** — queryValue (query_value), quote (quote)
- **`disableReferentialIntegrity`** — queryValue (query_value), update (update), isActive (active?)
- **`beginDbTransaction`** — internalExecute (internal_execute)
- **`beginIsolatedDbTransaction`** — executeBatch (execute_batch), transactionIsolationLevels (transaction_isolation_levels)
- **`commitDbTransaction`** — internalExecute (internal_execute)
- **`execRollbackDbTransaction`** — internalExecute (internal_execute)
- **`execRestartDbTransaction`** — internalExecute (internal_execute)
- **`recreateDatabase`** — dropDatabase (drop_database), createDatabase (create_database), reconnectBang (reconnect!)
- **`createDatabase`** — execute (execute), isRowFormatDynamicByDefault (row_format_dynamic_by_default?)
- **`dropDatabase`** — execute (execute)
- **`currentDatabase`** — queryValue (query_value)
- **`charset`** — showVariable (show_variable)
- **`collation`** — showVariable (show_variable)
- **`tableComment`** — quotedScope (quoted_scope), queryValue (query_value)
- **`changeTableComment`** — extractNewCommentValue (extract_new_comment_value), execute (execute), quote (quote)
- **`renameTable`** — validateTableLengthBang (validate_table_length!), clearDataSourceCacheBang (clear_data_source_cache!), schemaCache (schema_cache), execute (execute), renameTableIndexes (rename_table_indexes)
- **`dropTable`** — clearDataSourceCacheBang (clear_data_source_cache!), schemaCache (schema_cache), execute (execute)
- **`renameIndex`** — supportsRenameIndex (supports_rename_index?), validateIndexLengthBang (validate_index_length!), execute (execute)
- **`changeColumnDefault`** — execute (execute), changeColumnDefaultForAlter (change_column_default_for_alter)
- **`buildChangeColumnDefaultDefinition`** — columnFor (column_for), extractNewDefaultValue (extract_new_default_value)
- **`changeColumnNull`** — validateChangeColumnNullArgumentBang (validate_change_column_null_argument!), execute (execute), quote (quote), changeColumn (change_column)
- **`changeColumnComment`** — extractNewCommentValue (extract_new_comment_value), changeColumn (change_column)
- **`changeColumn`** — execute (execute), changeColumnForAlter (change_column_for_alter)
- **`buildChangeColumnDefinition`** — columnFor (column_for), sqlType (sql_type), defaultFunction (default_function), default (default), null (null)
- **`renameColumn`** — execute (execute), renameColumnForAlter (rename_column_for_alter), renameColumnIndexes (rename_column_indexes)
- **`addIndex`** — buildCreateIndexDefinition (build_create_index_definition), execute (execute), accept (accept), schemaCreation (schema_creation)
- **`buildCreateIndexDefinition`** — addIndexOptions (add_index_options), isIndexExists (index_exists?)
- **`foreignKeys`** — quotedScope (quoted_scope), internalExecQuery (internal_exec_query), sortByBang (sort_by!), extractForeignKeyAction (extract_foreign_key_action), isOne (one?)
- **`checkConstraints`** — supportsCheckConstraints (supports_check_constraints?), quotedScope (quoted_scope), isMariadb (mariadb?), internalExecQuery (internal_exec_query), isStartWith (start_with?)
- **`tableOptions`** — createTableInfo (create_table_info), charset (charset), collation (collation), subBang (sub!), tableComment (table_comment)
- **`showVariable`** — queryValue (query_value)
- **`primaryKeys`** — quotedScope (quoted_scope), queryValues (query_values)
- **`caseSensitiveComparison`** — columnForAttribute (column_for_attribute), collation (collation), isCaseSensitive (case_sensitive?), eq (eq)
- **`canPerformCaseInsensitiveComparisonFor`** — isCaseSensitive (case_sensitive?)
- **`columnsForDistinct`** — withIndex (with_index), compactBlank (compact_blank), compile (compile), visitor (visitor)
- **`isStrictMode`** — typeCastConfigToBoolean (type_cast_config_to_boolean)
- **`isDefaultIndexType`** — using (using)
- **`buildInsertSql`** — supportsInsertRawAliasSyntax (supports_insert_raw_alias_syntax?), quotedTableName (quoted_table_name), parameterize (parameterize), into (into), valuesList (values_list)
- **`quoteString`** — withRawConnection (with_raw_connection), escape (escape)
- **`dbconsole`** — configurationHash (configuration_hash), database (database), findCmdAndExec (find_cmd_and_exec), databaseCli (database_cli)
- **`extendedTypeMap`** — registerType (register_type)

### `connection-adapters/abstract/connection-handler.ts` (3 methods)

- **`establishConnection`** — determineOwnerName (determine_owner_name), resolvePoolConfig (resolve_pool_config), dbConfig (db_config), setPoolManager (set_pool_manager), connectionDescriptor (connection_descriptor)
- **`activeConnections`** — eachConnectionPool (each_connection_pool)
- **`retrieveConnectionPool`** — getPoolManager (get_pool_manager), getPoolConfig (get_pool_config), defaultShard (default_shard), defaultRole (default_role)

### `connection-adapters/abstract/connection-pool.ts` (10 methods)

- **`constructor`** — dbConfig (db_config), role (role), shard (shard), checkoutTimeout (checkout_timeout), idleTimeout (idle_timeout)
- **`schemaCache`** — schemaReflection (schema_reflection)
- **`activeConnection`** — connectionLease (connection_lease)
- **`withConnection`** — connectionLease (connection_lease), sticky (sticky), releaseConnection (release_connection)
- **`disconnect`** — withExclusivelyAcquiredAllConnections (with_exclusively_acquired_all_connections), isInUse (in_use?), stealBang (steal!), checkin (checkin), disconnectBang (disconnect!)
- **`checkout`** — checkoutAndVerify (checkout_and_verify), acquireConnection (acquire_connection), lock (lock), verifyBang (verify!)
- **`checkin`** — lock (lock), clear (clear), connectionLease (connection_lease), expire (expire), add (add)
- **`stat`** — isInUse (in_use?), isAlive (alive?), numWaitingInQueue (num_waiting_in_queue), checkoutTimeout (checkout_timeout)
- **`clear`** — clear (clear)
- **`clear`** — clear (clear)

### `connection-adapters/abstract/connection-pool/queue.ts` (6 methods)

- **`add`** — signal (signal)
- **`clear`** — clear (clear)
- **`poll`** — internalPoll (internal_poll)
- **`broadcast`** — broadcastOnBiased (broadcast_on_biased), broadcast (broadcast)
- **`signal`** — signal (signal)
- **`wait`** — wait (wait), current (current)

### `connection-adapters/abstract/database-statements.ts` (7 methods)

- **`toSql`** — toSqlAndBinds (to_sql_and_binds)
- **`selectAll`** — arelFromRelation (arel_from_relation), toSqlAndBinds (to_sql_and_binds), preparedStatements (prepared_statements), empty (empty)
- **`selectValue`** — selectRows (select_rows), singleValueFromRows (single_value_from_rows)
- **`selectValues`** — selectRows (select_rows)
- **`execute`** — internalExecute (internal_execute)
- **`insert`** — toSqlAndBinds (to_sql_and_binds), execInsert (exec_insert), returningColumnValues (returning_column_values), lastInsertedId (last_inserted_id)
- **`update`** — toSqlAndBinds (to_sql_and_binds), execUpdate (exec_update)

### `connection-adapters/abstract/quoting.ts` (7 methods)

- **`quote`** — quotedBinary (quoted_binary), quotedTime (quoted_time)
- **`typeCast`** — quotedTime (quoted_time)
- **`lookupCastTypeFromColumn`** — sqlType (sql_type)
- **`quoteDefaultExpression`** — serialize (serialize), lookupCastType (lookup_cast_type), sqlType (sql_type)
- **`quotedDate`** — isActsLike (acts_like?), defaultTimezone (default_timezone), isUtc (utc?), getutc (getutc), getlocal (getlocal)
- **`quotedTime`** — change (change)
- **`sanitizeAsSqlComment`** — gsubBang (gsub!)

### `connection-adapters/abstract/savepoints.ts` (1 method)

- **`currentSavepointName`** — savepointName (savepoint_name), currentTransaction (current_transaction)

### `connection-adapters/abstract/schema-definitions.ts` (14 methods)

- **`constructor`** — conciseOptions (concise_options)
- **`addTo`** — column (column), index (index), columnNames (column_names), indexOptions (index_options), foreignTableName (foreign_table_name)
- **`index`** — indexes (indexes)
- **`timestamps`** — supportsDatetimeWithPrecision (supports_datetime_with_precision?), column (column)
- **`references`** — addTo (add_to)
- **`addForeignKey`** — newForeignKeyDefinition (new_foreign_key_definition)
- **`addCheckConstraint`** — newCheckConstraintDefinition (new_check_constraint_definition)
- **`addColumn`** — newColumnDefinition (new_column_definition)
- **`index`** — raiseOnIfExistOptions (raise_on_if_exist_options), addIndex (add_index)
- **`timestamps`** — raiseOnIfExistOptions (raise_on_if_exist_options), addTimestamps (add_timestamps)
- **`remove`** — raiseOnIfExistOptions (raise_on_if_exist_options), removeColumns (remove_columns)
- **`removeIndex`** — raiseOnIfExistOptions (raise_on_if_exist_options), removeIndex (remove_index)
- **`rename`** — renameColumn (rename_column)
- **`references`** — raiseOnIfExistOptions (raise_on_if_exist_options), addReference (add_reference)

### `connection-adapters/abstract/schema-statements.ts` (30 methods)

- **`tables`** — queryValues (query_values), dataSourceSql (data_source_sql)
- **`tableExists`** — queryValues (query_values), dataSourceSql (data_source_sql), tables (tables)
- **`views`** — queryValues (query_values), dataSourceSql (data_source_sql)
- **`viewExists`** — queryValues (query_values), dataSourceSql (data_source_sql), views (views)
- **`indexExists`** — isDefinedFor (defined_for?)
- **`columns`** — columnDefinitions (column_definitions), newColumnFromField (new_column_from_field)
- **`columnExists`** — columnOptionsKeys (column_options_keys)
- **`primaryKey`** — primaryKeys (primary_keys)
- **`createTable`** — validateCreateTableOptionsBang (validate_create_table_options!), validateTableLengthBang (validate_table_length!), buildCreateTableDefinition (build_create_table_definition), clearDataSourceCacheBang (clear_data_source_cache!), schemaCache (schema_cache)
- **`createJoinTable`** — findJoinTableName (find_join_table_name), reverseMergeBang (reverse_merge!), referenceNameForTable (reference_name_for_table), references (references)
- **`dropJoinTable`** — findJoinTableName (find_join_table_name)
- **`changeTable`** — supportsBulkAlter (supports_bulk_alter?), updateTableDefinition (update_table_definition), bulkChangeTable (bulk_change_table), commands (commands)
- **`dropTable`** — clearDataSourceCacheBang (clear_data_source_cache!), schemaCache (schema_cache), execute (execute)
- **`addColumn`** — buildAddColumnDefinition (build_add_column_definition), execute (execute), accept (accept), schemaCreation (schema_creation)
- **`removeColumns`** — removeColumnsForAlter (remove_columns_for_alter), execute (execute)
- **`removeColumn`** — execute (execute), removeColumnForAlter (remove_column_for_alter)
- **`addIndex`** — buildCreateIndexDefinition (build_create_index_definition), execute (execute), accept (accept), schemaCreation (schema_creation)
- **`removeIndex`** — isIndexExists (index_exists?), indexNameForRemove (index_name_for_remove), execute (execute)
- **`renameIndex`** — validateIndexLengthBang (validate_index_length!), indexes (indexes), addIndex (add_index), unique (unique), removeIndex (remove_index)
- **`indexName`** — generateIndexName (generate_index_name), indexName (index_name), indexNameOptions (index_name_options)
- **`addReference`** — add (add)
- **`removeReference`** — slice (slice), pluralizeTableNames (pluralize_table_names), pluralize (pluralize), removeForeignKey (remove_foreign_key)
- **`addForeignKey`** — isUseForeignKeys (use_foreign_keys?), isForeignKeyExists (foreign_key_exists?), slice (slice), foreignKeyOptions (foreign_key_options), createAlterTable (create_alter_table)
- **`removeForeignKey`** — isUseForeignKeys (use_foreign_keys?), isForeignKeyExists (foreign_key_exists?), foreignKeyForBang (foreign_key_for!), createAlterTable (create_alter_table), dropForeignKey (drop_foreign_key)
- **`foreignKeyExists`** — foreignKeyFor (foreign_key_for)
- **`addCheckConstraint`** — supportsCheckConstraints (supports_check_constraints?), checkConstraintOptions (check_constraint_options), isCheckConstraintExists (check_constraint_exists?), createAlterTable (create_alter_table), addCheckConstraint (add_check_constraint)
- **`removeCheckConstraint`** — supportsCheckConstraints (supports_check_constraints?), isCheckConstraintExists (check_constraint_exists?), checkConstraintForBang (check_constraint_for!), createAlterTable (create_alter_table), dropCheckConstraint (drop_check_constraint)
- **`typeToSql`** — nativeDatabaseTypes (native_database_types)
- **`addTimestamps`** — addTimestampsForAlter (add_timestamps_for_alter), execute (execute)
- **`removeTimestamps`** — removeColumns (remove_columns)

### `connection-adapters/abstract/transaction.ts` (17 methods)

- **`fullyCompleted`** — isCompleted (completed?)
- **`start`** — buildHandle (build_handle), instrumenter (instrumenter), start (start)
- **`finish`** — finish (finish)
- **`afterCommit`** — isFinalized (finalized?)
- **`afterRollback`** — isFinalized (finalized?)
- **`constructor`** — isolationLevel (isolation_level), addChild (add_child), state (state)
- **`rollback`** — rollbackBang (rollback!), restart (restart)
- **`commit`** — commitBang (commit!)
- **`constructor`** — addChild (add_child), state (state), isolationLevel (isolation_level)
- **`rollback`** — isInvalidated (invalidated?), isMaterialized (materialized?), isActive (active?), rollbackToSavepoint (rollback_to_savepoint), savepointName (savepoint_name)
- **`commit`** — isMaterialized (materialized?), releaseSavepoint (release_savepoint), savepointName (savepoint_name), commitBang (commit!), finish (finish)
- **`rollback`** — isMaterialized (materialized?), rollbackDbTransaction (rollback_db_transaction), isolationLevel (isolation_level), resetIsolationLevel (reset_isolation_level), fullRollbackBang (full_rollback!)
- **`commit`** — isMaterialized (materialized?), commitDbTransaction (commit_db_transaction), isolationLevel (isolation_level), resetIsolationLevel (reset_isolation_level), fullCommitBang (full_commit!)
- **`beginTransaction`** — lock (lock), isJoinable (joinable?), currentTransaction (current_transaction), isRestartable (restartable?), isMaterialized (materialized?)
- **`commitTransaction`** — lock (lock), beforeCommitRecords (before_commit_records), isDirty (dirty?), dirtyCurrentTransaction (dirty_current_transaction), commit (commit)
- **`rollbackTransaction`** — lock (lock), rollback (rollback), rollbackRecords (rollback_records)
- **`withinNewTransaction`** — lock (lock), beginTransaction (begin_transaction), userTransaction (user_transaction), rollbackTransaction (rollback_transaction), afterFailureActions (after_failure_actions)

### `connection-adapters/column.ts` (4 methods)

- **`hasDefault`** — default (default), defaultFunction (default_function)
- **`isBigint`** — isMatch (match?), sqlType (sql_type)
- **`humanName`** — humanAttributeName (human_attribute_name)
- **`isAutoPopulated`** — defaultFunction (default_function)

### `connection-adapters/deduplicable.ts` (1 method)

- **`deduplicate`** — registry (registry), deduplicated (deduplicated)

### `connection-adapters/mysql/column.ts` (4 methods)

- **`isUnsigned`** — isMatch (match?), sqlType (sql_type)
- **`isCaseSensitive`** — collation (collation), isEndWith (end_with?)
- **`isAutoIncrement`** — extra (extra)
- **`isVirtual`** — isMatch (match?), extra (extra)

### `connection-adapters/mysql/explain-pretty-printer.ts` (1 method)

- **`pp`** — computeColumnWidths (compute_column_widths), buildSeparator (build_separator), buildCells (build_cells), rows (rows), buildFooter (build_footer)

### `connection-adapters/postgresql-adapter.ts` (1 method)

- **`decode`** — deserialize (deserialize)

### `connection-adapters/postgresql/column.ts` (1 method)

- **`hasDefault`** — isVirtual (virtual?)

### `connection-adapters/postgresql/explain-pretty-printer.ts` (1 method)

- **`pp`** — rows (rows), rstrip (rstrip), center (center)

### `connection-adapters/postgresql/oid/array.ts` (3 methods)

- **`deserialize`** — typeCastArray (type_cast_array), decode (decode)
- **`cast`** — decode (decode), typeCastArray (type_cast_array)
- **`serialize`** — typeCastArray (type_cast_array)

### `connection-adapters/postgresql/oid/bit.ts` (1 method)

- **`toString`** — value (value)

### `connection-adapters/postgresql/oid/bytea.ts` (1 method)

- **`deserialize`** — unescapeBytea (unescape_bytea)

### `connection-adapters/postgresql/oid/cidr.ts` (1 method)

- **`serialize`** — prefix (prefix)

### `connection-adapters/postgresql/oid/interval.ts` (1 method)

- **`serialize`** — iso8601 (iso8601), precision (precision), build (build)

### `connection-adapters/postgresql/oid/legacy-point.ts` (2 methods)

- **`cast`** — isStartWith (start_with?), isEndWith (end_with?), cast (cast)
- **`serialize`** — numberForPoint (number_for_point)

### `connection-adapters/postgresql/oid/point.ts` (2 methods)

- **`cast`** — isStartWith (start_with?), isEndWith (end_with?), buildPoint (build_point), valuesArrayFromHash (values_array_from_hash)
- **`serialize`** — numberForPoint (number_for_point), x (x), y (y), serialize (serialize), buildPoint (build_point)

### `connection-adapters/postgresql/oid/timestamp-with-time-zone.ts` (1 method)

- **`type`** — realTypeUnlessAliased (real_type_unless_aliased)

### `connection-adapters/postgresql/oid/timestamp.ts` (1 method)

- **`type`** — realTypeUnlessAliased (real_type_unless_aliased)

### `connection-adapters/postgresql/quoting.ts` (4 methods)

- **`quoteString`** — withRawConnection (with_raw_connection), escape (escape)
- **`quotedDate`** — year (year), format (format)
- **`quoteColumnName`** — quoteIdent (quote_ident)
- **`quoteTableName`** — quoted (quoted), extractSchemaQualifiedName (extract_schema_qualified_name)

### `connection-adapters/postgresql/schema-definitions.ts` (1 method)

- **`constructor`** — createUnloggedTables (create_unlogged_tables)

### `connection-adapters/postgresql/utils.ts` (3 methods)

- **`toString`** — parts (parts)
- **`quoted`** — schema (schema), quoteIdent (quote_ident), identifier (identifier)
- **`unquoteIdentifier`** — isStartWith (start_with?)

### `connection-adapters/schema-cache.ts` (16 methods)

- **`primaryKeys`** — primaryKeys (primary_keys), cache (cache)
- **`dataSourceExists`** — isDataSourceExists (data_source_exists?), cache (cache)
- **`columns`** — cache (cache)
- **`columnsHash`** — columnsHash (columns_hash), cache (cache)
- **`columnsHash`** — isColumnsHash (columns_hash?), cache (cache)
- **`version`** — version (version), cache (cache)
- **`size`** — cache (cache)
- **`primaryKeys`** — primaryKeys (primary_keys)
- **`dataSourceExists`** — isDataSourceExists (data_source_exists?)
- **`columnsHash`** — columnsHash (columns_hash)
- **`columnsHash`** — isColumnsHash (columns_hash?)
- **`version`** — version (version)
- **`primaryKeys`** — isDataSourceExists (data_source_exists?), deepDeduplicate (deep_deduplicate)
- **`dataSourceExists`** — isIgnoredTable (ignored_table?), tablesToCache (tables_to_cache), deepDeduplicate (deep_deduplicate), isDataSourceExists (data_source_exists?)
- **`columns`** — isIgnoredTable (ignored_table?), deepDeduplicate (deep_deduplicate)
- **`columnsHash`** — deepDeduplicate (deep_deduplicate)

### `connection-adapters/sqlite3-adapter.ts` (28 methods)

- **`constructor`** — root (root), expandPath (expand_path), dirname (dirname), isDirectory (directory?), mkdirP (mkdir_p)
- **`isDatabaseExists`** — isExist (exist?)
- **`isConnected`** — isClosed (closed?)
- **`isActive`** — isConnected (connected?), verifiedBang (verified!)
- **`disconnectBang`** — close (close)
- **`encoding`** — encoding (encoding), anyRawConnection (any_raw_connection)
- **`disableReferentialIntegrity`** — queryValue (query_value), execute (execute)
- **`checkAllForeignKeysValidBang`** — execute (execute)
- **`primaryKeys`** — tableStructure (table_structure)
- **`removeIndex`** — isIndexExists (index_exists?), indexNameForRemove (index_name_for_remove), execQuery (exec_query)
- **`virtualTables`** — castValues (cast_values), execQuery (exec_query)
- **`createVirtualTable`** — execQuery (exec_query)
- **`dropVirtualTable`** — dropTable (drop_table)
- **`renameTable`** — validateTableLengthBang (validate_table_length!), clearDataSourceCacheBang (clear_data_source_cache!), schemaCache (schema_cache), execQuery (exec_query), renameTableIndexes (rename_table_indexes)
- **`addColumn`** — isInvalidAlterTableType (invalid_alter_table_type?), alterTable (alter_table), column (column)
- **`removeColumn`** — removeColumn (remove_column), deleteIf (delete_if), foreignKeys (foreign_keys), column (column)
- **`removeColumns`** — removeColumn (remove_column), deleteIf (delete_if), foreignKeys (foreign_keys), column (column)
- **`changeColumnDefault`** — extractNewDefaultValue (extract_new_default_value)
- **`changeColumnNull`** — validateChangeColumnNullArgumentBang (validate_change_column_null_argument!), internalExecQuery (internal_exec_query), quote (quote)
- **`changeColumn`** — changeColumn (change_column)
- **`renameColumn`** — columnFor (column_for), alterTable (alter_table), renameColumnIndexes (rename_column_indexes)
- **`addTimestamps`** — alterTable (alter_table), column (column)
- **`foreignKeys`** — internalExecQuery (internal_exec_query), quote (quote), tableStructureSql (table_structure_sql), isStartWith (start_with?), downcase (downcase)
- **`buildInsertSql`** — into (into), valuesList (values_list), isSkipDuplicates (skip_duplicates?), conflictTarget (conflict_target), isUpdateDuplicates (update_duplicates?)
- **`isSharedCache`** — isAnybits (anybits?)
- **`getDatabaseVersion`** — queryValue (query_value)
- **`newClient`** — message (message)
- **`dbconsole`** — expandPath (expand_path), database (database), root (root), findCmdAndExec (find_cmd_and_exec), databaseCli (database_cli)

### `connection-adapters/sqlite3/column.ts` (1 method)

- **`hasDefault`** — isVirtual (virtual?)

### `connection-adapters/sqlite3/explain-pretty-printer.ts` (1 method)

- **`pp`** — rows (rows)

### `connection-adapters/sqlite3/quoting.ts` (1 method)

- **`quoteString`** — quote (quote)

### `connection-adapters/statement-pool.ts` (3 methods)

- **`length`** — cache (cache)
- **`clear`** — eachValue (each_value), cache (cache), dealloc (dealloc), clear (clear)
- **`delete`** — cache (cache), dealloc (dealloc)

### `connection-handling.ts` (1 method)

- **`establishConnection`** — resolveConfigForConnection (resolve_config_for_connection), establishConnection (establish_connection), connectionHandler (connection_handler), currentRole (current_role), currentShard (current_shard)

### `core.ts` (20 methods)

- **`constructor`** — deepDup (deep_dup), initInternals (init_internals), initializeInternalsCallback (initialize_internals_callback)
- **`initWithAttributes`** — initInternals (init_internals)
- **`initAttributes`** — deepDup (deep_dup), reset (reset)
- **`fullInspect`** — inspectWithAttributes (inspect_with_attributes), allAttributesForInspect (all_attributes_for_inspect)
- **`destroyAssociationAsyncJob`** — constantize (constantize), message (message)
- **`isApplicationRecordClass`** — applicationRecordClass (application_record_class)
- **`asynchronousQueriesSession`** — currentSession (current_session)
- **`currentRole`** — reverseEach (reverse_each), connectedToStack (connected_to_stack), connectionClassForSelf (connection_class_for_self), defaultRole (default_role)
- **`currentShard`** — reverseEach (reverse_each), connectedToStack (connected_to_stack), connectionClassForSelf (connection_class_for_self), defaultShard (default_shard)
- **`currentPreventingWrites`** — reverseEach (reverse_each), connectedToStack (connected_to_stack), connectionClassForSelf (connection_class_for_self)
- **`isPreventingWrites`** — reverseEach (reverse_each), connectedToStack (connected_to_stack)
- **`isConnectionClass`** — connectionClass (connection_class)
- **`connectionClassForSelf`** — isConnectionClass (connection_class?)
- **`strictLoadingViolationBang`** — actionOnStrictLoadingViolation (action_on_strict_loading_violation), strictLoadingViolationMessage (strict_loading_violation_message)
- **`initializeGeneratedModules`** — generatedAssociationMethods (generated_association_methods)
- **`generatedAssociationMethods`** — constSet (const_set), privateConstant (private_constant), include (include)
- **`filterAttributes`** — filterAttributes (filter_attributes)
- **`inspectionFilter`** — inspectionFilter (inspection_filter)
- **`predicateBuilder`** — arelTable (arel_table)
- **`cachedFindByStatement`** — preparedStatements (prepared_statements), computeIfAbsent (compute_if_absent), create (create)

### `counter-cache.ts` (5 methods)

- **`resetCounters`** — reflectOnAllAssociations (reflect_on_all_associations), counterCacheColumn (counter_cache_column), isBelongsTo (belongs_to?), wrap (wrap), touchAttributesWithTime (touch_attributes_with_time)
- **`updateCounters`** — updateCounters (update_counters), whereBang (where!), unscoped (unscoped)
- **`incrementCounter`** — updateCounters (update_counters)
- **`decrementCounter`** — updateCounters (update_counters)
- **`loadSchemaBang`** — isBelongsTo (belongs_to?), counterCacheColumn (counter_cache_column)

### `database-configurations.ts` (4 methods)

- **`constructor`** — buildConfigs (build_configs)
- **`configsFor`** — defaultEnv (default_env), envWithConfigs (env_with_configs), isDatabaseTasks (database_tasks?), configurationHash (configuration_hash)
- **`findDbConfig`** — configurations (configurations), isForCurrentEnv (for_current_env?), envName (env_name)
- **`empty`** — configurations (configurations)

### `database-configurations/database-config.ts` (1 method)

- **`forCurrentEnv`** — envName (env_name)

### `database-configurations/hash-config.ts` (1 method)

- **`constructor`** — symbolizeKeys (symbolize_keys)

### `database-configurations/url-config.ts` (1 method)

- **`constructor`** — buildUrlHash (build_url_hash), toBooleanBang (to_boolean!)

### `delegated-type.ts` (1 method)

- **`delegatedType`** — belongsTo (belongs_to), defineDelegatedTypeMethods (define_delegated_type_methods)

### `encryption/auto-filtered-parameters.ts` (1 method)

- **`constructor`** — installCollectingHook (install_collecting_hook)

### `encryption/cipher/aes256-gcm.ts` (2 methods)

- **`encrypt`** — encrypt (encrypt), generateIv (generate_iv), update (update), final (final), headers (headers)
- **`decrypt`** — payload (payload), iv (iv), headers (headers), authTag (auth_tag), bytes (bytes)

### `encryption/config.ts` (1 method)

- **`constructor`** — setDefaults (set_defaults)

### `encryption/configurable.ts` (3 methods)

- **`configure`** — resetDefaultContext (reset_default_context), context (context)
- **`onEncryptedAttributeDeclared`** — encryptedAttributeDeclarationListeners (encrypted_attribute_declaration_listeners)
- **`encryptedAttributeWasDeclared`** — encryptedAttributeDeclarationListeners (encrypted_attribute_declaration_listeners)

### `encryption/contexts.ts` (5 methods)

- **`withEncryptionContext`** — customContexts (custom_contexts), defaultContext (default_context), currentCustomContext (current_custom_context)
- **`withoutEncryption`** — withEncryptionContext (with_encryption_context)
- **`protectingEncryptedData`** — withEncryptionContext (with_encryption_context)
- **`context`** — currentCustomContext (current_custom_context), defaultContext (default_context)
- **`currentCustomContext`** — customContexts (custom_contexts)

### `encryption/derived-secret-key-provider.ts` (1 method)

- **`constructor`** — deriveKeyFrom (derive_key_from)

### `encryption/encryptable-record.ts` (2 methods)

- **`encrypts`** — encryptAttribute (encrypt_attribute)
- **`deterministicEncryptedAttributes`** — findAll (find_all), isDeterministic (deterministic?)

### `encryption/encrypted-attribute-type.ts` (6 methods)

- **`cast`** — cast (cast), castType (cast_type)
- **`deserialize`** — deserialize (deserialize), castType (cast_type)
- **`serialize`** — isSerializeWithOldest (serialize_with_oldest?), serializeWithOldest (serialize_with_oldest), serializeWithCurrent (serialize_with_current)
- **`encrypted`** — withContext (with_context), isEncrypted (encrypted?), encryptor (encryptor)
- **`previousTypes`** — isSupportUnencryptedData (support_unencrypted_data?), buildPreviousTypesFor (build_previous_types_for), previousSchemesIncludingCleanText (previous_schemes_including_clean_text)
- **`supportUnencryptedData`** — supportUnencryptedData (support_unencrypted_data), isSupportUnencryptedData (support_unencrypted_data?), scheme (scheme), isPreviousType (previous_type?)

### `encryption/encryptor.ts` (4 methods)

- **`constructor`** — compressor (compressor)
- **`encrypt`** — forceEncodingIfNeeded (force_encoding_if_needed), validatePayloadType (validate_payload_type), serializeMessage (serialize_message), buildEncryptedMessage (build_encrypted_message)
- **`decrypt`** — deserializeMessage (deserialize_message), decryptionKeys (decryption_keys), uncompressIfNeeded (uncompress_if_needed), decrypt (decrypt), cipher (cipher)
- **`encrypted`** — deserializeMessage (deserialize_message)

### `encryption/envelope-encryption-key-provider.ts` (2 methods)

- **`encryptionKey`** — generateRandomSecret (generate_random_secret), publicTags (public_tags), encryptDataKey (encrypt_data_key), storeKeyReferences (store_key_references), id (id)
- **`decryptionKeys`** — decryptDataKey (decrypt_data_key)

### `encryption/extended-deterministic-queries.ts` (4 methods)

- **`constructor`** — process (process)
- **`installSupport`** — prepend (prepend), include (include)
- **`processArguments`** — deterministicEncryptedAttributes (deterministic_encrypted_attributes), transformKeys (transform_keys), previousTypes (previous_types)
- **`serialize`** — value (value)

### `encryption/extended-deterministic-uniqueness-validator.ts` (1 method)

- **`installSupport`** — prepend (prepend)

### `encryption/key-generator.ts` (2 methods)

- **`generateRandomKey`** — randomBytes (random_bytes)
- **`generateRandomHexKey`** — unpack (unpack), generateRandomKey (generate_random_key)

### `encryption/key-provider.ts` (2 methods)

- **`encryptionKey`** — storeKeyReferences (store_key_references), publicTags (public_tags), id (id)
- **`decryptionKeys`** — encryptedDataKeyId (encrypted_data_key_id), headers (headers), keysGroupedById (keys_grouped_by_id)

### `encryption/key.ts` (2 methods)

- **`id`** — hexdigest (hexdigest), secret (secret)
- **`deriveFrom`** — deriveKeyFrom (derive_key_from), keyGenerator (key_generator)

### `encryption/message-pack-message-serializer.ts` (2 methods)

- **`dump`** — dump (dump), messageToHash (message_to_hash)
- **`load`** — load (load), hashToMessage (hash_to_message)

### `encryption/message-serializer.ts` (2 methods)

- **`load`** — parse (parse), parseMessage (parse_message)
- **`dump`** — messageToJson (message_to_json)

### `encryption/message.ts` (1 method)

- **`constructor`** — validatePayloadType (validate_payload_type)

### `encryption/properties.ts` (1 method)

- **`constructor`** — add (add)

### `encryption/scheme.ts` (1 method)

- **`constructor`** — wrap (wrap), validateConfigBang (validate_config!)

### `errors.ts` (3 methods)

- **`constructor`** — message (message)
- **`constructor`** — isBigint (bigint?), squish (squish), sqlType (sql_type)
- **`setQuery`** — setBacktrace (set_backtrace), backtrace (backtrace)

### `fixture-set/table-row.ts` (2 methods)

- **`constructor`** — fillRowModelAttributes (fill_row_model_attributes)
- **`constructor`** — joinPrimaryKey (join_primary_key)

### `fixture-set/table-rows.ts` (1 method)

- **`constructor`** — buildTableRowsFrom (build_table_rows_from)

### `fixtures.ts` (1 method)

- **`constructor`** — readFixtureFiles (read_fixture_files), modelClass (model_class), defaultFixtureTableName (default_fixture_table_name)

### `inheritance.ts` (3 methods)

- **`isDescendsFromActiveRecord`** — isAbstractClass (abstract_class?), isDescendsFromActiveRecord (descends_from_active_record?), columnsHash (columns_hash), inheritanceColumn (inheritance_column)
- **`stiName`** — storeFullStiClass (store_full_sti_class), storeFullClassName (store_full_class_name), demodulize (demodulize)
- **`polymorphicName`** — storeFullClassName (store_full_class_name), baseClass (base_class), demodulize (demodulize)

### `insert-all.ts` (14 methods)

- **`constructor`** — recordTimestamps (record_timestamps), disallowRawSqlBang (disallow_raw_sql!), resolveSti (resolve_sti), resolveAttributeAliases (resolve_attribute_aliases), except (except)
- **`execute`** — inserts (inserts), empty (empty), isMany (many?), onDuplicate (on_duplicate), execInsertAll (exec_insert_all)
- **`updatableColumns`** — readonlyColumns (readonly_columns), uniqueByColumns (unique_by_columns)
- **`primaryKeys`** — primaryKeys (primary_keys), schemaCache (schema_cache)
- **`skipDuplicates`** — onDuplicate (on_duplicate)
- **`updateDuplicates`** — onDuplicate (on_duplicate)
- **`mapKeyWithValue`** — inserts (inserts), stringifyKeys (stringify_keys), reverseMergeBang (reverse_merge!), timestampsForCreate (timestamps_for_create), verifyAttributes (verify_attributes)
- **`keysIncludingTimestamps`** — allTimestampAttributesInModel (all_timestamp_attributes_in_model)
- **`into`** — quotedTableName (quoted_table_name), columnsList (columns_list)
- **`valuesList`** — extractTypesFromColumnsOn (extract_types_from_columns_on), keysIncludingTimestamps (keys_including_timestamps), mapKeyWithValue (map_key_with_value), insertAll (insert_all), serialize (serialize)
- **`conflictTarget`** — uniqueBy (unique_by), insertAll (insert_all), formatColumns (format_columns), where (where), isUpdateDuplicates (update_duplicates?)
- **`updatableColumns`** — quoteColumns (quote_columns), updatableColumns (updatable_columns), insertAll (insert_all)
- **`touchModelTimestampsUnless`** — isUpdateDuplicates (update_duplicates?), isRecordTimestamps (record_timestamps?), timestampAttributesForUpdateInModel (timestamp_attributes_for_update_in_model), isTouchTimestampAttribute (touch_timestamp_attribute?), quotedTableName (quoted_table_name)
- **`rawUpdateSql`** — updateSql (update_sql), insertAll (insert_all)

### `integration.ts` (5 methods)

- **`toParam`** — id (id), paramDelimiter (param_delimiter)
- **`cacheKey`** — cacheKey (cache_key), modelName (model_name), cacheVersion (cache_version), id (id), maxUpdatedColumnTimestamp (max_updated_column_timestamp)
- **`cacheVersion`** — cacheVersioning (cache_versioning), hasAttribute (has_attribute?), updatedAtBeforeTypeCast (updated_at_before_type_cast), canUseFastCacheVersion (can_use_fast_cache_version?), rawTimestampToCacheVersion (raw_timestamp_to_cache_version)
- **`cacheKeyWithVersion`** — cacheVersion (cache_version), cacheKey (cache_key)
- **`toParam`** — truncate (truncate), parameterize (parameterize), squish (squish)

### `internal-metadata.ts` (6 methods)

- **`tableName`** — tableNamePrefix (table_name_prefix), internalMetadataTableName (internal_metadata_table_name), tableNameSuffix (table_name_suffix)
- **`deleteAllEntries`** — arelTable (arel_table)
- **`count`** — arelTable (arel_table), project (project), star (star)
- **`createTable`** — isEnabled (enabled?), isTableExists (table_exists?), createTable (create_table), string (string), internalStringOptionsForPrimaryKey (internal_string_options_for_primary_key)
- **`dropTable`** — isEnabled (enabled?), dropTable (drop_table)
- **`tableExists`** — isDataSourceExists (data_source_exists?), schemaCache (schema_cache)

### `locking/optimistic.ts` (5 methods)

- **`lockingEnabled`** — isLockingEnabled (locking_enabled?)
- **`incrementBang`** — isLockingEnabled (locking_enabled?), lockingColumn (locking_column), clearAttributeChange (clear_attribute_change)
- **`lockingEnabled`** — lockOptimistically (lock_optimistically), columnsHash (columns_hash)
- **`lockingColumn`** — reloadSchemaFromCache (reload_schema_from_cache)
- **`updateCounters`** — lockingColumn (locking_column)

### `locking/pessimistic.ts` (1 method)

- **`lockBang`** — isPersisted (persisted?), hasChangesToSave (has_changes_to_save?), squish (squish), changed (changed), reload (reload)

### `migration.ts` (59 methods)

- **`constructor`** — strftime (strftime), utc (utc), now (now), day (day)
- **`constructor`** — pendingMigrations (pending_migrations), open (open), migrationContext (migration_context), detailedMigrationMessage (detailed_migration_message)
- **`constructor`** — env (env)
- **`constructor`** — env (env)
- **`disableDdlTransaction`** — disableDdlTransaction (disable_ddl_transaction)
- **`executionStrategy`** — migrationStrategy (migration_strategy)
- **`revert`** — run (run), revert (revert), commandRecorder (command_recorder), suppressMessages (suppress_messages), delegate (delegate)
- **`isReverting`** — reverting (reverting)
- **`up`** — reverting (reverting)
- **`down`** — reverting (reverting)
- **`reversible`** — isReverting (reverting?), executeBlock (execute_block)
- **`upOnly`** — isReverting (reverting?), executeBlock (execute_block)
- **`run`** — isReverting (reverting?), revert (revert), run (run), execMigration (exec_migration)
- **`migrate`** — migrationConnection (migration_connection), realtime (realtime)
- **`execMigration`** — revert (revert), change (change)
- **`write`** — verbose (verbose)
- **`announce`** — version (version)
- **`sayWithTime`** — realtime (realtime)
- **`suppressMessages`** — verbose (verbose)
- **`connection`** — migrationConnection (migration_connection)
- **`connectionPool`** — migrationConnectionPool (migration_connection_pool)
- **`copy`** — isExist (exist?), mkdirP (mkdir_p), migrations (migrations), binread (binread), filename (filename)
- **`nextMigrationNumber`** — timestampedMigrations (timestamped_migrations), strftime (strftime), utc (utc), now (now)
- **`tableNameOptions`** — tableNamePrefix (table_name_prefix), tableNameSuffix (table_name_suffix)
- **`isValidVersionFormat`** — isMatch (match?)
- **`nearestDelegate`** — delegate (delegate), nearestDelegate (nearest_delegate)
- **`checkAllPendingBang`** — withTemporaryPoolForEach (with_temporary_pool_for_each), env (env), pendingMigrations (pending_migrations), open (open), migrationContext (migration_context)
- **`loadSchemaIfPendingBang`** — isAnySchemaNeedsUpdate (any_schema_needs_update?), loadSchemaBang (load_schema!)
- **`maintainTestSchemaBang`** — maintainTestSchema (maintain_test_schema), suppressMessages (suppress_messages), loadSchemaIfPendingBang (load_schema_if_pending!)
- **`checkPendingMigrations`** — pendingMigrations (pending_migrations)
- **`createTable`** — compatibleTableDefinition (compatible_table_definition)
- **`changeTable`** — compatibleTableDefinition (compatible_table_definition)
- **`createJoinTable`** — compatibleTableDefinition (compatible_table_definition)
- **`dropTable`** — compatibleTableDefinition (compatible_table_definition)
- **`call`** — buildWatcher (build_watcher), checkPendingMigrations (check_pending_migrations), execute (execute), executeIfUpdated (execute_if_updated)
- **`migrate`** — up (up), down (down)
- **`rollback`** — move (move)
- **`forward`** — move (move)
- **`up`** — migrations (migrations), migrate (migrate), schemaMigration (schema_migration), internalMetadata (internal_metadata)
- **`down`** — migrations (migrations), migrate (migrate), schemaMigration (schema_migration), internalMetadata (internal_metadata)
- **`run`** — run (run), migrations (migrations), schemaMigration (schema_migration), internalMetadata (internal_metadata)
- **`open`** — migrations (migrations), schemaMigration (schema_migration), internalMetadata (internal_metadata)
- **`getAllVersions`** — isTableExists (table_exists?), schemaMigration (schema_migration), integerVersions (integer_versions)
- **`needsMigration`** — pendingMigrationVersions (pending_migration_versions)
- **`pendingMigrationVersions`** — migrations (migrations), getAllVersions (get_all_versions)
- **`migrations`** — migrationFiles (migration_files), parseMigrationFilename (parse_migration_filename), isValidateTimestamp (validate_timestamp?), isValidMigrationTimestamp (valid_migration_timestamp?), camelize (camelize)
- **`migrationsStatus`** — normalizedVersions (normalized_versions), schemaMigration (schema_migration), migrationFiles (migration_files), parseMigrationFilename (parse_migration_filename), isValidateTimestamp (validate_timestamp?)
- **`isProtectedEnvironment`** — lastStoredEnvironment (last_stored_environment), protectedEnvironments (protected_environments)
- **`lastStoredEnvironment`** — internalMetadata (internal_metadata), isEnabled (enabled?), currentVersion (current_version), isTableExists (table_exists?)
- **`constructor`** — validate (validate), createTable (create_table)
- **`currentVersion`** — migrated (migrated)
- **`currentMigration`** — migrations (migrations), version (version)
- **`run`** — isUseAdvisoryLock (use_advisory_lock?), withAdvisoryLock (with_advisory_lock), runWithoutLock (run_without_lock)
- **`migrate`** — isUseAdvisoryLock (use_advisory_lock?), withAdvisoryLock (with_advisory_lock), migrateWithoutLock (migrate_without_lock)
- **`runnable`** — migrations (migrations), start (start), finish (finish), isUp (up?), isRan (ran?)
- **`migrations`** — isDown (down?)
- **`pendingMigrations`** — migrated (migrated), migrations (migrations), version (version)
- **`migrated`** — loadMigrated (load_migrated)
- **`loadMigrated`** — integerVersions (integer_versions)

### `migration/command-recorder.ts` (3 methods)

- **`revert`** — concat (concat)
- **`changeTable`** — supportsBulkAlter (supports_bulk_alter?), delegate (delegate), updateTableDefinition (update_table_definition), commands (commands), bulkChangeTable (bulk_change_table)
- **`replay`** — commands (commands)

### `migration/pending-migration-connection.ts` (1 method)

- **`withTemporaryPool`** — establishConnection (establish_connection), connectionHandler (connection_handler), removeConnectionPool (remove_connection_pool)

### `model-schema.ts` (17 methods)

- **`deriveJoinTableName`** — tr (tr)
- **`quotedTableName`** — adapterClass (adapter_class)
- **`resetTableName`** — isAbstractClass (abstract_class?), computeTableName (compute_table_name)
- **`fullTableNamePrefix`** — tableNamePrefix (table_name_prefix), moduleParents (module_parents)
- **`fullTableNameSuffix`** — tableNameSuffix (table_name_suffix), moduleParents (module_parents)
- **`resetSequenceName`** — defaultSequenceName (default_sequence_name)
- **`isPrefetchPrimaryKey`** — isPrefetchPrimaryKey (prefetch_primary_key?)
- **`nextSequenceValue`** — nextSequenceValue (next_sequence_value), sequenceName (sequence_name)
- **`attributesBuilder`** — except (except), columnNames (column_names), attributeTypes (attribute_types)
- **`columnsHash`** — loadSchema (load_schema)
- **`columns`** — columnsHash (columns_hash)
- **`yamlEncoder`** — attributeTypes (attribute_types)
- **`columnForAttribute`** — columnsHash (columns_hash)
- **`symbolColumnToString`** — columnNames (column_names)
- **`contentColumns`** — inheritanceColumn (inheritance_column), isEndWith (end_with?)
- **`resetColumnInformation`** — clearCacheBang (clear_cache!), activeConnection (active_connection), descendants (descendants), clearDataSourceCacheBang (clear_data_source_cache!), schemaCache (schema_cache)
- **`loadSchema`** — isSchemaLoaded (schema_loaded?), loadSchemaBang (load_schema!), reloadSchemaFromCache (reload_schema_from_cache)

### `nested-attributes.ts` (1 method)

- **`acceptsNestedAttributesFor`** — update (update), assertValidKeys (assert_valid_keys), defineAutosaveValidationCallbacks (define_autosave_validation_callbacks), nestedAttributesOptions (nested_attributes_options), isCollection (collection?)

### `no-touching.ts` (4 methods)

- **`isNoTouching`** — isAppliedTo (applied_to?)
- **`applyTo`** — klasses (klasses)
- **`isAppliedTo`** — klasses (klasses)
- **`noTouching`** — applyTo (apply_to)

### `persistence.ts` (4 methods)

- **`build`** — build (build)
- **`instantiate`** — instantiateInstanceOf (instantiate_instance_of)
- **`queryConstraintsList`** — isBaseClass (base_class?), baseClass (base_class), queryConstraintsList (query_constraints_list)
- **`compositeQueryConstraintsList`** — queryConstraintsList (query_constraints_list)

### `query-cache.ts` (1 method)

- **`uncached`** — isConnected (connected?), configurations (configurations), disableQueryCache (disable_query_cache)

### `query-logs.ts` (2 methods)

- **`tags`** — rebuildHandlers (rebuild_handlers)
- **`call`** — prependComment (prepend_comment)

### `querying.ts` (2 methods)

- **`countBySql`** — selectValue (select_value)
- **`asyncCountBySql`** — selectValue (select_value), sanitizeSql (sanitize_sql)

### `readonly-attributes.ts` (1 method)

- **`attrReadonly`** — raiseOnAssignToAttrReadonly (raise_on_assign_to_attr_readonly), include (include)

### `reflection.ts` (53 methods)

- **`className`** — deriveClassName (derive_class_name)
- **`joinScope`** — with (with), predicateBuilder (predicate_builder), whereBang (where!), polymorphicName (polymorphic_name), joinPrimaryKey (join_primary_key)
- **`joinScopes`** — scopeFor (scope_for)
- **`klassJoinScope`** — scopeForAssociation (scope_for_association)
- **`constraints`** — chain (chain)
- **`counterCacheColumn`** — demodulize (demodulize)
- **`inverseOf`** — inverseName (inverse_name)
- **`inverseWhichUpdatesCounterCache`** — isPolymorphic (polymorphic?)
- **`hasCachedCounter`** — hasAttribute (has_attribute?)
- **`constructor`** — normalizeOptions (normalize_options), pluralizeTableNames (pluralize_table_names)
- **`computeClass`** — constantize (constantize)
- **`scopeFor`** — instanceExec (instance_exec)
- **`computeClass`** — isMatch (match?)
- **`constructor`** — squish (squish), ensureOptionNotGivenAsClassBang (ensure_option_not_given_as_class!)
- **`associationScopeCache`** — isPolymorphic (polymorphic?), cachedFindByStatement (cached_find_by_statement)
- **`joinTable`** — deriveJoinTable (derive_join_table)
- **`foreignKey`** — deriveForeignKey (derive_foreign_key), hasQueryConstraints (has_query_constraints?), deriveFkQueryConstraints (derive_fk_query_constraints), mapBang (map!)
- **`activeRecordPrimaryKey`** — hasQueryConstraints (has_query_constraints?), queryConstraintsList (query_constraints_list)
- **`checkEagerLoadableBang`** — arity (arity), squish (squish)
- **`joinIdFor`** — joinForeignKey (join_foreign_key)
- **`clearAssociationScopeCache`** — initializeFindByCache (initialize_find_by_cache)
- **`hasInverse`** — inverseName (inverse_name)
- **`polymorphicName`** — polymorphicName (polymorphic_name)
- **`associationPrimaryKey`** — hasQueryConstraints (has_query_constraints?), compositeQueryConstraintsList (composite_query_constraints_list)
- **`joinPrimaryKey`** — isPolymorphic (polymorphic?)
- **`constructor`** — ensureOptionNotGivenAsClassBang (ensure_option_not_given_as_class!)
- **`klass`** — delegateReflection (delegate_reflection)
- **`collectJoinChain`** — collectJoinReflections (collect_join_reflections)
- **`clearAssociationScopeCache`** — clearAssociationScopeCache (clear_association_scope_cache), delegateReflection (delegate_reflection)
- **`scopes`** — scopes (scopes)
- **`joinScopes`** — joinScopes (join_scopes)
- **`hasScope`** — hasScope (has_scope?)
- **`isNested`** — isThroughReflection (through_reflection?)
- **`associationPrimaryKey`** — actualSourceReflection (actual_source_reflection)
- **`joinPrimaryKey`** — joinPrimaryKey (join_primary_key)
- **`sourceReflectionName`** — findAll (find_all)
- **`checkValidityBang`** — normalizedReflections (normalized_reflections), index (index)
- **`constraints`** — constraints (constraints)
- **`addAsSource`** — collectJoinReflections (collect_join_reflections)
- **`addAsPolymorphicThrough`** — collectJoinReflections (collect_join_reflections)
- **`addAsThrough`** — collectJoinReflections (collect_join_reflections)
- **`joinScopes`** — isThroughReflection (through_reflection?), joinScopes (join_scopes), instanceExec (instance_exec), sourceTypeScope (source_type_scope)
- **`constraints`** — constraints (constraints), sourceTypeScope (source_type_scope)
- **`aliasedTable`** — arelTable (arel_table)
- **`joinPrimaryKey`** — joinPrimaryKey (join_primary_key)
- **`addReflection`** — except (except)
- **`addAggregateReflection`** — aggregateReflections (aggregate_reflections)
- **`reflectOnAllAggregations`** — aggregateReflections (aggregate_reflections)
- **`reflectOnAggregation`** — aggregateReflections (aggregate_reflections)
- **`reflections`** — stringifyKeys (stringify_keys)
- **`reflectOnAllAssociations`** — normalizedReflections (normalized_reflections), selectBang (select!)
- **`reflectOnAssociation`** — normalizedReflections (normalized_reflections)
- **`reflectOnAllAutosaveAssociations`** — normalizedReflections (normalized_reflections), selectBang (select!)

### `relation.ts` (36 methods)

- **`constructor`** — with (with), predicateBuilder (predicate_builder), arelTable (arel_table)
- **`bindAttribute`** — readAttribute (read_attribute), buildBindAttribute (build_bind_attribute), predicateBuilder (predicate_builder)
- **`constructor`** — currentScopeRestoringBlock (current_scope_restoring_block), scoping (scoping)
- **`create`** — create (create), currentScopeRestoringBlock (current_scope_restoring_block), scoping (scoping)
- **`createBang`** — createBang (create!), currentScopeRestoringBlock (current_scope_restoring_block), scoping (scoping)
- **`findOrCreateBy`** — findBy (find_by), createOrFindBy (create_or_find_by)
- **`createOrFindBy`** — transaction (transaction), create (create), isTransactionOpen (transaction_open?), findByBang (find_by!), lock (lock)
- **`isOne`** — isOne (one?), limitedCount (limited_count)
- **`isMany`** — isMany (many?), limitedCount (limited_count)
- **`cacheKey`** — collectionCacheKey (collection_cache_key)
- **`computeCacheKey`** — hexdigest (hexdigest), cacheKey (cache_key), modelName (model_name), collectionCacheVersioning (collection_cache_versioning), computeCacheVersion (compute_cache_version)
- **`cacheVersion`** — collectionCacheVersioning (collection_cache_versioning)
- **`computeCacheVersion`** — readAttribute (read_attribute), isEagerLoading (eager_loading?), applyJoinDependency (apply_join_dependency), compile (compile), visitor (visitor)
- **`scoping`** — scopeRegistry (scope_registry), isGlobalScope (global_scope?), isAlreadyInScope (already_in_scope?)
- **`updateAll`** — isLockingEnabled (locking_enabled?), lockingColumn (locking_column), sql (sql), sanitizeSqlForAssignment (sanitize_sql_for_assignment), isEagerLoading (eager_loading?)
- **`update`** — update (update)
- **`updateBang`** — updateBang (update!)
- **`insertAll`** — execute (execute)
- **`insertBang`** — insertAllBang (insert_all!)
- **`insertAllBang`** — execute (execute)
- **`upsertAll`** — execute (execute)
- **`updateCounters`** — wrap (wrap), touchAttributesWithTime (touch_attributes_with_time), updateAll (update_all)
- **`touchAll`** — updateAll (update_all), touchAttributesWithTime (touch_attributes_with_time)
- **`deleteAll`** — isEagerLoading (eager_loading?), arel (arel), applyJoinDependency (apply_join_dependency), buildArel (build_arel), source (source)
- **`destroyBy`** — destroyAll (destroy_all)
- **`loadAsync`** — isAsyncEnabled (async_enabled?), load (load), execMainQuery (exec_main_query), isJoinable (joinable?), currentTransaction (current_transaction)
- **`load`** — isScheduled (scheduled?), execQueries (exec_queries)
- **`reset`** — cancel (cancel)
- **`toSql`** — isEagerLoading (eager_loading?), applyJoinDependency (apply_join_dependency), applyColumnAliases (apply_column_aliases), toSql (to_sql), unpreparedStatement (unprepared_statement)
- **`whereValuesHash`** — whereClause (where_clause)
- **`scopeForCreate`** — whereClause (where_clause), createWithValue (create_with_value)
- **`isEagerLoading`** — joinedIncludesValues (joined_includes_values), isReferencesEagerLoadedTables (references_eager_loaded_tables?)
- **`valuesForQueries`** — except (except)
- **`isEmptyScope`** — unscoped (unscoped)
- **`preloadAssociations`** — isEagerLoading (eager_loading?)
- **`pluck`** — execExplain (exec_explain), pluck (pluck)

### `relation/batches/batch-enumerator.ts` (4 methods)

- **`eachRecord`** — toEnum (to_enum)
- **`touchAll`** — touchAll (touch_all)
- **`destroyAll`** — destroyAll (destroy_all)
- **`each`** — toEnum (to_enum)

### `relation/calculations.ts` (1 method)

- **`aliasFor`** — columnAliasFor (column_alias_for), truncate (truncate)

### `relation/delegation.ts` (4 methods)

- **`generateMethod`** — isMatch (match?), scoping (scoping)
- **`uncacheableMethods`** — toSet (to_set), delegatedClasses (delegated_classes), publicInstanceMethods (public_instance_methods)
- **`initializeRelationDelegateCache`** — delegatedClasses (delegated_classes), include (include), includeRelationMethods (include_relation_methods), constSet (const_set), privateConstant (private_constant)
- **`generateRelationMethod`** — generateMethod (generate_method), generatedRelationMethods (generated_relation_methods)

### `relation/finder-methods.ts` (1 method)

- **`raiseRecordNotFoundExceptionBang`** — whereClause (where_clause), whereSql (where_sql), arel (arel), wrap (wrap), pluralize (pluralize)

### `relation/from-clause.ts` (1 method)

- **`isEmpty`** — value (value)

### `relation/merger.ts` (3 methods)

- **`constructor`** — assertValidKeys (assert_valid_keys)
- **`merge`** — relation (relation), other (other)
- **`merge`** — relation (relation), isNullRelation (null_relation?), other (other), noneBang (none!), mergeSelectValues (merge_select_values)

### `relation/predicate-builder.ts` (5 methods)

- **`constructor`** — registerHandler (register_handler)
- **`buildFromHash`** — convertDotNotationToHash (convert_dot_notation_to_hash), expandFromHash (expand_from_hash)
- **`build`** — id (id), isForceEquality (force_equality?), buildBindAttribute (build_bind_attribute), handlerFor (handler_for)
- **`resolveArelAttribute`** — arelTable (arel_table), associatedTable (associated_table)
- **`references`** — sql (sql), rindex (rindex)

### `relation/predicate-builder/array-handler.ts` (1 method)

- **`call`** — in (in), id (id), compactBang (compact!), build (build), predicateBuilder (predicate_builder)

### `relation/predicate-builder/association-query-value.ts` (1 method)

- **`queries`** — joinForeignKey (join_foreign_key), associatedTable (associated_table), pluck (pluck), zip (zip)

### `relation/predicate-builder/basic-object-handler.ts` (1 method)

- **`call`** — buildBindAttribute (build_bind_attribute), predicateBuilder (predicate_builder), eq (eq)

### `relation/predicate-builder/polymorphic-array-value.ts` (1 method)

- **`queries`** — joinForeignKey (join_foreign_key), associatedTable (associated_table), typeToIdsMapping (type_to_ids_mapping), joinForeignType (join_foreign_type)

### `relation/predicate-builder/range-handler.ts` (1 method)

- **`call`** — buildBindAttribute (build_bind_attribute), predicateBuilder (predicate_builder), begin (begin), end (end), between (between)

### `relation/predicate-builder/relation-handler.ts` (1 method)

- **`call`** — isEagerLoading (eager_loading?), in (in), arel (arel)

### `relation/query-attribute.ts` (3 methods)

- **`constructor`** — valueBeforeTypeCast (value_before_type_cast), isSerialized (serialized?), valueForDatabase (value_for_database), isMutable (mutable?), deepDup (deep_dup)
- **`isInfinite`** — isInfinity (infinity?), valueBeforeTypeCast (value_before_type_cast), isSerializable (serializable?), valueForDatabase (value_for_database)
- **`isUnboundable`** — isSerializable (serializable?)

### `relation/query-methods.ts` (19 methods)

- **`not`** — invert (invert)
- **`associated`** — scopeAssociationReflection (scope_association_reflection), leftOuterJoinsValues (left_outer_joins_values), joinsBang (joins!), indexWith (index_with), not (not)
- **`missing`** — scopeAssociationReflection (scope_association_reflection), leftOuterJoinsBang (left_outer_joins!), indexWith (index_with), whereBang (where!)
- **`withBang`** — processWithArgs (process_with_args)
- **`withRecursiveBang`** — processWithArgs (process_with_args)
- **`orderBang`** — preprocessOrderArgs (preprocess_order_args)
- **`reorderBang`** — preprocessOrderArgs (preprocess_order_args), uniqBang (uniq!)
- **`unscopeBang`** — assertModifiableBang (assert_modifiable!), resolveArelAttributes (resolve_arel_attributes), wrap (wrap), except (except), whereClause (where_clause)
- **`whereBang`** — buildWhereClause (build_where_clause)
- **`invertWhereBang`** — invert (invert), whereClause (where_clause)
- **`andBang`** — structurallyIncompatibleValuesFor (structurally_incompatible_values_for), whereClause (where_clause), havingClause (having_clause)
- **`orBang`** — structurallyIncompatibleValuesFor (structurally_incompatible_values_for), or (or), whereClause (where_clause), havingClause (having_clause)
- **`havingBang`** — buildHavingClause (build_having_clause)
- **`noneBang`** — whereBang (where!)
- **`createWithBang`** — sanitizeForbiddenAttributes (sanitize_forbidden_attributes), createWithValue (create_with_value)
- **`extendingBang`** — flattenBang (flatten!), extendingValues (extending_values), extend (extend)
- **`reverseOrderBang`** — compactBlank (compact_blank), reverseSqlOrder (reverse_sql_order)
- **`uniqBang`** — uniqBang (uniq!)
- **`excludingBang`** — invert (invert), predicateBuilder (predicate_builder)

### `relation/spawn-methods.ts` (1 method)

- **`mergeBang`** — instanceExec (instance_exec)

### `relation/where-clause.ts` (6 methods)

- **`merge`** — extractAttributes (extract_attributes), predicates (predicates)
- **`or`** — ast (ast), expr (expr), children (children), predicates (predicates)
- **`ast`** — isOne (one?)
- **`invert`** — predicates (predicates), ast (ast)
- **`isContradiction`** — predicates (predicates), right (right), isUnboundable (unboundable?)
- **`extractAttributes`** — eachAttributes (each_attributes)

### `sanitization.ts` (6 methods)

- **`sanitizeSqlForConditions`** — sanitizeSqlArray (sanitize_sql_array)
- **`sanitizeSqlForAssignment`** — sanitizeSqlArray (sanitize_sql_array)
- **`sanitizeSqlForOrder`** — columnNameWithOrderMatcher (column_name_with_order_matcher), adapterClass (adapter_class), sql (sql)
- **`sanitizeSqlHashForAssignment`** — serialize (serialize), cast (cast), quoteTableNameForAssignment (quote_table_name_for_assignment)
- **`sanitizeSqlArray`** — isMatch (match?), replaceNamedBindVariables (replace_named_bind_variables), replaceBindVariables (replace_bind_variables), quoteString (quote_string)
- **`disallowRawSqlBang`** — isArelNode (arel_node?), isMatch (match?)

### `schema-dumper.ts` (1 method)

- **`dump`** — header (header), schemas (schemas), types (types), tables (tables), virtualTables (virtual_tables)

### `schema-migration.ts` (9 methods)

- **`createVersion`** — arelTable (arel_table), insert (insert)
- **`deleteVersion`** — arelTable (arel_table), eq (eq)
- **`tableName`** — tableNamePrefix (table_name_prefix), schemaMigrationsTableName (schema_migrations_table_name), tableNameSuffix (table_name_suffix)
- **`createTable`** — isTableExists (table_exists?), createTable (create_table), string (string), internalStringOptionsForPrimaryKey (internal_string_options_for_primary_key)
- **`dropTable`** — dropTable (drop_table)
- **`normalizedVersions`** — normalizeMigrationNumber (normalize_migration_number)
- **`versions`** — arelTable (arel_table), project (project), order (order), asc (asc)
- **`count`** — arelTable (arel_table), project (project), star (star)
- **`tableExists`** — isDataSourceExists (data_source_exists?)

### `schema.ts` (2 methods)

- **`define`** — instanceEval (instance_eval), createTable (create_table), schemaMigration (schema_migration), assumeMigratedUptoVersion (assume_migrated_upto_version), createTableAndSetFlags (create_table_and_set_flags)
- **`define`** — define (define)

### `scoping.ts` (9 methods)

- **`populateWithCurrentScopeAttributes`** — isScopeAttributes (scope_attributes?), scopeAttributes (scope_attributes)
- **`initializeInternalsCallback`** — populateWithCurrentScopeAttributes (populate_with_current_scope_attributes)
- **`scopeAttributes`** — scopeForCreate (scope_for_create)
- **`isScopeAttributes`** — currentScope (current_scope)
- **`currentScope`** — currentScope (current_scope)
- **`currentScope`** — setCurrentScope (set_current_scope)
- **`globalCurrentScope`** — globalCurrentScope (global_current_scope)
- **`globalCurrentScope`** — setGlobalCurrentScope (set_global_current_scope)
- **`scopeRegistry`** — instance (instance)

### `scoping/default.ts` (2 methods)

- **`unscoped`** — scoping (scoping), relation (relation)
- **`isDefaultScopes`** — defaultScopes (default_scopes)

### `scoping/named.ts` (3 methods)

- **`scopeForAssociation`** — isEmptyScope (empty_scope?), currentScope (current_scope), defaultScoped (default_scoped)
- **`defaultScoped`** — buildDefaultScope (build_default_scope)
- **`defaultExtensions`** — scopeForAssociation (scope_for_association), buildDefaultScope (build_default_scope)

### `secure-token.ts` (2 methods)

- **`hasSecureToken`** — updateBang (update!), generateUniqueSecureToken (generate_unique_secure_token), setCallback (set_callback), isNewRecord (new_record?), queryAttribute (query_attribute)
- **`generateUniqueSecureToken`** — base58 (base58)

### `signed-id.ts` (7 methods)

- **`signedId`** — isNewRecord (new_record?), generate (generate), id (id), combineSignedIdPurposes (combine_signed_id_purposes)
- **`findSigned`** — scoping (scoping), findSigned (find_signed)
- **`findSignedBang`** — scoping (scoping), findSignedBang (find_signed!)
- **`findSigned`** — verified (verified), combineSignedIdPurposes (combine_signed_id_purposes), findBy (find_by)
- **`findSignedBang`** — verify (verify), combineSignedIdPurposes (combine_signed_id_purposes)
- **`signedIdVerifier`** — signedIdVerifierSecret (signed_id_verifier_secret)
- **`combineSignedIdPurposes`** — compactBlank (compact_blank), baseClass (base_class)

### `store.ts` (4 methods)

- **`read`** — prepare (prepare)
- **`prepare`** — asIndifferentHash (as_indifferent_hash)
- **`store`** — buildColumnSerializer (build_column_serializer), serialize (serialize), storeAccessor (store_accessor), slice (slice)
- **`storedAttributes`** — storedAttributes (stored_attributes), localStoredAttributes (local_stored_attributes)

### `suppressor.ts` (1 method)

- **`suppress`** — registry (registry)

### `tasks/database-tasks.ts` (14 methods)

- **`env`** — env (env)
- **`create`** — resolveConfiguration (resolve_configuration), create (create), databaseAdapterFor (database_adapter_for), isVerbose (verbose?), database (database)
- **`createAll`** — dbConfig (db_config), migrationConnection (migration_connection), establishConnection (establish_connection), migrationClass (migration_class)
- **`createCurrent`** — eachCurrentConfiguration (each_current_configuration), establishConnection (establish_connection), migrationClass (migration_class)
- **`drop`** — resolveConfiguration (resolve_configuration), drop (drop), databaseAdapterFor (database_adapter_for), isVerbose (verbose?), database (database)
- **`dropCurrent`** — eachCurrentConfiguration (each_current_configuration)
- **`truncateAll`** — truncateTables (truncate_tables)
- **`migrate`** — verbose (verbose), isVerbose (verbose?), initializeDatabase (initialize_database), dbConfig (db_config), migrationConnectionPool (migration_connection_pool)
- **`checkTargetVersion`** — targetVersion (target_version), isValidVersionFormat (valid_version_format?)
- **`charset`** — resolveConfiguration (resolve_configuration), charset (charset), databaseAdapterFor (database_adapter_for)
- **`collation`** — resolveConfiguration (resolve_configuration), collation (collation), databaseAdapterFor (database_adapter_for)
- **`purge`** — resolveConfiguration (resolve_configuration), purge (purge), databaseAdapterFor (database_adapter_for)
- **`purgeCurrent`** — eachCurrentConfiguration (each_current_configuration), establishConnection (establish_connection), migrationClass (migration_class)
- **`checkSchemaFile`** — isExist (exist?), root (root), abort (abort)

### `testing/query-assertions.ts` (1 method)

- **`assertNoQueries`** — assertQueriesCount (assert_queries_count)

### `timestamp.ts` (5 methods)

- **`touchAttributesWithTime`** — attributeAliases (attribute_aliases), timestampAttributesForUpdateInModel (timestamp_attributes_for_update_in_model), indexWith (index_with)
- **`timestampAttributesForCreateInModel`** — timestampAttributesForCreate (timestamp_attributes_for_create)
- **`timestampAttributesForUpdateInModel`** — timestampAttributesForUpdate (timestamp_attributes_for_update)
- **`allTimestampAttributesInModel`** — timestampAttributesForCreateInModel (timestamp_attributes_for_create_in_model), timestampAttributesForUpdateInModel (timestamp_attributes_for_update_in_model)
- **`currentTimeFromProperTimezone`** — defaultTimezone (default_timezone), utc (utc), now (now)

### `transaction.ts` (4 methods)

- **`afterCommit`** — afterCommit (after_commit)
- **`afterRollback`** — afterRollback (after_rollback)
- **`isClosed`** — isFinalized (finalized?), state (state)
- **`uuid`** — uuidV4 (uuid_v4)

### `transactions.ts` (12 methods)

- **`rolledbackBang`** — restoreTransactionRecordState (restore_transaction_record_state), clearTransactionRecordState (clear_transaction_record_state)
- **`withTransactionReturningStatus`** — isTransactionOpen (transaction_open?), addToTransaction (add_to_transaction), hasTransactionalCallbacks (has_transactional_callbacks?)
- **`isTriggerTransactionalCallbacks`** — isPersisted (persisted?), isDestroyed (destroyed?)
- **`currentTransaction`** — userTransaction (user_transaction), currentTransaction (current_transaction), activeConnection (active_connection)
- **`beforeCommit`** — setOptionsForCallbacksBang (set_options_for_callbacks!), setCallback (set_callback)
- **`afterCommit`** — setOptionsForCallbacksBang (set_options_for_callbacks!), prependOption (prepend_option), setCallback (set_callback)
- **`afterSaveCommit`** — setOptionsForCallbacksBang (set_options_for_callbacks!), prependOption (prepend_option), setCallback (set_callback)
- **`afterCreateCommit`** — setOptionsForCallbacksBang (set_options_for_callbacks!), prependOption (prepend_option), setCallback (set_callback)
- **`afterUpdateCommit`** — setOptionsForCallbacksBang (set_options_for_callbacks!), prependOption (prepend_option), setCallback (set_callback)
- **`afterDestroyCommit`** — setOptionsForCallbacksBang (set_options_for_callbacks!), prependOption (prepend_option), setCallback (set_callback)
- **`afterRollback`** — setOptionsForCallbacksBang (set_options_for_callbacks!), prependOption (prepend_option), setCallback (set_callback)
- **`setCallback`** — assertValidTransactionAction (assert_valid_transaction_action), isTransactionIncludeAnyAction (transaction_include_any_action?)

### `translation.ts` (1 method)

- **`lookupAncestors`** — isBaseClass (base_class?)

### `type-caster/connection.ts` (2 methods)

- **`typeCastForDatabase`** — serialize (serialize)
- **`typeForAttribute`** — schemaCache (schema_cache), isDataSourceExists (data_source_exists?), columnsHash (columns_hash), lookupCastTypeFromColumn (lookup_cast_type_from_column), defaultValue (default_value)

### `type-caster/map.ts` (1 method)

- **`typeCastForDatabase`** — serialize (serialize)

### `type.ts` (2 methods)

- **`register`** — register (register), registry (registry)
- **`lookup`** — lookup (lookup), registry (registry)

### `type/adapter-specific-registry.ts` (7 methods)

- **`addModifier`** — registrations (registrations)
- **`register`** — ruby2Keywords (ruby2_keywords), registrations (registrations)
- **`lookup`** — findRegistration (find_registration)
- **`call`** — block (block)
- **`matches`** — isMatchesAdapter (matches_adapter?)
- **`call`** — lookup (lookup), except (except)
- **`matches`** — isMatchesAdapter (matches_adapter?), isMatchesOptions (matches_options?)

### `type/hash-lookup-type-map.ts` (4 methods)

- **`lookup`** — defaultValue (default_value)
- **`fetch`** — fetchOrStore (fetch_or_store), performFetch (perform_fetch)
- **`registerType`** — clear (clear)
- **`clear`** — clear (clear)

### `type/internal/timezone.ts` (2 methods)

- **`isUtc`** — defaultTimezone (default_timezone)
- **`defaultTimezone`** — defaultTimezone (default_timezone)

### `type/json.ts` (2 methods)

- **`deserialize`** — decode (decode)
- **`serialize`** — encode (encode)

### `type/serialized.ts` (5 methods)

- **`deserialize`** — load (load), coder (coder)
- **`serialize`** — dump (dump), coder (coder)
- **`changedInPlace`** — encoded (encoded), isChangedInPlace (changed_in_place?), subtype (subtype)
- **`assertValidValue`** — coder (coder), assertValidValue (assert_valid_value)
- **`forceEquality`** — coder (coder), objectClass (object_class)

### `type/type-map.ts` (3 methods)

- **`lookup`** — defaultValue (default_value)
- **`fetch`** — fetchOrStore (fetch_or_store), performFetch (perform_fetch)
- **`registerType`** — clear (clear)

### `validations/associated.ts` (1 method)

- **`validateEach`** — recordValidationContextForAssociation (record_validation_context_for_association), isValidObject (valid_object?), add (add), errors (errors)

### `validations/uniqueness.ts` (1 method)

- **`validateEach`** — findFinderClassFor (find_finder_class_for), mapEnumAttribute (map_enum_attribute), isPersisted (persisted?), isValidationNeeded (validation_needed?), buildRelation (build_relation)
