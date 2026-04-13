type PreservedFieldState = {
  name: string;
  type: string;
  value: string;
  checked: boolean;
  selectionStart?: number | null;
  selectionEnd?: number | null;
};

type PreservedFormState = {
  key: string;
  fields: PreservedFieldState[];
};

type PreservedFocusState = {
  formKey?: string;
  name?: string;
  type?: string;
  value?: string;
  id?: string;
  selectionStart?: number | null;
  selectionEnd?: number | null;
};

type PreservedScrollState = {
  key: string;
  top: number;
  left: number;
};

type PreservedDomState = {
  forms: PreservedFormState[];
  focus?: PreservedFocusState;
  windowScrollX: number;
  windowScrollY: number;
  scrollRegions: PreservedScrollState[];
};

const formSelector = "form[data-ui-preserve-form=\"true\"]";
const fieldSelector = "input[name], textarea[name], select[name]";
const scrollRegionSelector = "[data-ui-preserve-scroll]";

export function captureDomState(root: HTMLElement): PreservedDomState {
  const forms = Array.from(root.querySelectorAll<HTMLFormElement>(formSelector))
    .map((form) => ({
      key: resolveFormKey(form),
      fields: Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(fieldSelector))
        .map((field) => captureFieldState(field))
    }));

  const activeElement = document.activeElement;
  const focus = activeElement instanceof HTMLElement && root.contains(activeElement)
    ? captureFocusState(activeElement)
    : undefined;

  const scrollRegions = Array.from(root.querySelectorAll<HTMLElement>(scrollRegionSelector)).map((element) => ({
    key: element.dataset.uiPreserveScroll ?? "",
    top: element.scrollTop,
    left: element.scrollLeft
  }));

  const snapshot: PreservedDomState = {
    forms,
    windowScrollX: window.scrollX,
    windowScrollY: window.scrollY,
    scrollRegions
  };

  if (focus) {
    snapshot.focus = focus;
  }

  return snapshot;
}

export function restoreDomState(root: HTMLElement, snapshot: PreservedDomState | null): void {
  if (!snapshot) {
    return;
  }

  for (const formState of snapshot.forms) {
    const form = findFormByKey(root, formState.key);
    if (!form) continue;
    for (const fieldState of formState.fields) {
      const field = findField(form, fieldState);
      if (!field) continue;
      restoreFieldState(field, fieldState);
    }
  }

  window.scrollTo({
    left: snapshot.windowScrollX,
    top: snapshot.windowScrollY
  });

  for (const scrollState of snapshot.scrollRegions) {
    const element = root.querySelector<HTMLElement>(`[data-ui-preserve-scroll="${escapeSelectorValue(scrollState.key)}"]`);
    if (!element) continue;
    element.scrollTop = scrollState.top;
    element.scrollLeft = scrollState.left;
  }

  if (snapshot.focus) {
    restoreFocus(root, snapshot.focus);
  }
}

function captureFieldState(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): PreservedFieldState {
  const fieldState: PreservedFieldState = {
    name: field.name,
    type: field instanceof HTMLInputElement ? field.type : field instanceof HTMLSelectElement ? "select-one" : "textarea",
    value: field.value,
    checked: field instanceof HTMLInputElement ? field.checked : false
  };

  if ("selectionStart" in field) {
    fieldState.selectionStart = field.selectionStart;
    fieldState.selectionEnd = field.selectionEnd;
  }

  return fieldState;
}

function captureFocusState(activeElement: HTMLElement): PreservedFocusState | undefined {
  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLSelectElement) {
    const focusState: PreservedFocusState = {
      name: activeElement.name,
      type: activeElement instanceof HTMLInputElement ? activeElement.type : activeElement instanceof HTMLSelectElement ? "select-one" : "textarea"
    };

    if (activeElement.form) {
      focusState.formKey = resolveFormKey(activeElement.form);
    }

    if (activeElement instanceof HTMLInputElement && (activeElement.type === "checkbox" || activeElement.type === "radio")) {
      focusState.value = activeElement.value;
    }

    if ("selectionStart" in activeElement) {
      focusState.selectionStart = activeElement.selectionStart;
      focusState.selectionEnd = activeElement.selectionEnd;
    }

    return focusState;
  }

  if (activeElement.id) {
    return { id: activeElement.id };
  }

  return undefined;
}

function restoreFocus(root: HTMLElement, focusState: PreservedFocusState): void {
  if (focusState.id) {
    root.querySelector<HTMLElement>(`#${escapeSelectorValue(focusState.id)}`)?.focus();
    return;
  }

  if (!focusState.formKey || !focusState.name || !focusState.type) {
    return;
  }

  const form = findFormByKey(root, focusState.formKey);
  if (!form) {
    return;
  }

  const field = findField(form, {
    name: focusState.name,
    type: focusState.type,
    value: focusState.value ?? ""
  });

  if (!(field instanceof HTMLElement)) {
    return;
  }

  field.focus();
  if ("setSelectionRange" in field && typeof focusState.selectionStart === "number" && typeof focusState.selectionEnd === "number") {
    field.setSelectionRange(focusState.selectionStart, focusState.selectionEnd);
  }
}

function restoreFieldState(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  fieldState: PreservedFieldState
): void {
  if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
    field.checked = fieldState.checked;
    return;
  }

  field.value = fieldState.value;
}

function resolveFormKey(form: HTMLFormElement): string {
  const scope = form.dataset.uiFormScope ?? "";
  if (form.id) {
    return `id:${form.id}|scope:${scope}`;
  }

  if (scope) {
    return `scope:${scope}|class:${Array.from(form.classList).sort().join(".")}`;
  }

  if (form.dataset.alarmCaseId) {
    return `alarm:${form.dataset.alarmCaseId}|class:${Array.from(form.classList).sort().join(".")}`;
  }

  return `class:${Array.from(form.classList).sort().join(".")}`;
}

function findFormByKey(root: HTMLElement, formKey: string): HTMLFormElement | null {
  for (const form of Array.from(root.querySelectorAll<HTMLFormElement>(formSelector))) {
    if (resolveFormKey(form) === formKey) {
      return form;
    }
  }
  return null;
}

function findField(
  form: HTMLFormElement,
  fieldState: Pick<PreservedFieldState, "name" | "type" | "value">
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  const candidates = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(fieldSelector))
    .filter((field) => field.name === fieldState.name);

  if (fieldState.type === "radio" || fieldState.type === "checkbox") {
    return candidates.find((field) => field instanceof HTMLInputElement && field.value === fieldState.value) ?? null;
  }

  return candidates[0] ?? null;
}

function escapeSelectorValue(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/"/g, '\\"');
}
