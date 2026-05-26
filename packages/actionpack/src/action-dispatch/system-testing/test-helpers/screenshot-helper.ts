import { getFsAsync, getPath } from "@blazetrails/activesupport";

export interface ScreenshotPage {
  screenshot(options: { path: string }): Promise<Buffer>;
  content(): Promise<string>;
}

export interface ScreenshotHelperHost {
  _page?: ScreenshotPage;
  _testName?: string;
  _testFailed?: boolean;
  _screenshotCounter?: number;
  metadata?: Record<string, unknown>;
}

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
    .then((imageData) =>
      show(displayImage.call(this, { html: showingHtml, screenshotOutput: screenshot, imageData })),
    );
}

export async function takeFailedScreenshot(this: ScreenshotHelperHost): Promise<void> {
  if (!failed.call(this) || !supportsScreenshot.call(this)) return;
  await takeScreenshot.call(this);
  if (this.metadata) {
    this.metadata["failure_screenshot_path"] = relativeImagePath.call(this);
  }
}

function htmlFromEnv(): boolean {
  return (
    env("RAILS_SYSTEM_TESTING_SCREENSHOT_HTML") === "1" ||
    env("TRAILS_SYSTEM_TESTING_SCREENSHOT_HTML") === "1"
  );
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
  const sanitized = (this._testName ?? "test").replace(/[^\w]+/g, "-");
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
  return env("CAPYBARA_SAVE_PATH") || "tmp/screenshots";
}

function absolutePath(this: ScreenshotHelperHost): string {
  const { join } = getPath();
  return join(projectRoot(), screenshotsDir(), imageName.call(this));
}

function absoluteImagePath(this: ScreenshotHelperHost): string {
  return `${absolutePath.call(this)}.png`;
}

function relativeImagePath(this: ScreenshotHelperHost): string {
  const { relative } = getPath();
  const abs = absolutePath.call(this);
  const root = projectRoot();
  return `${relative!(root, abs)}.png`;
}

function absoluteHtmlPath(this: ScreenshotHelperHost): string {
  return `${absolutePath.call(this)}.html`;
}

/** @internal */
export async function saveHtml(this: ScreenshotHelperHost): Promise<void> {
  if (!this._page) return;
  const path = absoluteHtmlPath.call(this);
  const { join } = getPath();
  const fs = await getFsAsync();
  await fs.mkdir!(join(projectRoot(), screenshotsDir()), { recursive: true });
  const content = await this._page.content();
  await fs.writeFile!(path, content);
}

/** @internal */
export async function saveImage(this: ScreenshotHelperHost): Promise<Buffer | undefined> {
  if (!this._page) return;
  const path = absoluteImagePath.call(this);
  const { join } = getPath();
  const fs = await getFsAsync();
  await fs.mkdir!(join(projectRoot(), screenshotsDir()), { recursive: true });
  return this._page.screenshot({ path });
}

/** @internal */
export function outputType(): string {
  return (
    env("RAILS_SYSTEM_TESTING_SCREENSHOT") ||
    env("TRAILS_SYSTEM_TESTING_SCREENSHOT") ||
    env("CAPYBARA_INLINE_SCREENSHOT") ||
    "simple"
  );
}

/** @internal */
export function displayImage(
  this: ScreenshotHelperHost,
  {
    html,
    screenshotOutput,
    imageData,
  }: { html: boolean; screenshotOutput: string | null | undefined; imageData?: Buffer },
): string {
  const imgPath = imagePath.call(this);
  let message = `[Screenshot Image]: ${imgPath}\n`;
  if (html) message += `[Screenshot HTML]: ${htmlPath.call(this)}\n`;

  const mode = screenshotOutput ?? outputType();
  if (mode === "artifact") {
    message += `]1338;url=artifact://${imgPath}\n`;
  } else if (mode === "inline") {
    const { basename } = getPath();
    const name = inlineBase64(basename(imgPath));
    const image = imageData ? imageData.toString("base64") : "";
    message += `]1337;File=name=${name};height=400px;inline=1:${image}\n`;
  }
  return message;
}

/** @internal */
export function inlineBase64(str: string): string {
  return Buffer.from(str).toString("base64");
}

function show(message: string): void {
  console.log(message);
}

function failed(this: ScreenshotHelperHost): boolean {
  return this._testFailed === true;
}

/** @internal */
export function supportsScreenshot(this: ScreenshotHelperHost): boolean {
  return this._page !== undefined;
}
