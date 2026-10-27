import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./channel/base.js";
import * as m1 from "./connection/base.js";
import * as m2 from "./connection/client-socket.js";
import * as m3 from "./connection/message-buffer.js";
import * as m4 from "./connection/stream-event-loop.js";
import * as m5 from "./connection/stream.js";
import * as m6 from "./connection/subscriptions.js";
import * as m7 from "./connection/tagged-logger-proxy.js";
import * as m8 from "./connection/web-socket.js";
import * as m9 from "./remote-connections.js";
import * as m10 from "./server/base.js";
import * as m11 from "./server/broadcasting.js";
import * as m12 from "./server/configuration.js";
import * as m13 from "./server/worker.js";
import * as m14 from "./subscription-adapter/async.js";
import * as m15 from "./subscription-adapter/base.js";
import * as m16 from "./subscription-adapter/inline.js";
import * as m17 from "./subscription-adapter/subscriber-map.js";
import * as m18 from "./subscription-adapter/test.js";

registerClassPaths([
  [() => m0.Base, "ActionCable::Channel::Base"],
  [() => m1.Base, "ActionCable::Connection::Base"],
  [() => m2.ClientSocket, "ActionCable::Connection::ClientSocket"],
  [() => m3.MessageBuffer, "ActionCable::Connection::MessageBuffer"],
  [() => m5.Stream, "ActionCable::Connection::Stream"],
  [() => m4.StreamEventLoop, "ActionCable::Connection::StreamEventLoop"],
  [() => m6.Subscriptions, "ActionCable::Connection::Subscriptions"],
  [() => m7.TaggedLoggerProxy, "ActionCable::Connection::TaggedLoggerProxy"],
  [() => m8.WebSocket, "ActionCable::Connection::WebSocket"],
  [() => m9.RemoteConnections, "ActionCable::RemoteConnections"],
  [() => m9.RemoteConnection, "ActionCable::RemoteConnections::RemoteConnection"],
  [
    () => m9.InvalidIdentifiersError,
    "ActionCable::RemoteConnections::RemoteConnection::InvalidIdentifiersError",
  ],
  [() => m10.Base, "ActionCable::Server::Base"],
  [() => m11.Broadcaster, "ActionCable::Server::Broadcasting::Broadcaster"],
  [() => m12.Configuration, "ActionCable::Server::Configuration"],
  [() => m13.Worker, "ActionCable::Server::Worker"],
  [() => m14.Async, "ActionCable::SubscriptionAdapter::Async"],
  [() => m14.AsyncSubscriberMap, "ActionCable::SubscriptionAdapter::Async::AsyncSubscriberMap"],
  [() => m15.Base, "ActionCable::SubscriptionAdapter::Base"],
  [() => m16.Inline, "ActionCable::SubscriptionAdapter::Inline"],
  [() => m17.SubscriberMap, "ActionCable::SubscriptionAdapter::SubscriberMap"],
  [() => m18.Test, "ActionCable::SubscriptionAdapter::Test"],
]);
