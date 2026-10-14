# Audit: Rails' `inherited` hooks and `@inlinedFrom`

RFC 0188 (`module-initialize-inlined-into-constructors`), story
`audit-inherited-hooks-for-an-inlined-from-entry`. The RFC lists `inherited` as
a possible third entry in `@inlinedFrom`'s closed list. JS has no hook that
fires when a subclass is defined (CLAUDE.md § "`inherited` is deferred to
own-property memo guards"), so trails runs each Rails `inherited` body at some
other point. This audit sorts all 32 definitions before the list changes.

The 32 are the 30 `def inherited` / `def self.inherited` in
`vendor/rails/v8.0.2/*/lib`, plus Thor's (`vendor/thor/v1.3.2/lib/thor/base.rb:721`)
and Minitest's (`vendor/minitest/v5.27.0/lib/minitest.rb:1241`).

## Verdicts

- **Inlined**: the body is written inside another declaration (a reader, a
  `register`, a constructor), with no function of its own.
- **Named**: the body is kept as a named function and run from a deferral
  point, usually a first-read getter.
- **Replaced**: a different mechanism stands in for the body, usually an
  own-property memo guard that makes an inherited memo read as unset. There are
  no lines to compare.
- **Unported**: the Rails class or module has no trails port.

## Table

| #   | Rails definition                                                     | Rails `file:line`                                                     | trails location                                                                                                                                                                                                                 | Verdict  |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | `AbstractController::Base.inherited`                                 | `actionpack/lib/abstract_controller/base.rb:62`                       | `abstract` getter answers `false` unless `_abstract` is own (`actionpack/src/abstract-controller/base.ts:119`)                                                                                                                  | Replaced |
| 2   | `AbstractController::Helpers::ClassMethods#inherited`                | `actionpack/lib/abstract_controller/helpers.rb:68`                    | `inherited` (`abstract-controller/helpers.ts:209`), run from the `_helpers` getter and `_helpersForModification`                                                                                                                | Named    |
| 3   | `ActionController::Metal.inherited`                                  | `actionpack/lib/action_controller/metal.rb:146`                       | `inherited` (`action-controller/metal.ts:103`), run from the `middlewareStack` getter; the `@controller_name = nil` line is not in the body                                                                                     | Named    |
| 4   | `ActionController::ParamsWrapper::ClassMethods#inherited`            | `actionpack/lib/action_controller/metal/params_wrapper.rb:244`        | `inheritedParamsWrapper` (`metal/params-wrapper.ts:227`), run from `deferInherited`'s `_wrapperOptions` getter                                                                                                                  | Named    |
| 5   | `ActionController::ParameterEncoding::ClassMethods#inherited`        | `actionpack/lib/action_controller/metal/parameter_encoding.rb:11`     | `inherited` (`metal/parameter-encoding.ts:12`), run from the `_parameterEncodings` getter                                                                                                                                       | Named    |
| 6   | `ActionController::Rendering::ClassMethods#inherited`                | `actionpack/lib/action_controller/metal/rendering.rb:23`              | `setupRendererBang()` call written inside `renderer` (`metal/rendering.ts:178`)                                                                                                                                                 | Inlined  |
| 7   | `ActionController::Railties::Helpers#inherited`                      | `actionpack/lib/action_controller/railties/helpers.rb:8`              | `inherited` (`action-controller/trailties/helpers.ts:40`), run from `fireInherited` in `Metal`'s constructor                                                                                                                    | Named    |
| 8   | `ActionView::Layouts::ClassMethods#inherited`                        | `actionview/lib/action_view/layouts.rb:218`                           | `_writeLayoutMethod()` call written inside `fireInherited` (`action-controller/trailties/helpers.ts:34`)                                                                                                                        | Inlined  |
| 9   | `ActionView::TestCase::Behavior::ClassMethods#inherited`             | `actionview/lib/action_view/test_case.rb:66`                          | none; `ActionView::TestCase` is not ported                                                                                                                                                                                      | Unported |
| 10  | `ActiveModel::AttributeMethods::ClassMethods#inherited`              | `activemodel/lib/active_model/attribute_methods.rb:387`               | own-property guards on `_aliasesByAttributeName`, `_generatedAttributeMethods` and `_attributeMethodPatternsCache` (`activemodel/src/attribute-methods.ts:335,359,384`)                                                         | Replaced |
| 11  | `ActiveModel::Naming#inherited`                                      | `activemodel/lib/active_model/naming.rb:352`                          | `Object.hasOwn(this, "_modelName")` guard (`activemodel/src/naming.ts:29`)                                                                                                                                                      | Replaced |
| 12  | `ActiveModel::Validations::ClassMethods#inherited`                   | `activemodel/lib/active_model/validations.rb:287`                     | `inherited` (`activemodel/src/validations.ts:397`), run from the `_validators` getter                                                                                                                                           | Named    |
| 13  | `ActiveRecord::Core::ClassMethods#inherited`                         | `activerecord/lib/active_record/core.rb:409`                          | own guards on `_arelTable`, `_predicateBuilder` and `_inspectionFilter` (`activerecord/src/core.ts:177,220`); `initializeFindByCache()` written inside `cachedFindByStatement` (`core.ts:713`). The ancestor walk is not ported | Replaced |
| 14  | `ActiveRecord::AttributeMethods::ClassMethods#inherited`             | `activerecord/lib/active_record/attribute_methods.rb:265`             | `initializeGeneratedModules` call written inside `generatedAttributeMethods`' own guard (`activerecord/src/attribute-methods.ts:301`); `_aliasAttributesMassGenerated` read through an own guard (`:311`)                       | Inlined  |
| 15  | `ActiveRecord::Inheritance::ClassMethods#inherited`                  | `activerecord/lib/active_record/inheritance.rb:287`                   | `setBaseClass` at `included` time and an own guard on `_typeCandidatesCache` (`activerecord/src/inheritance.ts:34,47`)                                                                                                          | Replaced |
| 16  | `ActiveRecord::Enum#inherited`                                       | `activerecord/lib/active_record/enum.rb:289`                          | copy-on-first-write against the superclass's `definedEnums` (`activerecord/src/enum.ts:232`)                                                                                                                                    | Replaced |
| 17  | `ActiveRecord::ModelSchema::ClassMethods#inherited`                  | `activerecord/lib/active_record/model_schema.rb:574`                  | `ownSchemaMemo` (`activerecord/src/model-schema.ts:41`)                                                                                                                                                                         | Replaced |
| 18  | `ActiveRecord::Migration.inherited`                                  | `activerecord/lib/active_record/migration.rb:617`                     | raise written inside `Migration`'s constructor (`activerecord/src/migration.ts:323`), so it fires at `new`, not at class definition                                                                                             | Inlined  |
| 19  | `ActiveRecord::Persistence::ClassMethods#inherited`                  | `activerecord/lib/active_record/persistence.rb:301`                   | `Object.hasOwn(this, "_hasQueryConstraints")` guard (`activerecord/src/persistence.ts:255`)                                                                                                                                     | Replaced |
| 20  | `ActiveRecord::Reflection::ClassMethods#inherited`                   | `activerecord/lib/active_record/reflection.rb:142`                    | `_reflections` is a `classAttribute` (`activerecord/src/reflection.ts:1758`); no `@__reflections` memo to reset                                                                                                                 | Replaced |
| 21  | `ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#inherited` | `activerecord/lib/active_record/attribute_methods/primary_key.rb:143` | own-property guards, documented at `activerecord/src/attribute-methods/primary-key.ts:125`                                                                                                                                      | Replaced |
| 22  | `ActiveRecord::Locking::Optimistic::ClassMethods#inherited`          | `activerecord/lib/active_record/locking/optimistic.rb:194`            | `Object.hasOwn(this, "_lockingColumn")` guard (`activerecord/src/locking/optimistic.ts:92`)                                                                                                                                     | Replaced |
| 23  | `ActiveRecord::Delegation::DelegateCache#inherited`                  | `activerecord/lib/active_record/relation/delegation.rb:47`            | `initializeRelationDelegateCache` call written inside `relationDelegateClass` (`activerecord/src/relation/delegation.ts:71`)                                                                                                    | Inlined  |
| 24  | `ActiveSupport::Configurable::ClassMethods#inherited`                | `activesupport/lib/active_support/configurable.rb:132`                | own `_config` guard (`activesupport/src/configurable.ts:34`)                                                                                                                                                                    | Replaced |
| 25  | `Rails::Application.inherited`                                       | `railties/lib/rails/application.rb:71`                                | `appClass` assignment and `before_configuration` load hook written inside `Application.register` (`trailties/src/application.ts:62`)                                                                                            | Inlined  |
| 26  | `Rails::Engine.inherited`                                            | `railties/lib/rails/engine.rb:361`                                    | `calledFrom` written inside `Engine.register` (`trailties/src/engine.ts:72`); `eager_load_namespaces <<` is not in the body                                                                                                     | Inlined  |
| 27  | `Rails::Railtie.inherited`                                           | `railties/lib/rails/railtie.rb:198`                                   | `_loadIndex` increment written inside `Trailtie.register` (`trailties/src/trailtie.ts:51`)                                                                                                                                      | Inlined  |
| 28  | `Rails::Command::Base.inherited`                                     | `railties/lib/rails/command/base.rb:59`                               | none; `Rails::Command.subclasses` is not ported                                                                                                                                                                                 | Unported |
| 29  | `Rails::Generators::Base.inherited`                                  | `railties/lib/rails/generators/base.rb:242`                           | `subclasses` push written inside the generator file loader (`trailties/src/generators.ts:350`); `source_root` and `source_paths` are not in the body                                                                            | Inlined  |
| 30  | `Rails::Railtie::Configurable::ClassMethods#inherited`               | `railties/lib/rails/railtie/configurable.rb:13`                       | `assertNotSealed` (`trailties/src/trailtie/configurable.ts:22`), run from `Trailtie.register`                                                                                                                                   | Named    |
| 31  | `Thor::Base::ClassMethods#inherited`                                 | `thor/v1.3.2/lib/thor/base.rb:721`                                    | `Base.registerKlassFile(this)` written inside `namespace` (`trailties/src/thor/base.ts:505`)                                                                                                                                    | Inlined  |
| 32  | `Minitest::Runnable.inherited`                                       | `minitest/v5.27.0/lib/minitest.rb:1241`                               | none; vitest collects tests                                                                                                                                                                                                     | Unported |

Totals: 10 Inlined, 6 Named, 13 Replaced, 3 Unported.

## Recommendation: `inherited` does not join the closed list

`@inlinedFrom` goes on a class constructor and nowhere else. It names a segment
whose `def` lives in a different Ruby file from the one the constructor's file
mirrors. Of the ten Inlined bodies, only one sits in a constructor:
`Migration.inherited` (row 18). That `def` is in `migration.rb`, the same file
`Migration`'s constructor mirrors, so the same-file rule already bars a tag.
The other nine are written into readers, `register` methods, a file loader and
`namespace`, which the constructor-only rule excludes. Allowing them would
reopen arel's `inlined-from` bucket, which is pinned at 0.

The Named rows are already visible by name, so the call gates and `parity:api`
see them without a tag. The Replaced rows have no lines to compare.

So no verdict produces a case the tag could carry, and this audit files no lint
or tagging stories. The partial bodies noted in rows 3, 13, 26 and 29 are
fidelity gaps in the deferral points. They are not `@inlinedFrom` work, and
each belongs to its package's convergence backlog.
