import { File } from "@blazetrails/ruby-compat";

import { CookieJar, type CookieJarOptions } from "../middleware/cookies.js";
import type { FlashHash } from "../middleware/flash.js";
import { UploadedFile } from "../http/upload.js";

/** @internal */
export interface TestProcessRequest {
  session: Record<string, unknown>;
  flash: FlashHash;
  cookies: Record<string, string>;
  cookiesAppOptions?: CookieJarOptions;
}

/** @internal */
export interface TestProcessResponse {
  redirectUrl?: string;
}

/** @internal */
export interface TestProcessHost {
  request: TestProcessRequest;
  response: TestProcessResponse;
  _cookieJar?: CookieJar;
  fileFixture?(path: string): string;
  fileFixturePath?: string | null;
  constructor: {
    fileFixturePath?: string | null;
  };
}

export function fileFixtureUpload(
  this: TestProcessHost,
  path: string,
  mimeType?: string | null,
  binary: boolean = false,
): UploadedFile {
  const fixturePath = this.fileFixturePath ?? this.constructor.fileFixturePath;
  let resolved = path;
  if (fixturePath && !File.isExist(path)) {
    if (!this.fileFixture) {
      throw new Error(
        "TestProcess#fileFixtureUpload: host does not implement fileFixture(); include ActiveSupport::Testing::FileFixtures.",
      );
    }
    resolved = this.fileFixture(path);
  }
  return new UploadedFile({
    filename: File.basename(resolved),
    type: mimeType ?? undefined,
    tempfile: resolved,
    head: binary ? "Content-Transfer-Encoding: binary" : undefined,
  });
}

export const fixtureFileUpload = fileFixtureUpload;

export class NoMethodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoMethodError";
  }
}

export function assigns(this: TestProcessHost, _key?: string | symbol): never {
  throw new NoMethodError(
    'assigns has been extracted to a gem. To continue using it, add `gem "rails-controller-testing"` to your Gemfile.',
  );
}

export function session(this: TestProcessHost): Record<string, unknown> {
  return this.request.session;
}

export function flash(this: TestProcessHost): FlashHash {
  return this.request.flash;
}

export function cookies(this: TestProcessHost): CookieJar {
  if (!this._cookieJar) {
    this._cookieJar = CookieJar.build(this.request, this.request.cookies);
  }
  return this._cookieJar;
}

export function redirectToUrl(this: TestProcessHost): string | undefined {
  return this.response.redirectUrl;
}

export const TestProcess = {
  fileFixtureUpload,
  fixtureFileUpload,
  assigns,
  session,
  flash,
  cookies,
  redirectToUrl,
};

export const FixtureFile = {
  fileFixtureUpload,
  fixtureFileUpload,
};
