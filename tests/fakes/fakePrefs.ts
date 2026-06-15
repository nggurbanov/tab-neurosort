import type { PlatformPrefType, PlatformPrefs, PlatformPrefValue } from "../../src/platform";

type StoredPref =
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "int"; readonly value: number }
  | { readonly kind: "string"; readonly value: string };

export class FakePrefs implements PlatformPrefs {
  readonly PREF_STRING = 32;
  readonly PREF_INT = 64;
  readonly PREF_BOOL = 128;
  readonly PREF_INVALID = 0;

  private readonly values = new Map<string, StoredPref>();

  prefHasUserValue(prefName: string): boolean {
    return this.values.has(prefName);
  }

  getPrefType(prefName: string): PlatformPrefType {
    const pref = this.values.get(prefName);
    if (pref === undefined) {
      return this.PREF_INVALID;
    }
    switch (pref.kind) {
      case "string":
        return this.PREF_STRING;
      case "int":
        return this.PREF_INT;
      case "bool":
        return this.PREF_BOOL;
    }
  }

  getStringPref(prefName: string): string {
    const pref = this.values.get(prefName);
    if (pref === undefined || pref.kind !== "string") {
      throw new FakePreferenceTypeError(prefName, "string");
    }
    return pref.value;
  }

  getIntPref(prefName: string): number {
    const pref = this.values.get(prefName);
    if (pref === undefined || pref.kind !== "int") {
      throw new FakePreferenceTypeError(prefName, "int");
    }
    return pref.value;
  }

  getBoolPref(prefName: string): boolean {
    const pref = this.values.get(prefName);
    if (pref === undefined || pref.kind !== "bool") {
      throw new FakePreferenceTypeError(prefName, "bool");
    }
    return pref.value;
  }

  setStringPref(prefName: string, value: string): void {
    this.values.set(prefName, { kind: "string", value });
  }

  setIntPref(prefName: string, value: number): void {
    this.values.set(prefName, { kind: "int", value });
  }

  setBoolPref(prefName: string, value: boolean): void {
    this.values.set(prefName, { kind: "bool", value });
  }

  clearUserPref(prefName: string): void {
    this.values.delete(prefName);
  }

  snapshot(): ReadonlyMap<string, PlatformPrefValue> {
    const snapshot = new Map<string, PlatformPrefValue>();
    this.values.forEach((pref, key) => {
      snapshot.set(key, pref.value);
    });
    return snapshot;
  }

}

export class FakePreferenceTypeError extends Error {
  constructor(readonly prefName: string, readonly expectedKind: StoredPref["kind"]) {
    super(`Preference ${prefName} is not a ${expectedKind}`);
    this.name = "FakePreferenceTypeError";
  }
}

export class FakeSinePrefs {
  readonly reads: string[] = [];
  readonly writes: string[] = [];

  constructor(private readonly prefs: FakePrefs, private readonly branch: string) {}

  readString(name: string, fallback: string): string {
    this.reads.push(name);
    const prefName = this.prefName(name);
    if (!this.prefs.prefHasUserValue(prefName)) {
      return fallback;
    }
    return this.prefs.getStringPref(prefName);
  }

  writeString(name: string, value: string): void {
    this.writes.push(name);
    this.prefs.setStringPref(this.prefName(name), value);
  }

  readBool(name: string, fallback: boolean): boolean {
    this.reads.push(name);
    const prefName = this.prefName(name);
    if (!this.prefs.prefHasUserValue(prefName)) {
      return fallback;
    }
    return this.prefs.getBoolPref(prefName);
  }

  writeBool(name: string, value: boolean): void {
    this.writes.push(name);
    this.prefs.setBoolPref(this.prefName(name), value);
  }

  readInt(name: string, fallback: number): number {
    this.reads.push(name);
    const prefName = this.prefName(name);
    if (!this.prefs.prefHasUserValue(prefName)) {
      return fallback;
    }
    return this.prefs.getIntPref(prefName);
  }

  writeInt(name: string, value: number): void {
    this.writes.push(name);
    this.prefs.setIntPref(this.prefName(name), value);
  }

  private prefName(name: string): string {
    return `${this.branch}.${name}`;
  }
}
