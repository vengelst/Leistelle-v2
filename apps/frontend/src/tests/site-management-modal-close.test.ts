import assert from "node:assert/strict";
import test from "node:test";

import { bindDeviceModalCloseInteractions } from "../actions/events.js";

test("device modal close interactions close on escape and backdrop only", () => {
  const listeners = new Map<string, Array<(event: any) => void>>();
  const backdropListeners = new Map<string, Array<(event: any) => void>>();
  let closeCalls = 0;

  const fakeBackdrop = {
    addEventListener(type: string, listener: (event: any) => void) {
      backdropListeners.set(type, [...(backdropListeners.get(type) ?? []), listener]);
    },
    removeEventListener(type: string, listener: (event: any) => void) {
      backdropListeners.set(type, (backdropListeners.get(type) ?? []).filter((entry) => entry !== listener));
    }
  };

  const fakeDocument = {
    querySelector(selector: string) {
      return selector === ".site-management-modal-backdrop" ? fakeBackdrop : null;
    },
    addEventListener(type: string, listener: (event: any) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type: string, listener: (event: any) => void) {
      listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== listener));
    }
  };

  const previousDocument = globalThis.document;
  globalThis.document = fakeDocument as unknown as Document;

  try {
    bindDeviceModalCloseInteractions({
      handleSiteManagementCloseDeviceModal: () => {
        closeCalls += 1;
      }
    });

    for (const listener of listeners.get("keydown") ?? []) {
      listener({ key: "Enter" });
    }
    assert.equal(closeCalls, 0);

    for (const listener of listeners.get("keydown") ?? []) {
      listener({ key: "Escape" });
    }
    assert.equal(closeCalls, 1);

    for (const listener of backdropListeners.get("click") ?? []) {
      listener({ currentTarget: fakeBackdrop, target: {} });
    }
    assert.equal(closeCalls, 1);

    for (const listener of backdropListeners.get("click") ?? []) {
      listener({ currentTarget: fakeBackdrop, target: fakeBackdrop });
    }
    assert.equal(closeCalls, 2);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("device modal close interactions remove escape listener when modal is absent", () => {
  const listeners = new Map<string, Array<(event: any) => void>>();
  const fakeBackdrop = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  };

  let modalOpen = true;
  let closeCalls = 0;
  const fakeDocument = {
    querySelector(selector: string) {
      if (selector !== ".site-management-modal-backdrop") {
        return null;
      }
      return modalOpen ? fakeBackdrop : null;
    },
    addEventListener(type: string, listener: (event: any) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type: string, listener: (event: any) => void) {
      listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== listener));
    }
  };

  const previousDocument = globalThis.document;
  globalThis.document = fakeDocument as unknown as Document;

  try {
    bindDeviceModalCloseInteractions({
      handleSiteManagementCloseDeviceModal: () => {
        closeCalls += 1;
      }
    });

    modalOpen = false;
    bindDeviceModalCloseInteractions({
      handleSiteManagementCloseDeviceModal: () => {
        closeCalls += 1;
      }
    });

    for (const listener of listeners.get("keydown") ?? []) {
      listener({ key: "Escape" });
    }

    assert.equal(closeCalls, 0);
  } finally {
    globalThis.document = previousDocument;
  }
});
