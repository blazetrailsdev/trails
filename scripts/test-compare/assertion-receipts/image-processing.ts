import type { AssertionReceipt } from "../assertion-receipts.js";

const ASSERT_OUTPUT_REASON =
  "Minitest's `assert_output` captures `$stderr` around a block; trails has no `assertOutput`, so the port spies on `stderr.write` and asserts the captured text with `toMatch`";

export const imageProcessing: Record<string, AssertionReceipt[]> = {
  "image-processing:mini_magick_test.rb › ImageProcessing::MiniMagick › #composite › accepts deprecated :compose":
    [
      {
        kind: "assert_output",
        value: "x:nil",
        as: "assert_match",
        reason: `mini_magick_test.rb:498 ${ASSERT_OUTPUT_REASON}`,
      },
    ],
  "image-processing:mini_magick_test.rb › ImageProcessing::MiniMagick › #composite › accepts deprecated :geometry":
    [
      {
        kind: "assert_output",
        value: "x:nil",
        as: "assert_match",
        reason: `mini_magick_test.rb:515 ${ASSERT_OUTPUT_REASON}`,
      },
    ],
};
