import { describe, expect, it } from "vitest";
import { onLoad } from "@blazetrails/activesupport";

describe("ActionMailer::Railtie load order", () => {
  it(
    "leaves ActionMailer::Base unloaded until something references it",
    { timeout: 30_000 },
    async () => {
      const loaded: unknown[] = [];
      onLoad("action_mailer", (base) => loaded.push(base));

      await import("./action-mailer.js");
      expect(loaded).toEqual([]);

      const { ActionMailer } = await import("@blazetrails/actionmailer");
      expect(loaded).toEqual([ActionMailer.Base]);
    },
  );
});
