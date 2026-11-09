import { afterEach, describe, expect, it, vi } from "vitest";
import { IO } from "@blazetrails/ruby-compat";
import { Message } from "../../../lib/message.js";
import { Sendmail } from "../../../lib/network/delivery-methods/sendmail.js";

function buildMail(): Message {
  const mail = new Message();
  mail.setFrom("roger@test.lindsaar.net");
  mail.setTo("marcel@test.lindsaar.net, bob@test.lindsaar.net");
  mail.setSubject("some subject");
  return mail;
}

const DESTS = "-- marcel@test.lindsaar.net bob@test.lindsaar.net";

async function deliverWith(dm: Sendmail, mail = buildMail()) {
  const popen = vi
    .spyOn(dm as unknown as { popen(command: unknown): Promise<unknown> }, "popen")
    .mockResolvedValue(null);
  await dm.deliverBang(mail);
  return popen;
}

afterEach(() => vi.restoreAllMocks());

describe("Mail::Sendmail", () => {
  it("sends an email using sendmail", async () => {
    const dm = new Sendmail({});
    expect(await deliverWith(dm)).toHaveBeenCalledWith(
      `/usr/sbin/sendmail -i -f roger@test.lindsaar.net ${DESTS}`.split(" "),
      expect.any(Function),
    );
  });

  const expectPopen = async (mail: Message, from: string, ...to: string[]) => {
    expect(await deliverWith(new Sendmail({}), mail)).toHaveBeenCalledWith(
      ["/usr/sbin/sendmail", "-i", "-f", from, "--", ...to],
      expect.any(Function),
    );
  };
  const DEFAULT_TO = ["marcel@test.lindsaar.net", "bob@test.lindsaar.net"];

  it("spawns a sendmail process", async () => {
    await expectPopen(buildMail(), "roger@test.lindsaar.net", ...DEFAULT_TO);
  });

  describe("SMTP From", () => {
    it("explicitly passes an envelope From address to sendmail", async () => {
      const mail = buildMail();
      mail.setSmtpEnvelopeFrom("smtp_from@test.lindsaar.net");
      await expectPopen(mail, "smtp_from@test.lindsaar.net", ...DEFAULT_TO);
    });

    it("escapes the From address", async () => {
      const mail = buildMail();
      mail.setFrom('"from+suffix test"@test.lindsaar.net');
      await expectPopen(mail, '"from+suffix test"@test.lindsaar.net', ...DEFAULT_TO);
    });

    it("does not escape ~ in From address", async () => {
      const mail = buildMail();
      mail.setFrom("tilde~@test.lindsaar.net");
      await expectPopen(mail, "tilde~@test.lindsaar.net", ...DEFAULT_TO);
    });
  });

  describe("SMTP To", () => {
    it("explicitly passes envelope To addresses to sendmail", async () => {
      const mail = buildMail();
      mail.setSmtpEnvelopeTo("smtp_to@test.lindsaar.net");
      await expectPopen(mail, "roger@test.lindsaar.net", "smtp_to@test.lindsaar.net");
    });

    it("escapes the To address", async () => {
      const mail = buildMail();
      mail.setTo('"to+suffix test"@test.lindsaar.net');
      await expectPopen(mail, "roger@test.lindsaar.net", '"to+suffix test"@test.lindsaar.net');
    });

    it("does not escape ~ in To address", async () => {
      const mail = buildMail();
      mail.setTo("tilde~@test.lindsaar.net");
      await expectPopen(mail, "roger@test.lindsaar.net", "tilde~@test.lindsaar.net");
    });

    it("quotes the destinations to ensure leading -hyphen doesn't confuse sendmail", async () => {
      const mail = buildMail();
      mail.setTo("-hyphen@test.lindsaar.net");
      await expectPopen(mail, "roger@test.lindsaar.net", "-hyphen@test.lindsaar.net");
    });
  });

  it("still sends an email if the arguments setting have been set to nil", async () => {
    const dm = new Sendmail({});
    dm.settings.arguments = null;
    expect(await deliverWith(dm)).toHaveBeenCalledWith(
      `/usr/sbin/sendmail -f roger@test.lindsaar.net ${DESTS}`.split(" "),
      expect.any(Function),
    );
  });

  it("escapes evil haxxor attempts", async () => {
    const evil = '"foo\\";touch /tmp/PWNED;\\""@blah.com';
    const mail = buildMail();
    mail.setFrom(evil);
    mail.setTo(evil);
    await expectPopen(mail, evil, evil);
  });

  it("raises on nonzero exitstatus", async () => {
    const popen = IO.popen.bind(IO);
    const spy = vi.spyOn(IO, "popen").mockImplementation((() => popen(["false"])) as never);
    await expect(new Sendmail({}).deliverBang(buildMail())).rejects.toThrow(
      'Delivery failed with exitstatus 1: ["/usr/sbin/sendmail", "-i", "-f", "roger@test.lindsaar.net", "--", "marcel@test.lindsaar.net", "bob@test.lindsaar.net"]',
    );
    expect(spy).toHaveBeenCalledWith(
      `/usr/sbin/sendmail -i -f roger@test.lindsaar.net ${DESTS}`.split(" "),
      "w+",
      { err: "out" },
      expect.any(Function),
    );
  });

  it("raises an error if no sender is defined", async () => {
    const mail = new Message();
    mail.setTo("to@somemail.com");
    mail.setBody("body");
    expect(mail.smtpEnvelopeFrom()).toBeNull();
    await expect(new Sendmail({}).deliverBang(mail)).rejects.toThrow(
      "SMTP From address may not be blank: nil",
    );
  });

  it("raises an error if no recipient is defined", async () => {
    const mail = new Message();
    mail.setFrom("from@somemail.com");
    mail.setSubject("Email with no recipient");
    mail.setBody("body");
    expect(mail.smtpEnvelopeTo()).toEqual([]);
    await expect(new Sendmail({}).deliverBang(mail)).rejects.toThrow(
      "SMTP To address may not be blank: []",
    );
  });

  it("allows for legacy callers with :arguments strings", async () => {
    const warn = vi.fn();
    vi.spyOn(
      Sendmail.prototype as unknown as { deprecationWarn(): unknown },
      "deprecationWarn",
    ).mockReturnValue(warn);
    const dm = new Sendmail({ arguments: "-i -t" });
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/:arguments of type String is deprecated/),
    );
    expect(await deliverWith(dm)).toHaveBeenCalledWith(
      '/usr/sbin/sendmail -i -t -f "roger@test.lindsaar.net" -- "marcel@test.lindsaar.net" "bob@test.lindsaar.net"',
      expect.any(Function),
    );
  });
});
