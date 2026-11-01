import { describe, expect, it } from "vitest";
import { AddressListsParser } from "../parsers/address-lists-parser.js";
import { Address } from "./address.js";

function breakDownTo(target: Address, expected: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(expected)) {
    const member = (target as unknown as Record<string, unknown>)[k];
    const actual = typeof member === "function" ? member.call(target) : member;
    expect(actual).toEqual(v);
  }
}

describe("Mail::Address", () => {
  describe("functionality", () => {
    it("should allow us to instantiate an empty address object and call inspect", () => {
      expect(() => {
        new Address().inspect();
      }).not.toThrow();
    });

    it("should allow us to instantiate an empty address object and call to_s", () => {
      expect(new Address().toString()).toEqual("");
    });

    it("should allow us to instantiate an empty address object and call format", () => {
      expect(new Address().format()).toEqual("");
    });

    it("should allow us to instantiate an empty address object and call address", () => {
      for (const input of [null, "", " "]) {
        expect(new Address(input).address()).toBeNull();
      }
    });

    it("should allow us to instantiate an empty address object and call local", () => {
      for (const input of [null, "", " "]) {
        expect(new Address(input).local()).toBeNull();
      }
    });

    it("should allow us to instantiate an empty address object and call domain", () => {
      for (const input of [null, "", " "]) {
        expect(new Address(input).domain()).toBeNull();
      }
    });

    it("should allow us to instantiate an empty address object and call name", () => {
      for (const input of [null, "", " "]) {
        expect(new Address(input).name).toBeNull();
      }
    });

    for (const spammyAddress of ['"-Earnings...Notification-" <vodacom.co.rs>', "<56253817>"]) {
      it(`should ignore funky local-only spammy addresses in angle brackets ${spammyAddress}`, () => {
        expect(new Address(spammyAddress).address()).toBeNull();
      });
    }

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
        for (const [words, ok] of [
          ["aamine", "aamine"],
          ['"Minero Aoki"', '"Minero Aoki"'],
          ['"!@#$%^&*()"', '"!@#$%^&*()"'],
          ["a.b.c", "a.b.c"],
        ]) {
          const a = new Address(words);
          expect(a.local()).toEqual(ok);
        }
      });

      it("should handle all OK domains", () => {
        for (const [words, ok] of [
          ["loveruby.net", "loveruby.net"],
          ['"love ruby".net', '"love ruby".net'],
          ['a."love ruby".net', 'a."love ruby".net'],
          ['"!@#$%^&*()"', '"!@#$%^&*()"'],
          ["[192.168.1.1]", "[192.168.1.1]"],
        ]) {
          const a = new Address(`me@${words}`);
          expect(a.domain()).toEqual(ok);
        }
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
      it("should handle |astrachan@austlcm.sps.mot.com ('paul astrachan/xvt3')|", () => {
        const address = new Address("astrachan@austlcm.sps.mot.com ('paul astrachan/xvt3')");
        breakDownTo(address, {
          name: "'paul astrachan/xvt3'",
          displayName: null,
          address: "astrachan@austlcm.sps.mot.com",
          comments: ["'paul astrachan/xvt3'"],
          domain: "austlcm.sps.mot.com",
          local: "astrachan",
          format: "astrachan@austlcm.sps.mot.com ('paul astrachan/xvt3')",
          raw: "astrachan@austlcm.sps.mot.com ('paul astrachan/xvt3')",
        });
      });
      it("should handle 'TWINE57%SDELVB.decnet@SNYBUF.CS.SNYBUF.EDU (JAMES R. TWINE - THE NERD)'", () => {
        const address = new Address(
          "TWINE57%SDELVB.decnet@SNYBUF.CS.SNYBUF.EDU (JAMES R. TWINE - THE NERD)",
        );
        breakDownTo(address, {
          name: "JAMES R. TWINE - THE NERD",
          displayName: null,
          address: "TWINE57%SDELVB.decnet@SNYBUF.CS.SNYBUF.EDU",
          comments: ["JAMES R. TWINE - THE NERD"],
          domain: "SNYBUF.CS.SNYBUF.EDU",
          local: "TWINE57%SDELVB.decnet",
          format: "TWINE57%SDELVB.decnet@SNYBUF.CS.SNYBUF.EDU (JAMES R. TWINE - THE NERD)",
          raw: "TWINE57%SDELVB.decnet@SNYBUF.CS.SNYBUF.EDU (JAMES R. TWINE - THE NERD)",
        });
      });
      it("should be able to handle 'David Apfelbaum <da0g+@andrew.cmu.edu>'", () => {
        const address = new Address("David Apfelbaum <da0g+@andrew.cmu.edu>");
        breakDownTo(address, {
          name: "David Apfelbaum",
          displayName: "David Apfelbaum",
          address: "da0g+@andrew.cmu.edu",
          comments: null,
          domain: "andrew.cmu.edu",
          local: "da0g+",
          format: "David Apfelbaum <da0g+@andrew.cmu.edu>",
          raw: "David Apfelbaum <da0g+@andrew.cmu.edu>",
        });
      });
      it('should handle |"JAMES R. TWINE - THE NERD" <TWINE57%SDELVB%SNYDELVA.bitnet@CUNYVM.CUNY.EDU>|', () => {
        const address = new Address(
          '"JAMES R. TWINE - THE NERD" <TWINE57%SDELVB%SNYDELVA.bitnet@CUNYVM.CUNY.EDU>',
        );
        breakDownTo(address, {
          name: "JAMES R. TWINE - THE NERD",
          displayName: "JAMES R. TWINE - THE NERD",
          address: "TWINE57%SDELVB%SNYDELVA.bitnet@CUNYVM.CUNY.EDU",
          comments: null,
          domain: "CUNYVM.CUNY.EDU",
          local: "TWINE57%SDELVB%SNYDELVA.bitnet",
          format: '"JAMES R. TWINE - THE NERD" <TWINE57%SDELVB%SNYDELVA.bitnet@CUNYVM.CUNY.EDU>',
          raw: '"JAMES R. TWINE - THE NERD" <TWINE57%SDELVB%SNYDELVA.bitnet@CUNYVM.CUNY.EDU>',
        });
      });
      it("should handle '/G=Owen/S=Smith/O=SJ-Research/ADMD=INTERSPAN/C=GB/@mhs-relay.ac.uk'", () => {
        const address = new Address(
          "/G=Owen/S=Smith/O=SJ-Research/ADMD=INTERSPAN/C=GB/@mhs-relay.ac.uk",
        );
        breakDownTo(address, {
          name: null,
          displayName: null,
          address: "/G=Owen/S=Smith/O=SJ-Research/ADMD=INTERSPAN/C=GB/@mhs-relay.ac.uk",
          comments: null,
          domain: "mhs-relay.ac.uk",
          local: "/G=Owen/S=Smith/O=SJ-Research/ADMD=INTERSPAN/C=GB/",
          format: "/G=Owen/S=Smith/O=SJ-Research/ADMD=INTERSPAN/C=GB/@mhs-relay.ac.uk",
          raw: "/G=Owen/S=Smith/O=SJ-Research/ADMD=INTERSPAN/C=GB/@mhs-relay.ac.uk",
        });
      });
      it('should handle |"Stephen Burke, Liverpool" <BURKE@vxdsya.desy.de>|', () => {
        const address = new Address('"Stephen Burke, Liverpool" <BURKE@vxdsya.desy.de>');
        breakDownTo(address, {
          name: "Stephen Burke, Liverpool",
          displayName: "Stephen Burke, Liverpool",
          address: "BURKE@vxdsya.desy.de",
          comments: null,
          domain: "vxdsya.desy.de",
          local: "BURKE",
          format: '"Stephen Burke, Liverpool" <BURKE@vxdsya.desy.de>',
          raw: '"Stephen Burke, Liverpool" <BURKE@vxdsya.desy.de>',
        });
      });
      it("should handle 'The Newcastle Info-Server <info-admin@newcastle.ac.uk>'", () => {
        const address = new Address("The Newcastle Info-Server <info-admin@newcastle.ac.uk>");
        breakDownTo(address, {
          name: "The Newcastle Info-Server",
          displayName: "The Newcastle Info-Server",
          address: "info-admin@newcastle.ac.uk",
          comments: null,
          domain: "newcastle.ac.uk",
          local: "info-admin",
          format: "The Newcastle Info-Server <info-admin@newcastle.ac.uk>",
          raw: "The Newcastle Info-Server <info-admin@newcastle.ac.uk>",
        });
      });
      it("should handle 'Suba.Peddada@eng.sun.com (Suba Peddada [CONTRACTOR])'", () => {
        const address = new Address("Suba.Peddada@eng.sun.com (Suba Peddada [CONTRACTOR])");
        breakDownTo(address, {
          name: "Suba Peddada [CONTRACTOR]",
          displayName: null,
          address: "Suba.Peddada@eng.sun.com",
          comments: ["Suba Peddada [CONTRACTOR]"],
          domain: "eng.sun.com",
          local: "Suba.Peddada",
          format: "Suba.Peddada@eng.sun.com (Suba Peddada [CONTRACTOR])",
          raw: "Suba.Peddada@eng.sun.com (Suba Peddada [CONTRACTOR])",
        });
      });
      it("should handle 'Paul Manser (0032 memo) <a906187@tiuk.ti.com>'", () => {
        const address = new Address("Paul Manser (0032 memo) <a906187@tiuk.ti.com>");
        breakDownTo(address, {
          name: "Paul Manser",
          displayName: "Paul Manser",
          address: "a906187@tiuk.ti.com",
          comments: ["0032 memo"],
          domain: "tiuk.ti.com",
          local: "a906187",
          format: "Paul Manser <a906187@tiuk.ti.com> (0032 memo)",
          raw: "Paul Manser (0032 memo) <a906187@tiuk.ti.com>",
        });
      });
      it('should handle |"gregg (g.) woodcock" <woodcock@bnr.ca>|', () => {
        const address = new Address('"gregg (g.) woodcock" <woodcock@bnr.ca>');
        breakDownTo(address, {
          name: "gregg (g.) woodcock",
          displayName: "gregg (g.) woodcock",
          address: "woodcock@bnr.ca",
          comments: null,
          domain: "bnr.ca",
          local: "woodcock",
          format: '"gregg (g.) woodcock" <woodcock@bnr.ca>',
          raw: '"gregg (g.) woodcock" <woodcock@bnr.ca>',
        });
      });
      it("should handle |Graham.Barr@tiuk.ti.com|", () => {
        const address = new Address("Graham.Barr@tiuk.ti.com");
        breakDownTo(address, {
          name: null,
          displayName: null,
          address: "Graham.Barr@tiuk.ti.com",
          comments: null,
          domain: "tiuk.ti.com",
          local: "Graham.Barr",
          format: "Graham.Barr@tiuk.ti.com",
          raw: "Graham.Barr@tiuk.ti.com",
        });
      });
      it("should handle |a909937 (Graham Barr          (0004 bodg))|", () => {
        const address = new Address("a909937 (Graham Barr          (0004 bodg))");
        breakDownTo(address, {
          name: "Graham Barr (0004 bodg)",
          displayName: null,
          address: "a909937",
          comments: ["Graham Barr (0004 bodg)"],
          domain: null,
          local: "a909937",
          format: "a909937 (Graham Barr \\(0004 bodg\\))",
          raw: "a909937 (Graham Barr          (0004 bodg))",
        });
      });
      it("should handle |david d `zoo' zuhn <zoo@aggregate.com>|", () => {
        const address = new Address("david d `zoo' zuhn <zoo@aggregate.com>");
        breakDownTo(address, {
          name: "david d `zoo' zuhn",
          displayName: "david d `zoo' zuhn",
          address: "zoo@aggregate.com",
          comments: null,
          domain: "aggregate.com",
          local: "zoo",
          format: "david d `zoo' zuhn <zoo@aggregate.com>",
          raw: "david d `zoo' zuhn <zoo@aggregate.com>",
        });
      });
      it("should handle |(foo@bar.com (foobar), ned@foo.com (nedfoo) ) <kevin@goess.org>|", () => {
        const address = new Address(
          "(foo@bar.com (foobar), ned@foo.com (nedfoo) ) <kevin@goess.org>",
        );
        breakDownTo(address, {
          name: "foo@bar.com \\(foobar\\), ned@foo.com \\(nedfoo\\) ",
          displayName: "(foo@bar.com \\(foobar\\), ned@foo.com \\(nedfoo\\) )",
          address: "kevin@goess.org",
          comments: ["foo@bar.com (foobar), ned@foo.com (nedfoo) "],
          domain: "goess.org",
          local: "kevin",
          format:
            '"(foo@bar.com \\\\(foobar\\\\), ned@foo.com \\\\(nedfoo\\\\) )" <kevin@goess.org> (foo@bar.com \\(foobar\\), ned@foo.com \\(nedfoo\\) )',
          raw: "(foo@bar.com (foobar), ned@foo.com (nedfoo) ) <kevin@goess.org>",
        });
      });
      it("should handle |Pete(A wonderful ) chap) <pete(his account)@silly.test(his host)>|", () => {
        const address = new Address(
          "Pete(A wonderful \\) chap) <pete(his account)@silly.test(his host)>",
        );
        breakDownTo(address, {
          name: "Pete",
          displayName: "Pete",
          address: "pete(his account)@silly.test",
          comments: ["A wonderful \\) chap", "his account", "his host"],
          domain: "silly.test",
          local: "pete(his account)",
          format: "Pete <pete(his account)@silly.test> (A wonderful \\) chap his account his host)",
          raw: "Pete(A wonderful \\) chap) <pete(his account)@silly.test(his host)>",
        });
      });
      it("should handle |Joe Q. Public <john.q.public@example.com>|", () => {
        const address = new Address("Joe Q. Public <john.q.public@example.com>");
        breakDownTo(address, {
          name: "Joe Q. Public",
          displayName: "Joe Q. Public",
          address: "john.q.public@example.com",
          comments: null,
          domain: "example.com",
          local: "john.q.public",
          format: '"Joe Q. Public" <john.q.public@example.com>',
          raw: "Joe Q. Public <john.q.public@example.com>",
        });
      });
      it("should handle |Mary Smith <@machine.tld:mary@example.net>|", () => {
        const address = new Address("Mary Smith <@machine.tld:mary@example.net>");
        breakDownTo(address, {
          name: "Mary Smith",
          displayName: "Mary Smith",
          address: "@machine.tld:mary@example.net",
          comments: null,
          domain: "example.net",
          local: "@machine.tld:mary",
          format: "Mary Smith <@machine.tld:mary@example.net>",
          raw: "Mary Smith <@machine.tld:mary@example.net>",
        });
      });
      it("should handle |jdoe@test   . example|", () => {
        const address = new Address("jdoe@test   . example");
        breakDownTo(address, {
          name: null,
          displayName: null,
          address: "jdoe@test   . example",
          comments: null,
          domain: "test   . example",
          local: "jdoe",
          format: "jdoe@test   . example",
          raw: "jdoe@test   . example",
        });
      });
      it("should handle |groupname+domain.com@example.com|", () => {
        const address = new Address("groupname+domain.com@example.com");
        breakDownTo(address, {
          name: null,
          displayName: null,
          address: "groupname+domain.com@example.com",
          comments: null,
          domain: "example.com",
          local: "groupname+domain.com",
          format: "groupname+domain.com@example.com",
          raw: "groupname+domain.com@example.com",
        });
      });
      it("should handle |=?UTF-8?B?8J+RjQ==?= <=?UTF-8?B?8J+RjQ==?=@=?UTF-8?B?8J+RjQ==?=.emoji>|", () => {
        const address = new Address(
          "=?UTF-8?B?8J+RjQ==?= <=?UTF-8?B?8J+RjQ==?=@=?UTF-8?B?8J+RjQ==?=.emoji>",
        );
        breakDownTo(address, {
          name: "👍",
          displayName: "👍",
          address: "👍@👍.emoji",
          comments: null,
          domain: "👍.emoji",
          local: "👍",
          format: '"👍" <👍@👍.emoji>',
          raw: "=?UTF-8?B?8J+RjQ==?= <=?UTF-8?B?8J+RjQ==?=@=?UTF-8?B?8J+RjQ==?=.emoji>",
        });
      });
      it('should handle |"Mikel \\"quotes\\" Lindsaar" <test@lindsaar.net>|', () => {
        const address = new Address('"Mikel \\"quotes\\" Lindsaar" <test@lindsaar.net>');
        breakDownTo(address, {
          name: 'Mikel "quotes" Lindsaar',
          displayName: 'Mikel "quotes" Lindsaar',
          address: "test@lindsaar.net",
          comments: null,
          domain: "lindsaar.net",
          local: "test",
          format: '"Mikel \\"quotes\\" Lindsaar" <test@lindsaar.net>',
          raw: '"Mikel \\"quotes\\" Lindsaar" <test@lindsaar.net>',
        });
      });
      it('should handle |"Mikel \\" Lindsaar" <test@lindsaar.net>|', () => {
        const address = new Address('"Mikel \\" Lindsaar" <test@lindsaar.net>');
        breakDownTo(address, {
          name: 'Mikel " Lindsaar',
          displayName: 'Mikel " Lindsaar',
          address: "test@lindsaar.net",
          comments: null,
          domain: "lindsaar.net",
          local: "test",
          format: '"Mikel \\" Lindsaar" <test@lindsaar.net>',
          raw: '"Mikel \\" Lindsaar" <test@lindsaar.net>',
        });
      });
      it('should handle |"Mikel \\"quotes\\" (and comments) Lindsaar" (comment1)<test(comment2)@lindsaar.net(comment3)>|', () => {
        const address = new Address(
          '"Mikel \\"quotes\\" (and comments) Lindsaar" (comment1)<test(comment2)@lindsaar.net(comment3)>',
        );
        breakDownTo(address, {
          name: 'Mikel "quotes" (and comments) Lindsaar',
          displayName: 'Mikel "quotes" (and comments) Lindsaar',
          address: "test(comment2)@lindsaar.net",
          comments: ["comment1", "comment2", "comment3"],
          domain: "lindsaar.net",
          local: "test(comment2)",
          format:
            '"Mikel \\"quotes\\" (and comments) Lindsaar" <test(comment2)@lindsaar.net> (comment1 comment2 comment3)',
          raw: '"Mikel \\"quotes\\" (and comments) Lindsaar" (comment1)<test(comment2)@lindsaar.net(comment3)>',
        });
      });
      it("should expose group", () => {
        const struct = new AddressListsParser.AddressStruct(
          null,
          null,
          null,
          null,
          null,
          null,
          "GROUP",
          null,
        );
        const address = new Address(struct);
        expect(address.group).toEqual("GROUP");
      });
      it("should have no group by default", () => {
        expect(new Address(null).group).toEqual(null);
      });
    });
  });

  describe("creating", () => {
    describe("parts of an address", () => {
      it("should add an address", () => {
        const address = new Address();
        address.setAddress("mikel@test.lindsaar.net");
        breakDownTo(address, { address: "mikel@test.lindsaar.net" });
      });

      it("should add a display name", () => {
        const address = new Address();
        address.setDisplayName("Mikel Lindsaar");
        expect(address.displayName()).toEqual("Mikel Lindsaar");
      });
    });
  });

  describe("modifying an address", () => {
    it("should add an address", () => {
      const address = new Address();
      address.setAddress("mikel@test.lindsaar.net");
      breakDownTo(address, { address: "mikel@test.lindsaar.net" });
    });

    it("should add a display name", () => {
      const address = new Address();
      address.setDisplayName("Mikel Lindsaar");
      expect(address.displayName()).toEqual("Mikel Lindsaar");
    });

    it("should take an address and a display name and join them", () => {
      const address = new Address();
      address.setAddress("mikel@test.lindsaar.net");
      address.setDisplayName("Mikel Lindsaar");
      expect(address.format()).toEqual("Mikel Lindsaar <mikel@test.lindsaar.net>");
    });

    it("should take a display name and an address and join them", () => {
      const address = new Address();
      address.setDisplayName("Mikel Lindsaar");
      address.setAddress("mikel@test.lindsaar.net");
      expect(address.format()).toEqual("Mikel Lindsaar <mikel@test.lindsaar.net>");
    });
  });

  describe("providing encoded and decoded outputs", () => {
    it("should provide an encoded output", () => {
      const address = new Address();
      address.setDisplayName("Mikel Lindsaar");
      address.setAddress("mikel@test.lindsaar.net");
      expect(address.encoded).toEqual("Mikel Lindsaar <mikel@test.lindsaar.net>");
    });

    it("should provide an encoded output for non us-ascii", () => {
      const address = new Address();
      address.setDisplayName("まける");
      address.setAddress("mikel@test.lindsaar.net");
      expect(address.encoded).toEqual("=?UTF-8?B?44G+44GR44KL?= <mikel@test.lindsaar.net>");
    });

    it("should provide an encoded output for non us-ascii", () => {
      const address = new Address();
      address.setDisplayName("まける");
      address.setAddress("mikel@test.lindsaar.net");
      expect(address.decoded).toEqual('"まける" <mikel@test.lindsaar.net>');
    });
  });
});
