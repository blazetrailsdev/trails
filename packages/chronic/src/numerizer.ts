import { StringScanner } from "@blazetrails/ruby-compat";
import { Chronic } from "./namespaces.js";

export class Numerizer {
  static DIRECT_NUMS: [string, string][] = [
    ["eleven", "11"],
    ["twelve", "12"],
    ["thirteen", "13"],
    ["fourteen", "14"],
    ["fifteen", "15"],
    ["sixteen", "16"],
    ["seventeen", "17"],
    ["eighteen", "18"],
    ["nineteen", "19"],
    ["ninteen", "19"],
    ["zero", "0"],
    ["one", "1"],
    ["two", "2"],
    ["three", "3"],
    ["four(\\W|$)", "4$1"],
    ["five", "5"],
    ["six(\\W|$)", "6$1"],
    ["seven(\\W|$)", "7$1"],
    ["eight(\\W|$)", "8$1"],
    ["nine(\\W|$)", "9$1"],
    ["ten", "10"],
    ["\\ba[\\b^$]", "1"],
  ];

  static ORDINALS: [string, string][] = [
    ["first", "1"],
    ["third", "3"],
    ["fourth", "4"],
    ["fifth", "5"],
    ["sixth", "6"],
    ["seventh", "7"],
    ["eighth", "8"],
    ["ninth", "9"],
    ["tenth", "10"],
    ["twelfth", "12"],
    ["twentieth", "20"],
    ["thirtieth", "30"],
    ["fourtieth", "40"],
    ["fiftieth", "50"],
    ["sixtieth", "60"],
    ["seventieth", "70"],
    ["eightieth", "80"],
    ["ninetieth", "90"],
  ];

  static TEN_PREFIXES: [string, number][] = [
    ["twenty", 20],
    ["thirty", 30],
    ["forty", 40],
    ["fourty", 40],
    ["fifty", 50],
    ["sixty", 60],
    ["seventy", 70],
    ["eighty", 80],
    ["ninety", 90],
  ];

  static BIG_PREFIXES: [string, number][] = [
    ["hundred", 100],
    ["thousand", 1000],
    ["million", 1_000_000],
    ["billion", 1_000_000_000],
    ["trillion", 1_000_000_000_000],
  ];

  static numerize(string: string): string {
    string = string.replace(/ +|([^\d])-([^\d])/g, (_m, a = "", b = "") => `${a} ${b}`);
    string = string.replace(/a half/g, "haAlf");

    for (const dn of Numerizer.DIRECT_NUMS) {
      string = string.replace(new RegExp(dn[0], "gim"), "<num>" + dn[1]);
    }

    for (const on of Numerizer.ORDINALS) {
      string = string.replace(new RegExp(on[0], "gim"), "<num>" + on[1] + on[0].slice(-2));
    }

    for (const tp of Numerizer.TEN_PREFIXES) {
      string = string.replace(
        new RegExp(`(?:${tp[0]}) *<num>(\\d(?=[^\\d]|$))*`, "gim"),
        (_m, d1: string | undefined) =>
          "<num>" + String(tp[1] + (d1 == null ? 0 : parseInt(d1, 10))),
      );
    }

    for (const tp of Numerizer.TEN_PREFIXES) {
      string = string.replace(new RegExp(tp[0], "gim"), () => "<num>" + String(tp[1]));
    }

    for (const bp of Numerizer.BIG_PREFIXES) {
      string = string.replace(new RegExp(`(?:<num>)?(\\d*) *${bp[0]}`, "gim"), (_m, d1: string) =>
        d1.length === 0 ? String(bp[1]) : "<num>" + String(bp[1] * parseInt(d1, 10)),
      );
      string = Numerizer.andition(string);
    }

    string = string.replace(/(\d+)(?: | and |-)*haAlf/gi, (_m, d1: string) =>
      String(parseFloat(d1) + 0.5),
    );

    return string.replace(/<num>/g, "");
  }

  /** @internal */
  private static andition(string: string): string {
    const sc = new StringScanner(string);

    while (sc.scanUntil(/<num>(\d+)( | and )<num>(\d+)(?=[^\w]|$)/im)) {
      if (/and/.test(sc.get(2)!) || sc.get(1)!.length > sc.get(3)!.length) {
        const from = sc.pos - sc.matchedSize()!;
        string =
          string.slice(0, from) +
          "<num>" +
          String(parseInt(sc.get(1)!, 10) + parseInt(sc.get(3)!, 10)) +
          string.slice(sc.pos);
        sc.string = string;
        sc.reset();
      }
    }
    return string;
  }
}

Chronic.Numerizer = Numerizer;
