import { describe, it, expect, afterEach } from "vitest";
import { extend } from "@blazetrails/activesupport";
import { FixtureSet, type FixtureSetHost } from "./fixture-set.js";
import { setApp, _resetApp } from "./config.js";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { SignedGlobalID, _resetSignedGlobalIDClassConfig } from "./signed-global-id.js";

class TestFixtureSet {
  static identify(label: string, columnType: string = ":integer"): number | string {
    return columnType === ":uuid" ? `uuid-${label}` : label.length;
  }
  static defaultFixtureModelName(fixtureSetName: string): string {
    return fixtureSetName === "users" ? "User" : fixtureSetName;
  }
}
extend(TestFixtureSet, FixtureSet);
const host = TestFixtureSet as unknown as FixtureSetHost & typeof FixtureSet;

describe("GlobalID::FixtureSet", () => {
  afterEach(() => {
    _resetApp();
    _resetSignedGlobalIDClassConfig();
  });

  it("global_id builds a GID from the fixture set's model name and identifier", () => {
    setApp("bcx");
    expect(host.globalId("users", "dhh").toString()).toBe("gid://bcx/User/3");
  });

  it("global_id honors column_type", () => {
    setApp("bcx");
    expect(host.globalId("users", "dhh", { columnType: ":uuid" }).toString()).toBe(
      "gid://bcx/User/uuid-dhh",
    );
  });

  it("signed_global_id builds a SignedGlobalID over the same GID", () => {
    setApp("bcx");
    const verifier = new MessageVerifier("s", { digest: "sha256", url_safe: true });
    const sgid = host.signedGlobalId("users", "dhh", { verifier });
    expect(SignedGlobalID.parse(sgid.toString(), { verifier })!.uri.toString()).toBe(
      "gid://bcx/User/3",
    );
  });
});
