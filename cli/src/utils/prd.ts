import { readText } from "./files.js";

export interface PrdValidationResult {
  valid: boolean;
  errors: string[];
}

type JsonObject = Record<string, unknown>;

const AGENT_ROLES = [
  "developer",
  "uxui",
  "documentation",
  "WEB_BROWSER_SAFE",
  "WEB_BROWSER_BYPASS",
] as const;
const HANDOFF_STATUSES = ["ready", "active", "complete", "blocked"] as const;
const ACCEPTANCE_BUNDLE_STATUSES = [
  "pending",
  "active",
  "passed",
  "deferred",
  "blocked",
] as const;

export async function validatePrdFile(prdPath: string): Promise<PrdValidationResult> {
  try {
    const content = await readText(prdPath);
    const parsed = JSON.parse(content) as unknown;
    return validatePrdData(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        valid: false,
        errors: [`prd.json is not valid JSON: ${error.message}`],
      };
    }

    return {
      valid: false,
      errors: [`Could not read prd.json: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

export function validatePrdData(data: unknown): PrdValidationResult {
  const errors: string[] = [];

  if (!isObject(data)) {
    return { valid: false, errors: ["Root must be a JSON object."] };
  }

  requireString(data, "project", "project", errors);
  requireString(data, "branchName", "branchName", errors);
  requireString(data, "description", "description", errors);

  let acceptanceCriteriaBundles: JsonObject[] | null = null;
  const finalSuccessCriteria = requireObject(
    data,
    "finalSuccessCriteria",
    "finalSuccessCriteria",
    errors
  );
  if (finalSuccessCriteria) {
    requireString(
      finalSuccessCriteria,
      "description",
      "finalSuccessCriteria.description",
      errors
    );
    const acceptanceCriteria = requireStringArray(
      finalSuccessCriteria,
      "acceptanceCriteria",
      "finalSuccessCriteria.acceptanceCriteria",
      errors
    );
    requireBoolean(finalSuccessCriteria, "passes", "finalSuccessCriteria.passes", errors);
    requireString(finalSuccessCriteria, "notes", "finalSuccessCriteria.notes", errors);

    acceptanceCriteriaBundles = optionalObjectArray(
      finalSuccessCriteria,
      "acceptanceCriteriaBundles",
      "finalSuccessCriteria.acceptanceCriteriaBundles",
      errors
    );
    if (acceptanceCriteriaBundles) {
      validateAcceptanceCriteriaBundlesShape(acceptanceCriteriaBundles, errors);
    }
    if (
      acceptanceCriteria &&
      acceptanceCriteria.length > 5 &&
      !acceptanceCriteriaBundles
    ) {
      errors.push(
        "finalSuccessCriteria.acceptanceCriteriaBundles is required when finalSuccessCriteria.acceptanceCriteria has more than 5 items."
      );
    }
  }

  const planning = requireObject(data, "planning", "planning", errors);
  if (planning) {
    requirePositiveInteger(planning, "cycle", "planning.cycle", errors);
    requireString(planning, "currentObjective", "planning.currentObjective", errors);

    const activeHandoff = optionalObject(
      planning,
      "activeHandoff",
      "planning.activeHandoff",
      errors
    );
    if (activeHandoff) {
      requireStringEnum(
        activeHandoff,
        "agent",
        [...AGENT_ROLES],
        "planning.activeHandoff.agent",
        errors
      );
      requireString(
        activeHandoff,
        "objective",
        "planning.activeHandoff.objective",
        errors
      );

      const scope = requireObject(
        activeHandoff,
        "scope",
        "planning.activeHandoff.scope",
        errors
      );
      if (scope) {
        requireStringArray(
          scope,
          "include",
          "planning.activeHandoff.scope.include",
          errors
        );
        requireStringArray(
          scope,
          "exclude",
          "planning.activeHandoff.scope.exclude",
          errors
        );
      }

      requireStringArray(
        activeHandoff,
        "rules",
        "planning.activeHandoff.rules",
        errors
      );
      requireString(
        activeHandoff,
        "comments",
        "planning.activeHandoff.comments",
        errors
      );
      requireStringArray(
        activeHandoff,
        "successCriteria",
        "planning.activeHandoff.successCriteria",
        errors
      );
      requireStringEnum(
        activeHandoff,
        "status",
        [...HANDOFF_STATUSES],
        "planning.activeHandoff.status",
        errors
      );
    }
  }

  const prdChain = requireObjectArray(data, "prdChain", "prdChain", errors);
  if (prdChain) {
    if (prdChain.length === 0) {
      errors.push("prdChain must contain at least one cycle entry.");
    }

    prdChain.forEach((entry, index) => {
      const path = `prdChain[${index}]`;
      requirePositiveInteger(entry, "cycle", `${path}.cycle`, errors);
      requireString(entry, "objective", `${path}.objective`, errors);
      requireString(entry, "status", `${path}.status`, errors);
      requireStringArray(entry, "storyIds", `${path}.storyIds`, errors);
      requireString(entry, "notes", `${path}.notes`, errors);
    });
  }

  const userStories = requireObjectArray(data, "userStories", "userStories", errors);
  const storyIds = new Set<string>();
  const storyPasses = new Map<string, boolean>();
  if (userStories) {
    userStories.forEach((story, index) => {
      const path = `userStories[${index}]`;
      const id = requireString(story, "id", `${path}.id`, errors);
      if (id) {
        if (storyIds.has(id)) {
          errors.push(`Duplicate userStories id '${id}'.`);
        }
        storyIds.add(id);
      }

      requireString(story, "title", `${path}.title`, errors);
      requireString(story, "description", `${path}.description`, errors);
      requireStringArray(story, "acceptanceCriteria", `${path}.acceptanceCriteria`, errors);
      requirePositiveNumber(story, "priority", `${path}.priority`, errors);
      requireStringEnum(story, "storyPriority", ["high", "medium", "low"], `${path}.storyPriority`, errors);
      requireBoolean(story, "passes", `${path}.passes`, errors);
      if (id && typeof story.passes === "boolean") {
        storyPasses.set(id, story.passes);
      }
      requireString(story, "notes", `${path}.notes`, errors);
    });
  }

  if (finalSuccessCriteria && acceptanceCriteriaBundles) {
    validateAcceptanceCriteriaBundleState(
      acceptanceCriteriaBundles,
      finalSuccessCriteria,
      storyIds,
      storyPasses,
      errors
    );
  }

  if (planning && prdChain) {
    const activeEntries = prdChain.filter((entry) => entry.status === "active");
    if (activeEntries.length > 1) {
      errors.push("prdChain must not contain more than one active entry.");
    }

    if (activeEntries.length === 1 && activeEntries[0].cycle !== planning.cycle) {
      errors.push(
        `planning.cycle (${planning.cycle}) must match the active prdChain cycle (${activeEntries[0].cycle}).`
      );
    }

    if (activeEntries.length === 1 && userStories) {
      const activeStoryIds = requireStringArray(
        activeEntries[0],
        "storyIds",
        "prdChain active entry.storyIds",
        errors
      ) ?? [];
      for (const storyId of activeStoryIds) {
        if (!storyIds.has(storyId)) {
          errors.push(
            `Active prdChain storyId '${storyId}' is missing from userStories.`
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateAcceptanceCriteriaBundlesShape(
  bundles: JsonObject[],
  errors: string[]
): void {
  const bundleIds = new Set<string>();

  if (bundles.length === 0) {
    errors.push("finalSuccessCriteria.acceptanceCriteriaBundles must contain at least one bundle when present.");
  }

  bundles.forEach((bundle, index) => {
    const path = `finalSuccessCriteria.acceptanceCriteriaBundles[${index}]`;
    const id = requireString(bundle, "id", `${path}.id`, errors);
    if (id) {
      if (bundleIds.has(id)) {
        errors.push(`Duplicate acceptanceCriteriaBundles id '${id}'.`);
      }
      bundleIds.add(id);
    }

    requireString(bundle, "title", `${path}.title`, errors);
    requireStringArray(bundle, "acceptanceCriteria", `${path}.acceptanceCriteria`, errors);
    requireStringArray(bundle, "storyIds", `${path}.storyIds`, errors);
    requireStringEnum(
      bundle,
      "status",
      [...ACCEPTANCE_BUNDLE_STATUSES],
      `${path}.status`,
      errors
    );
    requireString(bundle, "notes", `${path}.notes`, errors);
  });
}

function validateAcceptanceCriteriaBundleState(
  bundles: JsonObject[],
  finalSuccessCriteria: JsonObject,
  storyIds: Set<string>,
  storyPasses: Map<string, boolean>,
  errors: string[]
): void {
  bundles.forEach((bundle, index) => {
    const path = `finalSuccessCriteria.acceptanceCriteriaBundles[${index}]`;
    const bundleStoryIds = Array.isArray(bundle.storyIds)
      ? bundle.storyIds.filter((storyId): storyId is string => typeof storyId === "string")
      : [];

    for (const storyId of bundleStoryIds) {
      if (!storyIds.has(storyId)) {
        errors.push(`${path}.storyIds references missing userStories id '${storyId}'.`);
      }
    }

    if (bundle.status === "passed") {
      if (bundleStoryIds.length === 0) {
        errors.push(`${path}.status cannot be "passed" without at least one referenced userStory.`);
        return;
      }

      const allStoriesPassed = bundleStoryIds.every(
        (storyId) => storyPasses.get(storyId) === true
      );
      if (!allStoriesPassed) {
        errors.push(
          `${path}.status cannot be "passed" until all referenced userStories pass.`
        );
      }
    }
  });

  if (
    finalSuccessCriteria.passes === true &&
    bundles.length > 0 &&
    bundles.some((bundle) => bundle.status !== "passed" && bundle.status !== "deferred")
  ) {
    errors.push(
      'finalSuccessCriteria.passes cannot be true until every acceptanceCriteriaBundles entry has status "passed" or "deferred".'
    );
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(
  parent: JsonObject,
  key: string,
  path: string,
  errors: string[]
): JsonObject | null {
  const value = parent[key];
  if (!isObject(value)) {
    errors.push(`${path} must be an object.`);
    return null;
  }
  return value;
}

function optionalObject(
  parent: JsonObject,
  key: string,
  path: string,
  errors: string[]
): JsonObject | null {
  const value = parent[key];
  if (value === undefined) {
    return null;
  }
  if (!isObject(value)) {
    errors.push(`${path} must be an object when present.`);
    return null;
  }
  return value;
}

function optionalObjectArray(
  parent: JsonObject,
  key: string,
  path: string,
  errors: string[]
): JsonObject[] | null {
  const value = parent[key];
  if (value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array when present.`);
    return null;
  }

  const objects: JsonObject[] = [];
  value.forEach((item, index) => {
    if (!isObject(item)) {
      errors.push(`${path}[${index}] must be an object.`);
      return;
    }
    objects.push(item);
  });

  return objects;
}

