/**
 * Buendelt vendor-spezifische Profile, Aliasregeln und Normalisierungen fuer externe Alarmquellen.
 */
import type { MediaBundleProfileKey } from "@leitstelle/contracts";

import { toVendorSnakeCase } from "./vendor-adapter-utils.js";

export type VendorSourceProfile = {
  sourceType: string;
  defaultMediaBundleProfileKey: MediaBundleProfileKey;
  supportedMediaParserKeys: string[];
  preferredMatchingKeys: string[];
  alarmEventAliases: Record<string, string>;
};

export type VendorProfile = {
  vendorKey: string;
  sourceProfiles: Record<string, VendorSourceProfile>;
};

export type MediaBundleProfileDefinition = {
  key: MediaBundleProfileKey;
  expectedImages: number;
  expectedClips: number;
};

export const mediaBundleProfiles: Record<MediaBundleProfileKey, MediaBundleProfileDefinition> = {
  three_images_one_clip: { key: "three_images_one_clip", expectedImages: 3, expectedClips: 1 },
  single_snapshot: { key: "single_snapshot", expectedImages: 1, expectedClips: 0 },
  clip_only: { key: "clip_only", expectedImages: 0, expectedClips: 1 },
  nvr_channel_snapshot_clip: { key: "nvr_channel_snapshot_clip", expectedImages: 1, expectedClips: 1 },
  event_without_media: { key: "event_without_media", expectedImages: 0, expectedClips: 0 }
};

