import { trailsLogger } from "../trails-logger-slot.js";

type TaggedLogger = {
  warn(msg: unknown): void;
  debug(msg: unknown): void;
  info?(msg: unknown): unknown;
  readonly "info?"?: boolean;
};

let taggedLoggerValue: TaggedLogger | null = null;

export function setTaggedLogger(logger: TaggedLogger | null): void {
  taggedLoggerValue = logger;
}

export function beforeSetup(): void {
  const logger = taggedLogger();
  if (logger && logger["info?"]) {
    const heading = _testCaseIdentity(": ");
    const divider = "-".repeat(heading.length);
    logger.info?.(divider);
    logger.info?.(heading);
    logger.info?.(divider);
  }
}

/** @internal */
export function taggedLogger(): TaggedLogger | null {
  return taggedLoggerValue ?? trailsLogger;
}

/** @internal */
export function _testCaseIdentity(separator = " - "): string {
  const currentTestName =
    (globalThis as { expect?: { getState?(): { currentTestName?: string } } }).expect?.getState?.()
      ?.currentTestName ?? "";
  const sep = currentTestName.lastIndexOf(" > ");
  if (sep === -1) return currentTestName;
  return `${currentTestName.slice(0, sep)}${separator}${currentTestName.slice(sep + 3)}`;
}