function requireObjectArray(
  parent: JsonObject,
  key: string,
  path: string,
  errors: string[]
): JsonObject[] | null {
  const value = parent[key];
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return null;
  }

  const objects: JsonObject[] = [];
  value.forEach((item, index) => {
    if (!isObject(item)) {
      errors.push(`${path}[${index}] must be an object.`);
      return;
    }
    objects.push(item);
  });

  return objects;
}

function requireString(
  parent: JsonObject,
  key: string,
  path: string,
  errors: string[]
): string | null {
  const value = parent[key];
  if (typeof value !== "string") {
    errors.push(`${path} must be a string.`);
    return null;
  }
  return value;
}

function requireStringArray(
  parent: JsonObject,
  key: string,
  path: string,
  errors: string[]
): string[] | null {
  const value = parent[key];
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of strings.`);
    return null;
  }

  const strings: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push(`${path}[${index}] must be a string.`);
      return;
    }
    strings.push(item);
  });

  return strings;
}

function requireBoolean(
  parent: JsonObject,
  key: string,
  path: string,
  errors: string[]
): boolean | null {
  const value = parent[key];
  if (typeof value !== "boolean") {
    errors.push(`${path} must be a boolean.`);
    return null;
  }
  return value;
}

function requirePositiveInteger(
  parent: JsonObject,
  key: string,
  path: string,
  errors: string[]
): number | null {
  const value = parent[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    errors.push(`${path} must be a positive integer.`);
    return null;
  }
  return value;
}

function requireStringEnum(
  parent: JsonObject,
  key: string,
  allowed: string[],
  path: string,
  errors: string[]
): string | null {
  const value = parent[key];
  if (typeof value !== "string" || !allowed.includes(value)) {
    errors.push(`${path} must be one of: ${allowed.join(", ")}.`);
    return null;
  }
  return value;
}

function requirePositiveNumber(
  parent: JsonObject,
  key: string,
  path: string,
  errors: string[]
): number | null {
  const value = parent[key];
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    errors.push(`${path} must be a positive number.`);
    return null;
  }
  return value;
}
