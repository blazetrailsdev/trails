import { defineConstants } from "@blazetrails/ruby-compat";
import "./index.js";
import * as m0 from "./active-job/batch-id.js";
import * as m1 from "./active-job/concurrency-controls.js";
import * as m2 from "./active-job/queue-adapters/solid-queue-adapter.js";
import * as m3 from "./app-executor.js";
import * as m4 from "./async-supervisor.js";
import * as m5 from "./batch-execution.js";
import * as m6 from "./batch.js";
import * as m7 from "./batch/callbacks.js";
import * as m8 from "./batch/clearable.js";
import * as m9 from "./batch/status.js";
import * as m10 from "./batch/sweepable.js";
import * as m11 from "./blocked-execution.js";
import * as m12 from "./claimed-execution.js";
import * as m13 from "./configuration.js";
import * as m14 from "./dispatcher.js";
import * as m15 from "./dispatcher/concurrency-maintenance.js";
import * as m16 from "./engine.js";
import * as m17 from "./execution.js";
import * as m18 from "./execution/dispatching.js";
import * as m19 from "./execution/job-attributes.js";
import * as m20 from "./failed-execution.js";
import * as m21 from "./failed-execution/batchable.js";
import * as m22 from "./fiber-pool.js";
import * as m23 from "./fork-supervisor.js";
import * as m24 from "./job.js";
import * as m25 from "./job/batchable.js";
import * as m26 from "./job/clearable.js";
import * as m27 from "./job/concurrency-controls.js";
import * as m28 from "./job/executable.js";
import * as m29 from "./job/recurrable.js";
import * as m30 from "./job/retryable.js";
import * as m31 from "./job/schedulable.js";
import * as m32 from "./lifecycle-hooks.js";
import * as m33 from "./log-subscriber.js";
import * as m34 from "./pause.js";
import * as m35 from "./pool.js";
import * as m36 from "./process.js";
import * as m37 from "./process/executor.js";
import * as m38 from "./process/prunable.js";
import * as m39 from "./processes/base.js";
import * as m40 from "./processes/callbacks.js";
import * as m41 from "./processes/interruptible.js";
import * as m42 from "./processes/poller.js";
import * as m43 from "./processes/process-exit-error.js";
import * as m44 from "./processes/process-missing-error.js";
import * as m45 from "./processes/process-pruned-error.js";
import * as m46 from "./processes/procline.js";
import * as m47 from "./processes/registrable.js";
import * as m48 from "./processes/runnable.js";
import * as m49 from "./processes/supervised.js";
import * as m50 from "./processes/thread-terminated-error.js";
import * as m51 from "./processes/unrecoverable-error.js";
import * as m52 from "./queue-selector.js";
import * as m53 from "./queue.js";
import * as m54 from "./ready-execution.js";
import * as m55 from "./record.js";
import * as m56 from "./recurring-execution.js";
import * as m57 from "./recurring-job.js";
import * as m58 from "./recurring-task.js";
import * as m59 from "./recurring-task/arguments.js";
import * as m60 from "./scheduled-execution.js";
import * as m61 from "./scheduler.js";
import * as m62 from "./scheduler/recurring-schedule.js";
import * as m63 from "./semaphore.js";
import * as m64 from "./supervisor.js";
import * as m65 from "./supervisor/maintenance.js";
import * as m66 from "./supervisor/pidfile.js";
import * as m67 from "./supervisor/pidfiled.js";
import * as m68 from "./supervisor/signals.js";
import * as m69 from "./thread-pool.js";
import * as m70 from "./timer.js";
import * as m71 from "./worker.js";

