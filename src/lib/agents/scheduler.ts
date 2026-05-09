import cron, { type ScheduledTask } from 'node-cron';

export interface ScheduledJob {
  name: string;
  cronExpr: string;
  handler: () => Promise<void>;
}

const jobs = new Map<string, ScheduledJob>();
const tasks = new Map<string, ScheduledTask>();
let started = false;

export function registerJob(job: ScheduledJob): void {
  if (jobs.has(job.name)) {
    throw new Error(`Job "${job.name}" is already registered`);
  }
  if (!cron.validate(job.cronExpr)) {
    throw new Error(`Invalid cron expression for "${job.name}": ${job.cronExpr}`);
  }
  jobs.set(job.name, job);
}

export function startScheduler(): void {
  if (started) return;
  if (process.env.AGENT_SCHEDULER_DISABLED === '1') return;
  if (jobs.size === 0) return;

  for (const job of jobs.values()) {
    const task = cron.schedule(job.cronExpr, async () => {
      try {
        await job.handler();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[scheduler] job "${job.name}" failed: ${msg}`);
      }
    });
    tasks.set(job.name, task);
  }
  started = true;
}

export function stopScheduler(): void {
  for (const task of tasks.values()) task.stop();
  tasks.clear();
  started = false;
}

export function listJobs(): ScheduledJob[] {
  return Array.from(jobs.values());
}

export function _resetForTests(): void {
  stopScheduler();
  jobs.clear();
}
