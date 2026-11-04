import { afterEach, describe, expect, it, vi } from "vitest";
import { IO } from "@blazetrails/ruby-compat";
import { Message } from "../../message.js";
import { Sendmail } from "./sendmail.js";

function buildMail(): Message {
  const mail = new Message();
  mail.setFrom("roger@test.lindsaar.net");
  mail.setTo("marcel@test.lindsaar.net, bob@test.lindsaar.net");
  mail.setSubject("some subject");
  return mail;
}

function stubPopen(dm: Sendmail) {
  return vi.spyOn(dm, "popen").mockResolvedValue(null);
}

afterEach(() => vi.restoreAllMocks());

describe("Mail::Sendmail", () => {
  it("sends an email using sendmail", async () => {
    const dm = new Sendmail({});
    const popen = stubPopen(dm);
    await dm.deliverBang(buildMail());
    expect(popen.mock.calls[0][0]).toEqual(
      "/usr/sbin/sendmail -i -f roger@test.lindsaar.net -- marcel@test.lindsaar.net bob@test.lindsaar.net".split(
        " ",
      ),
    );
  });

  describe("SMTP To", () => {
    it("explicitly passes envelope To addresses to sendmail", async () => {
      const dm = new Sendmail({});
      const popen = stubPopen(dm);
      const mail = buildMail();
      mail.setSmtpEnvelopeTo("smtp_to@test.lindsaar.net");
      await dm.deliverBang(mail);
      expect(popen.mock.calls[0][0]).toEqual(
        "/usr/sbin/sendmail -i -f roger@test.lindsaar.net -- smtp_to@test.lindsaar.net".split(" "),
      );
    });
  });

  it("still sends an email if the arguments setting have been set to nil", async () => {
    const dm = new Sendmail({});
    const popen = stubPopen(dm);
    dm.settings.arguments = null;
    await dm.deliverBang(buildMail());
    expect(popen.mock.calls[0][0]).toEqual(
      "/usr/sbin/sendmail -f roger@test.lindsaar.net -- marcel@test.lindsaar.net bob@test.lindsaar.net".split(
        " ",
      ),
    );
  });

  it("raises on nonzero exitstatus", async () => {
    const popen = IO.popen.bind(IO);
    const spy = vi.spyOn(IO, "popen").mockImplementation((() => popen(["false"])) as never);
    await expect(new Sendmail({}).deliverBang(buildMail())).rejects.toThrow(
      'Delivery failed with exitstatus 1: ["/usr/sbin/sendmail", "-i", "-f", "roger@test.lindsaar.net", "--", "marcel@test.lindsaar.net", "bob@test.lindsaar.net"]',
    );
    expect(spy.mock.calls[0].slice(1, 3)).toEqual(["w+", { err: "out" }]);
  });

  it("raises an error if no sender is defined", async () => {
    const mail = new Message();
    mail.setTo("to@somemail.com");
    mail.setSubject("Email with no sender");
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
    vi.spyOn(Sendmail.prototype, "deprecationWarn").mockReturnValue(warn);
    const dm = new Sendmail({ arguments: "-i -t" });
    expect(warn.mock.calls[0][0]).toMatch(/:arguments of type String is deprecated/);
    const popen = stubPopen(dm);
    await dm.deliverBang(buildMail());
    expect(popen.mock.calls[0][0]).toBe(
      '/usr/sbin/sendmail -i -t -f "roger@test.lindsaar.net" -- "marcel@test.lindsaar.net" "bob@test.lindsaar.net"',
    );
  });
});
