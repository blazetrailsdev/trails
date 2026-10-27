import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./channel/base.js";
import * as m1 from "./channel/broadcasting.js";
import * as m2 from "./channel/callbacks.js";
import * as m3 from "./channel/naming.js";
import * as m4 from "./channel/periodic-timers.js";
import * as m5 from "./channel/streams.js";
import * as m6 from "./channel/test-case.js";
import * as m7 from "./connection/authorization.js";
import * as m8 from "./connection/base.js";
import * as m9 from "./connection/callbacks.js";
import * as m10 from "./connection/client-socket.js";
import * as m11 from "./connection/identification.js";
import * as m12 from "./connection/internal-channel.js";
import * as m13 from "./connection/message-buffer.js";
import * as m14 from "./connection/stream-event-loop.js";
import * as m15 from "./connection/stream.js";
import * as m16 from "./connection/subscriptions.js";
import * as m17 from "./connection/tagged-logger-proxy.js";
import * as m18 from "./connection/test-case.js";
import * as m19 from "./connection/web-socket.js";
import * as m20 from "./gem-version.js";
import * as m21 from "./helpers/action-cable-helper.js";
import * as m22 from "./remote-connections.js";
import * as m23 from "./server/base.js";
import * as m24 from "./server/broadcasting.js";
import * as m25 from "./server/configuration.js";
import * as m26 from "./server/connections.js";
import * as m27 from "./server/worker.js";
import * as m28 from "./server/worker/active-record-connection-management.js";
import * as m29 from "./subscription-adapter/async.js";
import * as m30 from "./subscription-adapter/base.js";
import * as m31 from "./subscription-adapter/channel-prefix.js";
import * as m32 from "./subscription-adapter/inline.js";
import * as m33 from "./subscription-adapter/subscriber-map.js";
import * as m34 from "./subscription-adapter/test.js";
import * as m35 from "./test-helper.js";

registerClassPaths([
  [() => m0.Base, "ActionCable::Channel::Base"],
  [() => m1.Broadcasting, "ActionCable::Channel::Broadcasting"],
  [() => m1.ClassMethods, "ActionCable::Channel::Broadcasting::ClassMethods"],
  [() => m2.Callbacks, "ActionCable::Channel::Callbacks"],
  [() => m2.ClassMethods, "ActionCable::Channel::Callbacks::ClassMethods"],
  [() => m6.ChannelStub, "ActionCable::Channel::ChannelStub"],
  [() => m6.ConnectionStub, "ActionCable::Channel::ConnectionStub"],
  [() => m3.Naming, "ActionCable::Channel::Naming"],
  [() => m3.ClassMethods, "ActionCable::Channel::Naming::ClassMethods"],
  [() => m6.NonInferrableChannelError, "ActionCable::Channel::NonInferrableChannelError"],
  [() => m4.PeriodicTimers, "ActionCable::Channel::PeriodicTimers"],
  [() => m4.ClassMethods, "ActionCable::Channel::PeriodicTimers::ClassMethods"],
  [() => m5.Streams, "ActionCable::Channel::Streams"],
  [() => m6.TestCase, "ActionCable::Channel::TestCase"],
  [() => m6.Behavior, "ActionCable::Channel::TestCase::Behavior"],
  [() => m6.ClassMethods, "ActionCable::Channel::TestCase::Behavior::ClassMethods"],
  [() => m18.Assertions, "ActionCable::Connection::Assertions"],
  [() => m7.Authorization, "ActionCable::Connection::Authorization"],
  [() => m7.UnauthorizedError, "ActionCable::Connection::Authorization::UnauthorizedError"],
  [() => m8.Base, "ActionCable::Connection::Base"],
  [() => m9.Callbacks, "ActionCable::Connection::Callbacks"],
  [() => m9.ClassMethods, "ActionCable::Connection::Callbacks::ClassMethods"],
  [() => m10.ClientSocket, "ActionCable::Connection::ClientSocket"],
  [() => m11.Identification, "ActionCable::Connection::Identification"],
  [() => m11.ClassMethods, "ActionCable::Connection::Identification::ClassMethods"],
  [() => m12.InternalChannel, "ActionCable::Connection::InternalChannel"],
  [() => m13.MessageBuffer, "ActionCable::Connection::MessageBuffer"],
  [() => m18.NonInferrableConnectionError, "ActionCable::Connection::NonInferrableConnectionError"],
  [() => m15.Stream, "ActionCable::Connection::Stream"],
  [() => m14.StreamEventLoop, "ActionCable::Connection::StreamEventLoop"],
  [() => m16.Subscriptions, "ActionCable::Connection::Subscriptions"],
  [() => m17.TaggedLoggerProxy, "ActionCable::Connection::TaggedLoggerProxy"],
  [() => m18.TestCase, "ActionCable::Connection::TestCase"],
  [() => m18.Behavior, "ActionCable::Connection::TestCase::Behavior"],
  [() => m18.ClassMethods, "ActionCable::Connection::TestCase::Behavior::ClassMethods"],
  [() => m18.TestConnection, "ActionCable::Connection::TestConnection"],
  [() => m18.TestCookieJar, "ActionCable::Connection::TestCookieJar"],
  [() => m18.TestCookies, "ActionCable::Connection::TestCookies"],
  [() => m18.TestRequest, "ActionCable::Connection::TestRequest"],
  [() => m19.WebSocket, "ActionCable::Connection::WebSocket"],
  [() => m21.ActionCableHelper, "ActionCable::Helpers::ActionCableHelper"],
  [() => m22.RemoteConnections, "ActionCable::RemoteConnections"],
  [() => m22.RemoteConnection, "ActionCable::RemoteConnections::RemoteConnection"],
  [
    () => m22.InvalidIdentifiersError,
    "ActionCable::RemoteConnections::RemoteConnection::InvalidIdentifiersError",
  ],
  [() => m23.Base, "ActionCable::Server::Base"],
  [() => m24.Broadcasting, "ActionCable::Server::Broadcasting"],
  [() => m24.Broadcaster, "ActionCable::Server::Broadcasting::Broadcaster"],
  [() => m25.Configuration, "ActionCable::Server::Configuration"],
  [() => m26.Connections, "ActionCable::Server::Connections"],
  [() => m27.Worker, "ActionCable::Server::Worker"],
  [
    () => m28.ActiveRecordConnectionManagement,
    "ActionCable::Server::Worker::ActiveRecordConnectionManagement",
  ],
  [() => m29.Async, "ActionCable::SubscriptionAdapter::Async"],
  [() => m29.AsyncSubscriberMap, "ActionCable::SubscriptionAdapter::Async::AsyncSubscriberMap"],
  [() => m30.Base, "ActionCable::SubscriptionAdapter::Base"],
  [() => m31.ChannelPrefix, "ActionCable::SubscriptionAdapter::ChannelPrefix"],
  [() => m32.Inline, "ActionCable::SubscriptionAdapter::Inline"],
  [() => m33.SubscriberMap, "ActionCable::SubscriptionAdapter::SubscriberMap"],
  [() => m34.Test, "ActionCable::SubscriptionAdapter::Test"],
  [() => m35.TestHelper, "ActionCable::TestHelper"],
  [() => m20.VERSION, "ActionCable::VERSION"],
]);
