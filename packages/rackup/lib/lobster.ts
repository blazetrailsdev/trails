import {
  CONTENT_LENGTH,
  CONTENT_TYPE,
  QUERY_STRING,
  Request,
  Response,
  type RackEnv,
  type RackResponse,
} from "@blazetrails/rack";
import { RuntimeError, unpack, Zlib } from "@blazetrails/ruby-compat";

export class Lobster {
  static LobsterString = String.fromCharCode(
    ...Zlib.Inflate.inflate(
      unpack(
        `eJx9kEEOwyAMBO99xd7MAcytUhPlJyj2
    P6jy9i4k9EQyGAnBarEXeCBqSkntNXsi/ZCvC48zGQoZKikGrFMZvgS5ZHd+aGWVuWwhVF0
    t1drVmiR42HcWNz5w3QanT+2gIvTVCiE1lm1Y0eU4JGmIIbaKwextKn8rvW+p5PIwFl8ZWJ
    I8jyiTlhTcYXkekJAzTyYN6E08A+dk8voBkAVTJQ==`.replace(/[\n ]/g, ""),
        "m*",
      )[0] as Uint8Array,
    ),
  );

  static LambdaLobster = async (env: RackEnv): Promise<RackResponse> => {
    let lobster: string;
    let href: string;
    if ((env[QUERY_STRING] as string).includes("flip")) {
      lobster = Lobster.LobsterString.split("\n")
        .map((line) => [...line.padEnd(42)].reverse().join(""))
        .join("\n");
      href = "?";
    } else {
      lobster = Lobster.LobsterString;
      href = "?flip";
    }

    const content = [
      "<title>Lobstericious!</title>",
      "<pre>",
      lobster,
      "</pre>",
      `<a href='${href}'>flip!</a>`,
    ];
    const length = content.reduce((a, e) => a + e.length, 0).toString();
    return [200, { [CONTENT_TYPE]: "text/html", [CONTENT_LENGTH]: length }, content];
  };

  async call(env: RackEnv): Promise<RackResponse> {
    const req = new Request(env);
    let lobster: string;
    let href: string;
    if (req.GET["flip"] === "left") {
      lobster = Lobster.LobsterString.split("\n")
        .map((line) =>
          [...line.padEnd(42)]
            .reverse()
            .join("")
            .replaceAll("\\", "TEMP")
            .replaceAll("/", "\\")
            .replaceAll("TEMP", "/")
            .replaceAll("{", "}")
            .replaceAll("(", ")"),
        )
        .join("\n");
      href = "?flip=right";
    } else if (req.GET["flip"] === "crash") {
      throw new RuntimeError("Lobster crashed");
    } else {
      lobster = Lobster.LobsterString;
      href = "?flip=left";
    }

    const res = new Response();
    res.write("<title>Lobstericious!</title>");
    res.write("<pre>");
    res.write(lobster);
    res.write("</pre>");
    res.write(`<p><a href='${href}'>flip!</a></p>`);
    res.write("<p><a href='?flip=crash'>crash!</a></p>");
    return res.finish();
  }
}
