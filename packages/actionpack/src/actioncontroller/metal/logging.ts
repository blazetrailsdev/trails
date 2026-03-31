/**
 * ActionController::Logging
 *
 * Provides log_at for setting per-request log level.
 * @see https://api.rubyonrails.org/classes/ActionController/Logging.html
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

export interface LeveledLogger {
  level: LogLevel;
  log(level: LogLevel, message: string): void;
}

export async function logAt(
  logger: LeveledLogger,
  level: LogLevel,
  fn: () => void | Promise<void>,
): Promise<void> {
  const previousLevel = logger.level;
  logger.level = level;
  try {
    await fn();
  } finally {
    logger.level = previousLevel;
  }
}

export function createLogAtFilter(
  level: LogLevel,
): (controller: { logger?: LeveledLogger }, action: () => void | Promise<void>) => Promise<void> {
  return async (controller, action) => {
    if (controller.logger) {
      await logAt(controller.logger, level, action);
    } else {
      await action();
    }
  };
}

export function shouldLog(currentLevel: LogLevel, messageLevel: LogLevel): boolean {
  return LOG_LEVEL_ORDER[messageLevel] >= LOG_LEVEL_ORDER[currentLevel];
}
