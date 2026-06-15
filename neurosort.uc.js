// NeuroSort generated artifact version 1.1.15
// ==UserScript==
// @name           NeuroSort
// @description    AI-assisted tab grouping for Zen Browser/Sine
// @version        1.1.15
// @author         Tyrell
// @include        chrome://browser/content/browser.xhtml
// @run-at         browser
// @ignorecache
// ==/UserScript==
var NeuroSort = (() => {
  // src/core/autoTidy.ts
  var createAutoTidyController = (policy, coordinator, clock) => {
    let lastRunAt = null;
    const shouldRun = (ungroupedTabCount2) => {
      if (!policy.enabled) {
        return { shouldRun: false, reason: "disabled" };
      }
      if (ungroupedTabCount2 < policy.threshold) {
        return { shouldRun: false, reason: "threshold" };
      }
      if (lastRunAt !== null && clock.now() - lastRunAt < policy.cooldownMs) {
        return { shouldRun: false, reason: "cooldown" };
      }
      return { shouldRun: true };
    };
    return {
      shouldRun,
      run: async (ungroupedTabCount2, task) => {
        const check = shouldRun(ungroupedTabCount2);
        if (!check.shouldRun) {
          return { status: "skipped", reason: check.reason };
        }
        const result = await coordinator.run("autoTidy", task);
        if (result.status === "completed") {
          lastRunAt = clock.now();
        }
        return result;
      },
      state: () => ({ lastRunAt })
    };
  };

  // src/core/operations.ts
  var createOperationCoordinator = () => {
    let active = null;
    const run = async (kind, task) => {
      const reject = getRejectResult(kind, active?.kind ?? null);
      if (reject !== null) {
        return reject;
      }
      const operation = { kind, abortController: new AbortController() };
      active = operation;
      try {
        const value = await task({ kind, signal: operation.abortController.signal });
        return { status: "completed", value };
      } catch (error) {
        return { status: "failed", error };
      } finally {
        if (active === operation) {
          active = null;
        }
      }
    };
    return {
      isBusy: () => active !== null,
      current: () => active?.kind ?? null,
      cancelCurrent: (reason = "operation cancelled") => {
        if (active === null) {
          return false;
        }
        active.abortController.abort(reason);
        return true;
      },
      run
    };
  };
  var getRejectResult = (requested, current) => {
    if (current === null) {
      return null;
    }
    if (requested === "undo" && isSortingOperation(current)) {
      return { status: "blocked", reason: "sorting-in-progress" };
    }
    if (requested === "autoTidy" && current === "manualTidy") {
      return { status: "ignored", reason: "manual-tidy-in-progress" };
    }
    if (isSortingOperation(requested) && isSortingOperation(current)) {
      return { status: "ignored", reason: "tidy-in-progress" };
    }
    return { status: "blocked", reason: "operation-in-progress" };
  };
  var isSortingOperation = (kind) => {
    return kind === "manualTidy" || kind === "autoTidy" || kind === "shortcutTidy";
  };

  // src/core/shortcuts.ts
  var DEFAULT_TIDY_SHORTCUT = "alt+shift+t";
  var DEFAULT_UNDO_SHORTCUT = "alt+shift+z";
  var modifierTokens = ["alt", "control", "ctrl", "cmd", "command", "meta", "shift"];
  var editableRoles = ["combobox", "searchbox", "spinbutton", "textbox"];
  var createShortcutMap = (preferences = {}) => {
    return {
      tidy: parseShortcutOrDefault(preferences.tidy, DEFAULT_TIDY_SHORTCUT),
      undo: parseShortcutOrDefault(preferences.undo, DEFAULT_UNDO_SHORTCUT)
    };
  };
  var getShortcutAction = (event, shortcuts) => {
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
  var parseShortcut = (input) => {
    const tokens = input.split("+").map((token) => token.trim().toLowerCase()).filter((token) => token.length > 0);
    if (tokens.length === 0) {
      return { ok: false, reason: "empty" };
    }
    const modifiers = { alt: false, ctrl: false, meta: false, shift: false };
    let key = null;
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
  var parseShortcutOrDefault = (input, fallback) => {
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
  var ShortcutConfigurationError = class extends Error {
    constructor(shortcut, message) {
      super(message);
      this.shortcut = shortcut;
      this.name = "ShortcutConfigurationError";
    }
  };
  var bindingFromEvent = (event) => {
    return {
      alt: event.altKey,
      ctrl: event.ctrlKey,
      key: normalizeKey(event.key),
      meta: event.metaKey,
      shift: event.shiftKey
    };
  };
  var bindingsEqual = (left, right) => {
    return left.alt === right.alt && left.ctrl === right.ctrl && left.key === right.key && left.meta === right.meta && left.shift === right.shift;
  };
  var isEditableTarget = (target) => {
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
  var isModifierToken = (token) => {
    return modifierTokens.some((modifier) => modifier === token);
  };
  var normalizeModifier = (token) => {
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
  var isValidKeyToken = (token) => {
    return /^[a-z0-9]$/.test(token) || /^f(?:[1-9]|1[0-2])$/.test(token);
  };
  var normalizeKey = (key) => {
    return key.trim().toLowerCase();
  };

  // src/core/categoryPlan.ts
  var DEFAULT_MIN_GROUP_SIZE = 2;
  var DEFAULT_MAX_GROUP_SIZE = 12;
  var createCategoryPlan = (tabs, assignments, options = {}) => {
    const minGroupSize = positiveIntegerOrDefault(options.minGroupSize, DEFAULT_MIN_GROUP_SIZE);
    const maxGroupSize = positiveIntegerOrDefault(options.maxGroupSize, DEFAULT_MAX_GROUP_SIZE);
    const tabOrder = new Map(tabs.map((tab, index) => [tab.id, index]));
    const aiChunks = collectAiGroups(assignments, tabOrder).flatMap((group) => splitGroup(group, maxGroupSize));
    const acceptedAiChunks = aiChunks.filter((group) => group.tabIds.length >= minGroupSize);
    const groupedTabIds = new Set(acceptedAiChunks.flatMap((group) => group.tabIds));
    const fallbackTabs = tabs.filter((tab) => !groupedTabIds.has(tab.id));
    const fallbackGroups = collectDomainGroups(fallbackTabs);
    const fallbackChunks = fallbackGroups.flatMap((group) => splitGroup(group, maxGroupSize));
    return {
      groups: [...acceptedAiChunks, ...fallbackChunks].filter((group) => group.tabIds.length >= minGroupSize)
    };
  };
  var collectAiGroups = (assignments, tabOrder) => {
    const assignedTabIds = /* @__PURE__ */ new Set();
    const groups = /* @__PURE__ */ new Map();
    for (const assignment of assignments) {
      if (assignedTabIds.has(assignment.tabId) || !tabOrder.has(assignment.tabId)) {
        continue;
      }
      const key = normalizeCategoryKey(assignment.category);
      if (key === null) {
        continue;
      }
      const existingGroup = groups.get(key);
      const nextTabIds = existingGroup === void 0 ? [assignment.tabId] : [...existingGroup.tabIds, assignment.tabId];
      groups.set(key, { name: existingGroup?.name ?? assignment.category.trim(), tabIds: nextTabIds, source: "ai" });
      assignedTabIds.add(assignment.tabId);
    }
    return Array.from(groups.values()).map((group) => ({
      ...group,
      tabIds: sortTabIds(group.tabIds, tabOrder)
    }));
  };
  var collectDomainGroups = (tabs) => {
    const groups = /* @__PURE__ */ new Map();
    for (const tab of tabs) {
      const name = tab.domain ?? "unknown domain";
      const existingTabIds = groups.get(name) ?? [];
      groups.set(name, [...existingTabIds, tab.id]);
    }
    return Array.from(groups.entries()).sort(([leftName], [rightName]) => leftName.localeCompare(rightName)).map(([name, tabIds]) => ({ name, tabIds, source: "domain" }));
  };
  var splitGroup = (group, maxGroupSize) => {
    if (group.tabIds.length <= maxGroupSize) {
      return [group];
    }
    const chunks = [];
    for (let start = 0; start < group.tabIds.length; start += maxGroupSize) {
      const suffix = chunks.length + 1;
      chunks.push({
        name: `${group.name} ${suffix}`,
        tabIds: group.tabIds.slice(start, start + maxGroupSize),
        source: group.source
      });
    }
    return chunks;
  };
  var sortTabIds = (tabIds, tabOrder) => {
    return [...tabIds].sort((left, right) => orderFor(left, tabOrder) - orderFor(right, tabOrder));
  };
  var orderFor = (tabId, tabOrder) => {
    return tabOrder.get(tabId) ?? Number.MAX_SAFE_INTEGER;
  };
  var normalizeCategoryKey = (category) => {
    const key = category.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
    return key.length > 0 ? key : null;
  };
  var positiveIntegerOrDefault = (value, fallback) => {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      return fallback;
    }
    return value;
  };

  // src/core/groupPlanner.ts
  var planGroupMutations = (input) => {
    const tabsById = new Map(input.tabs.map((tab) => [tab.id, tab]));
    const operations = [];
    const outcomes = [];
    for (const category of input.categories) {
      const targets = selectMovableTargets(category, tabsById, outcomes);
      const firstTarget = targets[0];
      if (firstTarget === void 0) {
        outcomes.push({ kind: "skippedEmptyCategory", category: category.name });
        continue;
      }
      const groupId = generatedGroupId(category.name);
      operations.push({
        kind: "createGroup",
        groupId,
        title: category.name,
        workspaceId: firstTarget.workspaceId
      });
      targets.forEach((target, order) => {
        operations.push({ kind: "moveTabToGroup", tabId: target.id, groupId, order });
      });
    }
    return { operations, outcomes };
  };
  var selectMovableTargets = (category, tabsById, outcomes) => {
    const selected = [];
    const seen = /* @__PURE__ */ new Set();
    for (const tabId of category.tabIds) {
      if (seen.has(tabId)) {
        continue;
      }
      seen.add(tabId);
      const tab = tabsById.get(tabId);
      if (tab === void 0) {
        outcomes.push({ kind: "skippedMissingTab", tabId, category: category.name });
        continue;
      }
      const exclusion = tabExclusion(tab);
      if (exclusion !== null) {
        outcomes.push({ kind: "skippedExcludedTab", tabId, category: category.name, reason: exclusion });
        continue;
      }
      selected.push(tab);
    }
    return selected;
  };
  var tabExclusion = (tab) => {
    if (tab.pinned) {
      return "pinned";
    }
    if (tab.folder) {
      return "folder";
    }
    if (tab.splitView) {
      return "splitView";
    }
    return null;
  };
  var generatedGroupId = (name) => {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return `generated-${slug.length > 0 ? slug : "group"}`;
  };

  // src/core/promptPayload.ts
  var buildPromptPayload = (snapshots, options = {}) => {
    return {
      tabs: snapshots.filter(isPromptEligible).map((snapshot) => toPromptTab(snapshot, options))
    };
  };
  var isPromptEligible = (snapshot) => {
    return snapshot.exclusion === null;
  };
  var toPromptTab = (snapshot, options) => {
    const promptTab = {
      id: snapshot.id,
      title: snapshot.title,
      url: snapshot.url,
      domain: snapshot.domain,
      workspaceId: snapshot.workspaceId,
      pinned: snapshot.pinned
    };
    if (options.includeDescriptions === true && typeof snapshot.description === "string") {
      return { ...promptTab, description: snapshot.description };
    }
    return promptTab;
  };

  // src/core/responseParser.ts
  var parseCategoryResponse = (responseText, validTabIds) => {
    const validIds = new Set(validTabIds);
    const jsonAssignments = parseJsonAssignments(responseText, validIds);
    if (jsonAssignments.length > 0) {
      return jsonAssignments;
    }
    return parsePlainLineAssignments(responseText, validTabIds);
  };
  var parseJsonAssignments = (responseText, validIds) => {
    const parsed = parseJsonCandidate(responseText);
    if (parsed === null) {
      return [];
    }
    return assignmentsFromJsonValue(parsed, validIds);
  };
  var parseJsonCandidate = (responseText) => {
    const candidates = [sliceBetween(responseText, "{", "}"), sliceBetween(responseText, "[", "]")].filter(
      (candidate) => candidate !== null
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
  var sliceBetween = (text, open, close) => {
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start < 0 || end <= start) {
      return null;
    }
    return text.slice(start, end + close.length);
  };
  var assignmentsFromJsonValue = (value, validIds) => {
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
  var assignmentsFromJsonEntry = (entry, validIds) => {
    if (!isRecord(entry)) {
      return [];
    }
    const category = cleanCategory(readString(entry, ["category", "name", "label", "group"]));
    if (category === null) {
      return [];
    }
    const tabIds = readStringList(entry, ["tabs", "tabIds", "ids"]);
    if (tabIds.length > 0) {
      return tabIds.filter((tabId2) => validIds.has(tabId2)).map((tabId2) => ({ tabId: tabId2, category }));
    }
    const tabId = readString(entry, ["tabId", "id"]);
    if (tabId !== null && validIds.has(tabId)) {
      return [{ tabId, category }];
    }
    return [];
  };
  var parsePlainLineAssignments = (responseText, validTabIds) => {
    return responseText.split(/\r?\n/u).flatMap((line) => assignmentFromLine(line, validTabIds));
  };
  var assignmentFromLine = (line, validTabIds) => {
    const trimmedLine = line.trim().replace(/^[-*•]\s*/u, "");
    for (const tabId of validTabIds) {
      const category = categoryAfterTabId(trimmedLine, tabId);
      if (category !== null) {
        return [{ tabId, category }];
      }
    }
    return [];
  };
  var categoryAfterTabId = (line, tabId) => {
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
  var readString = (entry, keys) => {
    for (const key of keys) {
      const value = entry[key];
      if (typeof value === "string") {
        return value;
      }
    }
    return null;
  };
  var readStringList = (entry, keys) => {
    for (const key of keys) {
      const value = entry[key];
      if (Array.isArray(value)) {
        return value.filter((item) => typeof item === "string");
      }
    }
    return [];
  };
  var cleanCategory = (value) => {
    if (value === null) {
      return null;
    }
    const cleaned = value.replace(/[<>"'`(){}[\]/;=]/gu, " ").replace(/\s+/gu, " ").trim();
    return cleaned.length > 0 ? cleaned : null;
  };
  var isRecord = (value) => {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  };

  // src/core/undo.ts
  var captureUndoSnapshot = (input) => ({
    tabs: input.tabs.map((tab) => ({ ...tab })),
    groups: input.groups.map((group) => ({ ...group, tabIds: [...group.tabIds] }))
  });
  var planUndo = (snapshot, current) => {
    const currentTabs = new Set(current.tabs.map((tab) => tab.id));
    const currentGroups = new Map(current.groups.map((group) => [group.id, group]));
    const failedTabIds = new Set(current.failedTabIds ?? []);
    const operations = [];
    const outcomes = [];
    const restoredTabIds = /* @__PURE__ */ new Set();
    const orderedSnapshots = [...snapshot.tabs].sort((left, right) => left.index - right.index);
    for (const original of orderedSnapshots) {
      const outcome = planTabRestore(original, currentTabs, currentGroups, failedTabIds);
      if (outcome.kind === "operation") {
        operations.push(outcome.operation);
        outcomes.push({ kind: "restored", tabId: original.id });
        restoredTabIds.add(original.id);
        continue;
      }
      outcomes.push(outcome.degraded);
    }
    for (const group of current.groups) {
      if (shouldRemoveGeneratedGroup(group, restoredTabIds)) {
        operations.push({ kind: "removeEmptyGeneratedGroup", groupId: group.id });
      }
    }
    return { operations, outcomes };
  };
  var planTabRestore = (original, currentTabs, currentGroups, failedTabIds) => {
    if (!currentTabs.has(original.id)) {
      return { kind: "degraded", degraded: { kind: "missingTab", tabId: original.id } };
    }
    if (failedTabIds.has(original.id)) {
      return { kind: "degraded", degraded: { kind: "partialMoveFailure", tabId: original.id } };
    }
    if (original.groupId !== null) {
      const targetGroup = currentGroups.get(original.groupId);
      if (targetGroup === void 0) {
        return { kind: "degraded", degraded: { kind: "missingGroup", tabId: original.id, groupId: original.groupId } };
      }
      if (targetGroup.closed) {
        return { kind: "degraded", degraded: { kind: "closedGroup", tabId: original.id, groupId: original.groupId } };
      }
    }
    return {
      kind: "operation",
      operation: { kind: "moveTabToGroup", tabId: original.id, groupId: original.groupId, index: original.index }
    };
  };
  var shouldRemoveGeneratedGroup = (group, restoredTabIds) => {
    if (!group.generated || group.closed) {
      return false;
    }
    if (group.tabIds.length === 0) {
      return true;
    }
    return group.tabIds.every((tabId) => restoredTabIds.has(tabId));
  };

  // src/privacy/providerReadiness.ts
  var getProviderReadiness = (settings) => {
    if (settings.provider === "disabled") {
      return { ok: false, reason: "provider_disabled" };
    }
    if (!settings.consentToSendData) {
      return { ok: false, reason: "consent_required" };
    }
    const missingFields = getMissingRequiredFields(settings);
    if (missingFields.length > 0) {
      return { ok: false, reason: "missing_required_config", missingFields };
    }
    return { ok: true, value: { ...settings, consentToSendData: true } };
  };
  var requestProviderFetch = async (settings, fetchProvider) => {
    const readiness = getProviderReadiness(settings);
    if (!readiness.ok) {
      return readiness;
    }
    return { ok: true, value: await fetchProvider(readiness.value) };
  };
  var getMissingRequiredFields = (settings) => {
    switch (settings.provider) {
      case "openai":
        return missingStringFields({ endpoint: settings.endpoint, apiKey: settings.apiKey, model: settings.model });
      case "gemini":
        return missingStringFields({ apiKey: settings.apiKey, model: settings.model });
      case "ollama":
        return missingStringFields({ endpoint: settings.endpoint, model: settings.model });
      case "custom":
        return missingStringFields({
          endpoint: settings.endpoint,
          apiKey: settings.apiKey,
          model: settings.model,
          format: settings.format
        });
      default:
        return assertNever(settings);
    }
  };
  var missingStringFields = (fields) => {
    return Object.entries(fields).filter(([, value]) => value.trim().length === 0).map(([field]) => field);
  };
  var assertNever = (value) => {
    throw new UnexpectedProviderError(value);
  };
  var UnexpectedProviderError = class extends Error {
    constructor(provider) {
      super("Unexpected provider variant");
      this.provider = provider;
    }
    name = "UnexpectedProviderError";
  };

  // src/privacy/redaction.ts
  var REDACTED = "[redacted]";
  var REDACTED_URL = "[redacted-url]";
  var AUTH_HEADER_KEY_PART = ["author", "ization"].join("");
  var AUTH_HEADER_INLINE_MARKER = [AUTH_HEADER_KEY_PART, ":"].join("");
  var SENSITIVE_KEY_PARTS = [AUTH_HEADER_KEY_PART, "api-key", "apikey", "api_key", "token", "secret", "key", "prompt", "body", "text"];
  var createSafeLogEvent = (event) => {
    return {
      event: event.event,
      ...event.url === void 0 ? {} : { url: REDACTED_URL },
      ...event.headers === void 0 ? {} : { headers: redactHeaders(event.headers) },
      ...event.requestBody === void 0 ? {} : { requestBody: REDACTED },
      ...event.responseBody === void 0 ? {} : { responseBody: REDACTED },
      ...event.prompt === void 0 ? {} : { prompt: REDACTED },
      ...event.apiKey === void 0 ? {} : { apiKey: REDACTED },
      ...event.externalText === void 0 ? {} : { externalText: REDACTED },
      ...event.details === void 0 ? {} : { details: redactLogValue(event.details) }
    };
  };
  var redactHeaders = (headers) => {
    return Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key, isSensitiveKey(key) ? REDACTED : value])
    );
  };
  var redactLogValue = (value) => {
    if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
      return typeof value === "string" ? redactInlineSensitiveText(value) : value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => redactLogValue(item));
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, isSensitiveKey(key) ? REDACTED : redactLogValue(nestedValue)])
    );
  };
  var redactInlineSensitiveText = (value) => {
    if (value.toLowerCase().includes(AUTH_HEADER_INLINE_MARKER) || value.toLowerCase().includes("bearer ")) {
      return REDACTED;
    }
    return value;
  };
  var isSensitiveKey = (key) => {
    const normalizedKey = key.toLowerCase();
    return SENSITIVE_KEY_PARTS.some((part) => normalizedKey.includes(part));
  };

  // src/providers/bounds.ts
  var MAX_PROMPT_CHARS = 24e3;
  var MAX_REQUEST_BYTES = 32e3;
  var DEFAULT_TIMEOUT_MS = 3e4;
  var MIN_MAX_TOKENS = 1;
  var MAX_MAX_TOKENS = 4096;
  var boundMaxTokens = (maxTokens) => {
    if (!Number.isFinite(maxTokens)) {
      return MIN_MAX_TOKENS;
    }
    return Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, Math.round(maxTokens)));
  };
  var isPromptWithinBounds = (prompt) => {
    return prompt.length <= MAX_PROMPT_CHARS;
  };
  var isJsonBodyWithinBounds = (body) => {
    return new TextEncoder().encode(body).byteLength <= MAX_REQUEST_BYTES;
  };

  // src/providers/abort.ts
  var createTimeoutSignal = (input) => {
    const controller = new AbortController();
    let reason = input?.signal?.aborted === true ? "aborted" : "timeout";
    const timeoutMs = input?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeoutId = globalThis.setTimeout(() => {
      reason = "timeout";
      controller.abort();
    }, timeoutMs);
    const abortFromCaller = () => {
      reason = "aborted";
      controller.abort();
    };
    if (input?.signal?.aborted === true) {
      abortFromCaller();
    } else {
      input?.signal?.addEventListener("abort", abortFromCaller, { once: true });
    }
    return {
      signal: controller.signal,
      getReason: () => reason,
      dispose: () => {
        globalThis.clearTimeout(timeoutId);
        input?.signal?.removeEventListener("abort", abortFromCaller);
      }
    };
  };

  // src/providers/parsing.ts
  var parseOpenAiText = (body) => {
    const choices = getRecord(body)?.["choices"];
    if (!Array.isArray(choices)) {
      return null;
    }
    const first = getRecord(choices[0]);
    const messageContent = getRecord(first?.["message"])?.["content"];
    if (typeof messageContent === "string") {
      return messageContent;
    }
    const text = first?.["text"];
    return typeof text === "string" ? text : null;
  };
  var parseGeminiText = (body) => {
    const candidates = getRecord(body)?.["candidates"];
    if (!Array.isArray(candidates)) {
      return null;
    }
    const parts = getRecord(getRecord(candidates[0])?.["content"])?.["parts"];
    if (!Array.isArray(parts)) {
      return null;
    }
    const texts = parts.map((part) => getRecord(part)?.["text"]).filter((text) => typeof text === "string");
    return texts.length > 0 ? texts.join("") : null;
  };
  var parseOllamaText = (bodyText) => {
    const lines = bodyText.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length > 1) {
      const fragments = lines.map((line) => parseJson(line)).map((value) => getRecord(value)?.["response"]);
      return fragments.every((fragment) => typeof fragment === "string") ? fragments.join("") : null;
    }
    const response = getRecord(parseJson(bodyText))?.["response"];
    return typeof response === "string" ? response : null;
  };
  var parseJson = (text) => {
    try {
      return JSON.parse(text);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return null;
      }
      throw error;
    }
  };
  var getRecord = (value) => {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
  };

  // src/providers/requests.ts
  var AUTH_HEADER_NAME = ["author", "ization"].join("");
  var buildProviderRequest = (provider, prompt, maxTokens) => {
    const boundedTokens = boundMaxTokens(maxTokens);
    switch (provider.provider) {
      case "openai":
        return openAiRequest(provider.endpoint, provider.apiKey, provider.model, prompt, boundedTokens);
      case "gemini":
        return geminiRequest(provider.apiKey, provider.model, prompt, boundedTokens);
      case "ollama":
        return ollamaRequest(provider.endpoint, provider.model, prompt, boundedTokens);
      case "custom":
        return provider.format === "ollama" ? ollamaRequest(provider.endpoint, provider.model, prompt, boundedTokens) : openAiRequest(provider.endpoint, provider.apiKey, provider.model, prompt, boundedTokens);
      default:
        return assertNever2(provider);
    }
  };
  var getProviderKind = (provider) => {
    switch (provider.provider) {
      case "openai":
      case "gemini":
      case "ollama":
        return provider.provider;
      case "custom":
        return provider.format;
      default:
        return assertNever2(provider);
    }
  };
  var openAiRequest = (endpoint, apiKey, model, prompt, maxTokens) => ({
    url: appendPath(endpoint, "/chat/completions"),
    init: {
      method: "POST",
      headers: { "content-type": "application/json", [AUTH_HEADER_NAME]: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.2
      })
    }
  });
  var geminiRequest = (apiKey, model, prompt, maxTokens) => ({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 }
      })
    }
  });
  var ollamaRequest = (endpoint, model, prompt, maxTokens) => ({
    url: appendPath(endpoint, "/api/generate"),
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false, options: { num_predict: maxTokens } })
    }
  });
  var appendPath = (endpoint, path) => {
    const trimmed = endpoint.trim().replace(/\/+$/, "");
    return trimmed.endsWith(path) ? trimmed : `${trimmed}${path}`;
  };
  var assertNever2 = (value) => {
    throw new UnexpectedProviderRequestError(value);
  };
  var UnexpectedProviderRequestError = class extends Error {
    constructor(provider) {
      super("Unexpected provider request variant");
      this.provider = provider;
    }
    name = "UnexpectedProviderRequestError";
  };

  // src/providers/index.ts
  var defaultFetcher = (url, init) => globalThis.fetch(url, init);
  var requestProviderCompletion = async (request) => {
    if (!isPromptWithinBounds(request.prompt)) {
      return { ok: false, reason: "request_too_large" };
    }
    const result = await requestProviderFetch(request.settings, async (readyProvider) => {
      const spec = buildProviderRequest(readyProvider, request.prompt, request.maxTokens);
      if (typeof spec.init.body !== "string" || !isJsonBodyWithinBounds(spec.init.body)) {
        return { ok: false, reason: "request_too_large" };
      }
      const abort = createTimeoutSignal({
        ...request.timeoutMs === void 0 ? {} : { timeoutMs: request.timeoutMs },
        ...request.signal === void 0 ? {} : { signal: request.signal }
      });
      try {
        const response = await (request.fetcher ?? defaultFetcher)(spec.url, { ...spec.init, signal: abort.signal });
        if (!response.ok) {
          await logFailure(request.logger, spec.url, spec.init, response);
          return { ok: false, reason: "provider_http_error", status: response.status };
        }
        const text = await response.text();
        return parseResponse(getProviderKind(readyProvider), text);
      } catch (error) {
        if (isAbortError(error)) {
          return abortResult(abort.getReason());
        }
        throw error;
      } finally {
        abort.dispose();
      }
    });
    return result.ok ? result.value : result;
  };
  var parseResponse = (kind, text) => {
    const parsedText = kind === "ollama" ? parseOllamaText(text) : parseStructuredResponse(kind, text);
    return parsedText === null ? { ok: false, reason: "malformed_response" } : { ok: true, text: parsedText };
  };
  var parseStructuredResponse = (kind, text) => {
    const json = parseJson(text);
    return kind === "openai" ? parseOpenAiText(json) : parseGeminiText(json);
  };
  var logFailure = async (logger, url, init, response) => {
    if (logger === void 0) {
      return;
    }
    const responseBody = await response.text();
    const headers = headersToRecord(init.headers);
    const event = createSafeLogEvent({
      event: "provider_fetch_failed",
      url,
      responseBody: { body: responseBody },
      details: { status: response.status },
      ...headers === void 0 ? {} : { headers },
      ...typeof init.body === "string" ? { requestBody: { body: init.body } } : {}
    });
    logger.debug(event);
  };
  var headersToRecord = (headers) => {
    if (headers === void 0) {
      return void 0;
    }
    if (headers instanceof Headers) {
      const entries = {};
      headers.forEach((value, key) => {
        entries[key] = value;
      });
      return entries;
    }
    return Array.isArray(headers) ? Object.fromEntries(headers) : headers;
  };
  var isAbortError = (error) => {
    return error instanceof DOMException && error.name === "AbortError";
  };
  var abortResult = (reason) => {
    switch (reason) {
      case "aborted":
        return { ok: false, reason: "aborted" };
      case "timeout":
        return { ok: false, reason: "timeout" };
      default:
        return assertNever3(reason);
    }
  };
  var assertNever3 = (value) => {
    throw new UnexpectedAbortReasonError(value);
  };
  var UnexpectedAbortReasonError = class extends Error {
    constructor(reason) {
      super("Unexpected abort reason");
      this.reason = reason;
    }
    name = "UnexpectedAbortReasonError";
  };

  // src/core/tabSnapshot.ts
  var collectTabSnapshots = (tabs, options = {}) => {
    return tabs.map((tab) => createTabSnapshot(tab, options));
  };
  var createTabSnapshot = (tab, options) => {
    const baseSnapshot = {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      domain: parseDomain(tab.url),
      workspaceId: tab.workspaceId,
      pinned: tab.pinned,
      exclusion: getTabExclusion(tab, options)
    };
    const description = getDescription(tab, options);
    if (description === null) {
      return baseSnapshot;
    }
    return { ...baseSnapshot, description };
  };
  var getTabExclusion = (tab, options) => {
    if (tab.parentNode === null) {
      return { reason: "disconnected" };
    }
    if (tab.closing) {
      return { reason: "closing" };
    }
    if (options.preservePinnedTabs === true && tab.pinned) {
      return { reason: "pinned" };
    }
    if (tab.folder === true) {
      return { reason: "folder" };
    }
    if (tab.splitView === true) {
      return { reason: "splitView" };
    }
    if (typeof tab.groupId === "string" && tab.groupId.trim().length > 0) {
      return { reason: "grouped", groupId: tab.groupId };
    }
    return null;
  };
  var getDescription = (tab, options) => {
    if (options.includeDescriptions !== true) {
      return null;
    }
    if (typeof tab.description !== "string") {
      return null;
    }
    const description = tab.description.trim();
    return description.length > 0 ? description : null;
  };
  var parseDomain = (url) => {
    if (url.startsWith("about:")) {
      return "about";
    }
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname.length > 0 ? parsedUrl.hostname : null;
    } catch (error) {
      if (error instanceof TypeError) {
        return null;
      }
      throw error;
    }
  };

  // src/zen/adapter.ts
  var resolveZenAdapter = (runtime) => {
    const gBrowser = getProperty(runtime, "gBrowser");
    if (!isZenGBrowser(gBrowser)) {
      return missingCapability("gBrowser.moveTabToGroup");
    }
    const gZenWorkspaces = getProperty(runtime, "gZenWorkspaces");
    if (!isZenWorkspaces(gZenWorkspaces)) {
      return missingCapability("gZenWorkspaces.activeWorkspace");
    }
    const document = getProperty(runtime, "document");
    if (!isPlatformDocument(document)) {
      return missingCapability("document.createXULElement");
    }
    return {
      ok: true,
      value: {
        activeWorkspaceId: gZenWorkspaces.activeWorkspace,
        activeWorkspaceStrip: gZenWorkspaces.activeWorkspaceStrip,
        document,
        gBrowser,
        tabs: gBrowser.tabs,
        tabGroups: getTabGroups(gBrowser, document),
        createGroup: (label, color) => createGroup(document, label, color),
        moveTabToGroup: (tab, group) => gBrowser.moveTabToGroup(tab, group),
        ungroupTab: (tab) => gBrowser.ungroupTab(tab),
        removeTabGroup: (group) => gBrowser.removeTabGroup(group)
      }
    };
  };
  var collectCurrentWorkspaceSnapshots = (adapter, options = {}) => {
    const activeWorkspaceTabs = adapter.tabs.filter((tab) => {
      return adapter.activeWorkspaceId === null || tab.workspaceId === adapter.activeWorkspaceId;
    });
    return collectTabSnapshots(activeWorkspaceTabs.map((tab) => withGroupExclusion(tab, adapter.tabGroups)), options);
  };
  var missingCapability = (missingApi) => ({
    ok: false,
    error: {
      code: "malformed_input",
      missingApi,
      message: `Zen tab group API is unavailable: missing ${missingApi}.`,
      setupHint: "Update Zen Browser/Sine or enable a build with native tab group APIs."
    }
  });
  var createGroup = (document, label, color = "blue") => {
    const group = document.createXULElement("tab-group");
    Reflect.set(group, "id", `neurosort-group-${slugify(label)}`);
    Reflect.set(group, "label", label);
    Reflect.set(group, "color", color);
    return group;
  };
  var getTabGroups = (gBrowser, document) => {
    if (Array.isArray(gBrowser.tabGroups)) {
      return gBrowser.tabGroups;
    }
    return document.querySelectorAll("tab-group").filter(isPlatformTabGroup);
  };
  var withGroupExclusion = (tab, groups) => {
    const group = groups.find((candidate) => candidate.tabs.some((groupedTab) => groupedTab.id === tab.id));
    if (group === void 0) {
      return tab;
    }
    return { ...tab, groupId: group.id };
  };
  var isZenGBrowser = (value) => {
    return hasTabArray(value, "tabs") && isElementContainer(getProperty(value, "tabContainer")) && isCallable(getProperty(value, "moveTabToGroup")) && isCallable(getProperty(value, "ungroupTab")) && isCallable(getProperty(value, "removeTabGroup"));
  };
  var isZenWorkspaces = (value) => {
    const activeWorkspace = getProperty(value, "activeWorkspace");
    return (typeof activeWorkspace === "string" || activeWorkspace === null) && isElementContainer(getProperty(value, "activeWorkspaceStrip"));
  };
  var isPlatformDocument = (value) => {
    return isCallable(getProperty(value, "createXULElement")) && isCallable(getProperty(value, "querySelector")) && isCallable(getProperty(value, "querySelectorAll")) && isElementContainer(getProperty(value, "body"));
  };
  var isPlatformTabGroup = (value) => {
    return typeof getProperty(value, "id") === "string" && typeof getProperty(value, "label") === "string" && typeof getProperty(value, "color") === "string" && hasTabArray(value, "tabs") && isCallable(getProperty(value, "addTabs"));
  };
  var hasTabArray = (value, key) => {
    const tabs = getProperty(value, key);
    return Array.isArray(tabs) && tabs.every(isPlatformTab);
  };
  var isPlatformTab = (value) => {
    const workspaceId = getProperty(value, "workspaceId");
    return typeof getProperty(value, "id") === "string" && typeof getProperty(value, "title") === "string" && typeof getProperty(value, "url") === "string" && typeof getProperty(value, "pinned") === "boolean" && typeof getProperty(value, "closing") === "boolean" && (typeof workspaceId === "string" || workspaceId === null);
  };
  var isElementContainer = (value) => {
    return isCallable(getProperty(value, "appendChild")) && isCallable(getProperty(value, "insertBefore")) && isCallable(getProperty(value, "removeChild")) && isCallable(getProperty(value, "querySelector")) && isCallable(getProperty(value, "querySelectorAll"));
  };
  var isCallable = (value) => {
    return typeof value === "function";
  };
  var getProperty = (value, key) => {
    if (typeof value !== "object" || value === null) {
      return void 0;
    }
    return Reflect.get(value, key);
  };
  var slugify = (label) => {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return slug.length > 0 ? slug : "untitled";
  };

  // src/zen/groupMutations.ts
  var applyGroupMutations = (adapter, mutations) => {
    const createdGroupIds = [];
    const movedTabIds = [];
    const missingTabIds = [];
    for (const mutation of mutations) {
      const group = adapter.createGroup(mutation.label, mutation.color);
      adapter.activeWorkspaceStrip.appendChild(group);
      createdGroupIds.push(group.id);
      const tabs = mutation.tabIds.flatMap((tabId) => {
        const tab = adapter.tabs.find((candidate) => candidate.id === tabId);
        if (tab === void 0) {
          missingTabIds.push(tabId);
          return [];
        }
        return [tab];
      });
      const moveResult = moveTabs(adapter, group, tabs);
      if (!moveResult.ok) {
        return moveResult;
      }
      movedTabIds.push(...moveResult.value);
    }
    return { ok: true, value: { createdGroupIds, movedTabIds, missingTabIds } };
  };
  var moveTabs = (adapter, group, tabs) => {
    if (tabs.length === 0) {
      return { ok: true, value: [] };
    }
    if (typeof group.addTabs === "function") {
      group.addTabs(tabs);
      return { ok: true, value: tabs.map((tab) => tab.id) };
    }
    if (typeof adapter.moveTabToGroup !== "function") {
      return missingCapability("group.addTabs");
    }
    const moveTabToGroup = adapter.moveTabToGroup;
    tabs.forEach((tab) => moveTabToGroup(tab, group));
    return { ok: true, value: tabs.map((tab) => tab.id) };
  };

  // src/runtime/preferences.ts
  var readRuntimePreferences = (prefs) => {
    const provider = readString2(prefs, "extensions.neurosort.provider", "disabled");
    return {
      enabled: readBool(prefs, "extensions.neurosort.enabled", true),
      fetchDescriptions: readBool(prefs, "extensions.neurosort.fetch_descriptions", false),
      minGroupSize: readInt(prefs, "extensions.neurosort.min_group_size", 2),
      preservePinned: readBool(prefs, "extensions.neurosort.preserve_pinned", true),
      provider: providerSettings(provider, prefs)
    };
  };
  var readRuntimePreferencesFromRuntime = (runtime) => {
    const services = getProperty2(runtime, "Services");
    const prefs = getProperty2(services, "prefs");
    return isPlatformPrefs(prefs) ? readRuntimePreferences(prefs) : null;
  };
  var providerSettings = (provider, prefs) => {
    switch (provider) {
      case "openai":
        return {
          provider,
          consentToSendData: readBool(prefs, "extensions.neurosort.data_consent", false),
          endpoint: readString2(prefs, "extensions.neurosort.openai.endpoint", ""),
          apiKey: readString2(prefs, "extensions.neurosort.openai.api_key", ""),
          model: readString2(prefs, "extensions.neurosort.openai.model", "")
        };
      case "gemini":
        return {
          provider,
          consentToSendData: readBool(prefs, "extensions.neurosort.data_consent", false),
          apiKey: readString2(prefs, "extensions.neurosort.gemini.api_key", ""),
          model: readString2(prefs, "extensions.neurosort.gemini.model", "")
        };
      case "ollama":
        return {
          provider,
          consentToSendData: readBool(prefs, "extensions.neurosort.data_consent", false),
          endpoint: readString2(prefs, "extensions.neurosort.ollama.endpoint", ""),
          model: readString2(prefs, "extensions.neurosort.ollama.model", "")
        };
      case "custom":
        return {
          provider,
          consentToSendData: readBool(prefs, "extensions.neurosort.data_consent", false),
          endpoint: readString2(prefs, "extensions.neurosort.custom.endpoint", ""),
          apiKey: readString2(prefs, "extensions.neurosort.custom.api_key", ""),
          model: readString2(prefs, "extensions.neurosort.custom.model", ""),
          format: readCustomFormat(prefs)
        };
      default:
        return { provider: "disabled", consentToSendData: readBool(prefs, "extensions.neurosort.data_consent", false) };
    }
  };
  var readCustomFormat = (prefs) => {
    const value = readString2(prefs, "extensions.neurosort.custom.format", "openai_chat");
    return value === "ollama_generate" || value === "ollama" ? "ollama" : "openai";
  };
  var readString2 = (prefs, name, fallback) => {
    return prefs.prefHasUserValue(name) && prefs.getPrefType(name) === prefs.PREF_STRING ? prefs.getStringPref(name) : fallback;
  };
  var readBool = (prefs, name, fallback) => {
    return prefs.prefHasUserValue(name) && prefs.getPrefType(name) === prefs.PREF_BOOL ? prefs.getBoolPref(name) : fallback;
  };
  var readInt = (prefs, name, fallback) => {
    return prefs.prefHasUserValue(name) && prefs.getPrefType(name) === prefs.PREF_INT ? prefs.getIntPref(name) : fallback;
  };
  var isPlatformPrefs = (value) => {
    return typeof getProperty2(value, "PREF_STRING") === "number" && typeof getProperty2(value, "PREF_INT") === "number" && typeof getProperty2(value, "PREF_BOOL") === "number" && isCallable2(getProperty2(value, "prefHasUserValue")) && isCallable2(getProperty2(value, "getPrefType")) && isCallable2(getProperty2(value, "getStringPref")) && isCallable2(getProperty2(value, "getIntPref")) && isCallable2(getProperty2(value, "getBoolPref"));
  };
  var isCallable2 = (value) => {
    return typeof value === "function";
  };
  var getProperty2 = (value, key) => {
    if (typeof value !== "object" || value === null) {
      return void 0;
    }
    return Reflect.get(value, key);
  };

  // src/runtime/scope.ts
  var selectScopeSnapshots = (snapshots, trigger, selectedTabIds2) => {
    const selected = trigger === "selected" ? new Set(selectedTabIds2 ?? []) : null;
    return snapshots.filter((snapshot) => selected === null || selected.has(snapshot.id)).map((snapshot) => normalizeScope(snapshot, trigger));
  };
  var toPlannerTabs = (snapshots) => {
    return snapshots.map((snapshot, index) => ({
      id: snapshot.id,
      workspaceId: snapshot.workspaceId,
      groupId: snapshot.exclusion?.reason === "grouped" ? snapshot.exclusion.groupId : null,
      index,
      pinned: snapshot.exclusion?.reason === "pinned",
      folder: snapshot.exclusion?.reason === "folder",
      splitView: snapshot.exclusion?.reason === "splitView"
    }));
  };
  var normalizeScope = (snapshot, trigger) => {
    if ((trigger === "menu" || trigger === "modifier" || trigger === "selected") && snapshot.exclusion?.reason === "grouped") {
      return { ...snapshot, exclusion: null };
    }
    return snapshot;
  };

  // src/runtime/state.ts
  var createNeuroSortStateStore = () => {
    let state = { status: "idle", message: "Ready", canUndo: false };
    return {
      get: () => state,
      set: (next) => {
        state = next;
      }
    };
  };

  // src/runtime/undoRuntime.ts
  var toZenMutations = (operations) => {
    const groups = /* @__PURE__ */ new Map();
    for (const operation of operations) {
      if (operation.kind === "createGroup") {
        groups.set(operation.groupId, { label: operation.title, tabIds: [] });
        continue;
      }
      groups.get(operation.groupId)?.tabIds.push(operation.tabId);
    }
    return Array.from(groups.values()).map((group) => ({ label: group.label, tabIds: group.tabIds }));
  };
  var runUndo = (runtime, snapshot) => {
    const adapterResult = resolveZenAdapter(runtime);
    if (!adapterResult.ok) {
      return { status: "adapter_failed", missingApi: adapterResult.error.missingApi };
    }
    const plan = planUndo(snapshot, snapshotInput(adapterResult.value));
    for (const operation of plan.operations) {
      if (operation.kind === "removeEmptyGeneratedGroup") {
        const group = adapterResult.value.tabGroups.find((candidate) => candidate.id === operation.groupId);
        if (group !== void 0) {
          adapterResult.value.removeTabGroup(group);
        }
        continue;
      }
      const tab = adapterResult.value.tabs.find((candidate) => candidate.id === operation.tabId);
      if (tab === void 0) {
        continue;
      }
      if (operation.groupId === null) {
        adapterResult.value.ungroupTab(tab);
      } else {
        const group = adapterResult.value.tabGroups.find((candidate) => candidate.id === operation.groupId);
        if (group !== void 0) {
          adapterResult.value.moveTabToGroup?.(tab, group);
        }
      }
    }
    return {
      status: "undone",
      restoredTabIds: plan.outcomes.flatMap((outcome) => outcome.kind === "restored" ? [outcome.tabId] : [])
    };
  };
  var snapshotInput = (adapter) => {
    return {
      tabs: adapter.tabs.map((tab, index) => toUndoTab(tab, adapter.tabGroups, index)),
      groups: adapter.tabGroups.map((group) => ({
        id: group.id,
        workspaceId: adapter.activeWorkspaceId,
        closed: false,
        generated: group.id.startsWith("neurosort-group-"),
        tabIds: group.tabs.map((tab) => tab.id)
      }))
    };
  };
  var toUndoTab = (tab, groups, index) => {
    const group = groups.find((candidate) => candidate.tabs.some((groupTab) => groupTab.id === tab.id));
    return {
      id: tab.id,
      parentId: parentId(tab),
      groupId: group?.id ?? null,
      workspaceId: tab.workspaceId,
      index,
      pinned: tab.pinned,
      folder: Reflect.get(tab, "folder") === true,
      splitView: Reflect.get(tab, "splitView") === true
    };
  };
  var parentId = (tab) => {
    const parent = Reflect.get(tab, "parentNode");
    if (typeof parent !== "object" || parent === null) {
      return null;
    }
    const id = Reflect.get(parent, "id");
    return typeof id === "string" ? id : null;
  };

  // src/runtime/orchestrator.ts
  var createNeuroSortApp = (runtime, options = {}) => {
    const provider = options.provider ?? requestProviderCompletion;
    const stateStore = options.stateStore ?? createNeuroSortStateStore();
    const coordinator = options.coordinator ?? createOperationCoordinator();
    let undoSnapshot = null;
    const tidy = async (request) => {
      const result = await coordinator.run(operationKind(request.trigger), async (context) => {
        stateStore.set({ status: "running", message: "Tidying tabs", canUndo: undoSnapshot !== null });
        return runTidy(runtime, request, provider, context.signal);
      });
      if (result.status !== "completed") {
        return { status: "busy" };
      }
      if (result.value.undoSnapshot !== null) {
        undoSnapshot = result.value.undoSnapshot;
      }
      stateStore.set(stateAfterTidy(result.value.result, undoSnapshot !== null));
      return result.value.result;
    };
    const undo = async () => {
      if (undoSnapshot === null) {
        return { status: "no_undo" };
      }
      const snapshot = undoSnapshot;
      const result = await coordinator.run("undo", () => runUndo(runtime, snapshot));
      if (result.status !== "completed") {
        return { status: "busy" };
      }
      if (result.value.status === "undone") {
        undoSnapshot = null;
        stateStore.set({ status: "idle", message: "Undo complete", canUndo: false });
      }
      return result.value;
    };
    return { tidy, undo, state: stateStore.get };
  };
  var runTidy = async (runtime, request, provider, signal) => {
    const adapterResult = resolveZenAdapter(runtime);
    if (!adapterResult.ok) {
      return { result: { status: "adapter_failed", missingApi: adapterResult.error.missingApi }, undoSnapshot: null };
    }
    const prefs = readRuntimePreferencesFromRuntime(runtime);
    if (prefs === null) {
      return { result: { status: "adapter_failed", missingApi: "Services.prefs" }, undoSnapshot: null };
    }
    if (!prefs.enabled) {
      return { result: { status: "empty" }, undoSnapshot: null };
    }
    const readiness = getProviderReadiness(prefs.provider);
    if (!readiness.ok) {
      return { result: { status: "provider_denied", reason: readiness.reason }, undoSnapshot: null };
    }
    const snapshots = collectCurrentWorkspaceSnapshots(adapterResult.value, { preservePinnedTabs: prefs.preservePinned });
    const scopedSnapshots = selectScopeSnapshots(snapshots, request.trigger, request.selectedTabIds);
    const payload = buildPromptPayload(scopedSnapshots, { includeDescriptions: prefs.fetchDescriptions });
    if (payload.tabs.length === 0) {
      return { result: { status: "empty" }, undoSnapshot: null };
    }
    const providerResult = await provider({
      settings: prefs.provider,
      prompt: JSON.stringify(payload),
      maxTokens: 800,
      signal
    });
    if (!providerResult.ok) {
      return { result: { status: "provider_failed", reason: providerResult.reason }, undoSnapshot: null };
    }
    const assignments = parseCategoryResponse(providerResult.text, payload.tabs.map((tab) => tab.id));
    const categoryPlan = createCategoryPlan(payload.tabs, assignments, { minGroupSize: prefs.minGroupSize });
    const mutationPlan = planGroupMutations({ tabs: toPlannerTabs(scopedSnapshots), categories: categoryPlan.groups });
    const undoSnapshot = captureUndoSnapshot(snapshotInput(adapterResult.value));
    const mutationResult = applyGroupMutations(adapterResult.value, toZenMutations(mutationPlan.operations));
    if (!mutationResult.ok) {
      return { result: { status: "adapter_failed", missingApi: mutationResult.error.missingApi }, undoSnapshot: null };
    }
    if (mutationResult.value.missingTabIds.length > 0) {
      return { result: { status: "partial_failure", missingTabIds: mutationResult.value.missingTabIds }, undoSnapshot };
    }
    return { result: { status: "tidied", movedTabIds: mutationResult.value.movedTabIds }, undoSnapshot };
  };
  var operationKind = (trigger) => {
    switch (trigger) {
      case "auto":
        return "autoTidy";
      case "shortcut":
        return "shortcutTidy";
      case "defaultClick":
      case "menu":
      case "modifier":
      case "selected":
        return "manualTidy";
      default:
        return assertNever4(trigger);
    }
  };
  var stateAfterTidy = (result, canUndo) => {
    switch (result.status) {
      case "tidied":
        return { status: "idle", message: "Tabs tidied", canUndo };
      case "partial_failure":
        return { status: "partial", message: "Tidy partially completed", canUndo };
      case "provider_denied":
        return { status: "blocked", message: result.reason, canUndo };
      case "provider_failed":
      case "adapter_failed":
        return { status: "failed", message: result.status, canUndo };
      case "busy":
        return { status: "running", message: "Operation in progress", canUndo };
      case "empty":
        return { status: "idle", message: "No eligible tabs", canUndo };
      default:
        return assertNever4(result);
    }
  };
  var assertNever4 = (value) => {
    throw new UnexpectedRuntimeVariantError(value);
  };
  var UnexpectedRuntimeVariantError = class extends Error {
    constructor(value) {
      super("Unexpected runtime variant");
      this.value = value;
    }
    name = "UnexpectedRuntimeVariantError";
  };

  // src/ui/dom.ts
  var appendText = (document, parent, text) => {
    parent.appendChild(document.createTextNode(text));
  };
  var appendLabeledText = (document, parent, label, value) => {
    const row = document.createElement("div");
    row.classList.add("neurosort-row");
    appendText(document, row, `${label}: ${value}`);
    parent.appendChild(row);
    return row;
  };
  var clearChildren = (element) => {
    while (element.firstChild !== null) {
      element.removeChild(element.firstChild);
    }
    element.textContent = "";
  };

  // src/ui/browserChrome.ts
  var mountedChromes = [];
  var nextChromeId = 1;
  var mountBrowserChrome = (options) => {
    const root = options.document.createElement("div");
    root.classList.add("neurosort-chrome");
    root.setAttribute("data-workspace-id", options.workspaceId);
    const button = createBroomButton(options.document, options.workspaceId, options.actions);
    const badge = options.document.createElement("span");
    badge.classList.add("neurosort-badge");
    button.appendChild(badge);
    root.appendChild(button);
    const menu = createContextMenu(options.document, options.actions);
    const quickSettings = createQuickSettings(options.document, options.settings, options.actions);
    const statusPanel = options.document.createElement("section");
    statusPanel.classList.add("neurosort-status");
    root.appendChild(menu);
    root.appendChild(quickSettings);
    root.appendChild(statusPanel);
    options.toolbar.appendChild(root);
    const mounted = { workspaceId: options.workspaceId, button, statusPanel, badge };
    mountedChromes.push(mounted);
    updateMountedChrome(mounted, options.status, options.document);
    return {
      button,
      root,
      update(status) {
        mountedChromes.filter((chrome) => chrome.workspaceId === options.workspaceId).forEach((chrome) => {
          updateMountedChrome(chrome, status, options.document);
        });
      },
      showToast(message) {
        return showToast(options.document, root, message);
      },
      clickMenuItem(command) {
        runCommand(command, options.actions);
      },
      clickQuickSave() {
        options.actions.saveQuickSettings();
      },
      destroy() {
        const index = mountedChromes.indexOf(mounted);
        if (index !== -1) {
          mountedChromes.splice(index, 1);
        }
        root.remove();
      }
    };
  };
  var createBroomButton = (document, workspaceId, actions) => {
    const button = document.createElement("button");
    button.id = `neurosort-broom-${safeIdPart(workspaceId)}-${nextChromeId}`;
    nextChromeId += 1;
    button.classList.add("neurosort-broom");
    button.setAttribute("type", "button");
    button.setAttribute("aria-label", "NeuroSort");
    button.setAttribute("title", "NeuroSort");
    button.addEventListener("click", actions.tidyUngrouped);
    button.addEventListener("contextmenu", () => {
      const root = button.parentNode;
      root?.classList.add("neurosort-menu-open");
    });
    return button;
  };
  var createContextMenu = (document, actions) => {
    const menu = document.createElement("menu");
    menu.classList.add("neurosort-menu");
    menu.classList.add("neurosort-menu-hidden");
    appendMenuButton(document, menu, "tidy-ungrouped", "Tidy ungrouped tabs", actions.tidyUngrouped);
    appendMenuButton(document, menu, "tidy-all", "Tidy all tabs", actions.tidyAll);
    appendMenuButton(document, menu, "tidy-selected", "Tidy selected tabs", actions.tidySelected);
    appendMenuButton(document, menu, "undo", "Undo last tidy", actions.undoLastTidy);
    appendMenuButton(document, menu, "settings", "Settings", actions.openSettings);
    return menu;
  };
  var appendMenuButton = (document, menu, command, label, action) => {
    const item = document.createElement("button");
    item.classList.add("neurosort-menu-item");
    item.setAttribute("type", "button");
    item.setAttribute("data-command", command);
    appendText(document, item, label);
    item.addEventListener("click", action);
    menu.appendChild(item);
  };
  var createQuickSettings = (document, settings, actions) => {
    const panel = document.createElement("section");
    panel.classList.add("neurosort-quick-settings");
    panel.classList.add("neurosort-menu-hidden");
    appendLabeledText(document, panel, "Provider", settings.providerLabel);
    appendLabeledText(document, panel, "Model", settings.modelLabel);
    appendLabeledText(document, panel, "Endpoint", settings.endpointLabel);
    appendLabeledText(document, panel, "API key", maskSecret(settings.apiKey));
    const save = document.createElement("button");
    save.classList.add("neurosort-save-settings");
    save.setAttribute("type", "button");
    appendText(document, save, "Save");
    save.addEventListener("click", actions.saveQuickSettings);
    panel.appendChild(save);
    return panel;
  };
  var updateMountedChrome = (chrome, status, document) => {
    clearChildren(chrome.badge);
    clearChildren(chrome.statusPanel);
    const badgeText = getBadgeText(status);
    appendText(document, chrome.badge, badgeText);
    appendText(document, chrome.statusPanel, userFacingStatusMessage(status.message));
    if (status.kind === "error") {
      appendText(document, chrome.statusPanel, ` ${status.actionLabel}`);
    }
  };
  var showToast = (document, root, message) => {
    const toast = document.createElement("aside");
    toast.classList.add("neurosort-toast");
    appendText(document, toast, message);
    root.appendChild(toast);
    return {
      element: toast,
      dismiss() {
        toast.remove();
      }
    };
  };
  var runCommand = (command, actions) => {
    switch (command) {
      case "tidy-ungrouped":
        actions.tidyUngrouped();
        return;
      case "tidy-all":
        actions.tidyAll();
        return;
      case "tidy-selected":
        actions.tidySelected();
        return;
      case "undo":
        actions.undoLastTidy();
        return;
      case "settings":
        actions.openSettings();
        return;
      default:
        assertNever5(command);
    }
  };
  var getBadgeText = (status) => {
    switch (status.kind) {
      case "ready":
      case "busy":
        return status.badgeText ?? "";
      case "disabled":
        return "Off";
      case "setup":
        return "?";
      case "error":
        return "!";
      default:
        return assertNever5(status);
    }
  };
  var maskSecret = (secret) => {
    if (secret.length === 0) {
      return "Not set";
    }
    if (secret.length <= 10) {
      return "Set";
    }
    return `${secret.slice(0, 7)}...${secret.slice(-4)}`;
  };
  var userFacingStatusMessage = (message) => {
    if (message === "adapter_failed") {
      return "Tab grouping is unavailable";
    }
    if (message === "missing_consent") {
      return "Enable data consent to use AI sorting";
    }
    if (message === "provider_disabled") {
      return "Choose an AI provider";
    }
    return message;
  };
  var safeIdPart = (value) => {
    const safe = value.toLowerCase().split("").map((char) => isIdChar(char) ? char : "-").join("").replace(/-+/g, "-");
    return safe.length === 0 ? "workspace" : safe;
  };
  var isIdChar = (char) => /^[a-z0-9_-]$/.test(char);
  var assertNever5 = (value) => {
    throw new UnexpectedChromeVariantError(value);
  };
  var UnexpectedChromeVariantError = class extends Error {
    constructor(value) {
      super("Unexpected browser chrome variant");
      this.value = value;
    }
    name = "UnexpectedChromeVariantError";
  };

  // src/main.ts
  var NEUROSORT_VERSION = "1.1.15";
  var createBootstrapMessage = () => {
    return `NeuroSort ${NEUROSORT_VERSION} toolchain bootstrap loaded`;
  };
  var installNeuroSort = (runtime, options = {}) => {
    const app = (options.createApp ?? createNeuroSortApp)(runtime);
    Reflect.set(globalThis, "NeuroSortApp", app);
    const browser = resolveBrowserRuntime(runtime);
    if (browser !== null) {
      wireBrowserSurface(app, browser);
    }
    return app;
  };
  var bootstrap = () => {
    installNeuroSort(globalThis);
    globalThis.console.info(createBootstrapMessage());
  };
  var wireBrowserSurface = (app, browser) => {
    const mount = mountBrowserChrome({
      document: browser.document,
      toolbar: browser.toolbar,
      workspaceId: browser.workspaceId,
      actions: {
        tidyUngrouped: () => void runTidy2(app, mount, { trigger: "defaultClick" }),
        tidyAll: () => void runTidy2(app, mount, { trigger: "menu" }),
        tidySelected: () => void runTidy2(app, mount, { trigger: "selected", selectedTabIds: selectedTabIds(browser.tabs) }),
        undoLastTidy: () => void runUndo2(app, mount),
        openSettings: () => mount.showToast("Open NeuroSort settings from Sine preferences."),
        saveQuickSettings: () => mount.showToast("Settings are managed by Sine preferences.")
      },
      settings: settingsFromPrefs(browser.prefs),
      status: statusFromApp(app)
    });
    installAutoTidy(app, mount, browser);
    installShortcuts(app, mount, browser);
    return mount;
  };
  var runTidy2 = async (app, mount, request) => {
    mount.update({ kind: "busy", message: "Tidying tabs" });
    const result = await app.tidy(request);
    mount.update(statusFromApp(app));
    mount.showToast(result.status === "tidied" ? "Tabs tidied" : app.state().message);
  };
  var runUndo2 = async (app, mount) => {
    mount.update({ kind: "busy", message: "Restoring tabs" });
    const result = await app.undo();
    mount.update(statusFromApp(app));
    mount.showToast(result.status === "undone" ? "Undo complete" : app.state().message);
  };
  var installShortcuts = (app, mount, browser) => {
    if (browser.addKeyListener === null) {
      return;
    }
    const tidyShortcut = readString3(browser.prefs, "extensions.neurosort.keyboard_shortcut", void 0);
    const shortcuts = createShortcutMap(tidyShortcut === void 0 ? {} : { tidy: tidyShortcut });
    browser.addKeyListener((event) => {
      const action = getShortcutAction(event, shortcuts);
      if (action === null) {
        return;
      }
      event.preventDefault?.();
      if (action === "tidy") {
        void runTidy2(app, mount, { trigger: "shortcut" });
        return;
      }
      void runUndo2(app, mount);
    });
  };
  var installAutoTidy = (app, mount, browser) => {
    if (browser.observer === null || browser.tabContainer === null) {
      return;
    }
    const controller = createAutoTidyController(
      {
        enabled: readBool2(browser.prefs, "extensions.neurosort.auto_tidy", false),
        threshold: readInt2(browser.prefs, "extensions.neurosort.auto_tidy_threshold", 6),
        cooldownMs: 3e4
      },
      createOperationCoordinator(),
      { now: () => Date.now() }
    );
    const observer = new browser.observer(() => {
      void controller.run(ungroupedTabCount(browser.tabs, browser.workspaceId), () => runTidy2(app, mount, { trigger: "auto" }));
    });
    observer.observe(browser.tabContainer, { childList: true });
  };
  var statusFromApp = (app) => {
    const state = app.state();
    switch (state.status) {
      case "idle":
      case "partial":
        return { kind: "ready", message: state.message, badgeText: state.canUndo ? "Undo" : "" };
      case "running":
        return { kind: "busy", message: state.message };
      case "blocked":
        return { kind: "setup", message: state.message };
      case "failed":
        return { kind: "error", message: state.message, actionLabel: "Open settings" };
    }
  };
  var resolveBrowserRuntime = (runtime) => {
    const document = getProperty3(runtime, "document");
    const workspace = getProperty3(runtime, "gZenWorkspaces");
    const toolbar = getProperty3(workspace, "activeWorkspaceStrip");
    const gBrowser = getProperty3(runtime, "gBrowser");
    if (!isChromeDocument(document) || !isChromeElement(toolbar)) {
      return null;
    }
    const tabContainer = getProperty3(gBrowser, "tabContainer");
    return {
      document,
      toolbar,
      workspaceId: readWorkspaceId(workspace),
      prefs: readPrefs(runtime),
      tabs: readTabs(gBrowser),
      tabContainer: isElementContainer2(tabContainer) ? tabContainer : null,
      observer: readObserver(runtime),
      addKeyListener: readKeyListener(runtime, document)
    };
  };
  var settingsFromPrefs = (prefs) => {
    const provider = readString3(prefs, "extensions.neurosort.provider", "disabled") ?? "disabled";
    const prefix = `extensions.neurosort.${provider}`;
    return {
      providerLabel: provider,
      modelLabel: readString3(prefs, `${prefix}.model`, "") ?? "",
      endpointLabel: readString3(prefs, `${prefix}.endpoint`, "") ?? "",
      apiKey: readString3(prefs, `${prefix}.api_key`, "") ?? ""
    };
  };
  var selectedTabIds = (tabs) => {
    return tabs.filter(isSelectedTab).map((tab) => tab.id);
  };
  var ungroupedTabCount = (tabs, workspaceId) => {
    return tabs.filter((tab) => isCurrentWorkspaceTab(tab, workspaceId) && getProperty3(tab, "group") === null).length;
  };
  var isSelectedTab = (tab) => {
    return typeof getProperty3(tab, "id") === "string" && (getProperty3(tab, "selected") === true || getProperty3(tab, "multiselected") === true);
  };
  var isCurrentWorkspaceTab = (tab, workspaceId) => {
    const tabWorkspace = getProperty3(tab, "workspaceId");
    return typeof tabWorkspace !== "string" || tabWorkspace === workspaceId;
  };
  var readWorkspaceId = (workspace) => {
    const activeWorkspace = getProperty3(workspace, "activeWorkspace");
    return typeof activeWorkspace === "string" && activeWorkspace.length > 0 ? activeWorkspace : "default";
  };
  var readPrefs = (runtime) => {
    const prefs = getProperty3(getProperty3(runtime, "Services"), "prefs");
    return isPrefs(prefs) ? prefs : null;
  };
  var readTabs = (gBrowser) => {
    const tabs = getProperty3(gBrowser, "tabs");
    return Array.isArray(tabs) ? tabs : [];
  };
  var readObserver = (runtime) => {
    const observer = getProperty3(runtime, "MutationObserver") ?? getProperty3(globalThis, "MutationObserver");
    return isMutationObserverConstructor(observer) ? observer : null;
  };
  var readKeyListener = (runtime, document) => {
    const addRuntimeListener = getProperty3(runtime, "addEventListener");
    if (typeof addRuntimeListener === "function") {
      return (listener) => {
        addRuntimeListener.call(runtime, "keydown", listener);
      };
    }
    const addDocumentListener = getProperty3(document, "addEventListener");
    if (typeof addDocumentListener === "function") {
      return (listener) => {
        addDocumentListener.call(document, "keydown", listener);
      };
    }
    return null;
  };
  var readString3 = (prefs, name, fallback) => {
    return prefs !== null && prefs.prefHasUserValue(name) && prefs.getPrefType(name) === prefs.PREF_STRING ? prefs.getStringPref(name) : fallback;
  };
  var readBool2 = (prefs, name, fallback) => {
    return prefs !== null && prefs.prefHasUserValue(name) && prefs.getPrefType(name) === prefs.PREF_BOOL ? prefs.getBoolPref(name) : fallback;
  };
  var readInt2 = (prefs, name, fallback) => {
    return prefs !== null && prefs.prefHasUserValue(name) && prefs.getPrefType(name) === prefs.PREF_INT ? prefs.getIntPref(name) : fallback;
  };
  var isChromeDocument = (value) => {
    return typeof getProperty3(value, "createElement") === "function" && typeof getProperty3(value, "createTextNode") === "function";
  };
  var isChromeElement = (value) => {
    return typeof getProperty3(value, "appendChild") === "function" && typeof getProperty3(value, "querySelector") === "function" && typeof getProperty3(value, "classList") === "object";
  };
  var isElementContainer2 = (value) => {
    return typeof getProperty3(value, "appendChild") === "function" && typeof getProperty3(value, "querySelectorAll") === "function";
  };
  var isPrefs = (value) => {
    return typeof getProperty3(value, "PREF_STRING") === "number" && typeof getProperty3(value, "prefHasUserValue") === "function" && typeof getProperty3(value, "getPrefType") === "function";
  };
  var isMutationObserverConstructor = (value) => {
    return typeof value === "function" && typeof getProperty3(getProperty3(value, "prototype"), "observe") === "function" && typeof getProperty3(getProperty3(value, "prototype"), "disconnect") === "function";
  };
  var getProperty3 = (value, key) => {
    return typeof value === "object" && value !== null || typeof value === "function" ? Reflect.get(value, key) : void 0;
  };

  // neurosort-build-entry.ts
  bootstrap();
})();
