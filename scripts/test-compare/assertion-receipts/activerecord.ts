import type { AssertionReceipt } from "../assertion-receipts.js";

export const activerecord: Record<string, AssertionReceipt[]> = {
  "activerecord:adapters/sqlite3/sqlite3_adapter_test.rb › SQLite3AdapterTest › type cast should not mutate encoding":
    [
      {
        kind: "assert_equal",
        value: null,
        as: null,
        reason:
          'adapters/sqlite3/sqlite3_adapter_test.rb:485 `assert_equal Encoding::ASCII_8BIT, name.encoding` — a JS string carries no encoding tag (CLAUDE.md, "A String has no encoding tag either")',
      },
    ],
  "activerecord:asynchronous_queries_test.rb › AsynchronousQueriesTest › async select all": [
    {
      kind: "assert_kind_of",
      value: null,
      as: null,
      reason:
        'asynchronous_queries_test.rb:107 `assert_kind_of ActiveRecord::FutureResult::Complete, future_result` — on an in-memory database the fallback query is a promise, and a promise resolving to a thenable `FutureResult::Complete` unwraps it to the Result (CLAUDE.md, "`ActiveRecord::Promise` is the native promise")',
    },
  ],
  "activerecord:attribute_methods_test.rb › AttributeMethodsTest › attribute keys on a new instance":
    [
      {
        kind: "assert_raise",
        value: null,
        as: null,
        reason:
          'attribute_methods_test.rb:166 `assert_raise(NoMethodError) { t.title2 }` — an undefined name on a record reads `undefined`; the raise comes from `method_missing`, which needs a Proxy (CLAUDE.md, "Records are not Proxies")',
      },
    ],
  "activerecord:attribute_methods_test.rb › AttributeMethodsTest › non-attribute read and write": [
    {
      kind: "assert_raise",
      value: null,
      as: null,
      reason:
        'attribute_methods_test.rb:644 `assert_raise(NoMethodError) { topic.mumbo }` — an undefined name on a record reads `undefined` (CLAUDE.md, "Records are not Proxies")',
    },
    {
      kind: "assert_raise",
      value: null,
      as: null,
      reason:
        'attribute_methods_test.rb:645 `assert_raise(NoMethodError) { topic.mumbo = 5 }` — an undefined name assigned on a record creates an own property (CLAUDE.md, "Records are not Proxies")',
    },
  ],
  "activerecord:attribute_methods_test.rb › AttributeMethodsTest › undeclared attribute method does not affect respond_to? and method_missing":
    [
      {
        kind: "assert_raise",
        value: null,
        as: null,
        reason:
          'attribute_methods_test.rb:653 `assert_raise(NoMethodError) { topic.title_hello_world }` — an undefined name on a record reads `undefined` (CLAUDE.md, "Records are not Proxies")',
      },
    ],
  "activerecord:attributes_test.rb › CustomPropertiesTest › overloaded properties save": [
    {
      kind: "assert_kind_of",
      value: null,
      as: "assert_equal",
      reason:
        "attributes_test.rb:43 `assert_kind_of Integer` — a JS number has no Integer class; the port asserts `Number.isInteger(...)` equals true",
    },
    {
      kind: "assert_kind_of",
      value: null,
      as: "assert_equal",
      reason:
        'attributes_test.rb:45 `assert_kind_of Float` — a JS number has no Float class; the port asserts `rbObjClassname(...)` equals "Float", the boxed Float seat FloatType#castValue produces',
    },
  ],
  "activerecord:base_test.rb › BasicsTest › dup": [
    {
      kind: "assert_equal",
      value: "s:c",
      as: null,
      reason:
        'base_test.rb:991 `assert_equal("c", duped_topic.title)` — reads the `duped_topic.title.replace "c"` of :979 back after save; a JS string cannot be mutated in place (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
  ],
  "activerecord:connection_adapters/standalone_connection_test.rb › StandaloneConnectionTest › async fallback":
    [
      {
        kind: "assert_instance_of",
        value: null,
        as: null,
        reason:
          'connection_adapters/standalone_connection_test.rb:23 `assert_instance_of FutureResult::Complete, result` — the fallback query is awaited, and a promise resolving to a thenable `FutureResult::Complete` unwraps it to the Result (CLAUDE.md, "`ActiveRecord::Promise` is the native promise")',
      },
    ],
  "activerecord:connection_pool_test.rb › pin connection nesting lock": [
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        'connection_pool_test.rb:954 `assert_equal ActiveSupport::Concurrency::NullLock, @pool.lease_connection.lock` — a connection nothing has pinned holds a monitor, not `NullLock` (packages/activerecord/CLAUDE.md, "The adapter lock defaults to a monitor, not `NullLock`")',
    },
  ],
  "activerecord:connection_pool_test.rb › pin connection nesting lock inverse": [
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        'connection_pool_test.rb:971 `assert_equal ActiveSupport::Concurrency::NullLock, @pool.lease_connection.lock` — a connection nothing has pinned holds a monitor, not `NullLock` (packages/activerecord/CLAUDE.md, "The adapter lock defaults to a monitor, not `NullLock`")',
    },
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        'connection_pool_test.rb:974 `assert_equal ActiveSupport::Concurrency::NullLock, @pool.lease_connection.lock` — a connection nothing has pinned holds a monitor, not `NullLock` (packages/activerecord/CLAUDE.md, "The adapter lock defaults to a monitor, not `NullLock`")',
    },
  ],
  "activerecord:connection_pool_test.rb › pin connection synchronize the connection": [
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        'connection_pool_test.rb:906 `assert_equal ActiveSupport::Concurrency::NullLock, @pool.lease_connection.lock` — a connection nothing has pinned holds a monitor, not `NullLock` (packages/activerecord/CLAUDE.md, "The adapter lock defaults to a monitor, not `NullLock`")',
    },
  ],
  "activerecord:fixtures_test.rb › FixturesWithoutInstantiationTest › visibility of accessor method":
    [
      {
        kind: "assert_equal",
        value: "b:false",
        as: null,
        reason:
          'fixtures_test.rb:771 `assert_equal false, respond_to?(:topics, false)` — a JS method entry carries no visibility, so a fixture accessor answers `respond_to?` at both `include_private` values (CLAUDE.md, "Method visibility is compile-time only")',
      },
    ],
};
