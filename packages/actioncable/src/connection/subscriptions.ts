import {
  ActiveSupportJSON,
  type HashWithIndifferentAccess,
  safeConstantize,
  withIndifferentAccess,
} from "@blazetrails/activesupport";
import {
  RuntimeError,
  excBacktrace,
  hashDelete,
  rbInspect,
  rbModConstSet,
  rbModGt,
  rbObjClassname,
} from "@blazetrails/ruby-compat";
import { ActionCable, Connection } from "../namespaces.js";

interface SubscriptionsConnection {
  logger: { error(message: string): unknown; info(message: string): unknown };
  rescueWithHandler(exception: unknown): unknown;
}

interface Subscription {
  identifier: string;
  subscribeToChannel(): unknown;
  unsubscribeFromChannel(): unknown;
  performAction(data: unknown): unknown;
}

type SubscriptionClass = new (
  connection: SubscriptionsConnection,
  identifier: string,
  params: HashWithIndifferentAccess,
) => Subscription;

type Data = Record<string, unknown>;

export class Subscriptions {
  /** @internal */
  private readonly connection: SubscriptionsConnection;
  /** @internal */
  private readonly subscriptions: Record<string, Subscription>;

  constructor(connection: SubscriptionsConnection) {
    this.connection = connection;
    this.subscriptions = Object.create(null) as Record<string, Subscription>;
  }

  async executeCommand(data: Data): Promise<unknown> {
    try {
      switch (data["command"]) {
        case "subscribe":
          return await this.add(data);
        case "unsubscribe":
          return await this.remove(data);
        case "message":
          return await this.performAction(data);
        default:
          return this.logger.error(`Received unrecognized command in ${rbInspect(data)}`);
      }
    } catch (e) {
      await this.connection.rescueWithHandler(e);
      return this.logger.error(
        `Could not execute command from (${rbInspect(data)}) [${rbObjClassname(e)} - ${(e as Error).message}]: ${excBacktrace(
          e as Error,
        )!
          .slice(0, 5)
          .join(" | ")}`,
      );
    }
  }

  async add(data: Data): Promise<unknown> {
    const idKey = data["identifier"] as string;
    const idOptions = withIndifferentAccess(
      ActiveSupportJSON.decode(idKey) as Record<string, unknown>,
    );

    if (Object.hasOwn(this.subscriptions, idKey)) return null;

    const subscriptionKlass = safeConstantize(
      idOptions.get("channel") as string,
    ) as SubscriptionClass | null;

    const Base = (ActionCable.Channel as unknown as { Base: SubscriptionClass }).Base;
    if (subscriptionKlass != null && rbModGt(Base, subscriptionKlass)) {
      const subscription = new subscriptionKlass(this.connection, idKey, idOptions);
      this.subscriptions[idKey] = subscription;
      return await subscription.subscribeToChannel();
    } else {
      return this.logger.error(
        `Subscription class not found: ${rbInspect(idOptions.get("channel"))}`,
      );
    }
  }

  async remove(data: Data): Promise<Subscription | undefined> {
    this.logger.info(`Unsubscribing from channel: ${data["identifier"] as string}`);
    return await this.removeSubscription(this.find(data));
  }

  async removeSubscription(subscription: Subscription): Promise<Subscription | undefined> {
    await subscription.unsubscribeFromChannel();
    return hashDelete(this.subscriptions, subscription.identifier) as Subscription | undefined;
  }

  async performAction(data: Data): Promise<unknown> {
    return await this.find(data).performAction(ActiveSupportJSON.decode(data["data"] as string));
  }

  get identifiers(): string[] {
    return Object.keys(this.subscriptions);
  }

  async unsubscribeFromAll(): Promise<void> {
    for (const [, channel] of Object.entries(this.subscriptions)) {
      await this.removeSubscription(channel);
    }
  }

  /** @internal */
  private get logger(): SubscriptionsConnection["logger"] {
    return this.connection.logger;
  }

  /** @internal */
  private find(data: Data): Subscription {
    const subscription = this.subscriptions[data["identifier"] as string];
    if (subscription != null) {
      return subscription;
    } else {
      throw new RuntimeError(
        `Unable to find subscription with identifier: ${data["identifier"] as string}`,
      );
    }
  }
}

rbModConstSet(Connection, "Subscriptions", Subscriptions);
