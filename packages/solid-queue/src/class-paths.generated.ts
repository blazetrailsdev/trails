import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./app-executor.js";
import * as m1 from "./blocked-execution.js";
import * as m2 from "./claimed-execution.js";
import * as m3 from "./configuration.js";
import * as m4 from "./dispatcher.js";
import * as m5 from "./dispatcher/concurrency-maintenance.js";
import * as m6 from "./engine.js";
import * as m7 from "./execution.js";
import * as m8 from "./failed-execution.js";
import * as m9 from "./job.js";
import * as m10 from "./log-subscriber.js";
import * as m11 from "./pause.js";
import * as m12 from "./pool.js";
import * as m13 from "./process.js";
import * as m14 from "./processes/base.js";
import * as m15 from "./processes/interruptible.js";
import * as m16 from "./processes/poller.js";
import * as m17 from "./processes/process-exit-error.js";
import * as m18 from "./processes/process-missing-error.js";
import * as m19 from "./processes/process-pruned-error.js";
import * as m20 from "./processes/procline.js";
import * as m21 from "./queue-selector.js";
import * as m22 from "./queue.js";
import * as m23 from "./ready-execution.js";
import * as m24 from "./record.js";
import * as m25 from "./recurring-execution.js";
import * as m26 from "./recurring-job.js";
import * as m27 from "./recurring-task.js";
import * as m28 from "./recurring-task/arguments.js";
import * as m29 from "./scheduled-execution.js";
import * as m30 from "./scheduler.js";
import * as m31 from "./scheduler/recurring-schedule.js";
import * as m32 from "./semaphore.js";
import * as m33 from "./supervisor.js";
import * as m34 from "./supervisor/pidfile.js";
import * as m35 from "./timer.js";
import * as m36 from "./worker.js";

registerClassPaths([
  [() => m0.AppExecutor, "SolidQueue::AppExecutor"],
  [() => m1.BlockedExecution, "SolidQueue::BlockedExecution"],
  [() => m2.ClaimedExecution, "SolidQueue::ClaimedExecution"],
  [() => m2.Result, "SolidQueue::ClaimedExecution::Result"],
  [() => m3.Configuration, "SolidQueue::Configuration"],
  [() => m4.Dispatcher, "SolidQueue::Dispatcher"],
  [() => m5.ConcurrencyMaintenance, "SolidQueue::Dispatcher::ConcurrencyMaintenance"],
  [() => m6.Engine, "SolidQueue::Engine"],
  [() => m7.Execution, "SolidQueue::Execution"],
  [() => m7.UndiscardableError, "SolidQueue::Execution::UndiscardableError"],
  [() => m8.FailedExecution, "SolidQueue::FailedExecution"],
  [() => m9.Job, "SolidQueue::Job"],
  [() => m9.EnqueueError, "SolidQueue::Job::EnqueueError"],
  [() => m10.LogSubscriber, "SolidQueue::LogSubscriber"],
  [() => m11.Pause, "SolidQueue::Pause"],
  [() => m12.Pool, "SolidQueue::Pool"],
  [() => m13.Process, "SolidQueue::Process"],
  [() => m14.Base, "SolidQueue::Processes::Base"],
  [() => m15.Interruptible, "SolidQueue::Processes::Interruptible"],
  [() => m16.Poller, "SolidQueue::Processes::Poller"],
  [() => m17.ProcessExitError, "SolidQueue::Processes::ProcessExitError"],
  [() => m18.ProcessMissingError, "SolidQueue::Processes::ProcessMissingError"],
  [() => m19.ProcessPrunedError, "SolidQueue::Processes::ProcessPrunedError"],
  [() => m20.Procline, "SolidQueue::Processes::Procline"],
  [() => m22.Queue, "SolidQueue::Queue"],
  [() => m21.QueueSelector, "SolidQueue::QueueSelector"],
  [() => m23.ReadyExecution, "SolidQueue::ReadyExecution"],
  [() => m24.Record, "SolidQueue::Record"],
  [() => m25.RecurringExecution, "SolidQueue::RecurringExecution"],
  [() => m25.AlreadyRecorded, "SolidQueue::RecurringExecution::AlreadyRecorded"],
  [() => m26.RecurringJob, "SolidQueue::RecurringJob"],
  [() => m27.RecurringTask, "SolidQueue::RecurringTask"],
  [() => m28.Arguments, "SolidQueue::RecurringTask::Arguments"],
  [() => m29.ScheduledExecution, "SolidQueue::ScheduledExecution"],
  [() => m30.Scheduler, "SolidQueue::Scheduler"],
  [() => m31.RecurringSchedule, "SolidQueue::Scheduler::RecurringSchedule"],
  [() => m32.Semaphore, "SolidQueue::Semaphore"],
  [() => m32.Proxy, "SolidQueue::Semaphore::Proxy"],
  [() => m33.Supervisor, "SolidQueue::Supervisor"],
  [() => m34.Pidfile, "SolidQueue::Supervisor::Pidfile"],
  [() => m35.Timer, "SolidQueue::Timer"],
  [() => m36.Worker, "SolidQueue::Worker"],
]);
