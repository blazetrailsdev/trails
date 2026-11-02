import { beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { block, type Tempfile } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "./active-storage.js";
import { PreviewError } from "./errors.js";
import { Previewer } from "./previewer.js";
import "./test-helpers/database/setup.js";
import { createFileBlob, subscribeEventsFrom } from "./test-helpers/test-helper.js";

class ShellPreviewer extends Previewer {
  run(...argv: string[]) {
    return this.draw(
      ...argv,
      block((file: Tempfile) => new TextDecoder().decode(file.read() as unknown as Uint8Array)),
    );
  }
}

describe("ActiveStorage::Previewer", () => {
  beforeEach(() => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
  });

  it("instruments preview around the capture with the key and service", async () => {
    const blob = await createFileBlob();
    const events = subscribeEventsFrom("preview.active_storage") as {
      payload: { key: string; service: string };
      duration: number;
    }[];

    expect(await new ShellPreviewer(blob).run("sh", "-c", "sleep 0.05; printf drawn")).toEqual(
      "drawn",
    );

    expect(events[0].payload.key).toEqual(blob.key);
    expect(events[0].payload.service).toEqual("Disk");
    expect(events[0].duration).toBeGreaterThanOrEqual(40);
  });

  it("raises PreviewError with the status and stderr on a failed command", async () => {
    const blob = await createFileBlob();

    await expect(new ShellPreviewer(blob).run("sh", "-c", "echo boom >&2; exit 3")).rejects.toThrow(
      new PreviewError("sh failed (status 3): boom"),
    );
  });
});
