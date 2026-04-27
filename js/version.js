/**
 * @fileoverview Runtime extension version helpers.
 */

const UNKNOWN_EXTENSION_VERSION = "unknown";

/**
 * Reads the installed extension version from the Chrome manifest.
 * @param {object} chromeApi - Optional Chrome API dependency for tests.
 * @returns {string} Extension version or a safe fallback outside Chrome.
 */
export const getExtensionVersion = (chromeApi = globalThis.chrome) => {
  if (!chromeApi?.runtime || typeof chromeApi.runtime.getManifest !== "function") {
    return UNKNOWN_EXTENSION_VERSION;
  }

  try {
    const manifest = chromeApi.runtime.getManifest();
    return typeof manifest?.version === "string" && manifest.version.trim() !== ""
      ? manifest.version
      : UNKNOWN_EXTENSION_VERSION;
  } catch (error) {
    return UNKNOWN_EXTENSION_VERSION;
  }
};

/**
 * Formats script startup banners with the runtime manifest version.
 * @param {string} label - Script label, such as "LLM Content".
 * @param {string} event - Startup event text.
 * @param {object} chromeApi - Optional Chrome API dependency for tests.
 * @returns {string} Formatted startup banner.
 */
export const formatVersionedLog = (
  label,
  event,
  chromeApi = globalThis.chrome,
) => `[${label}] ${event} (v${getExtensionVersion(chromeApi)})`;
