import {
  Callbacks as ASCallbacks,
  Notifications,
  ParameterFilter,
  Rescuable,
  include,
  presence,
  runLoadHooks,
  truncate,
  type Extended,
  type Included,
} from "@blazetrails/activesupport";
import {
  AtomicFixnum,
  except,
  publicInstanceMethods,
  rbFSend,
  rbInspect,
  rbModConstSet,
  rbObjClass,
  rbObjClassname,
  rbObjMethod,
  toS,
} from "@blazetrails/ruby-compat";
import "../action-cable.js";
import { ActionCable, Channel } from "../namespaces.js";
import { Broadcasting, type ClassMethods as BroadcastingClassMethods } from "./broadcasting.js";
import { Callbacks } from "./callbacks.js";
import { Naming } from "./naming.js";
import { PeriodicTimers } from "./periodic-timers.js";
import { Streams, type Handler, type StreamOptions } from "./streams.js";

type Data = Record<string, unknown>;

interface Logger {
  debug(message?: unknown, block?: () => unknown): unknown;
  error(message?: unknown): unknown;
  info(message?: unknown): unknown;
}

interface ChannelConnection {
  identifiers: Iterable<string>;
  logger: Logger;
  config: { filterParameters: ConstructorParameters<typeof ParameterFilter>[0] };
  subscriptions: { removeSubscription(subscription: unknown): unknown };
  transmit(cableMessage: unknown): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Base {
  streamFrom(
    broadcasting: unknown,
    callback?: Handler | StreamOptions | null,
    options?: StreamOptions,
    block?: Handler,
  ): void;
  streamFor(
    model: unknown,
    callback?: Handler | StreamOptions | null,
    options?: StreamOptions,
    block?: Handler,
  ): void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Base {
  declare static setCallback: Extended<typeof ASCallbacks.ClassMethods>["setCallback"];
  declare runCallbacks: (kind: string, block?: () => unknown) => unknown;
  declare rescueWithHandler: Included<typeof Rescuable>["rescueWithHandler"];
  declare static readonly channelName: string;
  declare static broadcastingFor: (typeof BroadcastingClassMethods)["broadcastingFor"];
  declare static broadcastTo: (typeof BroadcastingClassMethods)["broadcastTo"];
  declare stopStreamFrom: Included<typeof Streams>["stopStreamFrom"];
  declare stopStreamFor: Included<typeof Streams>["stopStreamFor"];
  declare stopAllStreams: Included<typeof Streams>["stopAllStreams"];
  declare streamOrRejectFor: Included<typeof Streams>["streamOrRejectFor"];

  /** @internal */
  protected static _actionMethods?: Set<string> | null;

  readonly params: Data;
  readonly connection: ChannelConnection;
  readonly identifier: string;
  /** @internal */
  private _deferSubscriptionConfirmationCounter: AtomicFixnum;
  /** @internal */
  private _rejectSubscription: boolean | null;
  /** @internal */
  private _subscriptionConfirmationSent: boolean | null;
  /** @internal */
  private _parameterFilter?: ParameterFilter;

  get logger(): Logger {
    return this.connection.logger;
  }

  /** @missingRailsArgs public_instance_methods — PERMANENT */
  static actionMethods(): Set<string> {
    if (!Object.hasOwn(this, "_actionMethods") || this._actionMethods == null) {
      const internal = new Set(publicInstanceMethods(ActionCable.Channel.Base, true));
      const methods = [
        ...publicInstanceMethods(this, true).filter((name) => !internal.has(name)),
        ...publicInstanceMethods(this, false),
      ];
      this._actionMethods = new Set(methods);
    }
    return this._actionMethods;
  }

  /** @internal */
  private static clearActionMethodsBang(): void {
    this._actionMethods = null;
  }

  /** @internal */
  protected static methodAdded(_name: string): void {
    this.clearActionMethodsBang();
  }

  constructor(connection: ChannelConnection, identifier: string, params: Data = {}) {
    this.connection = connection;
    this.identifier = identifier;
    this.params = params;

    this._deferSubscriptionConfirmationCounter = new AtomicFixnum(1);

    this._rejectSubscription = null;
    this._subscriptionConfirmationSent = null;

    this.delegateConnectionIdentifiers();
  }

  async performAction(data: Data): Promise<unknown> {
    const action = this.extractAction(data);

    if (this.isProcessableAction(action)) {
      const payload = { channelClass: rbObjClassname(this), action, data };
      return await Notifications.instrument("perform_action.action_cable", payload, () =>
        this.dispatchAction(action, data),
      );
    } else {
      return this.logger.error(`Unable to process ${this.actionSignature(action, data)}`);
    }
  }

  async subscribeToChannel(): Promise<unknown> {
    await this.runCallbacks("subscribe", () => this.subscribed());

    if (this.isSubscriptionRejected()) await this.rejectSubscription();
    return this.ensureConfirmationSent();
  }

  async unsubscribeFromChannel(): Promise<unknown> {
    return await this.runCallbacks("unsubscribe", () => this.unsubscribed());
  }

  /** @internal */
  protected subscribed(): unknown {
    return null;
  }

  /** @internal */
  protected unsubscribed(): unknown {
    return null;
  }

  /**
   * @internal
   * @missingRailsArgs truncate — PERMANENT
   */
  protected transmit(data: unknown, { via = null }: { via?: string | null } = {}): unknown {
    this.logger.debug(undefined, () => {
      let status = `${rbObjClassname(this)} transmitting ${truncate(rbInspect(data), 300)}`;
      if (via != null) status += ` (via ${via})`;
      return status;
    });

    const payload = { channelClass: rbObjClassname(this), data, via };
    return Notifications.instrument("transmit.action_cable", payload, () =>
      this.connection.transmit({ identifier: this.identifier, message: data }),
    );
  }

  /** @internal */
  protected ensureConfirmationSent(): unknown {
    if (this.isSubscriptionRejected()) return null;
    this._deferSubscriptionConfirmationCounter.decrement();
    if (!this.isDeferSubscriptionConfirmation()) return this.transmitSubscriptionConfirmation();
    return null;
  }

  /** @internal */
  protected deferSubscriptionConfirmationBang(): number {
    return this._deferSubscriptionConfirmationCounter.increment();
  }

  /** @internal */
  protected isDeferSubscriptionConfirmation(): boolean {
    return this._deferSubscriptionConfirmationCounter.value > 0;
  }

  /** @internal */
  protected isSubscriptionConfirmationSent(): boolean | null {
    return this._subscriptionConfirmationSent;
  }

  /** @internal */
  protected reject(): boolean {
    return (this._rejectSubscription = true);
  }

  /** @internal */
  protected isSubscriptionRejected(): boolean | null {
    return this._rejectSubscription;
  }

  /** @internal */
  private delegateConnectionIdentifiers(): void {
    for (const identifier of this.connection.identifiers) {
      Object.defineProperty(this, identifier, {
        value: () => rbFSend(this.connection, identifier),
        configurable: true,
        writable: true,
      });
    }
  }

  /** @internal */
  private extractAction(data: Data): string {
    return toS(presence(data["action"]) ?? "receive");
  }

  /** @internal */
  private isProcessableAction(action: string): boolean | null {
    if (!this.isSubscriptionRejected())
      return (rbObjClass(this) as unknown as typeof Base).actionMethods().has(toS(action));
    return null;
  }

  /** @internal */
  private async dispatchAction(action: string, data: Data): Promise<unknown> {
    try {
      this.logger.debug(this.actionSignature(action, data));

      if (rbObjMethod(this, action).arity() === 1) {
        return await rbFSend(this, action, data);
      } else {
        return await rbFSend(this, action);
      }
    } catch (exception) {
      const handled = await this.rescueWithHandler(exception);
      if (handled != null && handled !== false) return handled;
      throw exception;
    }
  }

  /** @internal */
  private actionSignature(action: string, data: Data): string {
    let signature = `${rbObjClassname(this)}#${action}`;
    let arguments_ = except(data, "action");

    if (Object.keys(arguments_).length > 0) {
      arguments_ = this.parameterFilter.filter(arguments_);
      signature += `(${rbInspect(arguments_)})`;
    }
    return signature;
  }

  /** @internal */
  private get parameterFilter(): ParameterFilter {
    return (this._parameterFilter ??= new ParameterFilter(this.connection.config.filterParameters));
  }

  /**
   * @internal
   * @missingRailsName name — PERMANENT
   */
  protected transmitSubscriptionConfirmation(): unknown {
    if (!this.isSubscriptionConfirmationSent()) {
      this.logger.debug(`${rbObjClassname(this)} is transmitting the subscription confirmation`);

      return Notifications.instrument(
        "transmit_subscription_confirmation.action_cable",
        { channelClass: rbObjClassname(this), identifier: this.identifier },
        () => {
          this.connection.transmit({
            identifier: this.identifier,
            type: ActionCable.INTERNAL.messageTypes.confirmation,
          });
          return (this._subscriptionConfirmationSent = true);
        },
      );
    }
    return null;
  }

  /** @internal */
  private async rejectSubscription(): Promise<unknown> {
    await this.connection.subscriptions.removeSubscription(this);
    return this.transmitSubscriptionRejection();
  }

  /**
   * @internal
   * @missingRailsName name — PERMANENT
   */
  private transmitSubscriptionRejection(): unknown {
    this.logger.debug(`${rbObjClassname(this)} is transmitting the subscription rejection`);

    return Notifications.instrument(
      "transmit_subscription_rejection.action_cable",
      { channelClass: rbObjClassname(this), identifier: this.identifier },
      () =>
        this.connection.transmit({
          identifier: this.identifier,
          type: ActionCable.INTERNAL.messageTypes.rejection,
        }),
    );
  }
}
include(Base, Callbacks);
include(Base, PeriodicTimers);
include(Base, Streams);
include(Base, Naming);
include(Base, Broadcasting);
include(Base, Rescuable);

rbModConstSet(Channel, "Base", Base);

runLoadHooks("action_cable_channel", Base);
