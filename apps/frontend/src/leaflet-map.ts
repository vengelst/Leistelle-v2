import type { SiteMapMarkerCollection } from "@leitstelle/contracts";

import { state } from "./state.js";

type LeafletNamespace = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletMarkerLayer = import("leaflet").LayerGroup;

let activeLeafletMap: LeafletMap | null = null;
let activeLeafletContainer: HTMLElement | null = null;
let activeLeafletMarkers: LeafletMarkerLayer | null = null;
let lastCenteredSelectedSiteId: string | null = null;

export function bindLeafletMap(
  handlers: {
    handleMapMarkerSelect: (siteId: string) => Promise<void>;
  }
): void {
  const container = document.querySelector<HTMLElement>("#leaflet-map");
  const markers = state.siteMarkers?.markers ?? [];
  const L = resolveLeaflet();

  if (!container || !L || markers.length === 0) {
    destroyLeafletMap();
    return;
  }

  if (activeLeafletContainer !== container) {
    destroyLeafletMap();
    activeLeafletMap = L.map(container, {
      zoomControl: true,
      attributionControl: true
    });
    activeLeafletContainer = container;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(activeLeafletMap);
    activeLeafletMap.on("moveend zoomend", () => {
      if (!activeLeafletMap) {
        return;
      }

      const center = activeLeafletMap.getCenter();
      state.mapZoom = activeLeafletMap.getZoom();
      state.mapCenterLatitude = center.lat;
      state.mapCenterLongitude = center.lng;
    });
  }

  if (!activeLeafletMap) {
    return;
  }

  renderLeafletMarkers(L, markers, handlers.handleMapMarkerSelect);
  syncLeafletViewport(markers);
  window.setTimeout(() => activeLeafletMap?.invalidateSize(), 0);
}

function renderLeafletMarkers(
  L: LeafletNamespace,
  markers: SiteMapMarkerCollection["markers"],
  handleMapMarkerSelect: (siteId: string) => Promise<void>
): void {
  if (!activeLeafletMap) {
    return;
  }

  activeLeafletMarkers?.remove();
  activeLeafletMarkers = L.layerGroup();

  for (const marker of markers) {
    const leafletMarker = L.marker([marker.latitude, marker.longitude], {
      icon: createLeafletMarkerIcon(L, marker, marker.siteId === state.selectedMapSiteId),
      title: marker.siteName
    });

    leafletMarker.on("click", () => {
      void handleMapMarkerSelect(marker.siteId);
    });

    leafletMarker.bindTooltip(buildTooltipHtml(marker), {
      direction: "top",
      offset: [0, -22],
      opacity: 0.96,
      className: "leaflet-site-tooltip"
    });

    activeLeafletMarkers.addLayer(leafletMarker);
  }

  activeLeafletMarkers.addTo(activeLeafletMap);
}

function syncLeafletViewport(markers: SiteMapMarkerCollection["markers"]): void {
  if (!activeLeafletMap) {
    return;
  }

  const selectedMarker = markers.find((marker) => marker.siteId === state.selectedMapSiteId);
  if (selectedMarker && selectedMarker.siteId !== lastCenteredSelectedSiteId) {
    lastCenteredSelectedSiteId = selectedMarker.siteId;
    activeLeafletMap.setView([selectedMarker.latitude, selectedMarker.longitude], Math.max(state.mapZoom || 0, 7), { animate: false });
    return;
  }

  if (!selectedMarker) {
    lastCenteredSelectedSiteId = null;
  }

  if (typeof state.mapCenterLatitude === "number" && typeof state.mapCenterLongitude === "number") {
    activeLeafletMap.setView([state.mapCenterLatitude, state.mapCenterLongitude], state.mapZoom || 6, { animate: false });
    return;
  }

  const bounds = markers.map((marker) => [marker.latitude, marker.longitude] as [number, number]);
  activeLeafletMap.fitBounds(bounds, { padding: [32, 32], maxZoom: 8 });
}

function createLeafletMarkerIcon(
  L: LeafletNamespace,
  marker: SiteMapMarkerCollection["markers"][number],
  isSelected: boolean
) {
  const statusClass = marker.technicalStatus.overallStatus === "offline"
    ? "marker-offline"
    : marker.technicalStatus.overallStatus === "disturbed"
      ? "marker-disturbed"
      : "marker-ok";
  const alarmClass = marker.hasOpenAlarm ? " marker-has-alarm" : "";
  const selectedClass = isSelected ? " selected" : "";
  const badge = marker.openDisturbanceCount > 0
    ? `<span class="leaflet-site-marker-badge">${marker.openDisturbanceCount}</span>`
    : "";

  return L.divIcon({
    className: "leaflet-site-marker-wrapper",
    html: `
      <span class="leaflet-site-marker ${statusClass}${alarmClass}${selectedClass}">
        <span class="leaflet-site-marker-core"></span>
        ${badge}
      </span>
    `.trim(),
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
}

function buildTooltipHtml(marker: SiteMapMarkerCollection["markers"][number]): string {
  return `
    <strong>${escapeLeafletHtml(marker.siteName)}</strong><br />
    ${escapeLeafletHtml(marker.customerName)}<br />
    Alarm ${marker.openAlarmCount} | Stoerungen ${marker.openDisturbanceCount}
  `.trim();
}

function escapeLeafletHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveLeaflet(): LeafletNamespace | null {
  const scope = window as Window & { L?: LeafletNamespace };
  return scope.L ?? null;
}

function destroyLeafletMap(): void {
  activeLeafletMarkers?.remove();
  activeLeafletMarkers = null;
  activeLeafletMap?.remove();
  activeLeafletMap = null;
  activeLeafletContainer = null;
  lastCenteredSelectedSiteId = null;
}
