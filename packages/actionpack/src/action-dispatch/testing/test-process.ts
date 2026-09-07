import { File, NoMethodError } from "@blazetrails/ruby-compat";

export { NoMethodError };

import { CookieJar, type CookieJarOptions } from "../middleware/cookies.js";
import type { FlashHash } from "../middleware/flash.js";
import { UploadedFile } from "@blazetrails/rack-test";

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
  if (this.constructor.fileFixturePath != null && !File.isExist(path)) {
    path = this.fileFixture!(path);
  }

  return new UploadedFile(path, mimeType ?? null, binary);
}

export const fixtureFileUpload = fileFixtureUpload;

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
