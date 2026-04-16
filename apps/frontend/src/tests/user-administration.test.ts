/**
 * Testet Rendering und Handlerfluesse der Benutzerverwaltung im Settings-Bereich.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createAdminHandlers } from "../handlers/admin.handlers.js";
import { resetSessionScopedState, state } from "../state.js";
import { renderAdministrationSection } from "../views/auth.js";

test("administration renders user table and detail actions inside existing workspace", () => {
  resetSessionScopedState();
  state.session = createSession(["administrator"]);
  state.userAdministration = createOverview();
  state.userAdministrationView = "detail";
  state.selectedAdministrationUserId = "user-operator";
  state.selectedAdministrationUserEditorId = "user-operator";

  const html = renderAdministrationSection();

  assert.ok(html.includes("Benutzerverwaltung"));
  assert.ok(html.includes("Benutzerdaten"));
  assert.ok(html.includes("Dispatcher Nord"));
  assert.ok(html.includes("Deaktivieren"));
  assert.ok(html.includes("Benutzer bearbeiten"));
});

test("user activation toggle uses dedicated activation endpoint", async () => {
  resetSessionScopedState();
  state.session = createSession(["administrator"]);
  state.userAdministration = createOverview();
  state.userAdministrationView = "detail";
  state.selectedAdministrationUserId = "user-operator";

  const fetchCalls: Array<{ url: string; method: string; body?: string }> = [];
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  const previousLocalStorage = (globalThis as { localStorage?: { getItem: (key: string) => string | null } }).localStorage;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const call = { url, method: init?.method ?? "GET" } as { url: string; method: string; body?: string };
    if (typeof init?.body === "string") {
      call.body = init.body;
    }
    fetchCalls.push(call);

    if (url.endsWith("/api/v1/admin/users/user-operator/activation")) {
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.isActive, false);
      return okResponse({
        overview: createOverview(false)
      });
    }

    throw new Error(`Unexpected fetch ${url}`);
  }) as typeof fetch;
  (globalThis as { localStorage?: { getItem: (key: string) => string | null } }).localStorage = {
    getItem: () => "token-1"
  };
  globalThis.window = {
    ...(globalThis.window ?? globalThis),
    confirm: () => true
  } as Window & typeof globalThis;

  try {
    const handlers = createAdminHandlers(createRuntimeStub());
    await handlers.handleUserAdministrationToggleActive("user-operator");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousLocalStorage) {
      (globalThis as { localStorage?: { getItem: (key: string) => string | null } }).localStorage = previousLocalStorage;
    } else {
      delete (globalThis as { localStorage?: { getItem: (key: string) => string | null } }).localStorage;
    }
    if (previousWindow) {
      globalThis.window = previousWindow;
    } else {
      delete (globalThis as { window?: Window & typeof globalThis }).window;
    }
  }

  assert.ok(fetchCalls.some((call) => call.url.endsWith("/api/v1/admin/users/user-operator/activation") && call.method === "POST"));
  assert.equal(state.userAdministration?.users.find((user) => user.id === "user-operator")?.isActive, false);
  assert.equal(state.message, "Benutzer deaktiviert.");
});

function createSession(roles: string[]) {
  return {
    token: "token-1",
    expiresAt: "2026-04-10T18:00:00.000Z",
    user: {
      id: "user-admin",
      username: "admin",
      email: "admin@example.test",
      displayName: "Admin",
      primaryRole: roles[0] ?? "administrator",
      roles,
      isActive: true,
      status: "aktiv",
      lastStatusChangeAt: "2026-04-10T11:00:00.000Z"
    }
  } as any;
}

function createOverview(operatorActive = true) {
  return {
    users: [
      {
        id: "user-admin",
        username: "admin",
        email: "admin@example.test",
        displayName: "Admin",
        primaryRole: "administrator",
        roles: ["administrator", "leitstellenleiter"],
        isActive: true,
        status: "aktiv",
        lastStatusChangeAt: "2026-04-10T11:00:00.000Z",
        createdAt: "2026-04-10T09:00:00.000Z",
        updatedAt: "2026-04-10T11:00:00.000Z"
      },
      {
        id: "user-operator",
        username: "dispatcher",
        email: "dispatcher@example.test",
        displayName: "Dispatcher Nord",
        primaryRole: "operator",
        roles: ["operator"],
        isActive: operatorActive,
        status: operatorActive ? "aktiv" : "offline",
        lastStatusChangeAt: "2026-04-10T10:30:00.000Z",
        createdAt: "2026-04-10T09:30:00.000Z",
        updatedAt: "2026-04-10T10:30:00.000Z"
      }
    ]
  } as any;
}

function createRuntimeStub() {
  return {
    render: () => undefined,
    setBusyState: (key: string, label: string | null) => {
      if (label) {
        state.pendingOperations = { ...state.pendingOperations, [key]: label };
        return;
      }
      const next = { ...state.pendingOperations };
      delete next[key];
      state.pendingOperations = next;
    },
    setSuccess: (message: string | null) => {
      state.message = message;
      state.error = null;
    },
    setFailure: (message: string) => {
      state.error = message;
      state.message = null;
    },
    runRenderBatch: async <T>(work: () => Promise<T>) => await work()
  };
}

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}
