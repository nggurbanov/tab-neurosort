import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { chunkPromptTabs, batchMetadataTabs, planOperationChunks } from "../../src/core/chunking";
import { createCategoryPlan } from "../../src/core/categoryPlan";
import { planGroupMutations } from "../../src/core/groupPlanner";
import { measureElapsed } from "../../src/core/performance";
import { buildPromptPayload } from "../../src/core/promptPayload";
import { parseCategoryResponse } from "../../src/core/responseParser";
import {
  PERFORMANCE_FIXTURE_SIZES,
  makeGroupPlannerTabs,
  makePromptTabs,
  makeRoundRobinAssignments,
  makeTabSnapshots,
} from "../fixtures/tabs";

describe("performance fixtures", () => {
  it("provides deterministic 25, 80, and 200 tab fixtures", () => {
    // Given
    const sizes = PERFORMANCE_FIXTURE_SIZES;

    // When
    const fixtures = sizes.map((size) => makeTabSnapshots(size));

    // Then
    expect(fixtures.map((fixture) => fixture.length)).toEqual([25, 80, 200]);
    expect(fixtures[2]?.slice(0, 3).map((tab) => tab.id)).toEqual(["tab-1", "tab-2", "tab-3"]);
    expect(fixtures[2]?.at(-1)?.url).toBe("https://design.example.com/workspace/200");
  });

  it("chunks prompts and metadata batches without dropping tabs", () => {
    // Given
    const promptTabs = makePromptTabs(200);

    // When
    const promptChunks = chunkPromptTabs(promptTabs, { maxTabsPerPrompt: 80 });
    const metadataBatches = batchMetadataTabs(promptTabs, { maxTabsPerBatch: 25 });

    // Then
    expect(promptChunks.map((chunk) => chunk.length)).toEqual([80, 80, 40]);
    expect(metadataBatches).toHaveLength(8);
    expect(promptChunks.flat().map((tab) => tab.id)).toEqual(promptTabs.map((tab) => tab.id));
  });

  it("keeps the 200 tab pure prompt and planning path under 100ms", () => {
    // Given
    const snapshots = makeTabSnapshots(200);
    const plannerTabs = makeGroupPlannerTabs(200);

    // When
    const measured = measureElapsed({ now: () => performance.now() }, () => {
      const payload = buildPromptPayload(snapshots, { includeDescriptions: false });
      const promptChunks = chunkPromptTabs(payload.tabs, { maxTabsPerPrompt: 80 });
      const assignments = parseCategoryResponse(
        JSON.stringify({ groups: makeRoundRobinAssignments(payload.tabs) }),
        payload.tabs.map((tab) => tab.id),
      );
      const categoryPlan = createCategoryPlan(payload.tabs, assignments, { minGroupSize: 2, maxGroupSize: 20 });
      const mutationPlan = planGroupMutations({
        tabs: plannerTabs,
        categories: categoryPlan.groups.map((group) => ({ name: group.name, tabIds: group.tabIds })),
      });
      return { promptChunks, categoryPlan, mutationPlan };
    });

    // Then
    console.info(`task-15 pure-path-elapsed-ms=${measured.elapsedMs.toFixed(3)}`);
    expect(measured.elapsedMs).toBeLessThan(100);
    expect(measured.value.promptChunks).toHaveLength(3);
    expect(measured.value.categoryPlan.groups.every((group) => group.tabIds.length <= 20)).toBe(true);
    expect(measured.value.mutationPlan.operations.length).toBeGreaterThan(200);
  });

  it("plans fake integration mutations so no operation chunk blocks over 50ms", () => {
    // Given
    const tabs = makePromptTabs(200);
    const categories = createCategoryPlan(tabs, makeRoundRobinAssignments(tabs), {
      minGroupSize: 2,
      maxGroupSize: 20,
    }).groups;
    const mutationPlan = planGroupMutations({
      tabs: makeGroupPlannerTabs(200),
      categories: categories.map((group) => ({ name: group.name, tabIds: group.tabIds })),
    });

    // When
    const chunks = planOperationChunks(mutationPlan.operations, {
      maxSynchronousMs: 50,
      estimatedMsPerOperation: 5,
    });
    const maxChunkMs = Math.max(...chunks.map((chunk) => chunk.estimatedSynchronousMs));

    // Then
    console.info(`task-15 mutation-chunks=${chunks.length} max-sync-ms=${maxChunkMs}`);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.estimatedSynchronousMs <= 50)).toBe(true);
    expect(chunks.flatMap((chunk) => chunk.operations)).toEqual(mutationPlan.operations);
  });
});
