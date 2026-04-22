/**
 * Steuert Kartenaktionen, Marker-Selektion und Plan-Navigation im Standortkontext.
 */
import type { SiteMapMarkerCollection } from "@leitstelle/contracts";
import type { AppHandlers } from "./events.js";
import type { HandlerRuntime } from "./handler-runtime.js";

import { apiRequest } from "../api.js";
import { state } from "../state.js";
import { clamp, compactMonitoringFilter, compactPipelineFilter } from "../utils.js";

type MapHandlerDeps = HandlerRuntime & {
  fetchOpenAlarms: (successMessage: string | null) => Promise<void>;
  fetchOpenDisturbances: (successMessage: string | null) => Promise<void>;
};

export function createMapHandlers(
  deps: MapHandlerDeps
): Pick<
  AppHandlers,
  | "handleMapFocusSite"
  | "handleMapMarkerSelect"
  | "handleSitePlanSelect"
  | "handleSitePlanMarkerSelect"
  | "handleSitePlanOpenCameraLive"
  | "handleSitePlanZoom"
  | "fetchSiteMarkers"
> {
  function openCameraLiveView(siteId: string, deviceId: string): boolean {
    if (!siteId || !deviceId) {
      return false;
    }
    const site = state.overview?.sites.find((entry) => entry.id === siteId);
    const device = site?.devices.find((entry) => entry.id === deviceId);
    const liveViewUrl = device?.liveViewUrl?.trim();
    if (!liveViewUrl) {
      state.error = `Fuer Kamera "${device?.name ?? deviceId}" ist keine Livebild-URL hinterlegt.`;
      state.message = null;
      deps.render();
      return false;
    }
    const popup = window.open(
      liveViewUrl,
      `leitstelle-camera-live-${deviceId}`,
      "popup=yes,width=1280,height=760,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes"
    );
    if (!popup) {
      state.error = "Livebild-Popup wurde vom Browser blockiert.";
      state.message = null;
      deps.render();
      return false;
    }
    popup.focus();
    state.message = `Livebild geoeffnet: ${device?.name ?? deviceId}`;
    state.error = null;
    return true;
  }

  async function handleMapFocusSite(siteId: string, scope: "both" | "alarms" | "monitoring"): Promise<void> {
    if (!siteId) return;
    state.selectedMapSiteId = siteId;
    deps.setBusyState("site-focus", "Standortkontext wird fokussiert");

    try {
      await deps.runRenderBatch(async () => {
        if (scope === "both" || scope === "alarms") {
          state.pipelineFilter = compactPipelineFilter({ siteId });
          await deps.fetchOpenAlarms(null);
        }

        if (scope === "both" || scope === "monitoring") {
          state.monitoringFilter = compactMonitoringFilter({ siteId });
          await deps.fetchOpenDisturbances(null);
        }

        deps.setSuccess(
          scope === "alarms"
            ? "Alarm-Pipeline auf Standort fokussiert."
            : scope === "monitoring"
              ? "Stoerungspipeline auf Standort fokussiert."
              : "Operative Ansichten auf Standort fokussiert."
        );
      });
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Standortfokus konnte nicht gesetzt werden.");
    } finally {
      deps.setBusyState("site-focus", null);
    }
  }

  return {
    async fetchSiteMarkers(successMessage: string | null): Promise<void> {
      deps.setBusyState("map", "Kartenstandorte werden geladen");
      try {
        const response = await apiRequest<{ siteMarkers: SiteMapMarkerCollection }>("/api/v1/map/site-markers", { method: "GET" });
        state.siteMarkers = response.siteMarkers;
        const hasSelectedMarker = response.siteMarkers.markers.some((marker) => marker.siteId === state.selectedMapSiteId);
        if (hasSelectedMarker && state.selectedMapSiteId) {
          state.selectedMapSiteId = state.selectedMapSiteId;
        } else if (response.siteMarkers.markers[0]?.siteId) {
          state.selectedMapSiteId = response.siteMarkers.markers[0].siteId;
        } else {
          delete state.selectedMapSiteId;
        }
        deps.setSuccess(successMessage);
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Standortkarte konnte nicht geladen werden.");
      } finally {
        deps.setBusyState("map", null);
      }
    },
    handleMapFocusSite,
    async handleMapMarkerSelect(siteId: string): Promise<void> {
      if (!siteId) return;
      await handleMapFocusSite(siteId, "both");
    },
    handleSitePlanSelect(siteId: string, planId: string): void {
      if (!siteId || !planId) return;
      const site = state.overview?.sites.find((entry) => entry.id === siteId);
      const plan = site?.plans.find((entry) => entry.id === planId);
      state.selectedSitePlanIds = {
        ...state.selectedSitePlanIds,
        [siteId]: planId
      };
      if (plan?.markers[0]?.id) {
        state.selectedSitePlanMarkerIds = {
          ...state.selectedSitePlanMarkerIds,
          [planId]: state.selectedSitePlanMarkerIds[planId] && plan.markers.some((marker) => marker.id === state.selectedSitePlanMarkerIds[planId])
            ? state.selectedSitePlanMarkerIds[planId]
            : plan.markers[0].id
        };
      }
      deps.render();
    },
    handleSitePlanMarkerSelect(siteId: string, planId: string, markerId: string): void {
      if (!siteId || !planId || !markerId) return;
      state.selectedMapSiteId = siteId;
      state.selectedSitePlanMarkerIds = {
        ...state.selectedSitePlanMarkerIds,
        [planId]: markerId
      };
      const site = state.overview?.sites.find((entry) => entry.id === siteId);
      const selectedPlan = site?.plans.find((entry) => entry.id === planId);
      const selectedMarker = selectedPlan?.markers.find((entry) => entry.id === markerId);
      if (selectedMarker?.markerType === "camera" && selectedMarker.deviceId) {
        openCameraLiveView(siteId, selectedMarker.deviceId);
      }
      deps.render();
    },
    handleSitePlanOpenCameraLive(siteId: string, deviceId: string): void {
      const opened = openCameraLiveView(siteId, deviceId);
      if (opened) {
        deps.render();
      }
    },
    handleSitePlanZoom(planId: string, direction: -1 | 1): void {
      if (!planId) return;
      const currentZoom = state.selectedSitePlanZooms[planId] ?? 1;
      const nextZoom = clamp(Math.round((currentZoom + (direction * 0.2)) * 10) / 10, 0.8, 2);
      state.selectedSitePlanZooms = {
        ...state.selectedSitePlanZooms,
        [planId]: nextZoom
      };
      deps.render();
    }
  };
}
