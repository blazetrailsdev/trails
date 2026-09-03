/** @internal */
export let trailsLogger: { warn(msg: unknown): void; debug(msg: unknown): void } | null = null;

/** @internal */
export function _setTrailsLogger(
  logger: { warn(msg: unknown): void; debug(msg: unknown): void } | null,
): void {
  trailsLogger = logger;
}
