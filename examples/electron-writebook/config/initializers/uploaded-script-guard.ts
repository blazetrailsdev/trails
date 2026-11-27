import { ActiveStorage } from "@blazetrails/activestorage";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { constSet, rbProcCall, TopLevel } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

// Uploaded files are served from this origin, so under script-src 'self' an
// upload served with any JavaScript MIME type would run as one of our scripts.
// Browsers accept sixteen spellings of that type, and Disk URLs sign the type
// they were minted with, so a list of types to refuse can't cover old links.
// Instead, anything Active Storage serves that isn't plainly media goes out as
// a download, whatever its URL says. A multi-range response keeps its
// multipart/byteranges type and boundary, which no browser runs as a script.
// Only reads are touched: uploading (direct upload JSON, Disk PUT) answers in
// its own types.
export class UploadedScriptGuard {
  static readonly SERVABLE =
    /^(image|video|audio)\/|^(application\/pdf|application\/octet-stream|text\/plain|multipart\/byteranges)$/;

  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const [status, headers, body] = (await rbProcCall(this.app, env)) as RackResponse;

    const type = headers["content-type"] as string | undefined;
    if (
      ["GET", "HEAD"].includes(env["REQUEST_METHOD"] as string) &&
      (env["PATH_INFO"] as string).startsWith(`${ActiveStorage.routesPrefix}/`) &&
      type != null
    ) {
      if (!UploadedScriptGuard.SERVABLE.test(type.split(";")[0].trim().toLowerCase())) {
        headers["content-type"] = ActiveStorage.binaryContentType;
      }
    }

    return [status, headers, body];
  }
}

constSet(TopLevel, "UploadedScriptGuard", UploadedScriptGuard);

Trails.application.config.middleware.use(UploadedScriptGuard);
