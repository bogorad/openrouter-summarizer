/**
 * Cost-based truncation policy for LLM content.
 *
 * This module returns explicit allow, truncate, or reject decisions so callers
 * do not own pricing math or direct content slicing.
 */

export const TRUNCATION_DECISIONS = Object.freeze({
  ALLOW: "allow",
  TRUNCATE: "truncate",
  REJECT: "reject",
});

const DEFAULT_MAX_REQUEST_PRICE = 0.01;
const DEFAULT_TOKENS_PER_CHAR = 227.56 / 1024;

const normalizeString = (value) => (typeof value === "string" ? value : "");

const normalizeNumber = (value, fallback) => (
  Number.isFinite(value) ? value : fallback
);

const normalizePrice = (value, fallback = 0) => {
  const normalized = normalizeNumber(Number(value), fallback);
  return Math.max(0, normalized);
};

const normalizeBehavior = (value) => (value === "fail" ? "fail" : "truncate");

export const createCharacterTokenEstimatePolicy = (tokensPerChar = DEFAULT_TOKENS_PER_CHAR) => {
  const normalizedTokensPerChar = normalizePrice(tokensPerChar, DEFAULT_TOKENS_PER_CHAR)
    || DEFAULT_TOKENS_PER_CHAR;

  return {
    tokensPerChar: normalizedTokensPerChar,
    estimateTokens(content) {
      return Math.ceil(normalizeString(content).length * normalizedTokensPerChar);
    },
    estimateMaxCharacters(maxTokens) {
      return Math.floor(Math.max(0, maxTokens) / normalizedTokensPerChar);
    },
  };
};

const resolveTokenEstimatePolicy = (policy = {}) => {
  const characterPolicy = createCharacterTokenEstimatePolicy(policy.tokensPerChar);

  return {
    tokensPerChar: characterPolicy.tokensPerChar,
    estimateTokens: typeof policy.estimateTokens === "function"
      ? policy.estimateTokens
      : characterPolicy.estimateTokens,
    estimateMaxCharacters: typeof policy.estimateMaxCharacters === "function"
      ? policy.estimateMaxCharacters
      : characterPolicy.estimateMaxCharacters,
  };
};

const createDecision = (decision, fields = {}) => ({
  decision,
  content: normalizeString(fields.content),
  warning: normalizeString(fields.warning),
  error: normalizeString(fields.error),
  estimatedTokens: Math.max(0, Math.ceil(normalizeNumber(fields.estimatedTokens, 0))),
  estimatedCost: normalizePrice(fields.estimatedCost, 0),
  maxRequestPrice: normalizePrice(fields.maxRequestPrice, DEFAULT_MAX_REQUEST_PRICE),
  maxAllowedTokens: Math.max(0, Math.floor(normalizeNumber(fields.maxAllowedTokens, 0))),
  maxAllowedChars: Math.max(0, Math.floor(normalizeNumber(fields.maxAllowedChars, 0))),
});

/**
 * Applies max-price behavior to content prepared for an LLM request.
 * @param {object} input - Policy input.
 * @param {string} input.content - Content that will be sent to the LLM.
 * @param {number} input.pricePerToken - Prompt price per token.
 * @param {number} input.maxRequestPrice - Maximum allowed request price.
 * @param {string} input.maxPriceBehavior - Either "fail" or "truncate".
 * @param {object} input.tokenEstimatePolicy - Token estimator implementation.
 * @returns {object} Explicit allow, truncate, or reject decision.
 */
export const applyCostTruncationPolicy = (input = {}) => {
  const content = normalizeString(input.content);
  const pricePerToken = normalizePrice(input.pricePerToken, 0);
  const maxRequestPrice = normalizePrice(
    input.maxRequestPrice,
    DEFAULT_MAX_REQUEST_PRICE,
  );
  const maxPriceBehavior = normalizeBehavior(input.maxPriceBehavior);
  const tokenEstimatePolicy = resolveTokenEstimatePolicy(input.tokenEstimatePolicy);
  const estimatedTokens = Math.max(
    0,
    Math.ceil(normalizeNumber(tokenEstimatePolicy.estimateTokens(content), 0)),
  );
  const estimatedCost = estimatedTokens * pricePerToken;

  if (pricePerToken === 0 || estimatedCost <= maxRequestPrice) {
    return createDecision(TRUNCATION_DECISIONS.ALLOW, {
      content,
      estimatedTokens,
      estimatedCost,
      maxRequestPrice,
    });
  }

  if (maxPriceBehavior === "truncate") {
    const maxAllowedTokens = Math.floor(maxRequestPrice / pricePerToken);
    const maxAllowedChars = tokenEstimatePolicy.estimateMaxCharacters(maxAllowedTokens);

    if (maxAllowedChars > 0) {
      return createDecision(TRUNCATION_DECISIONS.TRUNCATE, {
        content: content.substring(0, maxAllowedChars),
        warning: `Request exceeds max price of $${maxRequestPrice.toFixed(3)}. Truncating selection to fit the limit.`,
        estimatedTokens,
        estimatedCost,
        maxRequestPrice,
        maxAllowedTokens,
        maxAllowedChars,
      });
    }
  }

  return createDecision(TRUNCATION_DECISIONS.REJECT, {
    content,
    error: `Error: Request exceeds max price of $${maxRequestPrice.toFixed(3)}. Estimated cost: $${estimatedCost.toFixed(6)}.`,
    estimatedTokens,
    estimatedCost,
    maxRequestPrice,
  });
};
