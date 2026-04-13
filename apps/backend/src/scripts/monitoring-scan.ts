import { runMonitoringScanJob } from "../jobs/monitoring-scan-job.js";

const result = await runMonitoringScanJob({
  trigger: "script"
});

process.stdout.write(`${JSON.stringify(result)}\n`);
