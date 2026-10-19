/** Shared pure rules for catalog model lookup and fixed input prices. */
const ROUTING_MODIFIERS = new Set(["online", "nitro", "floor", "auto"]);

/**
 * Parse a fixed input price without treating unavailable data as free.
 * @param {unknown} value - Catalog or cached price to validate.
 * @returns {number|null} Finite nonnegative price, or null when unavailable.
 * Called by pricingService, truncationPolicy, and options pricing consumers.
 */
export const parsePricePerToken = (value) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
};

/**
 * Find an exact record before removing supported trailing routing modifiers.
 * @param {string} modelId - Full selected model ID, including variants.
 * @param {Object} modelsById - Catalog/cache records keyed by exact model ID.
 * @returns {Object|null} Matching record, or null when no supported ID matches.
 * Called by background pricing and options model/pricing consumers.
 */
export const findModelPricing = (modelId, modelsById = {}) => {
  if (typeof modelId !== "string") return null;
  let candidate = modelId.trim();
  while (candidate) {
    if (Object.hasOwn(modelsById, candidate)) return modelsById[candidate];
    const colonIndex = candidate.lastIndexOf(":");
    if (colonIndex === -1 || !ROUTING_MODIFIERS.has(candidate.slice(colonIndex + 1))) return null;
    candidate = candidate.slice(0, colonIndex);
  }
  return null;
};
