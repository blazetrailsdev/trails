import { Minitest, presence } from "@blazetrails/activesupport";
import {
  Encoding,
  File,
  getFs,
  Module,
  Pathname,
  rbModMethodDefined,
} from "@blazetrails/ruby-compat";
import { vite } from "../server.js";

declare module "vitest" {
  export interface ProvidedContext {
    screenshotDirectory?: string;
  }
}

export interface ScreenshotPage {
  screenshot(options: { path: string }): Promise<Buffer>;
  content(): Promise<string>;
}

export interface ScreenshotHelperHost {
  _page?: ScreenshotPage;
  methodName: string;
  isPassed(): boolean;
  isSkipped(): boolean;
  _screenshotCounter?: number;
  metadata: Record<string, unknown>;
}

export const ScreenshotHelper = Object.assign(new Module(), {
  /** @noRailsEquivalent PERMANENT */
  screenshotDirectory: undefined as string | undefined,
});

function env(key: string): string | undefined {
  return (globalThis as any).process?.env?.[key] as string | undefined;
}

function projectRoot(): string {
  return (globalThis as any).process?.cwd?.() ?? ".";
}

export function takeScreenshot(
  this: ScreenshotHelperHost,
  { html = false, screenshot = null }: { html?: boolean; screenshot?: string | null } = {},
): Promise<void> {
  const showingHtml = html || htmlFromEnv();
  incrementUnique.call(this);
  return (showingHtml ? saveHtml.call(this) : Promise.resolve())
    .then(() => saveImage.call(this))
    .then(() => show(displayImage.call(this, { html: showingHtml, screenshotOutput: screenshot })));
}

export async function takeFailedScreenshot(this: ScreenshotHelperHost): Promise<void> {
  if (!(failed.call(this) && supportsScreenshot.call(this) && this._page !== undefined)) return;
  await takeScreenshot.call(this);
  if (rbModMethodDefined(Minitest.Test, "metadata"))
    this.metadata["failure_screenshot_path"] = relativeImagePath.call(this);
}

/** @internal */
function htmlFromEnv(): boolean {
  return env("RAILS_SYSTEM_TESTING_SCREENSHOT_HTML") === "1";
}

/** @internal */
export function _screenshotCounter(this: ScreenshotHelperHost): number | undefined {
  return this._screenshotCounter;
}

/** @internal */
export function incrementUnique(this: ScreenshotHelperHost): void {
  this._screenshotCounter = (this._screenshotCounter ?? 0) + 1;
}

/** @internal */
export function unique(this: ScreenshotHelperHost): string {
  return failed.call(this) ? "failures" : String(this._screenshotCounter ?? 0);
}

/** @internal */
export function imageName(this: ScreenshotHelperHost): string {
  const sanitized = this.methodName.replace(/[^\w]+/g, "-");
  const name = `${unique.call(this)}_${sanitized}`;
  return name.slice(0, 225);
}

/** @internal */
export function imagePath(this: ScreenshotHelperHost): string {
  return absoluteImagePath.call(this);
}

/** @internal */
export function htmlPath(this: ScreenshotHelperHost): string {
  return absoluteHtmlPath.call(this);
}

/** @internal */
export function screenshotsDir(): string {
  return presence(ScreenshotHelper.screenshotDirectory) || "tmp/screenshots";
}

/** @internal */
function absolutePath(this: ScreenshotHelperHost): string {
  return new Pathname(projectRoot()).join(screenshotsDir(), imageName.call(this)).toString();
}

/** @internal */
function absoluteImagePath(this: ScreenshotHelperHost): string {
  return `${absolutePath.call(this)}.png`;
}

/** @internal */
function relativeImagePath(this: ScreenshotHelperHost): string {
  return `${File.join(screenshotsDir(), imageName.call(this))}.png`;
}

/** @internal */
function absoluteHtmlPath(this: ScreenshotHelperHost): string {
  return `${absolutePath.call(this)}.html`;
}

/**
 * @internal
 * @missingRailsCall save_page — PERMANENT
 */
export async function saveHtml(this: ScreenshotHelperHost): Promise<void> {
  if (!this._page) return;
  const path = absoluteHtmlPath.call(this);
  const fs = getFs();
  await fs.mkdir!(File.join(projectRoot(), screenshotsDir()), { recursive: true });
  const content = await this._page.content();
  await fs.writeFile!(path, content);
}

/** @internal */
export async function saveImage(this: ScreenshotHelperHost): Promise<Buffer | undefined> {
  if (!this._page) return;
  const path = absoluteImagePath.call(this);
  const fs = getFs();
  await fs.mkdir!(File.join(projectRoot(), screenshotsDir()), { recursive: true });
  return this._page.screenshot({ path });
}

/** @internal */
export function outputType(): string {
  return env("RAILS_SYSTEM_TESTING_SCREENSHOT") || "simple";
}

/**
 * @internal
 * @missingRailsArgs read — PERMANENT
 * @missingRailsArgs inline_base64 — PERMANENT
 */
export function displayImage(
  this: ScreenshotHelperHost,
  { html, screenshotOutput }: { html: boolean; screenshotOutput: string | null | undefined },
): string {
  const imgPath = imagePath.call(this);
  let message = `[Screenshot Image]: ${imgPath}\n`;
  if (html) message += `[Screenshot HTML]: ${htmlPath.call(this)}\n`;

  const mode = screenshotOutput ?? outputType();
  if (mode === "artifact") {
    message += `\x1b]1338;url=artifact://${imgPath}\x07\n`;
  } else if (mode === "inline") {
    const name = inlineBase64(File.basename(absoluteImagePath.call(this)));
    const image = inlineBase64(
      File.read(absoluteImagePath.call(this), { encoding: Encoding.BINARY }),
      Encoding.BINARY,
    );
    message += `\x1b]1337;File=name=${name};height=400px;inline=1:${image}\x07\n`;
  }
  return message;
}

/** @internal */
export function inlineBase64(path: string, enc: Encoding = Encoding.UTF_8): string {
  return Buffer.from(path, enc === Encoding.BINARY ? "latin1" : "utf-8").toString("base64");
}

/** @internal */
function show(img: string): void {
  console.log(img);
}

/** @internal */
function failed(this: ScreenshotHelperHost): boolean {
  return !this.isPassed() && !this.isSkipped();
}

/** @internal */
export function supportsScreenshot(this: ScreenshotHelperHost): boolean {
  return vite.currentDriver !== "rack_test";
}

ScreenshotHelper.defineMethod("takeScreenshot", takeScreenshot);
ScreenshotHelper.defineMethod("takeFailedScreenshot", takeFailedScreenshot);
