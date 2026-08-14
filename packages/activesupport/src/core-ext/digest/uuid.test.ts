import { describe, expect, it } from "vitest";
import { ArgumentError } from "../../hash-utils.js";
import {
  DNS_NAMESPACE,
  OID_NAMESPACE,
  URL_NAMESPACE,
  X500_NAMESPACE,
  nilUuid,
  uuidFromHash,
  uuidV3,
  uuidV5,
} from "./uuid.js";

/** Rails' `"%08x-%04x-%04x-%04x-%04x%08x" % namespace.unpack("NnnnnN")`. */
function formatNamespace(namespace: Uint8Array): string {
  const hex = Array.from(namespace, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describe("DigestUUIDExt", () => {
  it("constants", () => {
    expect(formatNamespace(DNS_NAMESPACE)).toEqual("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
    expect(formatNamespace(URL_NAMESPACE)).toEqual("6ba7b811-9dad-11d1-80b4-00c04fd430c8");
    expect(formatNamespace(OID_NAMESPACE)).toEqual("6ba7b812-9dad-11d1-80b4-00c04fd430c8");
    expect(formatNamespace(X500_NAMESPACE)).toEqual("6ba7b814-9dad-11d1-80b4-00c04fd430c8");
  });

  it("v3 uuids with rfc4122 namespaced uuids enabled", () => {
    expect(uuidV3("6BA7B810-9DAD-11D1-80B4-00C04FD430C8", "www.widgets.com")).toEqual(
      "3d813cbb-47fb-32ba-91df-831e1593ac29",
    );
    expect(uuidV3("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "www.widgets.com")).toEqual(
      "3d813cbb-47fb-32ba-91df-831e1593ac29",
    );
    expect(uuidV3(DNS_NAMESPACE, "www.widgets.com")).toEqual(
      "3d813cbb-47fb-32ba-91df-831e1593ac29",
    );

    expect(uuidV3("6BA7B811-9DAD-11D1-80B4-00C04FD430C8", "http://www.widgets.com")).toEqual(
      "86df55fb-428e-3843-8583-ba3c05f290bc",
    );
    expect(uuidV3(URL_NAMESPACE, "http://www.widgets.com")).toEqual(
      "86df55fb-428e-3843-8583-ba3c05f290bc",
    );

    expect(uuidV3("6BA7B812-9DAD-11D1-80B4-00C04FD430C8", "1.2.3")).toEqual(
      "8c29ab0e-a2dc-3482-b5eb-20cb2e2387a1",
    );
    expect(uuidV3(OID_NAMESPACE, "1.2.3")).toEqual("8c29ab0e-a2dc-3482-b5eb-20cb2e2387a1");

    expect(uuidV3(X500_NAMESPACE, "cn=John Doe, ou=People, o=Acme, Inc., c=US")).toEqual(
      "ee49149d-53a4-304a-890b-468229f6afc3",
    );

    expect(() => uuidV3("A non-UUID string", "some value")).toThrow(ArgumentError);
  });

  it("v5 uuids with rfc4122 namespaced uuids enabled", () => {
    expect(uuidV5("6BA7B810-9DAD-11D1-80B4-00C04FD430C8", "www.widgets.com")).toEqual(
      "21f7f8de-8051-5b89-8680-0195ef798b6a",
    );
    expect(uuidV5(DNS_NAMESPACE, "www.widgets.com")).toEqual(
      "21f7f8de-8051-5b89-8680-0195ef798b6a",
    );

    expect(uuidV5("6ba7b811-9dad-11d1-80b4-00c04fd430c8", "http://www.widgets.com")).toEqual(
      "4e570fd8-186d-5a74-90f0-4d28e34673a1",
    );
    expect(uuidV5(URL_NAMESPACE, "http://www.widgets.com")).toEqual(
      "4e570fd8-186d-5a74-90f0-4d28e34673a1",
    );

    expect(uuidV5(OID_NAMESPACE, "1.2.3")).toEqual("42d5e23b-3a02-5135-85c6-52d1102f1f00");

    expect(uuidV5(X500_NAMESPACE, "cn=John Doe, ou=People, o=Acme, Inc., c=US")).toEqual(
      "fd5b2ddf-bcfe-58b6-90d6-db50f74db527",
    );

    expect(() => uuidV5("A non-UUID string", "some value")).toThrow(ArgumentError);

    // trails-only: Rails' `include?` over the namespace constants is String
    // value equality (digest/uuid.rb:63), so a distinct copy of a known
    // namespace's bytes takes the same branch as the constant itself.
    expect(uuidV5(Uint8Array.from(DNS_NAMESPACE), "www.widgets.com")).toEqual(
      uuidV5(DNS_NAMESPACE, "www.widgets.com"),
    );
  });

  it("nil uuid", () => {
    expect(nilUuid()).toEqual("00000000-0000-0000-0000-000000000000");
  });

  it("invalid hash class", () => {
    expect(() => uuidFromHash("sha256", OID_NAMESPACE, "1.2.3")).toThrow(ArgumentError);
  });
});
