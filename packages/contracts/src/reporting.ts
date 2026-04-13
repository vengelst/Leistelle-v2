import type { AlarmType } from "./alarm-core.js";
import type { MonitoringDisturbanceType } from "./monitoring.js";

export const reportingPeriods = ["day", "week", "month", "year", "custom"] as const;
export const reportingGroupDimensions = ["customer", "site", "camera", "alarm_type", "operator", "disturbance_type"] as const;

export type ReportingPeriod = (typeof reportingPeriods)[number];
export type ReportingGroupDimension = (typeof reportingGroupDimensions)[number];

export type ReportingFilter = {
  period: ReportingPeriod;
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  siteId?: string;
  cameraId?: string;
  alarmType?: AlarmType;
  operatorUserId?: string;
  disturbanceType?: MonitoringDisturbanceType;
  groupBy?: ReportingGroupDimension;
};

export type ReportingTimeRange = {
  period: ReportingPeriod;
  from: string;
  to: string;
  label: string;
};

export type ReportingMetric = {
  value: number;
  label: string;
  hint?: string;
};

export type ReportingDurationMetric = {
  label: string;
  averageSeconds?: number;
  maximumSeconds?: number;
  totalSeconds?: number;
  sampleCount: number;
};

export type ReportingGroupBucket = {
  key: string;
  label: string;
  value: number;
  hint?: string;
};

export type AlarmReportingSummary = {
  counts: {
    totalAlarms: ReportingMetric;
    confirmedIncidents: ReportingMetric;
    falsePositives: ReportingMetric;
    policeCalls: ReportingMetric;
    securityServiceCalls: ReportingMetric;
    customerContacts: ReportingMetric;
  };
  durations: {
    timeToAcceptance: ReportingDurationMetric;
    timeToProcessingStart: ReportingDurationMetric;
    timeToClosure: ReportingDurationMetric;
    openAlarmDuration: ReportingDurationMetric;
  };
  groups: ReportingGroupBucket[];
};

export type MonitoringReportingSummary = {
  counts: {
    totalDisturbances: ReportingMetric;
    openCriticalDisturbances: ReportingMetric;
  };
  durations: {
    openDisturbanceDuration: ReportingDurationMetric;
  };
  groups: ReportingGroupBucket[];
};

export type ReportingOverview = {
  filter: ReportingFilter;
  range: ReportingTimeRange;
  alarms: AlarmReportingSummary;
  monitoring: MonitoringReportingSummary;
};
