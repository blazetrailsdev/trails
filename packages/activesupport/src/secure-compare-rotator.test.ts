import { describe, it, expect } from "vitest";
import { SecureCompareRotator, InvalidMatch } from "./secure-compare-rotator.js";
import { assertChanges } from "./testing/assertions.js";

describe("SecureCompareRotatorTest", () => {
  it("#secure_compare! works correctly after rotation", () => {
    const wrapper = new SecureCompareRotator("old_secret");
    wrapper.rotate("new_secret");

    expect(wrapper.secureCompareBang("new_secret")).toEqual(true);
  });

  it("#secure_compare! works correctly after multiple rotation", () => {
    const wrapper = new SecureCompareRotator("old_secret");
    wrapper.rotate("new_secret");
    wrapper.rotate("another_secret");
    wrapper.rotate("and_another_one");

    expect(wrapper.secureCompareBang("and_another_one")).toEqual(true);
  });

  it("#secure_compare! fails correctly when credential is not part of the rotation", () => {
    const wrapper = new SecureCompareRotator("old_secret");
    wrapper.rotate("new_secret");

    expect(() => wrapper.secureCompareBang("different_secret")).toThrow(InvalidMatch);
  });

  it("#secure_compare! calls the on_rotation proc", async () => {
    const wrapper = new SecureCompareRotator("old_secret");
    wrapper.rotate("new_secret");
    wrapper.rotate("another_secret");
    wrapper.rotate("and_another_one");

    let witness: boolean | null = null;

    await assertChanges(
      () => witness,
      null,
      { from: null, to: true },
      () => {
        expect(
          wrapper.secureCompareBang("and_another_one", {
            onRotation: () => {
              witness = true;
            },
          }),
        ).toEqual(true);
      },
    );
  });

  it("#secure_compare! calls the on_rotation proc that given in constructor", async () => {
    let witness: boolean | null = null;

    const wrapper = new SecureCompareRotator("old_secret", {
      onRotation: () => {
        witness = true;
      },
    });
    wrapper.rotate("new_secret");
    wrapper.rotate("another_secret");
    wrapper.rotate("and_another_one");

    await assertChanges(
      () => witness,
      null,
      { from: null, to: true },
      () => {
        expect(wrapper.secureCompareBang("and_another_one")).toEqual(true);
      },
    );
  });
});
