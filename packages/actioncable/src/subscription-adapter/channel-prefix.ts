import { defineModule, rbCallSuper, rbModConstSet } from "@blazetrails/ruby-compat";
import { SubscriptionAdapter } from "../namespaces.js";

interface ChannelPrefixHost {
  server: { config: { cable: Record<string, unknown> } };
  channelWithPrefix(channel: string): string;
}

type Callback = (message: unknown) => unknown;

function broadcast(this: ChannelPrefixHost, channel: string, payload: unknown): unknown {
  channel = this.channelWithPrefix(channel);
  return rbCallSuper(this, broadcast, channel, payload);
}

function subscribe(
  this: ChannelPrefixHost,
  channel: string,
  callback: Callback,
  successCallback: (() => unknown) | null = null,
): unknown {
  channel = this.channelWithPrefix(channel);
  return rbCallSuper(this, subscribe, channel, callback, successCallback);
}

function unsubscribe(this: ChannelPrefixHost, channel: string, callback: Callback): unknown {
  channel = this.channelWithPrefix(channel);
  return rbCallSuper(this, unsubscribe, channel, callback);
}

/** @internal */
function channelWithPrefix(this: ChannelPrefixHost, channel: string): string {
  return [this.server.config.cable.channelPrefix, channel].filter((part) => part != null).join(":");
}

export const ChannelPrefix = defineModule(
  { broadcast, subscribe, unsubscribe },
  {},
  { channelWithPrefix },
);

rbModConstSet(SubscriptionAdapter, "ChannelPrefix", ChannelPrefix);
