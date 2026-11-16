import { describe, expect, it } from "vitest";
import { ActiveStorage } from "@blazetrails/activestorage";
import { freezeTime, travelBack } from "@blazetrails/activesupport/testing/time-helpers";
import { zone, type TimeZone } from "@blazetrails/activesupport";
import { StringIO } from "@blazetrails/ruby-compat";
import { fixturesAll } from "../test-helper.js";

type AttachableBlob = {
  id: unknown;
  attachableSgid(): string;
  asJson(options?: Record<string, unknown>): Record<string, unknown>;
};

describe("ActionText::AttachableTest", () => {
  fixturesAll();

  it("as_json is a hash when the attachable is persisted", async () => {
    freezeTime();
    try {
      const attachable = await (
        ActiveStorage.Blob as unknown as {
          createAfterUnfurlingBang(options: object): Promise<AttachableBlob>;
        }
      ).createAfterUnfurlingBang({ io: new StringIO("test"), filename: "test.txt", key: 123 });
      const attributes = {
        id: attachable.id,
        key: "123",
        filename: "test.txt",
        content_type: "text/plain",
        metadata: { identified: true },
        service_name: "test",
        byte_size: 4,
        checksum: "CY9rzUYh03PK3k6DJie09g==",
        created_at: (zone() as TimeZone).now().asJson(),
        attachable_sgid: attachable.attachableSgid(),
      };

      expect(attachable.asJson()).toEqual(attributes);
    } finally {
      travelBack();
    }
  });

  it("as_json is a hash when the attachable is a new record", () => {
    const attachable = (
      ActiveStorage.Blob as unknown as {
        buildAfterUnfurling(options: object): AttachableBlob;
      }
    ).buildAfterUnfurling({ io: new StringIO("test"), filename: "test.txt", key: 123 });
    const attributes = {
      id: null,
      key: "123",
      filename: "test.txt",
      content_type: "text/plain",
      metadata: { identified: true },
      service_name: "test",
      byte_size: 4,
      checksum: "CY9rzUYh03PK3k6DJie09g==",
      created_at: null,
      attachable_sgid: null,
    };

    expect(attachable.asJson()).toEqual(attributes);
  });

  it("attachable_sgid is included in as_json when only option is nil or includes attachable_sgid", async () => {
    const attachable = await (
      ActiveStorage.Blob as unknown as {
        createAfterUnfurlingBang(options: object): Promise<AttachableBlob>;
      }
    ).createAfterUnfurlingBang({
      io: new StringIO("test"),
      filename: "test.txt",
      key: 123,
    });

    expect(attachable.asJson({ only: "id" })).toEqual({ id: attachable.id });
    expect(attachable.asJson({ only: ["id"] })).toEqual({ id: attachable.id });
    const { attachable_sgid: _, ...withoutSgid } = attachable.asJson();
    expect(attachable.asJson({ except: "attachable_sgid" })).toEqual(withoutSgid);
    expect(attachable.asJson({ except: ["attachable_sgid"] })).toEqual(withoutSgid);
  });
});
