// Reviewed receipts for Rails assertions a TS port genuinely cannot make, applied
// to the Rails side of a matched pair before parity:test compares assertion
// counts, kinds and values.
//
// A receipt is for a TypeScript LANGUAGE shortcoming only — a Ruby fact with no
// JS value to assert against (a JS string has no encoding tag; `2.0` and `2` are
// one JS number, so no `Float` exists to be a kind of). It is never a way to
// excuse a port bug: a converged assertion that fails is parked and filed under
// RFC 0155, not receipted here. Every row names the Rails `file:line` it covers.

/** One Rails assertion the port cannot make. */
export interface AssertionReceipt {
  /** Raw Rails assertion name the receipt consumes (`assert_kind_of`). */
  kind: string;
  /**
   * The Rails expected-value token the consumed assertion carries (`null` for a
   * non-literal argument such as a constant). Picks WHICH occurrence of `kind`
   * the receipt consumes, so the lockstep values stay aligned.
   */
  value: string | null;
  /**
   * `null` drops the assertion: there is nothing the port can assert. A kind
   * name re-scores it as that Rails assertion, for a Ruby check whose only JS
   * spelling is a different assertion (`kind_of?(Integer)` is
   * `Number.isInteger`, an equality).
   */
  as: string | null;
  /** Why this is a language shortcoming, with the Rails `file:line`. */
  reason: string;
}

