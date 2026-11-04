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

function stubPopen(dm: Exim) {
  return vi.spyOn(dm, "popen").mockResolvedValue(null);
}

afterEach(() => vi.restoreAllMocks());

describe("exim delivery agent", () => {
  it("should send an email using exim", async () => {
    const dm = new Exim({});
    const popen = stubPopen(dm);
    await dm.deliverBang(buildMail());
    expect(popen.mock.calls[0][0]).toEqual(
      "/usr/sbin/exim -i -t -f roger@test.lindsaar.net".split(" "),
    );
  });
});