export const vendorProfiles: Record<string, VendorProfile> = {
  grundig: {
    vendorKey: "grundig",
    sourceProfiles: {
      camera: {
        sourceType: "camera",
        defaultMediaBundleProfileKey: "three_images_one_clip",
        supportedMediaParserKeys: ["groundig-standard-v1"],
        preferredMatchingKeys: ["vendor_event_id", "correlation_key", "external_source_key", "channel_number", "event_type", "event_ts"],
        alarmEventAliases: {
          motion: "motion",
          intrusion: "area_entry",
          intrusiondetection: "area_entry",
          line_crossing: "line_crossing",
          linecrossing: "line_crossing",
          tamper: "sabotage",
          sabotage: "sabotage",
          network_disconnect: "camera_offline",
          networkdisconnected: "camera_offline",
          video_loss: "video_loss",
          videoloss: "video_loss"
        }
      },
      nvr: {
        sourceType: "nvr",
        defaultMediaBundleProfileKey: "three_images_one_clip",
        supportedMediaParserKeys: ["groundig-standard-v1"],
        preferredMatchingKeys: ["vendor_event_id", "correlation_key", "external_recorder_id", "channel_number", "event_type", "event_ts"],
        alarmEventAliases: {
          motion: "motion",
          intrusion: "area_entry",
          line_crossing: "line_crossing",
          tamper: "sabotage",
          sabotage: "sabotage",
          network_disconnect: "nvr_offline",
          videoloss: "video_loss",
          video_loss: "video_loss"
        }
      }
    }
  },
  dahua: {
    vendorKey: "dahua",
    sourceProfiles: {
      nvr: {
        sourceType: "nvr",
        defaultMediaBundleProfileKey: "nvr_channel_snapshot_clip",
        supportedMediaParserKeys: ["dahua-structured-v1", "dahua-legacy-underscore-v1"],
        preferredMatchingKeys: ["vendor_event_id", "external_recorder_id", "channel_number", "serial_number"],
        alarmEventAliases: {
          videomotion: "motion",
          motion: "motion",
          motiondetect: "motion",
          motiondetection: "motion",
          crosslinedetection: "line_crossing",
          linecrossingdetection: "line_crossing",
          tripwire: "line_crossing",
          crossregiondetection: "area_entry",
          intrusion: "area_entry",
          intrusiondetection: "area_entry",
          videoblind: "sabotage",
          tamper: "sabotage",
          videoloss: "video_loss",
          ipcoffline: "camera_offline",
          channeloffline: "camera_offline",
          nvroffline: "nvr_offline",
          recorderoffline: "nvr_offline"
        }
      }
    }
  },
  hikvision: {
    vendorKey: "hikvision",
    sourceProfiles: {
      camera: {
        sourceType: "camera",
        defaultMediaBundleProfileKey: "single_snapshot",
        supportedMediaParserKeys: ["hikvision-structured-v1", "hikvision-legacy-underscore-v1"],
        preferredMatchingKeys: ["vendor_event_id", "external_device_id", "serial_number"],
        alarmEventAliases: {
          videomotion: "motion",
          motion: "motion",
          motiondetection: "motion",
          motion_detection: "motion",
          linedetection: "line_crossing",
          linedetectionstart: "line_crossing",
          linedetectionstop: "line_crossing",
          line_detection: "line_crossing",
          line_detection_start: "line_crossing",
          intrusion: "area_entry",
          intrusionstart: "area_entry",
          intrusionstop: "area_entry",
          fielddetection: "area_entry",
          tamperdetection: "sabotage",
          shelteralarm: "sabotage",
          videotampering: "sabotage",
          videoloss: "video_loss",
          video_loss: "video_loss",
          netbroken: "camera_offline",
          networkdisconnected: "camera_offline",
          ipcdisconnect: "camera_offline",
          ipconflict: "camera_offline",
          ipaddressconflicted: "camera_offline"
        }
      },
      nvr: {
        sourceType: "nvr",
        defaultMediaBundleProfileKey: "nvr_channel_snapshot_clip",
        supportedMediaParserKeys: ["hikvision-structured-v1", "hikvision-legacy-underscore-v1"],
        preferredMatchingKeys: ["vendor_event_id", "external_recorder_id", "channel_number", "serial_number"],
        alarmEventAliases: {
          videomotion: "motion",
          motion: "motion",
          motiondetection: "motion",
          videoloss: "video_loss",
          videolost: "video_loss",
          tamper: "sabotage",
          shelteralarm: "sabotage",
          hderror: "technical",
          diskerror: "technical",
          hdfull: "technical",
          diskfull: "technical",
          recorderror: "technical",
          videoexception: "technical",
          netbroken: "nvr_offline",
          nvroffline: "nvr_offline",
          ipconflict: "nvr_offline",
          ipaddressconflicted: "nvr_offline",
          ipcdisconnect: "camera_offline",
          channeloffline: "camera_offline"
        }
      }
    }
  },
  ajax: {
    vendorKey: "ajax",
    sourceProfiles: {
      hub: {
        sourceType: "hub",
        defaultMediaBundleProfileKey: "event_without_media",
        supportedMediaParserKeys: [],
        preferredMatchingKeys: ["vendor_event_id", "external_device_id", "external_source_key"],
        alarmEventAliases: {}
      },
      nvr: {
        sourceType: "nvr",
        defaultMediaBundleProfileKey: "nvr_channel_snapshot_clip",
        supportedMediaParserKeys: [],
        preferredMatchingKeys: ["vendor_event_id", "external_recorder_id", "channel_number"],
        alarmEventAliases: {}
      }
    }
  }
};

export function getVendorProfile(vendor: string): VendorProfile | null {
  return vendorProfiles[vendor.trim().toLowerCase()] ?? null;
}

export function getVendorSourceProfile(vendor: string, sourceType: string): VendorSourceProfile | null {
  return getVendorProfile(vendor)?.sourceProfiles[sourceType.trim().toLowerCase()] ?? null;
}

export function normalizeVendorEventType(vendor: string, sourceType: string, rawValue: string): string {
  const normalized = rawValue.trim().toLowerCase();
  const profile = getVendorSourceProfile(vendor, sourceType);
  const alias = profile?.alarmEventAliases[normalized];
  if (alias) {
    return alias;
  }
  return toVendorSnakeCase(rawValue);
}

export function getDefaultMediaBundleProfileKey(vendor: string, sourceType: string): MediaBundleProfileKey {
  return getVendorSourceProfile(vendor, sourceType)?.defaultMediaBundleProfileKey ?? "event_without_media";
}