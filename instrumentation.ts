export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.AGENT_SCHEDULER_DISABLED === '1') return;

  const { registerPipelineHealthJob, startScheduler } = await import('./src/lib/agents/scheduler');
  registerPipelineHealthJob();
  startScheduler();
}
