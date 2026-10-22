/** ActiveSupport surface the generator maps Ruby calls onto. */

/** Ruby attribute macros → the activesupport function the extractor credits as `fn.call(Host, "name", opts)`. */
export const ATTR_MACROS: Record<string, string> = {
  class_attribute: "classAttribute",
  mattr_accessor: "mattrAccessor",
  mattr_reader: "mattrReader",
  mattr_writer: "mattrWriter",
  cattr_accessor: "cattrAccessor",
  cattr_reader: "cattrReader",
  cattr_writer: "cattrWriter",
  thread_mattr_accessor: "threadMattrAccessor",
  thread_cattr_accessor: "threadMattrAccessor",
};

/** ActiveSupport::Testing::TimeHelpers' methods (testing/time_helpers.rb). */
export const TIME_HELPERS = new Set([
  "travel",
  "travel_to",
  "travel_back",
  "freeze_time",
  "unfreeze_time",
]);

/** Ruby date/time class → the activesupport module holding its calculations. */
export const CORE_EXT_CALC: Record<string, string> = {
  Date: "core-ext/date/calculations",
  Time: "core-ext/time/calculations",
  DateTime: "core-ext/date-time/calculations",
};
