// js/settingsManager.js
import { Logger } from "./logger.js";
import { getSecretCapabilities } from "./state/secretStore.js";
import { loadSettingsForUi } from "./state/settingsStore.js";


export async function handleGetSettings(sendResponse, DEBUG) {
  Logger.debug("[LLM Settings Manager]", "handleGetSettings: Request received. Fetching settings...");

  try {
    const capabilities = await getSecretCapabilities();
    const settings = await loadSettingsForUi({ capabilities });

    if (DEBUG) {
      Logger.info("[LLM Settings Manager]", "handleGetSettings: Sending settings response - OK.", {
        ...settings,
        hasApiKey: settings.hasApiKey,
        hasNewsblurToken: settings.hasNewsblurToken,
        hasJoplinToken: settings.hasJoplinToken,
      });
    }

    sendResponse(settings);
  } catch (error) {
    Logger.error("[LLM Settings Manager]", "handleGetSettings: Error during settings processing:", error);
    sendResponse({
      status: "error",
      message: `Failed to load settings: ${error.message}`,
      errorDetails: error.toString(),
    });
  }
}
