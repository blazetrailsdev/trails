import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./blocked-execution.js";
import * as m1 from "./claimed-execution.js";
import * as m2 from "./configuration.js";
import * as m3 from "./dispatcher.js";
import * as m4 from "./dispatcher/concurrency-maintenance.js";
import * as m5 from "./engine.js";
import * as m6 from "./execution.js";
import * as m7 from "./failed-execution.js";
import * as m8 from "./job.js";
import * as m9 from "./log-subscriber.js";
import * as m10 from "./pause.js";
import * as m11 from "./pool.js";
import * as m12 from "./process.js";
import * as m13 from "./processes/base.js";
import * as m14 from "./processes/poller.js";
import * as m15 from "./processes/process-exit-error.js";
import * as m16 from "./processes/process-missing-error.js";
import * as m17 from "./processes/process-pruned-error.js";
import * as m18 from "./queue-selector.js";
import * as m19 from "./queue.js";
import * as m20 from "./ready-execution.js";
import * as m21 from "./record.js";
import * as m22 from "./recurring-execution.js";
import * as m23 from "./recurring-job.js";
import * as m24 from "./recurring-task.js";
import * as m25 from "./recurring-task/arguments.js";
import * as m26 from "./scheduled-execution.js";
import * as m27 from "./scheduler.js";
import * as m28 from "./scheduler/recurring-schedule.js";
import * as m29 from "./semaphore.js";
import * as m30 from "./supervisor.js";
import * as m31 from "./supervisor/pidfile.js";
import * as m32 from "./worker.js";

registerClassPaths([
  [() => m0.BlockedExecution, "SolidQueue::BlockedExecution"],
  [() => m1.ClaimedExecution, "SolidQueue::ClaimedExecution"],
  [() => m1.Result, "SolidQueue::ClaimedExecution::Result"],
  [() => m2.Configuration, "SolidQueue::Configuration"],
  [() => m3.Dispatcher, "SolidQueue::Dispatcher"],
  [() => m4.ConcurrencyMaintenance, "SolidQueue::Dispatcher::ConcurrencyMaintenance"],
  [() => m5.Engine, "SolidQueue::Engine"],
  [() => m6.Execution, "SolidQueue::Execution"],
  [() => m6.UndiscardableError, "SolidQueue::Execution::UndiscardableError"],
  [() => m7.FailedExecution, "SolidQueue::FailedExecution"],
  [() => m8.Job, "SolidQueue::Job"],
  [() => m8.EnqueueError, "SolidQueue::Job::EnqueueError"],
  [() => m9.LogSubscriber, "SolidQueue::LogSubscriber"],
  [() => m10.Pause, "SolidQueue::Pause"],
  [() => m11.Pool, "SolidQueue::Pool"],
  [() => m12.Process, "SolidQueue::Process"],
  [() => m13.Base, "SolidQueue::Processes::Base"],
  [() => m14.Poller, "SolidQueue::Processes::Poller"],
  [() => m15.ProcessExitError, "SolidQueue::Processes::ProcessExitError"],
  [() => m16.ProcessMissingError, "SolidQueue::Processes::ProcessMissingError"],
  [() => m17.ProcessPrunedError, "SolidQueue::Processes::ProcessPrunedError"],
  [() => m19.Queue, "SolidQueue::Queue"],
  [() => m18.QueueSelector, "SolidQueue::QueueSelector"],
  [() => m20.ReadyExecution, "SolidQueue::ReadyExecution"],
  [() => m21.Record, "SolidQueue::Record"],
  [() => m22.RecurringExecution, "SolidQueue::RecurringExecution"],
  [() => m22.AlreadyRecorded, "SolidQueue::RecurringExecution::AlreadyRecorded"],
  [() => m23.RecurringJob, "SolidQueue::RecurringJob"],
  [() => m24.RecurringTask, "SolidQueue::RecurringTask"],
  [() => m25.Arguments, "SolidQueue::RecurringTask::Arguments"],
  [() => m26.ScheduledExecution, "SolidQueue::ScheduledExecution"],
  [() => m27.Scheduler, "SolidQueue::Scheduler"],
  [() => m28.RecurringSchedule, "SolidQueue::Scheduler::RecurringSchedule"],
  [() => m29.Semaphore, "SolidQueue::Semaphore"],
  [() => m29.Proxy, "SolidQueue::Semaphore::Proxy"],
  [() => m30.Supervisor, "SolidQueue::Supervisor"],
  [() => m31.Pidfile, "SolidQueue::Supervisor::Pidfile"],
  [() => m32.Worker, "SolidQueue::Worker"],
]);
