import { describe, expect, it } from "vitest";
import { Address } from "./address.js";

function breakDownTo(target: Address, expected: Record<string, unknown>): void {
  const members = target as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(expected)) {
    const member = members[k];
    expect(typeof member === "function" ? member.call(target) : member).toEqual(v);
  }
}

describe("Mail::Address", () => {
  describe("functionality", () => {
    it("should allow us to instantiate an empty address object and call inspect", () => {
      expect(() => new Address().inspect()).not.toThrow();
    });

    it("should allow us to instantiate an empty address object and call to_s", () => {
      expect(new Address().toString()).toEqual("");
    });

    it("should allow us to instantiate an empty address object and call format", () => {
      expect(new Address().format()).toEqual("");
    });

    it("should allow us to instantiate an empty address object and call address", () => {
      [null, "", " "].forEach((input) => {
        expect(new Address(input).address()).toBeNull();
      });
    });

    it("should allow us to instantiate an empty address object and call local", () => {
      [null, "", " "].forEach((input) => {
        expect(new Address(input).local()).toBeNull();
      });
    });

    it("should allow us to instantiate an empty address object and call domain", () => {
      [null, "", " "].forEach((input) => {
        expect(new Address(input).domain()).toBeNull();
      });
    });

    it("should allow us to instantiate an empty address object and call name", () => {
      [null, "", " "].forEach((input) => {
        expect(new Address(input).name).toBeNull();
      });
    });

    ['"-Earnings...Notification-" <vodacom.co.rs>', "<56253817>"].forEach((spammyAddress) => {
      it(`should ignore funky local-only spammy addresses in angle brackets ${spammyAddress}`, () => {
        expect(new Address(spammyAddress).address()).toBeNull();
      });
    });

    it("should give its address back on :to_s if there is no display name", () => {
      const parseText = "test@lindsaar.net";
      const result = "test@lindsaar.net";
      expect(new Address(parseText).toString()).toEqual(result);
    });

    it("should give its format back on :to_s if there is a display name", () => {
      const parseText = "Mikel Lindsaar <test@lindsaar.net>";
      const result = "Mikel Lindsaar <test@lindsaar.net>";
      expect(new Address(parseText).toString()).toEqual(result);
    });

    it("should give back the display name", () => {
      const parseText = "Mikel Lindsaar <test@lindsaar.net>";
      const result = "Mikel Lindsaar";
      const a = new Address(parseText);
      expect(a.displayName()).toEqual(result);
    });

    it("should preserve the display name passed in", () => {
      const parseText = '"Mikel Lindsaar" <mikel@test.lindsaar.net>';
      const result = "Mikel Lindsaar";
      const a = new Address(parseText);
      expect(a.displayName()).toEqual(result);
    });

    it("should preserve the display name passed in with token unsafe chars", () => {
      const parseText = '"Mikel@@@Lindsaar" <mikel@test.lindsaar.net>';
      const result = "Mikel@@@Lindsaar";
      const a = new Address(parseText);
      expect(a.displayName()).toEqual(result);
    });

    it("should decode the display name without calling #decoded first", () => {
      const encoded = "=?ISO-8859-1?Q?Jan_Kr=FCtisch?= <jan@krutisch.de>";
      expect(new Address(encoded).displayName()).toEqual("Jan Krütisch");
    });

    it("doesn't get stuck on decode or encode output mode", () => {
      const a = new Address("=?ISO-8859-1?Q?Jan_Kr=FCtisch?= <jan@krutisch.de>");
      expect(a.displayName()).toEqual("Jan Krütisch");

      void a.encoded;
      expect(a.displayName()).toEqual("Jan Krütisch");
    });

    it("should allow nil display name", () => {
      const a = new Address();
      expect(a.displayName()).toBeNull();
      a.setDisplayName(null);
      expect(a.displayName()).toBeNull();
    });

    it("should give back the local part", () => {
      const parseText = "Mikel Lindsaar <test@lindsaar.net>";
      const result = "test";
      const a = new Address(parseText);
      expect(a.local()).toEqual(result);
    });

    it("should give back the domain", () => {
      const parseText = "Mikel Lindsaar <test@lindsaar.net>";
      const result = "lindsaar.net";
      const a = new Address(parseText);
      expect(a.domain()).toEqual(result);
    });

    it("should give back the formated address", () => {
      const parseText = "Mikel Lindsaar <test@lindsaar.net>";
      const result = "Mikel Lindsaar <test@lindsaar.net>";
      const a = new Address(parseText);
      expect(a.format()).toEqual(result);
    });

    it("should handle an address without a domain", () => {
      const parseText = "test";
      const result = "test";
      const a = new Address(parseText);
      expect(a.address()).toEqual(result);
    });

    it("should handle comments", () => {
      const parseText = "Mikel Lindsaar (author) <test@lindsaar.net>";
      const result = ["author"];
      const a = new Address(parseText);
      expect(a.comments).toEqual(result);
    });

    it("should handle multiple comments", () => {
      const parseText = "Mikel (first name) Lindsaar (author) <test@lindsaar.net>";
      const result = ["first name", "author"];
      const a = new Address(parseText);
      expect(a.comments).toEqual(result);
    });

    it("should handle nested comments", () => {
      const parseText = "bob@example.com (hello   (nested) yeah)";
      const result = ["hello (nested) yeah"];
      const a = new Address(parseText);
      expect(a.comments).toEqual(result);
    });

    it("should give back the raw value", () => {
      const parseText = "Mikel (first name) Lindsaar (author) <test@lindsaar.net>";
      const result = "Mikel (first name) Lindsaar (author) <test@lindsaar.net>";
      const a = new Address(parseText);
      expect(a.raw).toEqual(result);
    });

    it("should format junk addresses as raw text", () => {
      const junk = '<"somename@gmail.com">';
      expect(new Address(junk).format()).toEqual(junk);
    });
  });

  describe("assigning values directly", () => {
    it("should allow you to assign an address", () => {
      const a = new Address();
      a.setAddress("mikel@test.lindsaar.net");
      expect(a.address()).toEqual("mikel@test.lindsaar.net");
      expect(a.format()).toEqual("mikel@test.lindsaar.net");
    });

    it("should allow you to assign a display name", () => {
      const a = new Address();
      a.setDisplayName("Mikel Lindsaar");
      expect(a.displayName()).toEqual("Mikel Lindsaar");
    });

    it("should return an empty format a display name and no address defined", () => {
      const a = new Address();
      a.setDisplayName("Mikel Lindsaar");
      expect(a.format()).toEqual("");
    });

    it("should allow you to assign an address and a display name", () => {
      const a = new Address();
      a.setAddress("mikel@test.lindsaar.net");
      a.setDisplayName("Mikel Lindsaar");
      expect(a.format()).toEqual("Mikel Lindsaar <mikel@test.lindsaar.net>");
    });
  });

  describe("parsing", () => {
    describe("basic email addresses", () => {
      it("should handle all OK local parts", () => {
        [
          ["aamine", "aamine"],
          ['"Minero Aoki"', '"Minero Aoki"'],
          ['"!@#$%^&*()"', '"!@#$%^&*()"'],
          ["a.b.c", "a.b.c"],
        ].forEach(([words, ok]) => {
          const a = new Address(words);
          expect(a.local()).toEqual(ok);
        });
      });

      it("should handle all OK domains", () => {
        [
          ["loveruby.net", "loveruby.net"],
          ['"love ruby".net', '"love ruby".net'],
          ['a."love ruby".net', 'a."love ruby".net'],
          ['"!@#$%^&*()"', '"!@#$%^&*()"'],
          ["[192.168.1.1]", "[192.168.1.1]"],
        ].forEach(([words, ok]) => {
          const a = new Address(`me@${words}`);
          expect(a.domain()).toEqual(ok);
        });
      });
    });

    describe("RFC 6532 UTF-8 chars", () => {
      it("local", () => {
        expect(new Address("💌@example.com").local()).toEqual("💌");
      });

      it("domain", () => {
        expect(new Address("test@exämple.com").domain()).toEqual("exämple.com");
      });

      it("display name", () => {
        expect(new Address('"💌" <test@example.com>').displayName()).toEqual("💌");
      });
    });

    describe("email addresses from the wild", () => {
      it("should handle |aamine@loveruby.net|", () => {
        const address = new Address("aamine@loveruby.net");
        breakDownTo(address, {
          displayName: null,
          address: "aamine@loveruby.net",
          local: "aamine",
          domain: "loveruby.net",
          format: "aamine@loveruby.net",
          comments: null,
          raw: "aamine@loveruby.net",
        });
      });

      it("should handle |Minero Aoki <aamine@loveruby.net>|", () => {
        const address = new Address("Minero Aoki <aamine@loveruby.net>");
        breakDownTo(address, {
          displayName: "Minero Aoki",
          address: "aamine@loveruby.net",
          local: "aamine",
          domain: "loveruby.net",
          format: "Minero Aoki <aamine@loveruby.net>",
          comments: null,
          raw: "Minero Aoki <aamine@loveruby.net>",
        });
      });

      it("should handle |Minero Aoki<aamine@loveruby.net>|", () => {
        const address = new Address("Minero Aoki<aamine@loveruby.net>");
        breakDownTo(address, {
          displayName: "Minero Aoki",
          address: "aamine@loveruby.net",
          local: "aamine",
          domain: "loveruby.net",
          format: "Minero Aoki <aamine@loveruby.net>",
          comments: null,
          raw: "Minero Aoki<aamine@loveruby.net>",
        });
      });

      it('should handle |"Minero Aoki" <aamine@loveruby.net>|', () => {
        const address = new Address('"Minero Aoki" <aamine@loveruby.net>');
        breakDownTo(address, {
          displayName: "Minero Aoki",
          address: "aamine@loveruby.net",
          local: "aamine",
          domain: "loveruby.net",
          format: "Minero Aoki <aamine@loveruby.net>",
          comments: null,
          raw: '"Minero Aoki" <aamine@loveruby.net>',
        });
      });

      it("should handle |Minero Aoki<aamine@0246.loveruby.net>|", () => {
        const address = new Address("Minero Aoki<aamine@0246.loveruby.net>");
        breakDownTo(address, {
          displayName: "Minero Aoki",
          address: "aamine@0246.loveruby.net",
          local: "aamine",
          domain: "0246.loveruby.net",
          format: "Minero Aoki <aamine@0246.loveruby.net>",
          comments: null,
          raw: "Minero Aoki<aamine@0246.loveruby.net>",
        });
      });

      it("should handle lots of dots", () => {
        for (let times = 1; times <= 10; times++) {
          const dots = ".".repeat(times);
          const address = new Address(`hoge${dots}test@docomo.ne.jp`);
          breakDownTo(address, {
            displayName: null,
            address: `hoge${dots}test@docomo.ne.jp`,
            local: `hoge${dots}test`,
            domain: "docomo.ne.jp",
            format: `hoge${dots}test@docomo.ne.jp`,
            comments: null,
            raw: `hoge${dots}test@docomo.ne.jp`,
          });
        }
      });

      it("should handle trailing dots", () => {
        for (let times = 1; times <= 10; times++) {
          const dots = ".".repeat(times);
          const address = new Address(`hogetest${dots}@docomo.ne.jp`);
          breakDownTo(address, {
            displayName: null,
            address: `hogetest${dots}@docomo.ne.jp`,
            local: `hogetest${dots}`,
            domain: "docomo.ne.jp",
            format: `hogetest${dots}@docomo.ne.jp`,
            comments: null,
            raw: `hogetest${dots}@docomo.ne.jp`,
          });
        }
      });

      it('should handle |"Joe & J. Harvey" <ddd @Org>|', () => {
        const address = new Address('"Joe & J. Harvey" <ddd @Org>');
        breakDownTo(address, {
          name: "Joe & J. Harvey",
          displayName: "Joe & J. Harvey",
          address: "ddd@Org",
          domain: "Org",
          local: "ddd",
          format: '"Joe & J. Harvey" <ddd@Org>',
          comments: null,
          raw: '"Joe & J. Harvey" <ddd @Org>',
        });
      });

      it('should handle |"spickett@tiac.net" <Sean.Pickett@zork.tiac.net>|', () => {
        const address = new Address('"spickett@tiac.net" <Sean.Pickett@zork.tiac.net>');
        breakDownTo(address, {
          name: "spickett@tiac.net",
          displayName: "spickett@tiac.net",
          address: "Sean.Pickett@zork.tiac.net",
          domain: "zork.tiac.net",
          local: "Sean.Pickett",
          format: '"spickett@tiac.net" <Sean.Pickett@zork.tiac.net>',
          comments: null,
          raw: '"spickett@tiac.net" <Sean.Pickett@zork.tiac.net>',
        });
      });

      it("should handle |rls@intgp8.ih.att.com (-Schieve,R.L.)|", () => {
        const address = new Address("rls@intgp8.ih.att.com (-Schieve,R.L.)");
        breakDownTo(address, {
          name: "-Schieve,R.L.",
          displayName: null,
          address: "rls@intgp8.ih.att.com",
          comments: ["-Schieve,R.L."],
          domain: "intgp8.ih.att.com",
          local: "rls",
          format: "rls@intgp8.ih.att.com (-Schieve,R.L.)",
          raw: "rls@intgp8.ih.att.com (-Schieve,R.L.)",
        });
      });

      it("should handle |jrh%cup.portal.com@portal.unix.portal.com|", () => {
        const address = new Address("jrh%cup.portal.com@portal.unix.portal.com");
        breakDownTo(address, {
          name: null,
          displayName: null,
          address: "jrh%cup.portal.com@portal.unix.portal.com",
          comments: null,
          domain: "portal.unix.portal.com",
          local: "jrh%cup.portal.com",
          format: "jrh%cup.portal.com@portal.unix.portal.com",
          raw: "jrh%cup.portal.com@portal.unix.portal.com",
        });
      });
    });
  });
});
