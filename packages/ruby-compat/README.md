# @blazetrails/ruby-compat

Ruby core and stdlib primitives that trails calls but Rails does not define.

Rails is written against Ruby. A port of Rails therefore needs pieces of Ruby
itself — `Object#blank?`'s notion of whitespace, `String#succ`'s carry,
`Hash#fetch`'s stored-`nil` semantics, `Rational` canonicalization — and those
pieces have no Rails counterpart to mirror. Historically they accumulated inside
`@blazetrails/activesupport`, which inverted the real dependency: ActiveSupport
is a Rails gem that _uses_ Ruby, not the place Ruby lives. This package is where
they belong instead.

Its upstream is [ruby/ruby](https://github.com/ruby/ruby), vendored at
`vendor/ruby/` (RFC 0129). Read the C or the Ruby there before writing anything
here, the same way every other package reads `vendor/rails/` first.

## What is here

Every export, with the call site that justifies it (rule 1).

| export                                                                  | MRI anchor                                                          | call sites                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `regexpEscape`                                                          | `re.c:4144` `rb_reg_s_quote`                                        | `activerecord/src/support/quote-regex.ts`, `run-token.ts`, `trailties/src/generators/trails-actions.ts`                                                                                                                                                                                                                                                                                                       |
| `Pathname`                                                              | `ext/pathname/pathname.c:1511` `rb_cPathname`                       | `activesupport/src/message-pack/extensions.ts` (`Extensions.install`, ext type 15)                                                                                                                                                                                                                                                                                                                            |
| `rbRegInitStr`, `rbRegToS(re, "onig")`                                  | `re.c:3360` `rb_reg_init_str`, `re.c:322` `option_to_str`           | `activesupport/src/message-pack/extensions.ts` (`Extensions.install`, ext type 16)                                                                                                                                                                                                                                                                                                                            |
| `Range`                                                                 | `range.c:31` `rb_cRange`                                            | `activesupport/src/core-ext/range/*.ts`, `activemodel/src/validations/{clusivity,length,numericality}.ts`                                                                                                                                                                                                                                                                                                     |
| `rbEqual`                                                               | `object.c:147` `rb_equal`                                           | `ruby-compat/src/range.ts` (`Range#==`)                                                                                                                                                                                                                                                                                                                                                                       |
| `succ`                                                                  | `string.c:4868` `rb_str_succ`                                       | `ruby-compat/src/range.ts` (string ranges), `arel`                                                                                                                                                                                                                                                                                                                                                            |
| `Rational`                                                              | `rational.c:481` `nurat_s_canonicalize_internal`                    | `activemodel/src/type/{decimal,date-time}.ts`, `type/helpers/time-value.ts`, `activesupport/src/{time-with-zone.ts,core-ext/date-time/calculations.ts,message-pack/extensions.ts}`, `activerecord/src/connection-adapters/{mysql/quoting.ts,abstract/sql-datetime.ts}`, `date/src/date.ts`                                                                                                                    |
| `rational`                                                              | `rational.c:2691` `nurat_s_convert`                                 | `activesupport/src/core-ext/date-time/calculations.ts:274,290,306` (`end_of_day` / `end_of_hour` / `end_of_minute`), `message-pack/extensions.ts` (`read_rational`)                                                                                                                                                                                                                                           |
| `ZeroDivisionError`                                                     | `numeric.c:206` `rb_num_zerodiv`                                    | `activesupport/src/message-pack/extensions.ts` (`readRational` raises it on a zero denominator)                                                                                                                                                                                                                                                                                                               |
| `Enumerator`                                                            | `enumerator.c:411` `enumerator_init`                                | `activesupport/src/hash-with-indifferent-access.ts` (`select` / `reject` block-less arm)                                                                                                                                                                                                                                                                                                                      |
| `toEnum`                                                                | `enumerator.c:383` `obj_to_enum`                                    | `activesupport/src/hash-with-indifferent-access.ts` (`to_enum(:select)`, `to_enum(:reject)`)                                                                                                                                                                                                                                                                                                                  |
| `isSymbol`                                                              | `symbol.c:954` `rb_sym2str`                                         | `i18n/src/backend/{base,fallbacks,simple,key-value}.ts`, `activemodel/src/validations/numericality.ts`                                                                                                                                                                                                                                                                                                        |
| `symbolToS`                                                             | `symbol.c:954` `rb_sym2str`                                         | `i18n/src/backend/base.ts:242,444`                                                                                                                                                                                                                                                                                                                                                                            |
| `toSym`                                                                 | `symbol.c:862` `rb_str_intern`                                      | `activerecord/src/associations/preloader/branch.ts` (`Branch#initialize`'s `association.to_sym`, `rescue NoMethodError`)                                                                                                                                                                                                                                                                                      |
| `Location`                                                              | `vm_backtrace.c:1345` `rb_cBacktraceLocation`                       | `actionpack/src/action-dispatch/middleware/exception-wrapper.ts` (`build_backtrace`'s `loc.label`, `SourceMapLocation#spot`)                                                                                                                                                                                                                                                                                  |
| `excBacktraceLocations`                                                 | `error.c:1789` `exc_backtrace_locations`                            | `actionview/src/template/error.ts` (`Template::Error#backtrace_locations`), `exception-wrapper.ts` (`build_backtrace`)                                                                                                                                                                                                                                                                                        |
| `StringScanner`                                                         | `ext/strscan/strscan.c:681` `strscan_scan`                          | `actionpack/src/action-dispatch/journey/gtg/simulator.ts` (`Simulator#memos`)                                                                                                                                                                                                                                                                                                                                 |
| `rbObjInstanceVariables`                                                | `variable.c:2259` `rb_obj_instance_variables`                       | `ruby-compat/src/psych/visitors/yaml-tree.ts` (`YAMLTree#dump_ivars`)                                                                                                                                                                                                                                                                                                                                         |
| `rbObjIvarGet`                                                          | `object.c:2880` `rb_obj_ivar_get`                                   | `ruby-compat/src/psych/visitors/yaml-tree.ts` (`YAMLTree#dump_ivars`)                                                                                                                                                                                                                                                                                                                                         |
| `rbObjIvarSet`                                                          | `object.c:2914` `rb_obj_ivar_set_m`                                 | `ruby-compat/src/psych/visitors/to-ruby.ts` (`ToRuby#init_with`)                                                                                                                                                                                                                                                                                                                                              |
| `rbDeclareIvar`                                                         | none: the ivar's JS field                                           | `activemodel/src/{attribute-set,attribute-set/builder,type/integer}.ts`                                                                                                                                                                                                                                                                                                                                       |
| `Struct`                                                                | `struct.c:643` `rb_struct_s_def`                                    | `arel/src/attributes/attribute.ts` (`Attribute < Struct.new :relation, :name`)                                                                                                                                                                                                                                                                                                                                |
| `stringSuperclass`                                                      | `string.c:12119` `rb_cString`                                       | `arel/src/nodes/sql-literal.ts` (`SqlLiteral < String`)                                                                                                                                                                                                                                                                                                                                                       |
| `rbObjClass`                                                            | `object.c:265` `rb_obj_class`                                       | `arel/src/visitors/visitor.ts` (`visit`'s `dispatch[object.class]` and `object.class.ancestors`, `visitor.rb:28,40`)                                                                                                                                                                                                                                                                                          |
| `rbModName`                                                             | `variable.c:122` `rb_mod_name`                                      | `arel/src/visitors/visitor.ts` (`dispatch_cache`'s `klass.name`), `arel/src/nodes/bound-sql-literal.ts` (`inspect`), `ruby-compat/src/psych/visitors/yaml-tree.ts` (`YAMLTree#visit_Object`'s `o.class.name`), `activesupport/src/delegation.ts` (`delegate`'s `to.name`), `activesupport/src/core-ext/name-error.ts` (`real_mod_name`)                                                                       |
| `rbSetClassPathString`                                                  | `variable.c:407` `rb_set_class_path_string`                         | `arel/src/nodes/*.ts`, `arel/src/{table,select-manager,attributes/attribute}.ts`, `arel/src/visitors/*.ts`, `activemodel/src/attribute.ts`                                                                                                                                                                                                                                                                    |
| `registerConstant`                                                      | `variable.c:3674` `rb_const_set` on `rb_cObject`                    | `activemodel/src/{attribute,attribute-set,namespaces}.ts`, `activemodel/src/type/*.ts`, `activerecord/src/{associations,namespaces,type,enum}.ts`, `activerecord/src/coders/*.ts`, `activerecord/src/connection-adapters/postgresql/oid/*.ts`                                                                                                                                                                 |
| `unregisterConstant`                                                    | `variable.c:3313` `rb_const_remove` on `rb_cObject`                 | `activerecord/src/associations.ts` (the model registry's `delete` / `clear`)                                                                                                                                                                                                                                                                                                                                  |
| `rbGvGet` / `rbGvSet`                                                   | `variable.c:984` `rb_gv_get`, `:970` `rb_gv_set`                    | `trailties/src/thor/thor.ts` (`$thor_runner \|\|= false`), `thor/base.ts` (`handle_no_command_error`'s default)                                                                                                                                                                                                                                                                                               |
| `isRegisteredConstant`                                                  | `variable.c:3527` `rb_const_defined` on `rb_cObject`                | `activesupport/src/inflector.ts` (`constantize`), `trailties/src/generators/base.ts` (`class_collisions`, `module_namespacing`)                                                                                                                                                                                                                                                                               |
| `registeredConstant`                                                    | `variable.c:3210` `rb_const_get` on `rb_cObject`                    | `activesupport/src/inflector.ts` (`constantize`'s `Object.const_get`)                                                                                                                                                                                                                                                                                                                                         |
| `resetConstants`                                                        | none: empties the table between tests                               | `globalid/src/*.test.ts`, `activesupport/src/{inflector,core-ext/string-ext}.test.ts`                                                                                                                                                                                                                                                                                                                         |
| `rbPathToClass`                                                         | `variable.c:432` `rb_path_to_class`                                 | `ruby-compat/src/psych/class-loader.ts` (`ClassLoader#path2class`, `ext/psych/psych_to_ruby.c:22`)                                                                                                                                                                                                                                                                                                            |
| `Psych.dump` (`./psych`)                                                | `ext/psych/lib/psych.rb:505` `Psych.dump`                           | `activerecord/src/yaml-serialization.test.ts`, `store.test.ts` (`YAML.dump`); no non-test caller until `psych-object-to-yaml`                                                                                                                                                                                                                                                                                 |
| `Psych.unsafeLoad` (`./psych`)                                          | `ext/psych/lib/psych.rb:271` `Psych.unsafe_load`                    | `activerecord/src/yaml-serialization.test.ts` (`YAML.unsafe_load`)                                                                                                                                                                                                                                                                                                                                            |
| `Psych.loadTags` / `Psych.dumpTags` (`./psych`)                         | `ext/psych/lib/psych.rb:741-742` `load_tags` / `dump_tags`          | `activerecord/src/active-record.ts` (`YAML.load_tags[...]`, `active_record.rb:570-573`)                                                                                                                                                                                                                                                                                                                       |
| `Psych.DisallowedClass` (`./psych`)                                     | `ext/psych/lib/psych/exception.rb:23`                               | `activerecord/src/coders/yaml-column.ts` (`SafeCoder#dump`)                                                                                                                                                                                                                                                                                                                                                   |
| `Psych.Coder` (`./psych`)                                               | `ext/psych/lib/psych/coder.rb:9`                                    | `activerecord/src/legacy-yaml-adapter.ts` (`LegacyYamlAdapter.convert`), `activemodel/src/attribute.ts` (`init_with` / `encode_with`)                                                                                                                                                                                                                                                                         |
| `Psych.ClassLoader` / `.Restricted` (`./psych`)                         | `ext/psych/lib/psych/class_loader.rb:6,76`                          | `ruby-compat/src/psych/visitors/to-ruby.ts` (`ToRuby.create`), `yaml-tree.ts` (`YAMLTree.create`); `Restricted` has no non-test caller until `psych-load-and-safe-load`                                                                                                                                                                                                                                       |
| `Psych.ScalarScanner` (`./psych`)                                       | `ext/psych/lib/psych/scalar_scanner.rb:7`                           | `ruby-compat/src/psych/visitors/to-ruby.ts` (`ToRuby.create`), `yaml-tree.ts` (`YAMLTree.create`)                                                                                                                                                                                                                                                                                                             |
| `Psych.Visitors.NoAliasRuby` (`./psych`)                                | `ext/psych/lib/psych/visitors/to_ruby.rb:430`                       | no non-test caller until `psych-load-and-safe-load` (`Psych.safe_load`, `psych.rb:332`)                                                                                                                                                                                                                                                                                                                       |
| `Psych.BadAlias` / `AliasesNotEnabled` / `AnchorNotDefined` (`./psych`) | `ext/psych/lib/psych/exception.rb:6-21`                             | `ruby-compat/src/psych/visitors/to-ruby.ts` (`visit_Psych_Nodes_Alias`, `to_ruby.rb:327-328,431-433`)                                                                                                                                                                                                                                                                                                         |
| `YAML` (`./yaml`)                                                       | `lib/yaml.rb:20` `YAML = Psych`                                     | `activerecord/src/active-record.ts` (`active_record.rb:570-573`)                                                                                                                                                                                                                                                                                                                                              |
| `parse` / `stringify` (`./psych-adapter`)                               | `ext/psych/lib/psych.rb:13` `require 'psych.so'` (the libyaml seam) | `activerecord/src/coders/yaml-column.ts`, `connection-adapters/schema-cache.ts`, `abstract/database-statements.ts`, `actionview/src/helpers/debug-helper.ts`, `activesupport/src/{configuration-file,encrypted-configuration,xml-mini}.ts`, until each converges onto `Psych`                                                                                                                                 |
| `rbDefineMethod`                                                        | `class.c:2134` `rb_define_method`                                   | `activesupport/src/core-ext/object/blank.ts` (`String#blank?`, `blank.rb:153`)                                                                                                                                                                                                                                                                                                                                |
| `aryCount`                                                              | `array.c:6275` `rb_ary_count`                                       | `activerecord/src/associations/has-many-through-association.ts` (`delete_records`'s `scope.destroy_all.count(&:destroyed?)`)                                                                                                                                                                                                                                                                                  |
| `aryReject`                                                             | `array.c:4301` `rb_ary_reject`                                      | `activerecord/src/validations/associated.ts` (`validate_each`'s `Array(value).reject { ... }`, whose block awaits `valid?`)                                                                                                                                                                                                                                                                                   |
| `deleteAt`                                                              | `array.c:4072` `rb_ary_delete_at_m`                                 | `actionpack/src/action-controller/metal/params-wrapper.ts` (`Options#_default_wrap_model`'s `namespaces.delete_at(-2)`)                                                                                                                                                                                                                                                                                       |
| `rbStrGetbyte`                                                          | `string.c:6141` `rb_str_getbyte`                                    | `actionpack/src/action-controller/metal/request-forgery-protection.ts` (`xor_byte_strings`'s `s2.setbyte(i, s1.getbyte(i) ^ s2.getbyte(i))`)                                                                                                                                                                                                                                                                  |
| `rbStrSetbyte`                                                          | `string.c:6166` `rb_str_setbyte`                                    | `actionpack/src/action-controller/metal/request-forgery-protection.ts` (`xor_byte_strings`'s `s2.setbyte(i, s1.getbyte(i) ^ s2.getbyte(i))`)                                                                                                                                                                                                                                                                  |
| `intXor`                                                                | `numeric.c:5055` `int_xor`                                          | `actionpack/src/action-controller/metal/request-forgery-protection.ts` (`xor_byte_strings`'s `s1.getbyte(i) ^ s2.getbyte(i)`)                                                                                                                                                                                                                                                                                 |
| `aryIncludes`                                                           | `array.c:5222` `rb_ary_includes`                                    | `activemodel/src/validations/acceptance.ts` (`setup!`'s `klass.included_modules.include?(define_attributes)`, `acceptance.rb:20`)                                                                                                                                                                                                                                                                             |
| `isNil`                                                                 | `object.c:4425` `rb_true`, `object.c:4371` `rb_false`               | `arel/src/nodes/bind-param.ts` (`BindParam#nil?`'s `value.nil?`, `bind_param.rb:23`); `arel/src/nodes/casted.ts` (`Casted#nil?` / `Quoted#nil?`, `casted.rb:15,41`); `arel/src/visitors/to-sql.ts` (`right.nil?` in `visit_Arel_Nodes_Equality` / `NotEqual` / `IsNotDistinctFrom` / `IsDistinctFrom`, `to_sql.rb:642-690`); `arel/src/predications.ts` (`open_ended?`'s `value.nil?`, `predications.rb:257`) |
| `partition`                                                             | `enum.c:1102` `enum_partition`                                      | `activerecord/src/associations/join-dependency.ts` (`walk`'s `.partition(&:first)`)                                                                                                                                                                                                                                                                                                                           |
| `groupBy`                                                               | `enum.c:1157` `enum_group_by`                                       | `activemodel/src/errors.ts` (`group_by_attribute`'s `@errors.group_by(&:attribute)`, `errors.rb:289-291`)                                                                                                                                                                                                                                                                                                     |
| `each`                                                                  | `array.c:2532` `rb_ary_each`                                        | `activemodel/src/attribute-set/builder.ts` (`LazyAttributeHash#each_key`'s `keys.each(&block)`, `attribute_set/builder.rb:131`)                                                                                                                                                                                                                                                                               |
| `keys`                                                                  | `hash.c:3584` `rb_hash_keys`                                        | `activemodel/src/attribute-set/builder.ts` (`LazyAttributeSet#keys`' `values.keys \| types.keys \| @attributes.keys`, `attribute_set/builder.rb:37`)                                                                                                                                                                                                                                                          |
| `last`                                                                  | `array.c:1914` `rb_ary_last`                                        | `activerecord/src/relation/finder-methods.ts` (`find_last`'s `limit ? records.last(limit) : records.last`, `finder_methods.rb:634-636`)                                                                                                                                                                                                                                                                       |
| `zip`                                                                   | `array.c:4422` `rb_ary_zip`                                         | `activerecord/src/relation/predicate-builder.ts` (`expand_from_hash`'s `key.zip(ids_set).to_h`)                                                                                                                                                                                                                                                                                                               |
| `toH`                                                                   | `array.c:2988` `rb_ary_to_h`                                        | `activerecord/src/relation/predicate-builder.ts` (`expand_from_hash`'s `key.zip(ids_set).to_h`)                                                                                                                                                                                                                                                                                                               |
| `valuesAt` (Array receiver)                                             | `array.c:3769` `rb_ary_values_at`                                   | `activerecord/src/connection-adapters/postgresql-adapter.ts` (`enable_extension` / `disable_extension`'s `name.to_s.split(".").values_at(-2, -1)`, `postgresql_adapter.rb:474,487`)                                                                                                                                                                                                                           |
| `rbStrPartition`                                                        | `string.c:10574` `rb_str_partition`                                 | `activerecord/src/connection-adapters/sqlite3-adapter.ts` (`table_structure_sql`'s `result.partition(UNQUOTED_OPEN_PARENS_REGEX).last`, `sqlite3_adapter.rb:781-782`)                                                                                                                                                                                                                                         |
| `Hash#replace`                                                          | `hash.c:2967` `rb_hash_replace`                                     | `trailties/src/thor/core-ext/hash-with-indifferent-access.ts` (`replace`'s `super`, `hash_with_indifferent_access.rb:73`)                                                                                                                                                                                                                                                                                     |
| `slice` (Hash receiver)                                                 | `hash.c:2651` `rb_hash_slice`                                       | `trailties/src/thor/core-ext/hash-with-indifferent-access.ts` (`slice`'s `super`, `hash_with_indifferent_access.rb:42`)                                                                                                                                                                                                                                                                                       |
| `update` / `mergeBang` (Hash receiver)                                  | `hash.c:4028` `rb_hash_update`                                      | `trailties/src/thor/core-ext/hash-with-indifferent-access.ts` (`to_hash`'s `Hash.new(default).merge!(self)`, `hash_with_indifferent_access.rb:78`)                                                                                                                                                                                                                                                            |
| `fetch` (forwarded arguments)                                           | `hash.c:2176` `rb_hash_fetch_m`                                     | `trailties/src/thor/core-ext/hash-with-indifferent-access.ts` (`fetch`'s `super(convert_key(key), *args)`, `hash_with_indifferent_access.rb:38`)                                                                                                                                                                                                                                                              |
| `dup` (Hash subclass)                                                   | `hash.c:1584` `rb_hash_dup`                                         | `trailties/src/thor/core-ext/hash-with-indifferent-access.ts` (`except`'s `dup.tap`, `merge`'s `dup.merge!`, `hash_with_indifferent_access.rb:32,54`)                                                                                                                                                                                                                                                         |
| `objRespondToMissing`                                                   | `vm_method.c:3009` `obj_respond_to_missing`                         | `actionpack/src/action-dispatch/routing/routes-proxy.ts` (`respond_to_missing?`'s `super`, `routes_proxy.rb:27`)                                                                                                                                                                                                                                                                                              |
| `Concurrent` (`Concurrent::Map`)                                        | `hash.c:1782` `rb_hash_initialize`                                  | `activemodel/src/attribute-methods.ts` (`attribute_method_patterns_cache`'s `Concurrent::Map.new(initial_capacity: 4)` and `compute_if_absent`, `attribute_methods.rb:417-424`)                                                                                                                                                                                                                               |
| `Marshal`                                                               | `marshal.c:2555` `rb_define_module("Marshal")`                      | `activerecord/src/connection-adapters/schema-cache.ts` (`schema_cache.rb:233,409`) and `actionview/src/helpers/debug-helper.ts` (`debug_helper.rb:29`); byte fixtures regenerate with `ruby packages/ruby-compat/src/marshal.fixtures.rb`; `Marshal.load` resolves a class path through `rbPathToClass`, so a loaded class is one `registerConstant` seated                                                   |
| `rbFSystem`                                                             | `process.c:4841` `rb_f_system`                                      | `Thor::Actions#run` (`vendor/thor/v1.3.2/lib/thor/actions.rb:268`), ported by `port-thor-actions-run-run-ruby-script-and-thor`                                                                                                                                                                                                                                                                                |
| `rbFArray`                                                              | `object.c:3825` `rb_f_array`                                        | `actionpack/src/action-controller/metal/params-wrapper.ts` (`Options.from_hash`'s `Array(hash[:format])`, `params_wrapper.rb:90-92`)                                                                                                                                                                                                                                                                          |
| `Open3.capture2e`, `Process.Status`                                     | `lib/open3.rb:902`, `process.c:9169` `rb_cProcessStatus`            | `Thor::Actions#run`'s `capture:` arm (`actions.rb:265-266`), same story                                                                                                                                                                                                                                                                                                                                       |
| `URI::Generic#opaque` / `opaque=` / `user` / `password` / `hostname`    | `lib/uri/generic.rb:277,916,568,573,668`                            | `activerecord/src/database-configurations/connection-url-resolver.ts` (`ConnectionUrlResolver#initialize`, `#raw_config`)                                                                                                                                                                                                                                                                                     |
| `rbHashSRuby2KeywordsHashP` / `rbHashSRuby2KeywordsHash`                | `hash.c:1952,1974` `rb_hash_s_ruby2_keywords_hash(_p)`              | `ActiveJob::Arguments` (`serialize_argument`'s `Hash.ruby2_keywords_hash?(argument)`, `deserialize_hash`'s `Hash.ruby2_keywords_hash(result)`, `vendor/rails/v8.0.2/activejob/lib/active_job/arguments.rb:93,154`), no caller yet: story `port-ruby-compat-ruby2-keywords-hash-flag` (RFC 0169) lands the primitive ahead of `port-activejob-arguments`, which ports those two lines                          |

### Core classes are class objects; `Symbol` is not one

`rbObjClass` answers `Object#class` as a class object. `NilClass`, `TrueClass`,
`FalseClass`, `Numeric`, `Integer`, `Float`, `String`, `Class`, `Proc`, `Time`,
`Date`, `DateTime` and `BasicObject` are seated in `object.ts` by
`rb_define_class`; `Hash`, `Module`, `Kernel` and `Enumerable` are the exports
of those names. `include.ts` wires their MRI included modules.

`Symbol` has no seat. A Ruby Symbol is a bare JS string everywhere except the
call sites that keep its colon to tell it from a String, so no reading of a
value can answer "is a Symbol": a classifier keyed on the colon would call
`"::1"` and `"::Float::NAN"` Symbols. `rbObjClass` answers `String` for every
string, and a call site that discriminates uses `isSymbol`.

### Keyword arguments are a flagged trailing hash

Ruby marks a method `ruby2_keywords` so that the keywords it was called with
arrive as a trailing Hash in `*args`, flagged to be passed on as keywords.
`ActiveJob::Core#initialize` and `Enqueuing::ClassMethods#job_or_instantiate`
are marked that way
(`vendor/rails/v8.0.2/activejob/lib/active_job/core.rb:103`,
`enqueuing.rb:94`), and `Arguments` reads and restores the flag across
serialization (`arguments.rb:93-97,153-155`).

JS has no keyword arguments, so a call site cannot tell `perform_later(k: 1)`
from `perform_later({ k: 1 })`. This is the repo's kwargs idiom, a trailing
options object, applied to a `ruby2_keywords` method. The rule is: **a trailing plain-object argument
to `performLater` / `new` is the kwargs hash.** The port of a `ruby2_keywords`
method flags it with `rbHashSRuby2KeywordsHash` before storing its arguments,
which is what the VM does for the Ruby method, and everything downstream asks
`rbHashSRuby2KeywordsHashP` exactly where Rails asks
`Hash.ruby2_keywords_hash?`.

This rule is recorded here by story `port-ruby-compat-ruby2-keywords-hash-flag`
(RFC 0169, the ActiveJob port), which assigns it to this README. Its callers
are `port-activejob-core` and `port-activejob-enqueuing-and-configured-job`.

The flag is membership in a module-private `WeakSet`, as MRI's is a bit in the
hash's own header (`RHASH_PASS_AS_KEYWORDS`, `internal/hash.h:23`). It is not a
property, so `Object.keys`, a spread and `JSON.stringify` never see it, and a
copy of a flagged hash is unflagged.

## The contract

Four rules govern this package. Rules 2 and 3 are mechanically enforced, rule 4
is structural, and rule 1 is enforced by review until its gate lands (see
below).

### 1. Only what trails actually calls

No member exists here without a real call site elsewhere in this repo. This is
not a general-purpose Ruby runtime, and it is not a place to port a method
because its siblings are already here — `String#succ` earns its keep because
`arel` calls it; `String#squeeze` does not, until something calls it.

Today this rule is enforced by review, not by a gate: the question a reviewer
asks of a new export is "where is the call site", the answer must be a file and
a line, and it goes in the table above. Mechanical enforcement is
`ruby-compat-rule-1-call-site-gate`.

The extra-surface counter does NOT enforce it, although earlier revisions of
this README said it did. `ruby-compat` is in `GATED_PACKAGES`
(`scripts/api-compare/extra-surface-mark.ts`) with its mark committed in
`extra-surface-mark.json`, and `pnpm parity:api:extra:gate` fails on any
increase in either dimension. But the counter subtracts every member carrying a
`@noRailsEquivalent` receipt, and rule 2 requires that receipt on every export,
so a correctly receipted member — speculative or not — never reaches it.

### Growing the package: the receipt is the protocol

For a Rails package extra surface is debt and only-shrink is the whole point.
Here it is inventory: every move story adds MRI surface. The two do not
conflict, because growth here is **mark-neutral**:

- A member that arrives with its rule 2 receipt is subtracted from `novel` AND
  `total`, whether its name is novel or collides with a Rails method in some
  other `.rb` and would score moved. Adding it moves neither number.
- A member that arrives WITHOUT its receipt raises `total` (and, if novel,
  trips the `novel === 0` pin), and the gate turns red. The fix is the
  receipt, never a bigger mark.

So there is no raise path, and none is needed: the mark stays only-shrink
(`parity:api:extra:tighten` writes it DOWN) with **no reseed**, exactly as for
every other gated package. The `total` it holds today is the residue of members
that never got their receipt, a rule 2 violation burnt down by
`receipt-ruby-compat-moved-residue`.

### 2. Every export carries BOTH a `vendor/ruby` citation and a receipt

Each exported member needs two things in its JSDoc:

- a `vendor/ruby/<version>/<file>:<line>` citation naming the MRI source it mirrors, and
- a `@noRailsEquivalent PERMANENT` receipt.

Both, always. They answer different questions and neither substitutes for the
other:

- The **citation** is the fidelity anchor. It says _this behavior is Ruby's, and
  here is where to check it_. Without it a Ruby primitive degrades into a
  hand-rolled utility, and the next contributor has no way to tell a faithful
  `succ` from an approximation of one. It is the `vendor/rails` citation every
  other package writes, pointed at the other upstream.
- The **receipt** is the parity bookkeeping. `@noRailsEquivalent` is what marks
  a public name that has no Ruby-_Rails_ counterpart, and every name here is one
  — that is the definition of this package. `PERMANENT` is the correct
  permanence: these members will never converge onto a Rails method, because
  there is no Rails method to converge onto. A `CONVERGEABLE <story-id>` receipt
  here is a category error, not a smaller version of the same claim.

So a citation without a receipt fails the extra-surface tooling, and a receipt
without a citation passes the tooling while losing the only record of what the
code is supposed to do. Write both.

Both are enforced by `blazetrails/ruby-compat-needs-mri-citation`
(`eslint/ruby-compat-needs-mri-citation.mjs`), which RESOLVES the citation
rather than pattern-matching it: the file has to exist under `vendor/ruby/` at
the pinned SHA and the line has to be within it. The vendor tree is fetched
rather than committed, so the rule skips where it is absent — the
`rails-comparison` CI job, which fetches it, is the enforcing run. The reverse
direction is covered too: this package is in the RFC 0121
`unbacked-internal-needs-receipt` enrollment set, because every member here is
absent from the rails-private manifest by construction.

And a primitive lives here ONCE.
`blazetrails/no-ruby-compat-reimplementation` fails a function or class declared
outside this package whose name is a ruby-compat export, or a registered alias
of one (`escapeRegExp` for `Regexp.escape`, a local `fetch(hash, key, default)`
over a `Record` for `Hash#fetch`, ...). Today's copies each hold one row in
`eslint/no-ruby-compat-reimplementation-exclude.json`, which is only-shrink: a
row is deleted by the move story that converges it, and a new row is never the
remedy for new code.

That is enforced, not merely conventional.
`eslint/no-ruby-compat-reimplementation-mark.mjs` gates the register against the
committed high-water mark in
`eslint/no-ruby-compat-reimplementation-mark.json` — the way
`extra-surface-mark.json` gates extra surface — and fails when the array holds
more rows than the mark, or is not sorted (an appended row reads correctly to
the rule, so nothing else says where it belongs). Its `tighten` path writes the
mark DOWN as the move stories delete rows; there is no reseed.

### 3. `parity:api` never enrolls this package — permanently

`parity:api`'s package list is derived from `vendor/sources.ts` via
`apiComparePackages()` (`scripts/api-compare/config.ts`), and its population is
Rails gems. `ruby-compat` has no gem counterpart there and never will: it is a
port of Ruby, and Rails-parity comparison over it is meaningless — there is
nothing on the other side to compare against.

This is not a deferral awaiting a story, and it is not a `SKIP_GROUPS` entry
with a burndown behind it. Do not add `ruby-compat` to `vendor/sources.ts`, to
`PACKAGES`, or to `PACKAGES_OUTSIDE_MANIFEST` — the last of those subtracts a
package from the `unbacked-internal-needs-receipt` rule, and this package wants
that rule at full strength (rule 2 requires the receipt unconditionally).

What it IS in is `TS_ONLY_PACKAGES` (same file) — the packages the TypeScript
extractor walks and the Rails comparison never scores. That is the whole of the
enrollment rule 1 relies on: the TS manifest has to carry the package for the
extra-surface counter to see it, while the Rails-parity population stays a list
of gems.

### 4. It is a leaf: no workspace dependencies

`ruby-compat` depends on nothing in this workspace, and everything may depend on
it. In particular it must never depend on `@blazetrails/activesupport` — that
edge is the exact inversion the package exists to remove, and re-adding it would
put the cycle back.

`package.json` has no `dependencies` block and no workspace dependency of any
kind. The single `optionalDependencies` entry (`yaml`) is the npm backend of a
Ruby C extension (Psych's `psych.so`), reached only through its seam,
`psych-adapter.ts`. Keep it that way; if a primitive
here appears to need a trails module, the primitive is not a Ruby primitive.
