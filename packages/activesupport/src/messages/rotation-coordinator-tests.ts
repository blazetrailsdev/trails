import { beforeEach, expect, it } from "vitest";

import type { FallsBack, RotationCoordinator } from "./rotation-coordinator.js";

/**
 * Rails' `make_coordinator` / `roundtrip`, which each including test supplies.
 */
export interface CoordinatorHooks<C extends FallsBack<C>> {
  makeCoordinator(): RotationCoordinator<C>;
  roundtrip(message: string, codec: C, otherCodec?: C): unknown;
}

/**
 * Rails' `RotationCoordinatorTests`, the module both `MessageVerifiersTest`
 * and `MessageEncryptorsTest` `include`.
 */
export function rotationCoordinatorTests<C extends FallsBack<C>>(hooks: CoordinatorHooks<C>): void {
  const { makeCoordinator, roundtrip } = hooks;

  let coordinator: RotationCoordinator<C>;

  beforeEach(() => {
    coordinator = makeCoordinator().rotateDefaults();
  });

  it("builds working codecs", () => {
    const codec = coordinator.get("salt");
    const otherCodec = coordinator.get("other salt");

    expect(roundtrip("message", codec)).toEqual("message");
    expect(roundtrip("message", codec, otherCodec)).toBeNull();
  });

  it("memoizes codecs", () => {
    expect(coordinator.get("salt")).toBe(coordinator.get("salt"));
  });

  it("can override codecs", () => {
    coordinator.set("other salt", coordinator.get("salt"));
    expect(coordinator.get("salt")).toBe(coordinator.get("other salt"));
  });

  it("configures codecs with rotations", () => {
    coordinator.rotate({ digest: "MD5" });
    const codec = coordinator.get("salt");
    const obsoleteCodec = makeCoordinator().rotate({ digest: "MD5" }).get("salt");

    expect(roundtrip("message", obsoleteCodec, codec)).toEqual("message");
    expect(roundtrip("message", codec, obsoleteCodec)).toBeNull();
  });

  it("raises when building a codec and no rotations are configured", () => {
    expect(() => makeCoordinator().get("salt")).toThrow();
  });

  it("#rotate supports a block", () => {
    const blockCoordinator = makeCoordinator().rotate((salt) => ({
      digest: salt === "salt" ? "SHA1" : "MD5",
    }));

    const sha1Coordinator = makeCoordinator().rotate({ digest: "SHA1" });
    const md5Coordinator = makeCoordinator().rotate({ digest: "MD5" });

    expect(roundtrip("message", blockCoordinator.get("salt"), sha1Coordinator.get("salt"))).toEqual(
      "message",
    );
    expect(
      roundtrip("message", blockCoordinator.get("salt"), md5Coordinator.get("salt")),
    ).toBeNull();

    expect(
      roundtrip("message", blockCoordinator.get("other salt"), md5Coordinator.get("other salt")),
    ).toEqual("message");
    expect(
      roundtrip("message", blockCoordinator.get("other salt"), sha1Coordinator.get("other salt")),
    ).toBeNull();
  });

  it("#rotate block receives salt in its original form", () => {
    const blockCoordinator = makeCoordinator().rotate((salt) => {
      expect(salt).toBe(Symbol.for("salt"));
      return {};
    });

    blockCoordinator.get(Symbol.for("salt"));
  });

  it("#rotate raises when both a block and options are provided", () => {
    expect(() => makeCoordinator().rotate({ digest: "MD5" }, () => ({}))).toThrow(
      "Options cannot be specified when using a block",
    );
  });

  it("#rotate block can return nil to skip a rotation for specific salts", () => {
    const blockCoordinator = makeCoordinator().rotate({ digest: "SHA1" });
    blockCoordinator.rotate((salt) => (salt === "salt" ? { digest: "MD5" } : null));

    const sha1Coordinator = makeCoordinator().rotate({ digest: "SHA1" });
    const md5Coordinator = makeCoordinator().rotate({ digest: "MD5" });

    expect(roundtrip("message", sha1Coordinator.get("salt"), blockCoordinator.get("salt"))).toEqual(
      "message",
    );
    expect(roundtrip("message", md5Coordinator.get("salt"), blockCoordinator.get("salt"))).toEqual(
      "message",
    );

    expect(
      roundtrip("message", sha1Coordinator.get("other salt"), blockCoordinator.get("other salt")),
    ).toEqual("message");
    expect(
      roundtrip("message", md5Coordinator.get("other salt"), blockCoordinator.get("other salt")),
    ).toBeNull();
  });

  it("raises when building a codec and no rotations are configured for a specific salt", () => {
    const blockCoordinator = makeCoordinator().rotate((salt) =>
      salt === "salt" ? { digest: "MD5" } : null,
    );

    expect(() => blockCoordinator.get("salt")).not.toThrow();
    expect(() => blockCoordinator.get("other salt")).toThrow("other salt");
  });

  it("#transitional swaps the first two rotations when enabled", () => {
    const transitionalCoordinator = makeCoordinator().rotate({ digest: "SHA1" });
    transitionalCoordinator.rotate({ digest: "MD5" });
    transitionalCoordinator.rotate({ digest: "SHA256" });
    transitionalCoordinator.transitional = true;

    const codec = transitionalCoordinator.get("salt");
    const sha1Codec = makeCoordinator().rotate({ digest: "SHA1" }).get("salt");
    const md5Codec = makeCoordinator().rotate({ digest: "MD5" }).get("salt");
    const sha256Codec = makeCoordinator().rotate({ digest: "SHA256" }).get("salt");

    expect(roundtrip("message", codec, md5Codec)).toEqual("message");
    expect(roundtrip("message", codec, sha1Codec)).toBeNull();

    expect(roundtrip("message", sha1Codec, codec)).toEqual("message");
    expect(roundtrip("message", md5Codec, codec)).toEqual("message");
    expect(roundtrip("message", sha256Codec, codec)).toEqual("message");
  });

  it("#transitional works with a single rotation", () => {
    coordinator.transitional = true;

    const codec = coordinator.get("salt");
    expect(roundtrip("message", codec)).toEqual("message");

    const differentCodec = makeCoordinator().rotate({ digest: "MD5" }).get("salt");
    expect(roundtrip("message", differentCodec, codec)).toBeNull();
  });

  it("#transitional treats a nil first rotation as a new rotation", () => {
    const transitionalCoordinator = makeCoordinator();
    // (3) Finally, one salt upgraded to SHA1
    transitionalCoordinator.rotate((salt) => (salt === "salt" ? { digest: "SHA1" } : null));
    transitionalCoordinator.rotate({ digest: "MD5" }); // (2) Then, everything upgraded to MD5
    transitionalCoordinator.rotate({ digest: "SHA256" }); // (1) Originally, everything used SHA256
    transitionalCoordinator.transitional = true;

    const sha1Coordinator = makeCoordinator().rotate({ digest: "SHA1" });
    const md5Coordinator = makeCoordinator().rotate({ digest: "MD5" });

    // "salt" encodes with MD5 and can decode SHA1 (i.e. [SHA1, MD5, SHA256] => [MD5, SHA1, SHA256])
    expect(
      roundtrip("message", transitionalCoordinator.get("salt"), md5Coordinator.get("salt")),
    ).toEqual("message");
    expect(
      roundtrip("message", sha1Coordinator.get("salt"), transitionalCoordinator.get("salt")),
    ).toEqual("message");

    // "other salt" encodes with MD5 and cannot decode SHA1 (i.e. [nil, MD5, SHA256] => [MD5, SHA256])
    expect(
      roundtrip(
        "message",
        transitionalCoordinator.get("other salt"),
        md5Coordinator.get("other salt"),
      ),
    ).toEqual("message");
    expect(
      roundtrip(
        "message",
        sha1Coordinator.get("other salt"),
        transitionalCoordinator.get("other salt"),
      ),
    ).toBeNull();
  });

  it("#transitional swaps the first rotation with the next non-nil rotation", () => {
    const transitionalCoordinator = makeCoordinator();
    // (3) Finally, everything upgraded to SHA1
    transitionalCoordinator.rotate({ digest: "SHA1" });
    // (2) Then, one salt upgraded to SHA1
    transitionalCoordinator.rotate((salt) => (salt === "salt" ? { digest: "SHA1" } : null));
    transitionalCoordinator.rotate({ digest: "MD5" }); // (1) Originally, everything used MD5
    transitionalCoordinator.transitional = true;

    const sha1Coordinator = makeCoordinator().rotate({ digest: "SHA1" });
    const md5Coordinator = makeCoordinator().rotate({ digest: "MD5" });

    // "salt" encodes with SHA1 and can decode SHA1 (i.e. [SHA1, SHA1, MD5] => [SHA1, MD5])
    expect(
      roundtrip("message", transitionalCoordinator.get("salt"), sha1Coordinator.get("salt")),
    ).toEqual("message");
    expect(
      roundtrip("message", sha1Coordinator.get("salt"), transitionalCoordinator.get("salt")),
    ).toEqual("message");

    // "other salt" encodes with MD5 and can decode SHA1 (i.e. [SHA1, nil, MD5] => [MD5, SHA1])
    expect(
      roundtrip(
        "message",
        transitionalCoordinator.get("other salt"),
        md5Coordinator.get("other salt"),
      ),
    ).toEqual("message");
    expect(
      roundtrip(
        "message",
        sha1Coordinator.get("other salt"),
        transitionalCoordinator.get("other salt"),
      ),
    ).toEqual("message");
  });

  it("can clear rotations", () => {
    coordinator.clearRotations().rotate({ digest: "MD5" });
    const codec = coordinator.get("salt");
    const similarCodec = makeCoordinator().rotate({ digest: "MD5" }).get("salt");

    expect(roundtrip("message", codec, similarCodec)).toEqual("message");
  });

  it("configures codecs with on_rotation", () => {
    let rotated = 0;
    coordinator.onRotation(() => {
      rotated += 1;
    });
    coordinator.rotate({ digest: "MD5" });
    const codec = coordinator.get("salt");
    const obsoleteCodec = makeCoordinator().rotate({ digest: "MD5" }).get("salt");

    expect(roundtrip("message", obsoleteCodec, codec)).toEqual("message");
    expect(rotated).toEqual(1);
  });

  it("rotation options are deduped", () => {
    const dedupedCoordinator = makeCoordinator();
    // (3) Finally, everything upgraded to SHA1
    dedupedCoordinator.rotate({ digest: "SHA1" });
    // (2) Then, one salt upgraded to SHA1
    dedupedCoordinator.rotate((salt) => (salt === "salt" ? { digest: "SHA1" } : null));
    dedupedCoordinator.rotate({ digest: "MD5" }); // (1) Originally, everything used MD5

    let rotated = 0;
    dedupedCoordinator.onRotation(() => {
      rotated += 1;
    });

    const codec = dedupedCoordinator.get("salt");
    const md5Codec = makeCoordinator().rotate({ digest: "MD5" }).get("salt");

    expect(roundtrip("message", md5Codec, codec)).toEqual("message");
    expect(rotated).toEqual(1); // SHA1 tried only once
  });

  it("prevents adding a rotation after rotations have been applied", () => {
    coordinator.get("salt");
    expect(() => coordinator.rotate({ digest: "MD5" })).toThrow();
  });

  it("prevents clearing rotations after rotations have been applied", () => {
    coordinator.get("salt");
    expect(() => coordinator.clearRotations()).toThrow();
  });

  it("prevents changing on_rotation after on_rotation has been applied", () => {
    coordinator.get("salt");
    expect(() => coordinator.onRotation(() => "this block will not be evaluated")).toThrow();
  });
}
