import type { AssertionReceipt } from "../assertion-receipts.js";

export const rake: Record<string, AssertionReceipt[]> = {
  "rake:test_rake_file_list.rb › TestRakeFileList › string ext": [
    {
      kind: "assert_equal",
      value: "s:one.x\\two.net",
      as: null,
      reason:
        "test_rake_file_list.rb:353-356 runs only under `Rake::Win32.windows?`; `win32.rb` is a non-goal of RFC 0211, so the arm has no port.",
    },
    {
      kind: "assert_equal",
      value: "s:one.x\\two.net",
      as: null,
      reason:
        "test_rake_file_list.rb:353-356 runs only under `Rake::Win32.windows?`; `win32.rb` is a non-goal of RFC 0211, so the arm has no port.",
    },
  ],
  "rake:test_rake_linked_list.rb › TestLinkedList › conversion with inspect": [
    {
      kind: "assert_equal",
      value: "s:LL(:one, :two, :three)",
      as: null,
      reason:
        'test_rake_linked_list.rb:69 inspects Symbol items as `:one`; a Ruby Symbol is a JS string, so the items inspect as Strings (CLAUDE.md § "A Ruby Symbol is a JS string, never a JS `Symbol`")',
    },
  ],
  "rake:test_rake_rake_test_loader.rb › TestRakeRakeTestLoader › load error raised implicitly": [
    {
      kind: "assert_equal",
      value: "s:no such file to load -- superkalifragilisticoespialidoso",
      as: null,
      reason:
        'test_rake_rake_test_loader.rb:52-56 runs that arm only on `RUBY_ENGINE == "jruby"`; Node has no JRuby to assert against.',
    },
  ],
  "rake:test_rake_test_task.rb › TestRakeTestTask › run code rake": [
    {
      kind: "assert_includes",
      value: "s:lib/rake/rake_test_loader.rb",
      as: "assert_includes",
      reason:
        "test_rake_test_task.rb:131 names rake's installed path. A TS module is emitted by kebab-case file name beside its importer, so the same assertion names `rake-test-loader.js`, the spelling `run_code` produces.",
    },
  ],
};
