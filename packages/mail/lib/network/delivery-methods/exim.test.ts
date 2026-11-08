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

  describe("return path", () => {
    const expectFrom = async (mail: Message, from: string) => {
      expect(await deliverWith(new Exim({}), mail)).toHaveBeenCalledWith(
        ["/usr/sbin/exim", "-i", "-t", "-f", from],
        expect.any(Function),
      );
    };

    it("should send an email with a return-path using exim", async () => {
      const mail = buildMail();
      mail.setReturnPath("return@test.lindsaar.net");
      mail.setSender("sender@test.lindsaar.net");
      await expectFrom(mail, "return@test.lindsaar.net");
    });

    it("should use the sender address is no return path is specified", async () => {
      const mail = buildMail();
      mail.setSender("sender@test.lindsaar.net");
      await expectFrom(mail, "sender@test.lindsaar.net");
    });

    it("should use the from address is no return path or sender are specified", async () => {
      const mail = buildMail();
      mail.setFrom("from@test.lindsaar.net");
      await expectFrom(mail, "from@test.lindsaar.net");
    });

    it("should escape the return path address", async () => {
      const mail = buildMail();
      mail.setFrom('"from+suffix test"@test.lindsaar.net');
      await expectFrom(mail, '"from+suffix test"@test.lindsaar.net');
    });

    it("should not escape ~ in return path address", async () => {
      const mail = buildMail();
      mail.setFrom("tilde~@test.lindsaar.net");
      await expectFrom(mail, "tilde~@test.lindsaar.net");
    });
  });

  it("should still send an email if the settings have been set to nil", async () => {
    const dm = new Exim({});
    dm.settings.arguments = null;
    expect(await deliverWith(dm)).toHaveBeenCalledWith(
      ["/usr/sbin/exim", "-f", "roger@test.lindsaar.net"],
      expect.any(Function),
    );
  });

  it("should escape evil haxxor attemptes", async () => {
    const evil = '"foo\\";touch /tmp/PWNED;\\""@blah.com';
    const mail = buildMail();
    mail.setFrom(evil);
    expect(await deliverWith(new Exim({}), mail)).toHaveBeenCalledWith(
      ["/usr/sbin/exim", "-i", "-t", "-f", evil],
      expect.any(Function),
    );
  });

  it("should raise an error if no sender is defined", async () => {
    const mail = buildMail();
    mail.setFrom(null);
    expect(mail.smtpEnvelopeFrom()).toBeNull();
    await expect(new Exim({}).deliverBang(mail)).rejects.toThrow(
      "SMTP From address may not be blank: nil",
    );
  });

  it("should raise an error if no recipient if defined", async () => {
    const mail = buildMail();
    mail.setTo(null);
    expect(mail.smtpEnvelopeTo()).toEqual([]);
    await expect(new Exim({}).deliverBang(mail)).rejects.toThrow(
      "SMTP To address may not be blank: []",
    );
  });
});
