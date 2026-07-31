export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertIsObject(value: unknown, message = "Expected value to be an object"): asserts value is Record<string, unknown> {
  if (!isObject(value)) {
    throw new Error(message);
  }
}

export const unknown_to_object_orThrow = (value: unknown, message = "Expected object"): Record<string, unknown> => {
  assertIsObject(value, message);
  return value;
};

export const unknown_to_string_orThrow = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new Error(`Expected ${field} to be a string, got ${typeof value}`);
  }
  return value;
};

export const unknown_to_nonEmptyString_orThrow = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new Error(`Expected ${field} to be a string, got ${typeof value}`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Expected ${field} to be a non-empty string`);
  }
  return normalized;
};

export const unknown_to_nullableString_orThrow = (value: unknown, field: string): string | null => {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string") {
    throw new Error(`Field ${field} must be a string or null, got ${typeof value}`);
  }
  const normalized = value.trim();
  return normalized || null;
};

export const unknown_to_number_orThrow = (value: unknown, field: string): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Expected ${field} to be a number, got ${typeof value}`);
  }
  return value;
};

export const unknown_to_nullableNumber_orThrow = (value: unknown, field: string): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Expected ${field} to be a number or null, got ${typeof value}`);
  }
  return value;
};

export const unknown_to_nullableNonNegativeInteger_orThrow = (value: unknown, field: string): number | null => {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Field ${field} must be a non-negative integer or null, got ${String(value)}`);
  }
  return value;
};

export const unknown_to_mediaType_orThrow = (value: unknown, field: string): "image" | "video" | null => {
  if (value === null || value === undefined) return null;
  if (value === "image" || value === "video") return value;
  throw new Error(`Expected ${field} to be 'image', 'video' or null, got ${JSON.stringify(value)}`);
};

export const unknown_to_stringArray_orThrow = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item, idx) => unknown_to_string_orThrow(item, `${field}[${idx}]`));
};

export const cleanMeta = (meta: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) result[key] = value;
      continue;
    }
    if (typeof value === "object") {
      const cleaned = cleanMeta(value as Record<string, unknown>);
      if (Object.keys(cleaned).length > 0) result[key] = cleaned;
      continue;
    }
    result[key] = value;
  }
  return result;
};