/** Keyed by `<package>:<rails file> › <ancestors joined by " › "> › <test>`. */
export const ASSERTION_RECEIPTS: Record<string, AssertionReceipt[]> = {
  "actionview:template/tag_helper_test.rb › TagHelperTest › content tag": [
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        'Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (CLAUDE.md § "A Ruby Symbol is a JS string, never a JS `Symbol`"; template/tag_helper_test.rb:220)',
    },
  ],
  "actionview:template/tag_helper_test.rb › TagHelperTest › tag builder with content": [
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        'Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (CLAUDE.md § "A Ruby Symbol is a JS string, never a JS `Symbol`"; template/tag_helper_test.rb:233)',
    },
  ],
  "actionview:template/output_safety_helper_test.rb › OutputSafetyHelperTest › safe_join should return the safe string separated by $, when second argument is not passed":
    [
      {
        kind: "assert_equal",
        value: "s:a|b",
        as: null,
        reason:
          "Ruby's `$,` output field separator is a process global that `safe_join` reads as its default `sep` (`output_safety_helper.rb:33`); JS has no output field separator to set, so there is no `|` default to join with (template/output_safety_helper_test.rb:50)",
      },
    ],
  "actionview:template/form_helper_test.rb › FormHelperTest › explicit name": [
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1413)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1417)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1421)",
    },
  ],
  "actionview:template/form_helper_test.rb › FormHelperTest › explicit id": [
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1440)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1444)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1448)",
    },
  ],
  "actionview:template/form_helper_test.rb › FormHelperTest › nil id": [
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1475)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1479)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1483)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1487)",
    },
  ],
  "actionview:template/form_helper_test.rb › FormHelperTest › index with nil id": [
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1533)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1537)",
    },
    {
      kind: "assert_dom_equal",
      value: null,
      as: null,
      reason:
        "Ruby distinguishes a String option key from a Symbol one; a JS object has one key type, so the string-key and symbol-key calls are the same call and the cross-check has nothing to compare (template/form_helper_test.rb:1541)",
    },
  ],
  "actionview:template/form_collections_helper_test.rb › FormCollectionsHelperTest › collection radio correctly builds unique DOM IDs for float values":
    [
      {
        kind: "assert_select",
        value: "s:label[for=user_name_1_0]",
        as: null,
        reason:
          'Ruby `1.0.to_s` is "1.0" (`numeric.c:1059`); `1.0` and `1` are one JS number, so the helper renders `1` and no `user_name_1_0` element exists to select (template/form_collections_helper_test.rb:57)',
      },
      {
        kind: "assert_select",
        value: 's:input#user_name_1_0[type=radio][value="1.0"]',
        as: null,
        reason:
          'Ruby `1.0.to_s` is "1.0" (`numeric.c:1059`); `1.0` and `1` are one JS number, so the helper renders `1` and no `user_name_1_0` element exists to select (template/form_collections_helper_test.rb:59)',
      },
    ],
  "actionview:template/form_collections_helper_test.rb › FormCollectionsHelperTest › collection check boxes correctly builds unique DOM IDs for float values":
    [
      {
        kind: "assert_select",
        value: "s:label[for=user_name_1_0]",
        as: null,
        reason:
          'Ruby `1.0.to_s` is "1.0" (`numeric.c:1059`); `1.0` and `1` are one JS number, so the helper renders `1` and no `user_name_1_0` element exists to select (template/form_collections_helper_test.rb:326)',
      },
      {
        kind: "assert_select",
        value: 's:input#user_name_1_0[type=checkbox][value="1.0"]',
        as: null,
        reason:
          'Ruby `1.0.to_s` is "1.0" (`numeric.c:1059`); `1.0` and `1` are one JS number, so the helper renders `1` and no `user_name_1_0` element exists to select (template/form_collections_helper_test.rb:328)',
      },
    ],
  "actionview:template/date_helper_test.rb › DateHelperTest › object select html safety": [
    {
      kind: "assert_predicate",
      value: null,
      as: null,
      reason:
        'template/date_helper_test.rb:3670 `time_select` over a Date reaches `Date#min` through `send`, a private method (`date_core.c:9774`); a JS method entry carries no visibility, so porting it would make every Date `respond_to?(:min)` (CLAUDE.md, "Method visibility is compile-time only")',
    },
  ],
  "actionview:template/template_test.rb › TestERBTemplate › no magic comment word with utf 8": [
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        'template/template_test.rb:150 `render.encoding` is Encoding::UTF_8 — a JS string carries no encoding tag (CLAUDE.md, "A String has no encoding tag either")',
    },
  ],
  "actiondispatch:dispatch/test_response_test.rb › TestResponseTest › JSON response Hash pattern matching":
    [
      {
        kind: "assert_pattern",
        value: null,
        as: "assert_match",
        reason:
          "dispatch/test_response_test.rb:45 `assert_pattern { x => pattern }` is Ruby rightward pattern matching, which has no JS syntax; the port matches the same pattern with `toMatchObject`",
      },
    ],
  "actiondispatch:dispatch/test_response_test.rb › TestResponseTest › JSON response Array pattern matching":
    [
      {
        kind: "assert_pattern",
        value: null,
        as: "assert_match",
        reason:
          "dispatch/test_response_test.rb:50 `assert_pattern { x => pattern }` is Ruby rightward pattern matching, which has no JS syntax; the port matches the same pattern with `toMatchObject`",
      },
    ],
  "actiondispatch:dispatch/param_builder_test.rb › ParamBuilderTest › simple query string": [
    {
      kind: "assert_instance_of",
      value: null,
      as: "assert_nil",
      reason:
        'dispatch/param_builder_test.rb:15 `result` is a HashWithIndifferentAccess; trails params are a null-prototype plain object, so the port asserts the prototype is null (packages/actionpack/CLAUDE.md, "Request params are a null-prototype plain object")',
    },
  ],
  "actiondispatch:dispatch/param_builder_test.rb › ParamBuilderTest › nested parameters": [
    {
      kind: "assert_instance_of",
      value: null,
      as: "assert_nil",
      reason:
        'dispatch/param_builder_test.rb:21 `result[:foo]` is a HashWithIndifferentAccess; trails params are a null-prototype plain object, so the port asserts the prototype is null (packages/actionpack/CLAUDE.md, "Request params are a null-prototype plain object")',
    },
  ],
  "actiondispatch:dispatch/system_testing/driver_test.rb › DriverTest › initializing the driver with a browser":
    [
      {
        kind: "assert_instance_of",
        value: null,
        as: "assert_equal",
        reason:
          'dispatch/system_testing/driver_test.rb:17 `@browser.options` is a Playwright `LaunchOptions` plain object with no browser-specific options class, so its `args` are asserted (packages/actionpack/CLAUDE.md, "System testing runs on Vitest")',
      },
    ],
  "actiondispatch:dispatch/system_testing/driver_test.rb › DriverTest › initializing the driver with a headless chrome":
    [
      {
        kind: "assert_instance_of",
        value: null,
        as: "assert_equal",
        reason:
          'dispatch/system_testing/driver_test.rb:26 `@browser.options` is a Playwright `LaunchOptions` plain object with no browser-specific options class, so its `args` are asserted (packages/actionpack/CLAUDE.md, "System testing runs on Vitest")',
      },
    ],
  "actiondispatch:dispatch/system_testing/driver_test.rb › DriverTest › initializing the driver with a headless firefox":
    [
      {
        kind: "assert_instance_of",
        value: null,
        as: "assert_equal",
        reason:
          'dispatch/system_testing/driver_test.rb:45 `@browser.options` is a Playwright `LaunchOptions` plain object with no browser-specific options class, so its `args` are asserted (packages/actionpack/CLAUDE.md, "System testing runs on Vitest")',
      },
    ],
  "actiondispatch:dispatch/request/session_test.rb › Request › SessionTest › dig": [
    {
      kind: "assert_nil",
      value: null,
      as: null,
      reason:
        'dispatch/request/session_test.rb:135 `assert_nil session.dig("one", :two)` — misses because `:two` is a Symbol and the stored key a String; a Ruby Symbol is a JS string (CLAUDE.md, "A Ruby Symbol is a JS string, never a JS `Symbol`")',
    },
  ],
  "actiondispatch:dispatch/uploaded_file_test.rb › UploadedFileTest › filename is different object":
    [
      {
        kind: "assert_not_equal",
        value: null,
        as: "assert_equal",
        reason:
          'dispatch/uploaded_file_test.rb:23 `assert_not_equal file_str.object_id, uf.original_filename.object_id` — a JS string has no identity, so the port asserts the copied value (CLAUDE.md, "Ruby Strings are JS string primitives")',
      },
    ],
  "actiondispatch:dispatch/request/multipart_params_parsing_test.rb › MultipartParamsParsingTest › parses utf8 filename with percent character":
    [
      {
        kind: "assert_equal",
        value: null,
        as: null,
        reason:
          'dispatch/request/multipart_params_parsing_test.rb:86 `file.original_filename` is a binary String decoded only by UploadedFile#initialize\'s encode! rescue arm — a JS string carries no encoding tag (CLAUDE.md, "A String has no encoding tag either")',
      },
    ],
  "actiondispatch:dispatch/request/multipart_params_parsing_test.rb › MultipartParamsParsingTest › parses mixed files":
    [
      {
        kind: "assert_equal",
        value: null,
        as: null,
        reason:
          'dispatch/request/multipart_params_parsing_test.rb:139 `files.bytesize` — rack.input stays one byte per character, but tag_multipart_encoding `body.force_encoding(UTF_8)` (rack parser.rb:483) only re-tags in Ruby; with no tag to set, forceEncoding must decode, and invalid UTF-8 cannot survive as a JS string — a JS string carries no encoding tag (CLAUDE.md, "A String has no encoding tag either")',
      },
    ],
  "actiondispatch:dispatch/response_test.rb › ResponseTest › respond_to? accepts include_private": [
    {
      kind: "assert",
      value: null,
      as: null,
      reason:
        'dispatch/response_test.rb:381 `assert @response.respond_to?(:method_missing, true)` — a JS method entry carries no visibility, so no private `method_missing` exists to answer only at `include_private` (CLAUDE.md, "Method visibility is compile-time only")',
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
  "activerecord:asynchronous_queries_test.rb › AsynchronousQueriesTest › async select all": [
    {
      kind: "assert_kind_of",
      value: null,
      as: null,
      reason:
        'asynchronous_queries_test.rb:107 `assert_kind_of ActiveRecord::FutureResult::Complete, future_result` — on an in-memory database the fallback query is a promise, and a promise resolving to a thenable `FutureResult::Complete` unwraps it to the Result (CLAUDE.md, "`ActiveRecord::Promise` is the native promise")',
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
  "activemodel:attribute_methods_test.rb › AttributeMethodsTest › should not interfere with respond_to? if the attribute has a private/protected method":
    [
      {
        kind: "assert_not_respond_to",
        value: null,
        as: null,
        reason:
          'attribute_methods_test.rb:319 `assert_not_respond_to m, :private_method` — a JS method entry carries no visibility, so a defined method answers `respond_to?` at both arities (CLAUDE.md, "Method visibility is compile-time only")',
      },
    ],
  "activemodel:attribute_set_test.rb › AttributeSetTest › duping creates a new hash, but does not dup the attributes":
    [
      {
        kind: "assert_equal",
        value: "s:foobar",
        as: null,
        reason:
          'attribute_set_test.rb:49 `assert_equal "foobar", attributes[:bar].value` — reads the `duped[:bar].value << "bar"` of :45 through the shared Attribute; a JS string has no in-place append (CLAUDE.md, "Ruby Strings are JS string primitives")',
      },
      {
        kind: "assert_equal",
        value: "s:foobar",
        as: null,
        reason:
          'attribute_set_test.rb:50 `assert_equal "foobar", duped[:bar].value` — the same in-place append (CLAUDE.md, "Ruby Strings are JS string primitives")',
      },
    ],
  "activemodel:attribute_set_test.rb › AttributeSetTest › deep_duping creates a new hash and dups each attribute":
    [
      {
        kind: "assert_equal",
        value: "s:foobar",
        as: null,
        reason:
          'attribute_set_test.rb:68 `assert_equal "foobar", duped[:bar].value` — reads the `duped[:bar].value << "bar"` of :63; a JS string has no in-place append (CLAUDE.md, "Ruby Strings are JS string primitives")',
      },
    ],
  "activemodel:attributes_dirty_test.rb › AttributesDirtyTest › attribute mutation": [
    {
      kind: "assert_predicate",
      value: null,
      as: null,
      reason:
        'attributes_dirty_test.rb:72 `assert_predicate @model, :name_changed?` — true only after `@model.name.replace("Hadad")` at :71 mutates the receiver; a JS string cannot be mutated (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
  ],
  "activemodel:type/string_test.rb › StringTest › values are duped coming out": [
    {
      kind: "assert_not_same",
      value: null,
      as: null,
      reason:
        'type/string_test.rb:39 `assert_not_same s, type.cast(s)` — two equal JS string primitives are one value, with no identity to differ (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
    {
      kind: "assert_not_same",
      value: null,
      as: null,
      reason:
        'type/string_test.rb:41 `assert_not_same s, type.deserialize(s)` — the same missing identity (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
  ],
  "activesupport:core_ext/module_test.rb › ModuleTest › delegation arity to self class": [
    {
      kind: "assert_equal",
      value: "n:-1",
      as: null,
      reason:
        'module_test.rb:662 `assert_equal(-1, d.instance_method(:opt).arity)` — `Function.length` cannot express a method that takes any number of arguments (CLAUDE.md, "Runtime facts Node does not expose")',
    },
    {
      kind: "assert_equal",
      value: "n:-1",
      as: null,
      reason:
        'module_test.rb:663 `assert_equal(-1, d.instance_method(:kwargs).arity)` — `Function.length` cannot express a method that takes any number of arguments (CLAUDE.md, "Runtime facts Node does not expose")',
    },
    {
      kind: "assert_equal",
      value: "n:-1",
      as: null,
      reason:
        'module_test.rb:664 `assert_equal(-1, d.instance_method(:kwargs_with_block).arity)` — `Function.length` cannot express a method that takes any number of arguments (CLAUDE.md, "Runtime facts Node does not expose")',
    },
    {
      kind: "assert_equal",
      value: "n:-1",
      as: null,
      reason:
        'module_test.rb:665 `assert_equal(-1, d.instance_method(:opt_kwargs).arity)` — `Function.length` cannot express a method that takes any number of arguments (CLAUDE.md, "Runtime facts Node does not expose")',
    },
    {
      kind: "assert_equal",
      value: "n:-1",
      as: null,
      reason:
        'module_test.rb:666 `assert_equal(-1, d.instance_method(:opt_kwargs_with_block).arity)` — `Function.length` cannot express a method that takes any number of arguments (CLAUDE.md, "Runtime facts Node does not expose")',
    },
  ],
  "activesupport:core_ext/duration_test.rb › DurationTest › is a": [
    {
      kind: "assert_kind_of",
      value: null,
      as: "assert",
      reason:
        "core_ext/duration_test.rb:17 `assert_kind_of Numeric` — a Duration is an object and cannot be `instanceof` the JS `Number` builtin; the port asserts `d.isKindOf(Number)`, which is Rails' `value.is_a?(klass)` (duration.rb:330-332)",
    },
    {
      kind: "assert_kind_of",
      value: null,
      as: "assert",
      reason:
        "core_ext/duration_test.rb:18 `assert_kind_of Integer` — a JS number has no Integer class; the port asserts `Number.isInteger(d.toI())`",
    },
  ],
  "activesupport:json/encoding_test.rb › TestJSONEncoding › utf8 string encoded properly": [
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        "json/encoding_test.rb:77 `result.encoding` — a JS string carries no encoding tag (ruby-compat/src/string/force-encoding.ts)",
    },
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        "json/encoding_test.rb:81 `result.encoding` — a JS string carries no encoding tag (ruby-compat/src/string/force-encoding.ts)",
    },
  ],
  "activesupport:core_ext/string_ext_test.rb › CoreExtStringMultibyteTest › string should recognize utf8 strings":
    [
      {
        kind: "assert_not_predicate",
        value: null,
        as: null,
        reason:
          'core_ext/string_ext_test.rb:799 `EUC_JP_STRING` — a JS string carries no encoding tag, so `"さよなら".encode("EUC-JP")` has no JS value distinct from the UTF-8 string (ruby-compat/src/string/force-encoding.ts)',
      },
    ],
  "activesupport:safe_buffer_test.rb › SafeBufferTest › Should not fail if the returned object is not a string":
    [
      {
        kind: "assert_kind_of",
        value: null,
        as: "assert_nil",
        reason:
          "safe_buffer_test.rb:195 `assert_kind_of NilClass` — JS `null` is not an instance of any class, and nil is NilClass's only instance, so the check is `assert_nil`",
      },
    ],
  "actiondispatch:dispatch/routing_test.rb › TestUrlGenerationErrors › URL helpers raise message with mixed parameters when generation fails":
    [
      {
        kind: "assert_raises",
        value: null,
        as: null,
        reason:
          'dispatch/routing_test.rb:4966-4977 `{ id: nil, "id" => "url-tested" }`, in the call and in the expected message — a Ruby Symbol is a JS string, so a JS object cannot hold both `:id` and `"id"` (CLAUDE.md, "A Ruby Symbol is a JS string, never a JS `Symbol`"; packages/actionpack/CLAUDE.md, "A `null` positional keeps its url-helper slot")',
      },
      {
        kind: "assert_match",
        value: null,
        as: null,
        reason:
          'dispatch/routing_test.rb:4966-4977 `{ id: nil, "id" => "url-tested" }`, in the call and in the expected message — a Ruby Symbol is a JS string, so a JS object cannot hold both `:id` and `"id"` (CLAUDE.md, "A Ruby Symbol is a JS string, never a JS `Symbol`"; packages/actionpack/CLAUDE.md, "A `null` positional keeps its url-helper slot")',
      },
      {
        kind: "assert_match",
        value: null,
        as: null,
        reason:
          'dispatch/routing_test.rb:4966-4977 `{ id: nil, "id" => "url-tested" }`, in the call and in the expected message — a Ruby Symbol is a JS string, so a JS object cannot hold both `:id` and `"id"` (CLAUDE.md, "A Ruby Symbol is a JS string, never a JS `Symbol`"; packages/actionpack/CLAUDE.md, "A `null` positional keeps its url-helper slot")',
      },
    ],
  "actioncontroller:controller/routing_test.rb › LegacyRouteSetTests › id encoding": [
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        'controller/routing_test.rb:112 `assert_equal ::Encoding::UTF_8, hash["id"].encoding` — a JS string carries no encoding tag (CLAUDE.md, "A String has no encoding tag either")',
    },
  ],
  "actioncontroller:controller/parameter_encoding_test.rb › ParameterEncodingTest › properly transcodes parameters of the action specified by skip_parameter_encoding to ASCII_8BIT":
    [
      {
        kind: "assert_equal",
        value: "s:ASCII-8BIT",
        as: null,
        reason:
          'parameter_encoding_test.rb:42 `assert_equal "ASCII-8BIT", @response.body` — a JS string carries no encoding tag and ruby-compat has no binary String carrier for a param value: `forceEncoding` returns a string for a string and `rbObjEncoding` answers UTF-8 for every string (packages/ruby-compat/src/string/force-encoding.ts)',
      },
    ],
  "actioncontroller:controller/parameter_encoding_test.rb › ParameterEncodingTest › properly transcodes declared parameters into specified encodings":
    [
      {
        kind: "assert_equal",
        value: "s:Shift_JIS",
        as: null,
        reason:
          'parameter_encoding_test.rb:49 `assert_equal "Shift_JIS", JSON.parse(@response.body)["baz"]` — a JS string carries no encoding tag and ruby-compat has no binary String carrier for a param value: `forceEncoding` returns a string for a string and `rbObjEncoding` answers UTF-8 for every string (packages/ruby-compat/src/string/force-encoding.ts)',
      },
    ],
  "actioncontroller:controller/parameter_encoding_test.rb › ParameterEncodingTest › properly encodes all ASCII_8BIT parameters into binary":
    [
      {
        kind: "assert_equal",
        value: null,
        as: null,
        reason:
          'parameter_encoding_test.rb:57 `assert_equal ["ASCII-8BIT"], JSON.parse(@response.body).uniq` — a JS string carries no encoding tag and ruby-compat has no binary String carrier for a param value: `forceEncoding` returns a string for a string and `rbObjEncoding` answers UTF-8 for every string (packages/ruby-compat/src/string/force-encoding.ts)',
      },
    ],
  "actioncontroller:controller/parameter_encoding_test.rb › ParameterEncodingTest › does not raise an error when passed a param declared as ASCII-8BIT that contains invalid bytes":
    [
      {
        kind: "assert_equal",
        value: "s:ASCII-8BIT",
        as: null,
        reason:
          'parameter_encoding_test.rb:64 `assert_equal "ASCII-8BIT", @response.body` — a JS string carries no encoding tag and ruby-compat has no binary String carrier for a param value: `forceEncoding` returns a string for a string and `rbObjEncoding` answers UTF-8 for every string (packages/ruby-compat/src/string/force-encoding.ts)',
      },
    ],
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
  "msgpack:cruby/buffer_spec.rb › doesn't allow #dup or #clone": [
    {
      kind: "expect_not_to_respond_to",
      value: "s:dup",
      as: "assert_equal",
      reason:
        "cruby/buffer_spec.rb:594 `expect(subject).to_not respond_to :dup` — vitest has no respond_to matcher, and ActiveSupport's `assertNotRespondTo` is out of reach because activesupport depends on msgpack; the port asserts `rbObjRespondTo(...)` equals false",
    },
    {
      kind: "expect_not_to_respond_to",
      value: "s:clone",
      as: "assert_equal",
      reason:
        "cruby/buffer_spec.rb:595 `expect(subject).to_not respond_to :clone` — vitest has no respond_to matcher, and ActiveSupport's `assertNotRespondTo` is out of reach because activesupport depends on msgpack; the port asserts `rbObjRespondTo(...)` equals false",
    },
  ],
  "ruby-compat:library/yaml/to_yaml_spec.rb › Object#to_yaml › returns the YAML representation of a FalseClass":
    [
      {
        kind: "should_be_kind_of",
        value: null,
        as: "should_==",
        reason:
          "library/yaml/to_yaml_spec.rb:35 `should be_kind_of(FalseClass)` — a JS boolean has no FalseClass/TrueClass; the port asserts its typeof",
      },
    ],
  "ruby-compat:library/yaml/to_yaml_spec.rb › Object#to_yaml › returns the YAML representation of a Float object":
    [
      {
        kind: "should_be_kind_of",
        value: null,
        as: "should_==",
        reason:
          "library/yaml/to_yaml_spec.rb:41 `should be_kind_of(Float)` — a JS number has no Float class; the port asserts its typeof",
      },
    ],
  "ruby-compat:library/yaml/to_yaml_spec.rb › Object#to_yaml › returns the YAML representation of an Integer object":
    [
      {
        kind: "should_be_kind_of",
        value: null,
        as: "should_==",
        reason:
          "library/yaml/to_yaml_spec.rb:47 `should be_kind_of(Integer)` — a JS number has no Integer class; the port asserts Number.isInteger",
      },
    ],
  "ruby-compat:library/yaml/to_yaml_spec.rb › Object#to_yaml › returns the YAML representation of a NilClass object":
    [
      {
        kind: "should_be_kind_of",
        value: null,
        as: "should_be_nil",
        reason:
          "library/yaml/to_yaml_spec.rb:53 `should be_kind_of(NilClass)` — JS null has no NilClass; the port asserts toBeNull",
      },
    ],
  "ruby-compat:library/yaml/to_yaml_spec.rb › Object#to_yaml › returns the YAML representation of a TrueClass":
    [
      {
        kind: "should_be_kind_of",
        value: null,
        as: "should_==",
        reason:
          "library/yaml/to_yaml_spec.rb:85 `should be_kind_of(TrueClass)` — a JS boolean has no FalseClass/TrueClass; the port asserts its typeof",
      },
    ],
  "ruby-compat:library/yaml/to_yaml_spec.rb › Object#to_yaml › returns the YAML representation of numeric constants":
    [
      {
        kind: "should_match_yaml",
        value: null,
        as: null,
        reason:
          "library/yaml/to_yaml_spec.rb:105 `(0.0).to_yaml` is `--- 0.0` — `0.0` and `0` are one JS number, so no Float exists to dump with a fraction",
      },
    ],
  "rack:spec_request.rb › RackRequestTest › return values for the keys in the order given from values_at":
    [
      {
        kind: "assert_output",
        value: "x:nil",
        as: "assert_match",
        reason:
          "spec_request.rb:802 `assert_output(nil, /deprecated/)` swaps `$stderr` for a StringIO; Node's stderr is a stream with no reassignable global, so the port captures the `Kernel#warn` call that writes it and matches its message",
      },
    ],
  "rack:spec_request.rb › RackRequestTest › TestProxyRequest › return values for the keys in the order given from values_at":
    [
      {
        kind: "assert_output",
        value: "x:nil",
        as: "assert_match",
        reason:
          "spec_request.rb:802 `assert_output(nil, /deprecated/)` swaps `$stderr` for a StringIO; Node's stderr is a stream with no reassignable global, so the port captures the `Kernel#warn` call that writes it and matches its message",
      },
    ],
  "rack:spec_multipart.rb › parses multipart/mixed": [
    {
      kind: "must_be_instance_of",
      value: null,
      as: "must_equal",
      reason:
        'spec_multipart.rb:517 `must_be_instance_of String` — a Ruby String is a JS string primitive, which is not `instanceof String`, so its `typeof` is asserted (CLAUDE.md, "Ruby Strings are JS string primitives")',
    },
  ],
  "rack:spec_multipart.rb › falls back to content-type for the name": [
    {
      kind: "must_equal",
      value: "n:26473",
      as: null,
      reason:
        'spec_multipart.rb:1030 `f.length` is the byte size of an image/png part that tag_multipart_encoding re-tags UTF-8 (parser.rb:483); with no tag to set, forceEncoding must decode, and invalid UTF-8 cannot survive as a JS string (CLAUDE.md, "A String has no encoding tag either")',
    },
  ],
};

interface ReceiptableTestCase {
  description: string;
  ancestors: string[];
  assertionCount?: number;
  assertionKinds?: string[];
  assertionValues?: (string | null)[];
}

/**
 * The receipt key for a Rails test case: package, Rails file, ancestor chain
 * and description.
 */
export function assertionReceiptKey(pkg: string, file: string, tc: ReceiptableTestCase): string {
  return [`${pkg}:${file}`, ...tc.ancestors, tc.description].join(" › ");
}

/**
 * Apply the receipts filed for `tc` to its Rails-side assertion data, returning
 * a new test case. Each receipt consumes the first remaining assertion matching
 * its `kind` and `value`; a receipt that matches nothing is left unconsumed and
 * reported by `unconsumedAssertionReceipts`, so a stale row cannot linger.
 */
export function applyAssertionReceipts<T extends ReceiptableTestCase>(
  pkg: string,
  file: string,
  tc: T,
  receipts: Record<string, AssertionReceipt[]> = ASSERTION_RECEIPTS,
  consumed?: Set<string>,
): T {
  const key = assertionReceiptKey(pkg, file, tc);
  const rows = receipts[key];
  if (!rows || !tc.assertionKinds) return tc;
  const kinds = [...tc.assertionKinds];
  const values = [...(tc.assertionValues ?? kinds.map(() => null))];
  let count = tc.assertionCount ?? kinds.length;
  rows.forEach((row, i) => {
    const at = kinds.findIndex((k, j) => k === row.kind && (values[j] ?? null) === row.value);
    if (at < 0) return;
    consumed?.add(`${key}#${i}`);
    if (row.as === null) {
      kinds.splice(at, 1);
      values.splice(at, 1);
      count--;
    } else {
      kinds[at] = row.as;
      values[at] = null;
    }
  });
  return { ...tc, assertionCount: count, assertionKinds: kinds, assertionValues: values };
}

/** Receipt rows (`<key>#<index>`) that consumed no Rails assertion. */
export function unconsumedAssertionReceipts(
  consumed: Set<string>,
  receipts: Record<string, AssertionReceipt[]> = ASSERTION_RECEIPTS,
): string[] {
  const stale: string[] = [];
  for (const [key, rows] of Object.entries(receipts)) {
    rows.forEach((_row, i) => {
      if (!consumed.has(`${key}#${i}`)) stale.push(`${key}#${i}`);
    });
  }
  return stale;
}
