/**
 * The reviewed edges of the AR-closure test boundary.
 *
 * Rules R1 (path) and R2 (directory) in ./manifest.ts are exact and derived.
 * RFC 0105's derivation had a third rule — match a test stem's *basename*
 * against a closure file's basename at any path — which is a heuristic and
 * misfires (it maps `core_ext/pathname/blank_test.rb` onto
 * `active_support/core_ext/date/blank.rb` on the basename `blank` alone). So
 * R3 is not shipped: every file it would have caught is listed here by hand
 * with the closure file it actually covers, and everything else is listed as
 * out-of-closure. A reviewer settles any file by reading one row, not by
 * re-running a heuristic.
 */

export interface ClosureAlias {
  /** Path under `vendor/rails/activesupport/test/`. */
  testFile: string;
  /** The closure file it covers, relative to `activesupport/lib`. */
  closureFile: string;
  reason: string;
}

/** In-closure test files that R1/R2 cannot reach from their own path. */
export const CLOSURE_ALIASES: ClosureAlias[] = [
  {
    testFile: "time_zone_test.rb",
    closureFile: "active_support/values/time_zone.rb",
    reason: "TimeZone lives under values/, not at the test's top-level stem.",
  },
  {
    testFile: "core_ext/time_with_zone_test.rb",
    closureFile: "active_support/time_with_zone.rb",
    reason: "TimeWithZone is a top-level class; only its test sits under core_ext/.",
  },
  {
    testFile: "share_lock_test.rb",
    closureFile: "active_support/concurrency/share_lock.rb",
    reason: "ShareLock lives under concurrency/, reached via dependencies/interlock.",
  },
  {
    testFile: "autoload_test.rb",
    closureFile: "active_support/dependencies/autoload.rb",
    reason: "Autoload lives under dependencies/; the test drops the directory.",
  },
  {
    testFile: "transliterate_test.rb",
    closureFile: "active_support/inflector/transliterate.rb",
    reason: "Transliterate lives under inflector/; the test drops the directory.",
  },
  {
    testFile: "core_ext/module/attribute_accessor_per_thread_test.rb",
    closureFile: "active_support/core_ext/module/attribute_accessors_per_thread.rb",
    reason: "The test singularizes `accessors`, so no stem variant lines up.",
  },
  {
    testFile: "multibyte_proxy_test.rb",
    closureFile: "active_support/multibyte.rb",
    reason: "Covers the Multibyte proxy_class hook; the file is multibyte.rb.",
  },
];

/**
 * Activesupport test files deliberately outside the AR closure: nothing under
 * `activerecord/lib` or `activemodel/lib` requires the file they cover. They
 * are listed rather than inferred so the guard in ./manifest.ts can tell a
 * file that was *considered* out from one that is merely new.
 *
 * This list removes nothing from any denominator — RFC 0101 owns porting the
 * out-of-closure surface, and the whole-package activesupport percent still
 * counts every file here.
 */
export const OUT_OF_CLOSURE_TEST_FILES: string[] = [
  "backtrace_cleaner_test.rb",
  "benchmark_test.rb",
  "cache/cache_coder_test.rb",
  "cache/cache_entry_test.rb",
  "cache/cache_key_test.rb",
  "cache/cache_store_logger_test.rb",
  "cache/cache_store_namespace_test.rb",
  "cache/cache_store_setting_test.rb",
  "cache/local_cache_middleware_test.rb",
  "cache/serializer_with_fallback_test.rb",
  "cache/stores/file_store_test.rb",
  "cache/stores/mem_cache_store_test.rb",
  "cache/stores/memory_store_test.rb",
  "cache/stores/null_store_test.rb",
  "cache/stores/redis_cache_store_test.rb",
  "callback_inheritance_test.rb",
  "callbacks_test.rb",
  "clean_logger_test.rb",
  "configurable_test.rb",
  "core_ext/benchmark_test.rb",
  "core_ext/bigdecimal_test.rb",
  "core_ext/date_and_time_compatibility_test.rb",
  "core_ext/duration_test.rb",
  "core_ext/erb_util_test.rb",
  "core_ext/hash/transform_values_test.rb",
  "core_ext/kernel/concern_test.rb",
  "core_ext/kernel_test.rb",
  "core_ext/load_error_test.rb",
  "core_ext/module/attribute_aliasing_test.rb",
  "core_ext/name_error_test.rb",
  "core_ext/object/json_cherry_pick_test.rb",
  "core_ext/object/json_gem_encoding_test.rb",
  "core_ext/object/with_test.rb",
  "core_ext/pathname/blank_test.rb",
  "core_ext/pathname/existence_test.rb",
  "core_ext/regexp_ext_test.rb",
  "core_ext/secure_random_test.rb",
  "core_ext/symbol_ext_test.rb",
  "current_attributes_test.rb",
  "digest_test.rb",
  "encrypted_configuration_test.rb",
  "encrypted_file_test.rb",
  "error_reporter_test.rb",
  "evented_file_update_checker_test.rb",
  "execution_context_test.rb",
  "executor_test.rb",
  "file_update_checker_test.rb",
  "fork_tracker_test.rb",
  "gzip_test.rb",
  "isolated_execution_state_test.rb",
  "key_generator_test.rb",
  "log_subscriber_test.rb",
  "message_encryptor_test.rb",
  "message_encryptors_test.rb",
  "message_pack/cache_serializer_test.rb",
  "message_pack/serializer_test.rb",
  "message_verifier_test.rb",
  "message_verifiers_test.rb",
  "messages/message_encryptor_metadata_test.rb",
  "messages/message_encryptor_rotator_test.rb",
  "messages/message_verifier_metadata_test.rb",
  "messages/message_verifier_rotator_test.rb",
  "messages/rotation_configuration_test.rb",
  "messages/serializer_with_fallback_test.rb",
  "multibyte_chars_test.rb",
  "notifications/evented_notification_test.rb",
  "number_helper_i18n_test.rb",
  "option_merger_test.rb",
  "ordered_hash_test.rb",
  "reloader_test.rb",
  "rescuable_test.rb",
  "safe_buffer_test.rb",
  "secure_compare_rotator_test.rb",
  "security_utils_test.rb",
  "silence_logger_test.rb",
  "subscriber_test.rb",
  "tagged_logging_test.rb",
  "test_case_test.rb",
  "testing/after_teardown_assertion_test.rb",
  "testing/after_teardown_test.rb",
  "testing/constant_lookup_test.rb",
  "testing/file_fixtures_test.rb",
  "testing/method_call_assertions_test.rb",
  "testing/test_without_assertions_test.rb",
  "time_travel_test.rb",
  "xml_mini/jdom_engine_test.rb",
  "xml_mini/libxml_engine_test.rb",
  "xml_mini/libxmlsax_engine_test.rb",
  "xml_mini/nokogiri_engine_test.rb",
  "xml_mini/nokogirisax_engine_test.rb",
  "xml_mini/rexml_engine_test.rb",
  "xml_mini/xml_mini_engine_test.rb",
  "xml_mini_test.rb",
];
