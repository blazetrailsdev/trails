import { describe, expect, it } from "vitest";
import { ActiveStorage } from "@blazetrails/activestorage";
import { MockRequest } from "@blazetrails/rack";
import "../test-helper.ts";
import { constGet, TopLevel } from "@blazetrails/ruby-compat";
import type { UploadedScriptGuard as Guard } from "../../config/initializers/uploaded-script-guard.ts";

const UploadedScriptGuard = constGet(TopLevel, "UploadedScriptGuard") as typeof Guard;

// Every JavaScript MIME type essence in the MIME Sniffing Standard, plus
// parameters and casing a signed Disk URL might carry.
const SCRIPT_TYPES = [
  ...`application/ecmascript application/javascript application/x-ecmascript application/x-javascript
    text/ecmascript text/javascript text/javascript1.0 text/javascript1.1 text/javascript1.2 text/javascript1.3
    text/javascript1.4 text/javascript1.5 text/jscript text/livescript text/x-ecmascript text/x-javascript`.split(
    /\s+/,
  ),
  "Text/JavaScript; charset=utf-8",
];

async function servedType(type: string, path: string, method = "GET"): Promise<unknown> {
  const app = async () => [200, { "content-type": type }, [""]];
  const [, headers] = await new UploadedScriptGuard(app as never).call(
    MockRequest.envFor(path, { ":method": method }),
  );
  return headers["content-type"];
}

describe("UploadedScriptGuardTest", () => {
  it("uploads never leave with a script type, whatever the URL says", async () => {
    for (const type of SCRIPT_TYPES) {
      expect(await servedType(type, `${ActiveStorage.routesPrefix}/disk/key/probe.js`), type).toBe(
        ActiveStorage.binaryContentType,
      );
    }
  });

  it("media and downloads keep their type", async () => {
    for (const type of ["image/png", "video/mp4", "audio/mpeg", "application/pdf", "text/plain"]) {
      expect(await servedType(type, `${ActiveStorage.routesPrefix}/disk/key/file`), type).toBe(
        type,
      );
    }
  });

  it("multi-range responses keep their boundary", async () => {
    const type = "multipart/byteranges; boundary=AaB03x";
    expect(await servedType(type, `${ActiveStorage.routesPrefix}/blobs/proxy/key/movie.mp4`)).toBe(
      type,
    );
  });

  it("direct upload responses keep their JSON type", async () => {
    expect(
      await servedType("application/json", `${ActiveStorage.routesPrefix}/direct_uploads`, "POST"),
    ).toBe("application/json");
  });

  it("application responses outside uploads are untouched", async () => {
    expect(await servedType("text/javascript", "/assets/application-abc123.js")).toBe(
      "text/javascript",
    );
  });
});
