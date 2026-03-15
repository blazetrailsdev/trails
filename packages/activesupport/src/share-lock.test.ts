import { describe, it } from "vitest";

describe("ShareLockTest", () => {
  it.skip("reentrancy");
  it.skip("sharing doesnt block");
  it.skip("sharing blocks exclusive");
  it.skip("exclusive blocks sharing");
  it.skip("multiple exclusives are able to progress");
  it.skip("sharing is upgradeable to exclusive");
  it.skip("exclusive upgrade waits for other sharers to leave");
  it.skip("exclusive matching purpose");
  it.skip("killed thread loses lock");
  it.skip("exclusive conflicting purpose");
  it.skip("exclusive ordering");
  it.skip("new share attempts block on waiting exclusive");
  it.skip("share remains reentrant ignoring a waiting exclusive");
  it.skip("compatible exclusives cooperate to both proceed");
  it.skip("manual yield");
  it.skip("manual incompatible yield");
  it.skip("manual recursive yield");
  it.skip("manual recursive yield cannot expand outer compatible");
  it.skip("manual recursive yield restores previous compatible");
  it.skip("in shared section incompatible non upgrading threads cannot preempt upgrading threads");
});

describe("ShareLockTest", () => {
  describe("CustomAssertionsTest", () => {
    it.skip("happy path");
    it.skip("detects stuck thread");
    it.skip("detects free thread");
    it.skip("detects already released");
    it.skip("detects remains latched");
  });
});
