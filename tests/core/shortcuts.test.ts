import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIDY_SHORTCUT,
  DEFAULT_UNDO_SHORTCUT,
  createShortcutMap,
  getShortcutAction,
  parseShortcut,
  type KeyboardShortcutEvent,
} from "../../src/core/shortcuts";

const keyEvent = (
  key: string,
  modifiers: Partial<Omit<KeyboardShortcutEvent, "key">> = {},
): KeyboardShortcutEvent => {
  return {
    altKey: modifiers.altKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
    key,
    metaKey: modifiers.metaKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    target: modifiers.target,
  };
};

describe("shortcuts", () => {
  it("uses default tidy and undo shortcuts", () => {
    const shortcuts = createShortcutMap();

    expect(DEFAULT_TIDY_SHORTCUT).toBe("alt+shift+t");
    expect(DEFAULT_UNDO_SHORTCUT).toBe("alt+shift+z");
    expect(getShortcutAction(keyEvent("T", { altKey: true, shiftKey: true }), shortcuts)).toBe("tidy");
    expect(getShortcutAction(keyEvent("z", { altKey: true, shiftKey: true }), shortcuts)).toBe("undo");
  });

  it("honors user shortcut preferences", () => {
    const shortcuts = createShortcutMap({ tidy: "ctrl+j", undo: "meta+shift+u" });

    expect(getShortcutAction(keyEvent("j", { ctrlKey: true }), shortcuts)).toBe("tidy");
    expect(getShortcutAction(keyEvent("u", { metaKey: true, shiftKey: true }), shortcuts)).toBe("undo");
    expect(getShortcutAction(keyEvent("t", { altKey: true, shiftKey: true }), shortcuts)).toBeNull();
  });

  it("suppresses shortcuts from editable fields", () => {
    const shortcuts = createShortcutMap();
    const inputTarget = { tagName: "INPUT" };
    const editableTarget = { isContentEditable: true };

    expect(
      getShortcutAction(keyEvent("t", { altKey: true, shiftKey: true, target: inputTarget }), shortcuts),
    ).toBeNull();
    expect(
      getShortcutAction(keyEvent("z", { altKey: true, shiftKey: true, target: editableTarget }), shortcuts),
    ).toBeNull();
  });

  it("returns structured parse failures for malformed shortcuts", () => {
    expect(parseShortcut("")).toEqual({ ok: false, reason: "empty" });
    expect(parseShortcut("alt+shift")).toEqual({ ok: false, reason: "missing-key" });
    expect(parseShortcut("alt+spacebar+t")).toEqual({ ok: false, reason: "unknown-token" });
    expect(parseShortcut("alt+t+z")).toEqual({ ok: false, reason: "unknown-token" });
  });
});
