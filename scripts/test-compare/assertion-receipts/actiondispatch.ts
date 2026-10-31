import type { AssertionReceipt } from "../assertion-receipts.js";

export const actiondispatch: Record<string, AssertionReceipt[]> = {
  "actiondispatch:dispatch/param_builder_test.rb › ParamBuilderTest › nested parameters": [
    {
      kind: "assert_instance_of",
      value: null,
      as: "assert_nil",
      reason:
        'dispatch/param_builder_test.rb:21 `result[:foo]` is a HashWithIndifferentAccess; trails params are a null-prototype plain object, so the port asserts the prototype is null (packages/actionpack/CLAUDE.md, "Request params are a null-prototype plain object")',
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
  "actiondispatch:dispatch/request/session_test.rb › Request › SessionTest › dig": [
    {
      kind: "assert_nil",
      value: null,
      as: null,
      reason:
        'dispatch/request/session_test.rb:135 `assert_nil session.dig("one", :two)` — misses because `:two` is a Symbol and the stored key a String; a Ruby Symbol is a JS string (CLAUDE.md, "A Ruby Symbol is a JS string, never a JS `Symbol`")',
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
};
