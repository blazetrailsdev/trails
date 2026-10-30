import { TopLevel } from "@blazetrails/activesupport";
import { Base as ActiveRecordBase } from "@blazetrails/activerecord";
import { SubscriptionAdapter } from "@blazetrails/actioncable/namespaces";
import type { StreamEventLoop } from "@blazetrails/actioncable/connection/stream-event-loop";
import { Base } from "@blazetrails/actioncable/subscription-adapter/base";
import { ChannelPrefix } from "@blazetrails/actioncable/subscription-adapter/channel-prefix";
import type { InlineServer } from "@blazetrails/actioncable/subscription-adapter/inline";
import { SubscriberMap } from "@blazetrails/actioncable/subscription-adapter/subscriber-map";
import { Errno, Exception, IO, Thread, forceEncoding } from "@blazetrails/ruby-compat";
import type { PipeIO } from "@blazetrails/ruby-compat";
import { prepend } from "@blazetrails/ruby-compat/include";
import { Message } from "../../message.js";
import { SolidCable as SolidCableConfig } from "../../solid-cable.js";
import { TrimJob } from "../../trim-job.js";

type Callback = (message: unknown) => unknown;

export interface SolidCableServer extends InlineServer {
  eventLoop: StreamEventLoop;
}

export class SolidCable extends Base {
  private _listener: Listener | null;

  constructor(server: SolidCableServer) {
    super(server);
    this._listener = null;
  }

  override async broadcast(channel: string, payload: unknown): Promise<unknown> {
    await Message.broadcast(channel, payload);

    if (SolidCableConfig.isAutotrim()) return await TrimJob.performNow();
    return null;
  }

  override async subscribe(
    channel: string,
    callback: Callback,
    successCallback: (() => unknown) | null = null,
  ): Promise<unknown> {
    return (await this.listener).addSubscriber(channel, callback, successCallback);
  }

  override async unsubscribe(channel: string, callback: Callback): Promise<unknown> {
    return (await this.listener).removeSubscriber(channel, callback);
  }

  override async shutdown(): Promise<unknown> {
    return await (await this.listener).shutdown();
  }

  /** @internal */
  private get listener(): Listener | Promise<Listener> {
    return (
      this._listener ||
      (this.server as SolidCableServer).mutex.synchronize(
        () => (this._listener ??= new Listener((this.server as SolidCableServer).eventLoop)),
      )
    );
  }
}
prepend(SolidCable, ChannelPrefix);

/**
 * @missingRailsCall acquire — PERMANENT
 * @missingRailsCall release — PERMANENT
 */
export class Listener extends SubscriberMap {
  static Stop = class Stop extends Exception {};

  /** @internal */
  static readonly SELF_PIPE_BLOCK_SIZE = 11;

  private _eventLoop: StreamEventLoop;
  private _thread: Thread<Promise<void>>;
  private _lastId: number | null = null;
  private _channels: Set<string> | null = null;
  private _timer: ReturnType<typeof setTimeout> | undefined;
  private _isStopped = false;
  private _selfPipe: { reader: PipeIO; writer: PipeIO } | null = null;
  private _stop!: (stop: Exception) => void;
  private readonly _stopped = new Promise<never>((_resolve, reject) => (this._stop = reject));

  constructor(eventLoop: StreamEventLoop) {
    super();

    this._eventLoop = eventLoop;
    this._stopped.catch(() => {});

    this._thread = new Thread(() => this.listen());
  }

  async listen(): Promise<void> {
    try {
      for (;;) {
        let instance: { completeBang(): unknown } | null = null;
        try {
          instance = (await this.interruptible(() =>
            TopLevel.Trails!.application!.executor.runBang(),
          )) as { completeBang(): unknown } | null;
          await this.withPollingVolume(() => this.broadcastMessages());
        } finally {
          if (instance) await instance.completeBang();
        }

        await this.interruptible(async () => {
          await new Promise((resolve) => {
            this._timer = setTimeout(resolve, SolidCableConfig.pollingInterval().toF() * 1000);
            if (this._isStopped) clearTimeout(this._timer);
          });
        });
      }
    } catch (error) {
      if (!(error instanceof Listener.Stop)) throw error;
    }
  }

  async interruptible<T>(block: () => T | Promise<T>): Promise<T> {
    return await Promise.race([block(), this._stopped]);
  }

  async shutdown(): Promise<void> {
    this._isStopped = true;
    this._stop(new Listener.Stop());
    clearTimeout(this._timer);
    await this.thread.join();
  }

  override addChannel(channel: string, onSuccess: (() => unknown) | null): void {
    this.channels.add(channel);
    if (onSuccess != null) this.eventLoop.post(null, onSuccess);
  }

  override removeChannel(channel: string): void {
    this.channels.delete(channel);
  }

  override invokeCallback(callback: Callback, message: unknown): void {
    this.eventLoop.post(null, () => super.invokeCallback(callback, message));
  }

  /** @internal */
  private get eventLoop(): StreamEventLoop {
    return this._eventLoop;
  }

  /** @internal */
  private get thread(): Thread<Promise<void>> {
    return this._thread;
  }

  /** @internal */
  private setLastId(lastId: number): void {
    this._lastId = lastId;
  }

  /** @internal */
  private async lastId(): Promise<number> {
    return (this._lastId ??= (await Message.maximum("id")) ?? 0);
  }

  /** @internal */
  private get channels(): Set<string> {
    return (this._channels ||= new Set());
  }

  /** @internal */
  private async broadcastMessages(): Promise<void> {
    for (const message of await Message.broadcastable(
      this.channels,
      await this.lastId(),
    ).toArray()) {
      this.broadcast(
        forceEncoding(message.channel, "UTF-8") as string,
        forceEncoding(message.payload, "UTF-8"),
      );
      this.setLastId(message.id);
    }
  }

  /** @internal */
  private async withPollingVolume(block: () => Promise<void>): Promise<void> {
    if (SolidCableConfig.isSilencePolling() && ActiveRecordBase.logger) {
      await ActiveRecordBase.logger.silence(undefined, () => block());
    } else {
      await block();
    }
  }

  /** @internal */
  private wakeUp(): void {
    this.interrupt();
  }

  /** @internal */
  private interrupt(): void {
    for (;;) {
      try {
        this.selfPipe.writer.writeNonblock(".");
        return;
      } catch (error) {
        if (error instanceof Errno.EAGAIN || error instanceof Errno.EINTR) continue;
        throw error;
      }
    }
  }

  /** @internal */
  private async interruptibleSleep(time: number): Promise<void> {
    try {
      if (time > 0 && (await this.selfPipe.reader.waitReadable(time))) {
        for (;;) this.selfPipe.reader.readNonblock(Listener.SELF_PIPE_BLOCK_SIZE);
      }
    } catch (error) {
      if (!(error instanceof Errno.EAGAIN || error instanceof Errno.EINTR)) throw error;
    }
  }

  /** @internal */
  private get selfPipe(): { reader: PipeIO; writer: PipeIO } {
    return (this._selfPipe ||= this.createSelfPipe());
  }

  /** @internal */
  private createSelfPipe(): { reader: PipeIO; writer: PipeIO } {
    const [reader, writer] = IO.pipe();
    return { reader: reader, writer: writer };
  }
}

SubscriptionAdapter.loadPath["action_cable/subscription_adapter/solid_cable"] = () =>
  import("./solid-cable.js");
