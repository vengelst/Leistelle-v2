export type ApiEnvelope<TData> = {
  data: TData;
  meta: {
    requestId: string;
  };
};

export type ApiProblem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  requestId: string;
  code?: string;
};

export type SystemInfo = {
  service: string;
  environment: string;
  version: string;
  apiVersion: "v1";
};

export type AuditEvent = {
  category: string;
  action: string;
  outcome: "success" | "failure";
  actorId?: string;
  subjectId?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type UiShellDescriptor = {
  title: string;
  subtitle: string;
  regions: Array<{
    id: string;
    title: string;
    description: string;
  }>;
};

export type DashboardMetric = {
  value: number;
  label: string;
  hint?: string;
};

export type DashboardActiveOperator = {
  id: string;
  displayName: string;
  status: string;
  primaryRole: string;
  lastStatusChangeAt: string;
};

export type DashboardOverview = {
  metrics: {
    openAlarms: DashboardMetric;
    openDisturbances: DashboardMetric;
    todaysFalsePositives: DashboardMetric;
    criticalSites: DashboardMetric;
    activeOperators: DashboardMetric;
  };
  highlights: {
    alarms: Array<{
      id: string;
      title: string;
      priority: string;
      siteName: string;
      customerName: string;
      receivedAt: string;
    }>;
    disturbances: Array<{
      id: string;
      title: string;
      priority: string;
      siteName: string;
      customerName: string;
      startedAt: string;
      siteTechnicalStatus: string;
    }>;
    criticalSites: Array<{
      siteId: string;
      siteName: string;
      customerName: string;
      siteTechnicalStatus: string;
      openDisturbanceCount: number;
      openAlarmCount: number;
    }>;
    activeOperators: DashboardActiveOperator[];
  };
};
