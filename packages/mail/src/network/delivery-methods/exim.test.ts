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

async function argvFor(dm: Exim, mail = buildMail()): Promise<unknown> {
  const popen = vi
    .spyOn(dm as unknown as { popen(command: unknown): Promise<unknown> }, "popen")
    .mockResolvedValue(null);
  await dm.deliverBang(mail);
  return popen.mock.calls[0][0];
}

afterEach(() => vi.restoreAllMocks());

describe("exim delivery agent", () => {
  it("should send an email using exim", async () => {
    const dm = new Exim({});
    expect(await argvFor(dm)).toEqual("/usr/sbin/exim -i -t -f roger@test.lindsaar.net".split(" "));
  });
});
