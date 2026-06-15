export type ShortcutAction = "tidy" | "undo";

export type ShortcutBinding = {
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly key: string;
  readonly meta: boolean;
  readonly shift: boolean;
};

export type ShortcutPreferences = {
  readonly tidy?: string;
  readonly undo?: string;
};

export type KeyboardShortcutEvent = {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly target?: unknown;
};

export type ShortcutMap = {
  readonly tidy: ShortcutBinding;
  readonly undo: ShortcutBinding;
};

export type ShortcutParseResult =
  | { readonly ok: true; readonly binding: ShortcutBinding }
  | { readonly ok: false; readonly reason: "empty" | "missing-key" | "unknown-token" };

export const DEFAULT_TIDY_SHORTCUT = "alt+shift+t";
export const DEFAULT_UNDO_SHORTCUT = "alt+shift+z";

const modifierTokens = ["alt", "control", "ctrl", "cmd", "command", "meta", "shift"] as const;
const editableRoles = ["combobox", "searchbox", "spinbutton", "textbox"] as const;

export const createShortcutMap = (preferences: ShortcutPreferences = {}): ShortcutMap => {
  return {
    tidy: parseShortcutOrDefault(preferences.tidy, DEFAULT_TIDY_SHORTCUT),
    undo: parseShortcutOrDefault(preferences.undo, DEFAULT_UNDO_SHORTCUT),
  };
};

export const getShortcutAction = (
  event: KeyboardShortcutEvent,
  shortcuts: ShortcutMap,
): ShortcutAction | null => {
  if (isEditableTarget(event.target)) {
    return null;
  }

  const eventBinding = bindingFromEvent(event);
  if (bindingsEqual(eventBinding, shortcuts.tidy)) {
    return "tidy";
  }
  if (bindingsEqual(eventBinding, shortcuts.undo)) {
    return "undo";
  }
  return null;
};

export const parseShortcut = (input: string): ShortcutParseResult => {
  const tokens = input
    .split("+")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return { ok: false, reason: "empty" };
  }

  const modifiers = { alt: false, ctrl: false, meta: false, shift: false };
  let key: string | null = null;

  for (const token of tokens) {
    if (isModifierToken(token)) {
      const modifier = normalizeModifier(token);
      modifiers[modifier] = true;
    } else if (isValidKeyToken(token) && key === null) {
      key = normalizeKey(token);
    } else {
      return { ok: false, reason: "unknown-token" };
    }
  }

  if (key === null) {
    return { ok: false, reason: "missing-key" };
  }

  return { ok: true, binding: { ...modifiers, key } };
};

const parseShortcutOrDefault = (input: string | undefined, fallback: string): ShortcutBinding => {
  const parsed = parseShortcut(input ?? fallback);
  if (parsed.ok) {
    return parsed.binding;
  }
  const fallbackParsed = parseShortcut(fallback);
  if (fallbackParsed.ok) {
    return fallbackParsed.binding;
  }
  throw new ShortcutConfigurationError(fallback, "default shortcut is invalid");
};

class ShortcutConfigurationError extends Error {
  constructor(readonly shortcut: string, message: string) {
    super(message);
    this.name = "ShortcutConfigurationError";
  }
}

const bindingFromEvent = (event: KeyboardShortcutEvent): ShortcutBinding => {
  return {
    alt: event.altKey,
    ctrl: event.ctrlKey,
    key: normalizeKey(event.key),
    meta: event.metaKey,
    shift: event.shiftKey,
  };
};

const bindingsEqual = (left: ShortcutBinding, right: ShortcutBinding): boolean => {
  return (
    left.alt === right.alt &&
    left.ctrl === right.ctrl &&
    left.key === right.key &&
    left.meta === right.meta &&
    left.shift === right.shift
  );
};

const isEditableTarget = (target: unknown): boolean => {
  if (typeof target !== "object" || target === null) {
    return false;
  }
  if ("isContentEditable" in target && target.isContentEditable === true) {
    return true;
  }
  if ("tagName" in target && typeof target.tagName === "string") {
    const tagName = target.tagName.toLowerCase();
    if (tagName === "input" || tagName === "select" || tagName === "textarea") {
      return true;
    }
  }
  if ("role" in target && typeof target.role === "string") {
    const role = target.role.toLowerCase();
    return editableRoles.some((editableRole) => editableRole === role);
  }
  return false;
};

const isModifierToken = (token: string): boolean => {
  return modifierTokens.some((modifier) => modifier === token);
};

const normalizeModifier = (token: string): "alt" | "ctrl" | "meta" | "shift" => {
  switch (token) {
    case "alt":
      return "alt";
    case "control":
    case "ctrl":
      return "ctrl";
    case "cmd":
    case "command":
    case "meta":
      return "meta";
    case "shift":
      return "shift";
    default:
      throw new ShortcutConfigurationError(token, "unknown modifier");
  }
};

const isValidKeyToken = (token: string): boolean => {
  return /^[a-z0-9]$/.test(token) || /^f(?:[1-9]|1[0-2])$/.test(token);
};

const normalizeKey = (key: string): string => {
  return key.trim().toLowerCase();
};
