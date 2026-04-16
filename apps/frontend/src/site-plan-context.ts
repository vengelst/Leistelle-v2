/**
 * Leitet aus Standortplaenen, Markern und offenen Vorgaengen den aktuellen Plan-Kontext ab.
 */
import type {
  AlarmPipelineItem,
  CameraPlanMarker,
  MasterDataOverview,
  MonitoringPipelineItem,
  SiteDevice,
  SitePlan
} from "@leitstelle/contracts";

type SiteWithPlans = MasterDataOverview["sites"][number];

export type ResolvedSitePlanContext = {
  selectedPlan?: SitePlan;
  selectedMarker?: CameraPlanMarker;
  selectedDevice?: SiteDevice;
  matchingAlarms: AlarmPipelineItem[];
  matchingDisturbances: MonitoringPipelineItem[];
  cameraMarkerCount: number;
  unassignedCameraMarkerCount: number;
};

type ResolveSitePlanContextInput = {
  site: SiteWithPlans;
  selectedPlanId?: string;
  selectedMarkerId?: string;
  highlightedDeviceId?: string;
  openAlarms: AlarmPipelineItem[];
  openDisturbances: MonitoringPipelineItem[];
};

export function resolveSitePlanContext(input: ResolveSitePlanContextInput): ResolvedSitePlanContext {
  const selectedPlan = input.site.plans.find((plan) => plan.id === input.selectedPlanId) ?? input.site.plans[0];
  if (!selectedPlan) {
    return {
      matchingAlarms: [],
      matchingDisturbances: [],
      cameraMarkerCount: 0,
      unassignedCameraMarkerCount: 0
    };
  }

  const selectedMarker = selectedPlan.markers.find((marker) => marker.id === input.selectedMarkerId)
    ?? (input.highlightedDeviceId
      ? selectedPlan.markers.find((marker) => marker.deviceId === input.highlightedDeviceId)
      : undefined)
    ?? selectedPlan.markers[0];
  const selectedDevice = selectedMarker?.deviceId
    ? input.site.devices.find((device) => device.id === selectedMarker.deviceId)
    : undefined;

  const resolved: ResolvedSitePlanContext = {
    selectedPlan,
    matchingAlarms: selectedMarker?.deviceId
      ? input.openAlarms.filter((alarm) => alarm.siteId === input.site.id && alarm.primaryDeviceId === selectedMarker.deviceId)
      : [],
    matchingDisturbances: selectedMarker?.deviceId
      ? input.openDisturbances.filter((disturbance) => disturbance.siteId === input.site.id && disturbance.deviceId === selectedMarker.deviceId)
      : [],
    cameraMarkerCount: selectedPlan.markers.filter((marker) => marker.markerType === "camera").length,
    unassignedCameraMarkerCount: selectedPlan.markers.filter((marker) => marker.markerType === "camera" && !marker.deviceId).length
  };

  if (selectedMarker) {
    resolved.selectedMarker = selectedMarker;
  }
  if (selectedDevice) {
    resolved.selectedDevice = selectedDevice;
  }

  return resolved;
}
