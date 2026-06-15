export type CategoryAssignment = {
  readonly tabId: string;
  readonly category: string;
};

export const parseCategoryResponse = (
  responseText: string,
  validTabIds: readonly string[],
): readonly CategoryAssignment[] => {
  const validIds = new Set(validTabIds);
  const jsonAssignments = parseJsonAssignments(responseText, validIds);
  if (jsonAssignments.length > 0) {
    return jsonAssignments;
  }
  return parsePlainLineAssignments(responseText, validTabIds);
};

const parseJsonAssignments = (responseText: string, validIds: ReadonlySet<string>): readonly CategoryAssignment[] => {
  const parsed = parseJsonCandidate(responseText);
  if (parsed === null) {
    return [];
  }
  return assignmentsFromJsonValue(parsed, validIds);
};

const parseJsonCandidate = (responseText: string): unknown | null => {
  const candidates = [sliceBetween(responseText, "{", "}"), sliceBetween(responseText, "[", "]")].filter(
    (candidate): candidate is string => candidate !== null,
  );

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      if (error instanceof SyntaxError) {
        continue;
      }
      throw error;
    }
  }
  return null;
};

const sliceBetween = (text: string, open: string, close: string): string | null => {
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start < 0 || end <= start) {
    return null;
  }
  return text.slice(start, end + close.length);
};

const assignmentsFromJsonValue = (value: unknown, validIds: ReadonlySet<string>): readonly CategoryAssignment[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => assignmentsFromJsonEntry(entry, validIds));
  }
  if (!isRecord(value)) {
    return [];
  }
  const groupValue = value["groups"] ?? value["categories"] ?? value["assignments"];
  if (Array.isArray(groupValue)) {
    return groupValue.flatMap((entry) => assignmentsFromJsonEntry(entry, validIds));
  }
  return assignmentsFromJsonEntry(value, validIds);
};

const assignmentsFromJsonEntry = (entry: unknown, validIds: ReadonlySet<string>): readonly CategoryAssignment[] => {
  if (!isRecord(entry)) {
    return [];
  }

  const category = cleanCategory(readString(entry, ["category", "name", "label", "group"]));
  if (category === null) {
    return [];
  }

  const tabIds = readStringList(entry, ["tabs", "tabIds", "ids"]);
  if (tabIds.length > 0) {
    return tabIds
      .filter((tabId) => validIds.has(tabId))
      .map((tabId) => ({ tabId, category }));
  }

  const tabId = readString(entry, ["tabId", "id"]);
  if (tabId !== null && validIds.has(tabId)) {
    return [{ tabId, category }];
  }
  return [];
};

const parsePlainLineAssignments = (
  responseText: string,
  validTabIds: readonly string[],
): readonly CategoryAssignment[] => {
  return responseText
    .split(/\r?\n/u)
    .flatMap((line) => assignmentFromLine(line, validTabIds));
};

const assignmentFromLine = (line: string, validTabIds: readonly string[]): readonly CategoryAssignment[] => {
  const trimmedLine = line.trim().replace(/^[-*•]\s*/u, "");
  for (const tabId of validTabIds) {
    const category = categoryAfterTabId(trimmedLine, tabId);
    if (category !== null) {
      return [{ tabId, category }];
    }
  }
  return [];
};

const categoryAfterTabId = (line: string, tabId: string): string | null => {
  if (!line.startsWith(tabId)) {
    return null;
  }
  const rest = line.slice(tabId.length).trimStart();
  const separator = rest[0];
  if (separator !== ":" && separator !== "-" && separator !== "|") {
    return null;
  }
  return cleanCategory(rest.slice(1));
};

const readString = (entry: Record<string, unknown>, keys: readonly string[]): string | null => {
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
};

const readStringList = (entry: Record<string, unknown>, keys: readonly string[]): readonly string[] => {
  for (const key of keys) {
    const value = entry[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
  }
  return [];
};

const cleanCategory = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }
  const cleaned = value.replace(/[<>"'`(){}[\]/;=]/gu, " ").replace(/\s+/gu, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};
