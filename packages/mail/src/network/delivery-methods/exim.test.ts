import { afterEach, describe, expect, it, vi } from "vitest";
import { Message } from "../../message.js";
import { Exim } from "./exim.js";

function buildMail(): Message {
  const mail = new Message();
  mail.setFrom("roger@test.lindsaar.net");
  mail.setTo("marcel@test.lindsaar.net, bob@test.lindsaar.net");
  mail.setSubject("some subject");
  return mail;
}

async function deliverWith(dm: Exim, mail = buildMail()) {
  const popen = vi
    .spyOn(dm as unknown as { popen(command: unknown): Promise<unknown> }, "popen")
    .mockResolvedValue(null);
  await dm.deliverBang(mail);
  return popen;
}

afterEach(() => vi.restoreAllMocks());

describe("exim delivery agent", () => {
  it("should send an email using exim", async () => {
    const dm = new Exim({});
    expect(await deliverWith(dm)).toHaveBeenCalledWith(
      "/usr/sbin/exim -i -t -f roger@test.lindsaar.net".split(" "),
      expect.any(Function),
    );
  });
});
