import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./channel/base.js";
import * as m1 from "./channel/test-case.js";
import * as m2 from "./connection/base.js";
import * as m3 from "./connection/client-socket.js";
import * as m4 from "./connection/message-buffer.js";
import * as m5 from "./connection/stream-event-loop.js";
import * as m6 from "./connection/stream.js";
import * as m7 from "./connection/subscriptions.js";
import * as m8 from "./connection/tagged-logger-proxy.js";
import * as m9 from "./connection/test-case.js";
import * as m10 from "./connection/web-socket.js";
import * as m11 from "./remote-connections.js";
import * as m12 from "./server/base.js";
import * as m13 from "./server/broadcasting.js";
import * as m14 from "./server/configuration.js";
import * as m15 from "./server/worker.js";
import * as m16 from "./subscription-adapter/async.js";
import * as m17 from "./subscription-adapter/base.js";
import * as m18 from "./subscription-adapter/inline.js";
import * as m19 from "./subscription-adapter/subscriber-map.js";
import * as m20 from "./subscription-adapter/test.js";

registerClassPaths([
  [() => m0.Base, "ActionCable::Channel::Base"],
  [() => m1.ConnectionStub, "ActionCable::Channel::ConnectionStub"],
  [() => m1.NonInferrableChannelError, "ActionCable::Channel::NonInferrableChannelError"],
  [() => m1.TestCase, "ActionCable::Channel::TestCase"],
  [() => m2.Base, "ActionCable::Connection::Base"],
  [() => m3.ClientSocket, "ActionCable::Connection::ClientSocket"],
  [() => m4.MessageBuffer, "ActionCable::Connection::MessageBuffer"],
  [() => m9.NonInferrableConnectionError, "ActionCable::Connection::NonInferrableConnectionError"],
  [() => m6.Stream, "ActionCable::Connection::Stream"],
  [() => m5.StreamEventLoop, "ActionCable::Connection::StreamEventLoop"],
  [() => m7.Subscriptions, "ActionCable::Connection::Subscriptions"],
  [() => m8.TaggedLoggerProxy, "ActionCable::Connection::TaggedLoggerProxy"],
  [() => m9.TestCase, "ActionCable::Connection::TestCase"],
  [() => m9.TestCookieJar, "ActionCable::Connection::TestCookieJar"],
  [() => m9.TestCookies, "ActionCable::Connection::TestCookies"],
  [() => m9.TestRequest, "ActionCable::Connection::TestRequest"],
  [() => m10.WebSocket, "ActionCable::Connection::WebSocket"],
  [() => m11.RemoteConnections, "ActionCable::RemoteConnections"],
  [() => m11.RemoteConnection, "ActionCable::RemoteConnections::RemoteConnection"],
  [
    () => m11.InvalidIdentifiersError,
    "ActionCable::RemoteConnections::RemoteConnection::InvalidIdentifiersError",
  ],
  [() => m12.Base, "ActionCable::Server::Base"],
  [() => m13.Broadcaster, "ActionCable::Server::Broadcasting::Broadcaster"],
  [() => m14.Configuration, "ActionCable::Server::Configuration"],
  [() => m15.Worker, "ActionCable::Server::Worker"],
  [() => m16.Async, "ActionCable::SubscriptionAdapter::Async"],
  [() => m16.AsyncSubscriberMap, "ActionCable::SubscriptionAdapter::Async::AsyncSubscriberMap"],
  [() => m17.Base, "ActionCable::SubscriptionAdapter::Base"],
  [() => m18.Inline, "ActionCable::SubscriptionAdapter::Inline"],
  [() => m19.SubscriberMap, "ActionCable::SubscriptionAdapter::SubscriberMap"],
  [() => m20.Test, "ActionCable::SubscriptionAdapter::Test"],
]);
