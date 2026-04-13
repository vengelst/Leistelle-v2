export type RegisteredJob = {
  name: string;
  schedule: string;
  purpose: "technical";
  intervalEnv?: string;
};

export function getRegisteredJobs(): RegisteredJob[] {
  return [
    {
      name: "monitoring.scan",
      schedule: "per-site-monitoring-interval",
      purpose: "technical",
      intervalEnv: "WORKER_MONITORING_INTERVAL_SECONDS"
    },
    {
      name: "runtime.self-check",
      schedule: "manual",
      purpose: "technical"
    }
  ];
}
