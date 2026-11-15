import type { AssertionReceipt } from "../assertion-receipts.js";

const installedNodeModules: AssertionReceipt = {
  kind: "assert_includes",
  value: "s:right-pad",
  as: "assert_equal",
  reason:
    'rake_tasks_test.rb:31-46 `assert_includes installed_node_module_names, "right-pad"` — the port does not run the install; a fake `system` adapter asserts the install command and NODE_ENV=development instead (CONVERGEABLE vite-assets-rake-install-dependencies-tests-run-the-install)',
};

export const viteAssets: Record<string, AssertionReceipt[]> = {
  "vite-assets:rake_tasks_test.rb › RakeTasksTest › rake vite install dependencies in non production environments":
    [installedNodeModules],
  "vite-assets:rake_tasks_test.rb › RakeTasksTest › rake vite install dependencies in production environment":
    [installedNodeModules],
};
