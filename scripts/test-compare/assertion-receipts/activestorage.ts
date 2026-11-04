import type { AssertionReceipt } from "../assertion-receipts.js";

const unexpectedObject = (file: string, line: number): AssertionReceipt[] => [
  {
    kind: "assert_equal",
    value: "s:Could not find or build blob: expected attachable, got :foo",
    as: "assert_match",
    reason: `${file}:${line} \`got :foo\` — a Ruby Symbol is a JS string (CLAUDE.md, "A Ruby Symbol is a JS string, never a JS \`Symbol\`"), and a string attachable takes \`find_or_build_blob\`'s signed-id arm, so the port reaches the unexpected-object arm with a JS \`Symbol\`, whose inspect has no \`:foo\` spelling; the port matches the message prefix`,
  },
];

export const activestorage: Record<string, AssertionReceipt[]> = {
  "activestorage:models/attached/many_test.rb › ActiveStorage::ManyAttachedTest › creating a record with an unexpected object attached":
    unexpectedObject("models/attached/many_test.rb", 514),
  "activestorage:models/attached/one_test.rb › ActiveStorage::OneAttachedTest › creating a record with an unexpected object attached":
    unexpectedObject("models/attached/one_test.rb", 502),
};
