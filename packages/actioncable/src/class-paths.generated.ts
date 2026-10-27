import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./channel/base.js";
import * as m1 from "./channel/broadcasting.js";
import * as m2 from "./channel/callbacks.js";
import * as m3 from "./channel/naming.js";
import * as m4 from "./channel/periodic-timers.js";
import * as m5 from "./channel/streams.js";
import * as m6 from "./connection/authorization.js";
import * as m7 from "./connection/base.js";
import * as m8 from "./connection/callbacks.js";
import * as m9 from "./connection/client-socket.js";
import * as m10 from "./connection/identification.js";
import * as m11 from "./connection/internal-channel.js";
import * as m12 from "./connection/message-buffer.js";
import * as m13 from "./connection/stream-event-loop.js";
import * as m14 from "./connection/stream.js";
import * as m15 from "./connection/subscriptions.js";
import * as m16 from "./connection/tagged-logger-proxy.js";
import * as m17 from "./connection/web-socket.js";
import * as m18 from "./gem-version.js";
import * as m19 from "./helpers/action-cable-helper.js";
import * as m20 from "./remote-connections.js";
import * as m21 from "./server/base.js";
import * as m22 from "./server/broadcasting.js";
import * as m23 from "./server/configuration.js";
import * as m24 from "./server/connections.js";
import * as m25 from "./server/worker.js";
import * as m26 from "./server/worker/active-record-connection-management.js";
import * as m27 from "./subscription-adapter/async.js";
import * as m28 from "./subscription-adapter/base.js";
import * as m29 from "./subscription-adapter/channel-prefix.js";
import * as m30 from "./subscription-adapter/inline.js";
import * as m31 from "./subscription-adapter/subscriber-map.js";
import * as m32 from "./subscription-adapter/test.js";
import * as m33 from "./test-helper.js";

registerClassPaths([
  [() => m0.Base, "ActionCable::Channel::Base"],
  [() => m1.Broadcasting, "ActionCable::Channel::Broadcasting"],
  [() => m2.Callbacks, "ActionCable::Channel::Callbacks"],
  [() => m3.Naming, "ActionCable::Channel::Naming"],
  [() => m4.PeriodicTimers, "ActionCable::Channel::PeriodicTimers"],
  [() => m5.Streams, "ActionCable::Channel::Streams"],
  [() => m6.Authorization, "ActionCable::Connection::Authorization"],
  [() => m6.UnauthorizedError, "ActionCable::Connection::Authorization::UnauthorizedError"],
  [() => m7.Base, "ActionCable::Connection::Base"],
  [() => m8.Callbacks, "ActionCable::Connection::Callbacks"],
  [() => m9.ClientSocket, "ActionCable::Connection::ClientSocket"],
  [() => m10.Identification, "ActionCable::Connection::Identification"],
  [() => m11.InternalChannel, "ActionCable::Connection::InternalChannel"],
  [() => m12.MessageBuffer, "ActionCable::Connection::MessageBuffer"],
  [() => m14.Stream, "ActionCable::Connection::Stream"],
  [() => m13.StreamEventLoop, "ActionCable::Connection::StreamEventLoop"],
  [() => m15.Subscriptions, "ActionCable::Connection::Subscriptions"],
  [() => m16.TaggedLoggerProxy, "ActionCable::Connection::TaggedLoggerProxy"],
  [() => m17.WebSocket, "ActionCable::Connection::WebSocket"],
  [() => m19.ActionCableHelper, "ActionCable::Helpers::ActionCableHelper"],
  [() => m20.RemoteConnections, "ActionCable::RemoteConnections"],
  [() => m20.RemoteConnection, "ActionCable::RemoteConnections::RemoteConnection"],
  [
    () => m20.InvalidIdentifiersError,
    "ActionCable::RemoteConnections::RemoteConnection::InvalidIdentifiersError",
  ],
  [() => m21.Base, "ActionCable::Server::Base"],
  [() => m22.Broadcasting, "ActionCable::Server::Broadcasting"],
  [() => m22.Broadcaster, "ActionCable::Server::Broadcasting::Broadcaster"],
  [() => m23.Configuration, "ActionCable::Server::Configuration"],
  [() => m24.Connections, "ActionCable::Server::Connections"],
  [() => m25.Worker, "ActionCable::Server::Worker"],
  [
    () => m26.ActiveRecordConnectionManagement,
    "ActionCable::Server::Worker::ActiveRecordConnectionManagement",
  ],
  [() => m27.Async, "ActionCable::SubscriptionAdapter::Async"],
  [() => m27.AsyncSubscriberMap, "ActionCable::SubscriptionAdapter::Async::AsyncSubscriberMap"],
  [() => m28.Base, "ActionCable::SubscriptionAdapter::Base"],
  [() => m29.ChannelPrefix, "ActionCable::SubscriptionAdapter::ChannelPrefix"],
  [() => m30.Inline, "ActionCable::SubscriptionAdapter::Inline"],
  [() => m31.SubscriberMap, "ActionCable::SubscriptionAdapter::SubscriberMap"],
  [() => m32.Test, "ActionCable::SubscriptionAdapter::Test"],
  [() => m33.TestHelper, "ActionCable::TestHelper"],
  [() => m18.VERSION, "ActionCable::VERSION"],
]);