defineConstants([
  [m0, "BatchId", "ActiveJob::BatchId"],
  [m1, "ConcurrencyControls", "ActiveJob::ConcurrencyControls"],
  [m1, "ClassMethods", "ActiveJob::ConcurrencyControls::ClassMethods"],
  [m2, "SolidQueueAdapter", "ActiveJob::QueueAdapters::SolidQueueAdapter"],
  [m3, "AppExecutor", "SolidQueue::AppExecutor"],
  [m4, "AsyncSupervisor", "SolidQueue::AsyncSupervisor"],
  [m6, "Batch", "SolidQueue::Batch"],
  [m6, "AlreadyFinished", "SolidQueue::Batch::AlreadyFinished"],
  [m7, "Callbacks", "SolidQueue::Batch::Callbacks"],
  [m8, "Clearable", "SolidQueue::Batch::Clearable"],
  [m8, "ClassMethods", "SolidQueue::Batch::Clearable::ClassMethods"],
  [m6, "PendingMigrations", "SolidQueue::Batch::PendingMigrations"],
  [m9, "Status", "SolidQueue::Batch::Status"],
  [m10, "Sweepable", "SolidQueue::Batch::Sweepable"],
  [m10, "ClassMethods", "SolidQueue::Batch::Sweepable::ClassMethods"],
  [m5, "BatchExecution", "SolidQueue::BatchExecution"],
  [m11, "BlockedExecution", "SolidQueue::BlockedExecution"],
  [m12, "ClaimedExecution", "SolidQueue::ClaimedExecution"],
  [m12, "FinalizationError", "SolidQueue::ClaimedExecution::FinalizationError"],
  [m12, "Result", "SolidQueue::ClaimedExecution::Result"],
  [m13, "Configuration", "SolidQueue::Configuration"],
  [m13, "Process", "SolidQueue::Configuration::Process"],
  [m14, "Dispatcher", "SolidQueue::Dispatcher"],
  [m15, "ConcurrencyMaintenance", "SolidQueue::Dispatcher::ConcurrencyMaintenance"],
  [m16, "Engine", "SolidQueue::Engine"],
  [m17, "Execution", "SolidQueue::Execution"],
  [m18, "Dispatching", "SolidQueue::Execution::Dispatching"],
  [m18, "ClassMethods", "SolidQueue::Execution::Dispatching::ClassMethods"],
  [m19, "JobAttributes", "SolidQueue::Execution::JobAttributes"],
  [m19, "ClassMethods", "SolidQueue::Execution::JobAttributes::ClassMethods"],
  [m17, "UndiscardableError", "SolidQueue::Execution::UndiscardableError"],
  [m20, "FailedExecution", "SolidQueue::FailedExecution"],
  [m21, "Batchable", "SolidQueue::FailedExecution::Batchable"],
  [m22, "FiberPool", "SolidQueue::FiberPool"],
  [m23, "ForkSupervisor", "SolidQueue::ForkSupervisor"],
  [m24, "Job", "SolidQueue::Job"],
  [m25, "Batchable", "SolidQueue::Job::Batchable"],
  [m25, "ClassMethods", "SolidQueue::Job::Batchable::ClassMethods"],
  [m24, "ClassMissingError", "SolidQueue::Job::ClassMissingError"],
  [m26, "Clearable", "SolidQueue::Job::Clearable"],
  [m26, "ClassMethods", "SolidQueue::Job::Clearable::ClassMethods"],
  [m27, "ConcurrencyControls", "SolidQueue::Job::ConcurrencyControls"],
  [m27, "ClassMethods", "SolidQueue::Job::ConcurrencyControls::ClassMethods"],
  [m24, "EnqueueError", "SolidQueue::Job::EnqueueError"],
  [m28, "Executable", "SolidQueue::Job::Executable"],
  [m28, "ClassMethods", "SolidQueue::Job::Executable::ClassMethods"],
  [m29, "Recurrable", "SolidQueue::Job::Recurrable"],
  [m30, "Retryable", "SolidQueue::Job::Retryable"],
  [m31, "Schedulable", "SolidQueue::Job::Schedulable"],
  [m31, "ClassMethods", "SolidQueue::Job::Schedulable::ClassMethods"],
  [m32, "LifecycleHooks", "SolidQueue::LifecycleHooks"],
  [m32, "ClassMethods", "SolidQueue::LifecycleHooks::ClassMethods"],
  [m33, "LogSubscriber", "SolidQueue::LogSubscriber"],
  [m34, "Pause", "SolidQueue::Pause"],
  [m35, "Pool", "SolidQueue::Pool"],
  [m36, "Process", "SolidQueue::Process"],
  [m37, "Executor", "SolidQueue::Process::Executor"],
  [m38, "Prunable", "SolidQueue::Process::Prunable"],
  [m38, "ClassMethods", "SolidQueue::Process::Prunable::ClassMethods"],
  [m39, "Base", "SolidQueue::Processes::Base"],
  [m48, "BootGuards", "SolidQueue::Processes::BootGuards"],
  [m48, "ForkGuard", "SolidQueue::Processes::BootGuards::ForkGuard"],
  [m48, "NullGuard", "SolidQueue::Processes::BootGuards::NullGuard"],
  [m40, "Callbacks", "SolidQueue::Processes::Callbacks"],
  [m41, "Interruptible", "SolidQueue::Processes::Interruptible"],
  [m42, "Poller", "SolidQueue::Processes::Poller"],
  [m43, "ProcessExitError", "SolidQueue::Processes::ProcessExitError"],
  [m44, "ProcessMissingError", "SolidQueue::Processes::ProcessMissingError"],
  [m45, "ProcessPrunedError", "SolidQueue::Processes::ProcessPrunedError"],
  [m46, "Procline", "SolidQueue::Processes::Procline"],
  [m47, "Registrable", "SolidQueue::Processes::Registrable"],
  [m48, "Runnable", "SolidQueue::Processes::Runnable"],
  [m49, "Supervised", "SolidQueue::Processes::Supervised"],
  [m50, "ThreadTerminatedError", "SolidQueue::Processes::ThreadTerminatedError"],
  [m51, "UnrecoverableError", "SolidQueue::Processes::UnrecoverableError"],
  [m53, "Queue", "SolidQueue::Queue"],
  [m52, "QueueSelector", "SolidQueue::QueueSelector"],
  [m54, "ReadyExecution", "SolidQueue::ReadyExecution"],
  [m55, "Record", "SolidQueue::Record"],
  [m56, "RecurringExecution", "SolidQueue::RecurringExecution"],
  [m56, "AlreadyRecorded", "SolidQueue::RecurringExecution::AlreadyRecorded"],
  [m57, "RecurringJob", "SolidQueue::RecurringJob"],
  [m58, "RecurringTask", "SolidQueue::RecurringTask"],
  [m59, "Arguments", "SolidQueue::RecurringTask::Arguments"],
  [m60, "ScheduledExecution", "SolidQueue::ScheduledExecution"],
  [m61, "Scheduler", "SolidQueue::Scheduler"],
  [m62, "RecurringSchedule", "SolidQueue::Scheduler::RecurringSchedule"],
  [m63, "Semaphore", "SolidQueue::Semaphore"],
  [m63, "Proxy", "SolidQueue::Semaphore::Proxy"],
  [m64, "Supervisor", "SolidQueue::Supervisor"],
  [m65, "Maintenance", "SolidQueue::Supervisor::Maintenance"],
  [m66, "Pidfile", "SolidQueue::Supervisor::Pidfile"],
  [m67, "Pidfiled", "SolidQueue::Supervisor::Pidfiled"],
  [m68, "Signals", "SolidQueue::Supervisor::Signals"],
  [m69, "ThreadPool", "SolidQueue::ThreadPool"],
  [m70, "Timer", "SolidQueue::Timer"],
  [m71, "Worker", "SolidQueue::Worker"],
]);
