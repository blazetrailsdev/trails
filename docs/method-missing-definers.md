# `method_missing` definers

Per-class trails status of every Rails file that defines `method_missing` /
`respond_to_missing?`, decided under root `CLAUDE.md` § "Ruby protocol methods
with a different JS mechanism", whose cross-table rules apply to every row.
Class-specific rules live in the owning package's `CLAUDE.md`, under
"`method_missing` definers in this package".

| Rails file (`method_missing` / `respond_to_missing?`) | trails status         |
| ----------------------------------------------------- | --------------------- |
| `active_model/attribute_methods.rb`                   | named method, no trap |
| `active_record/attribute_methods.rb`                  | records: not a Proxy  |
| `connection_adapters/abstract/connection_pool.rb`     | Proxy (`NullPool`)    |
| `active_record/dynamic_matchers.rb`                   | Proxy (class chain)   |
| `migration/command_recorder.rb`                       | typed forwarders      |
| `migration/default_strategy.rb`                       | typed forwarders      |
| `active_record/migration.rb`                          | typed forwarders      |
| `relation/delegation.rb`                              | Proxy (proto chain)   |
| `active_record/test_fixtures.rb`                      | Proxy (proto chain)   |
| `active_support/array_inquirer.rb`                    | Proxy                 |
| `active_support/broadcast_logger.rb`                  | Proxy                 |
| `core_ext/module/delegation.rb`                       | nothing (no file)     |
| `active_support/current_attributes.rb`                | nothing               |
| `active_support/delegation.rb`                        | Proxy                 |
| `deprecation/proxy_wrappers.rb`                       | Proxy                 |
| `active_support/duration.rb`                          | named method, no trap |
| `log_subscriber/test_helper.rb`                       | typed forwarders      |
| `multibyte/chars.rb`                                  | nothing (no file)     |
| `active_support/option_merger.rb`                     | Proxy                 |
| `active_support/ordered_options.rb`                   | Proxy                 |
| `active_support/string_inquirer.rb`                   | Proxy (proto chain)   |
| `active_support/time_with_zone.rb`                    | Proxy                 |
| `action_mailer/base.rb`                               | Proxy (class chain)   |
| `rails/railtie.rb`                                    | Proxy (class chain)   |
| `rails/engine/lazy_route_set.rb`                      | Proxy (module chain)  |
| `rails/railtie/configuration.rb`                      | Proxy                 |
| `abstract_controller/collector.rb`                    | Proxy (proto chain)   |
| `action_dispatch/system_test_case.rb`                 | named method, no trap |
| `action_controller/metal/mime_responds.rb`            | Proxy                 |
| `action_dispatch/http/mime_type.rb`                   | Proxy (`is…` names)   |
| `action_dispatch/testing/assertions/routing.rb`       | Proxy (proto chain)   |
| `action_dispatch/testing/integration.rb`              | Proxy (proto chain)   |
| `thor/core_ext/hash_with_indifferent_access.rb`       | Proxy (proto chain)   |
| `rack/multipart/uploaded_file.rb`                     | Proxy                 |
| `builder/xmlbase.rb`                                  | Proxy (misses only)   |
| `mini_magick/tool.rb`                                 | Proxy                 |
| `mini_magick/image.rb`                                | Proxy (ungated)       |
| `image_processing/chainable.rb`                       | Proxy (thenable)      |
| `active_storage/attachment.rb`                        | Proxy (proto chain)   |
| `active_storage/attached/one.rb`                      | Proxy (proto chain)   |
| `active_storage/attached/many.rb`                     | Proxy (proto chain)   |
| `mail/field.rb`                                       | Proxy (proto chain)   |
