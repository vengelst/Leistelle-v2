/**
 * Testet das Laden und die Pflichtpruefungen der Backend-Laufzeitkonfiguration.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { loadBackendRuntimeConfig } from "../config/runtime.js";

test("production runtime rejects missing bootstrap password override", () => {
  const previousEnv = process.env;
  process.env = {
    ...previousEnv,
    NODE_ENV: "production",
    DATABASE_URL: "postgres://leitstelle:leitstelle@127.0.0.1:5432/leitstelle",
    AUTH_BOOTSTRAP_PASSWORD: "Leitstelle!2026"
  };

  try {
    assert.throws(
      () => loadBackendRuntimeConfig(),
      /AUTH_BOOTSTRAP_PASSWORD must be set to a production-safe value/i
    );
  } finally {
    process.env = previousEnv;
  }
});