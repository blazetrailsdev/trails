/**
 * ActionDispatch::DebugLocks
 *
 * Diagnostic middleware exposing a snapshot of the autoload interlock
 * (`/rails/locks`) — threads, their lock state, and the relationships
 * between them. Strictly diagnostic; output formatting is human-readable
 * and not part of the public contract.
 */

import { bodyFromString, CONTENT_TYPE, CONTENT_LENGTH } from "@blazetrails/rack";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { Request } from "../http/request.js";
import { Response } from "../http/response.js";

export interface ThreadLike {
  /**
   * Mirrors Ruby's `Thread#status`: "run" | "sleep" | "aborting" | false (terminated
   * with exception) | nil (terminated normally). The middleware renders falsy as "dead",
   * mirroring `thread.status || 'dead'` in the Ruby source.
   */
  status: string | false | null;
  backtrace(): string[] | null;
  id: number;
}

export interface ThreadInfo {
  exclusive?: boolean;
  sharing?: number;
  waiting?: boolean;
  sleeper?: string | null;
  purpose?: unknown;
  compatible?: Array<unknown> | null;
  index?: number;
  backtrace?: string[] | null;
}

export interface InterlockLike {
  rawState<T>(block: (threads: Map<ThreadLike, ThreadInfo>) => T): T;
}

export class DebugLocks {
  /**
   * Source of `raw_state`. Mirrors Ruby's `ActiveSupport::Dependencies.interlock`,
   * which has no port yet — assign before mounting the middleware.
   */
  static interlock: InterlockLike | null = null;

  /**
   * Charset used for the response `content-type`. Rails reads
   * `ActionDispatch::Response.default_charset` directly at request time
   * (`debug_locks.rb:104`); this getter mirrors that so the railtie's
   * `config.actionDispatch.defaultCharset` flows through here as well.
   */
  static get defaultCharset(): string {
    return Response.defaultCharset;
  }
  static set defaultCharset(value: string) {
    Response.defaultCharset = value;
  }

  private app: RackApp;
  private path: string;

  constructor(app: RackApp, path = "/rails/locks") {
    this.app = app;
    this.path = path;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const req = new Request(env);

    if (req.isGet) {
      const path = req.path.replace(/\/$/, "");
      if (path === this.path) {
        return this.renderDetails();
      }
    }

    return this.app(env);
  }

  /** @internal */
  private renderDetails(): RackResponse {
    const interlock = DebugLocks.interlock;
    if (!interlock) {
      throw new Error(
        "ActionDispatch::DebugLocks.interlock is not configured (no autoload interlock port available)",
      );
    }
    const threads = interlock.rawState<Map<ThreadLike, ThreadInfo>>((rawThreads) => {
      // The Interlock comes to a complete halt while this block runs, so do as
      // little as possible here.
      let idx = 0;
      for (const [thread, info] of rawThreads) {
        info.index = idx++;
        info.backtrace = thread.backtrace();
      }
      return rawThreads;
    });

    const allInfos = Array.from(threads.values());
    const parts: string[] = [];

    for (const [thread, info] of threads) {
      let lockState: string;
      if (info.exclusive) {
        lockState = "Exclusive";
      } else if ((info.sharing ?? 0) > 0) {
        lockState = "Sharing";
        if ((info.sharing ?? 0) > 1) lockState += ` x${info.sharing}`;
      } else {
        lockState = "No lock";
      }

      if (info.waiting) {
        lockState += " (yielded share)";
      }

      const status = thread.status || "dead";
      let msg = `Thread ${info.index} [0x${thread.id.toString(16)} ${status}]  ${lockState}\n`;

      if (info.sleeper) {
        msg += `  Waiting in ${String(info.sleeper)}`;
        if (info.purpose != null) msg += ` to ${JSON.stringify(String(info.purpose))}`;
        msg += "\n";

        if (info.compatible) {
          const compat = info.compatible.map((c) =>
            c === false ? "share" : JSON.stringify(String(c)),
          );
          msg += `  may be pre-empted for: ${compat.join(", ")}\n`;
        }

        const blockers = allInfos.filter((binfo) => this.blockedBy(info, binfo, allInfos));
        if (blockers.length) {
          msg += `  blocked by: ${blockers.map((i) => i.index).join(", ")}\n`;
        }
      }

      const blockees = allInfos.filter((binfo) => this.blockedBy(binfo, info, allInfos));
      if (blockees.length) {
        msg += `  blocking: ${blockees.map((i) => i.index).join(", ")}\n`;
      }

      if (info.backtrace) {
        msg += `\n${info.backtrace.join("\n")}\n`;
      }

      parts.push(msg);
    }

    const str = parts.join("\n\n---\n\n\n");

    return [
      200,
      {
        [CONTENT_TYPE]: `text/plain; charset=${DebugLocks.defaultCharset}`,
        [CONTENT_LENGTH]: Buffer.byteLength(str, "utf-8").toString(),
      },
      bodyFromString(str),
    ];
  }

  /** @internal */
  private blockedBy(victim: ThreadInfo, blocker: ThreadInfo, allThreads: ThreadInfo[]): boolean {
    if (victim === blocker) return false;

    switch (victim.sleeper) {
      case "start_sharing":
        return (
          !!blocker.exclusive ||
          (!victim.waiting && !!blocker.compatible && !blocker.compatible.includes(false))
        );
      case "start_exclusive":
        return (
          (blocker.sharing ?? 0) > 0 ||
          !!blocker.exclusive ||
          (!!blocker.compatible && !blocker.compatible.includes(victim.purpose))
        );
      case "yield_shares":
        return !!blocker.exclusive;
      case "stop_exclusive":
        return (
          !!blocker.exclusive ||
          (!!victim.compatible &&
            victim.compatible.includes(blocker.purpose) &&
            allThreads.every(
              (other) =>
                !other.compatible ||
                other === blocker ||
                other.compatible.includes(blocker.purpose),
            ))
        );
      default:
        return false;
    }
  }
}
