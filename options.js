const DEFAULT_PROMPT = "Summarize this article in 5 bullet points. Ignore HTML tags. Do not comment on output.";

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const promptInput = document.getElementById('promptInput');
  const modelDropdown = document.getElementById('modelDropdown');
  const modelInput = document.getElementById('modelInput');
  const debugCheckbox = document.getElementById('debug');

  chrome.storage.sync.get(['apiKey', 'prompt', 'model', 'debug'], (data) => {
    apiKeyInput.value = data.apiKey || '';
    promptInput.value = data.prompt || DEFAULT_PROMPT;
    debugCheckbox.checked = !!data.debug;

    if (data.model) {
      modelInput.value = data.model;

      const dropdownOption = modelDropdown.querySelector(`option[value="${data.model}"]`);
      if (dropdownOption) {
        modelDropdown.value = data.model;
      } else {
        modelDropdown.value = '';
      }
    }
  });

  modelDropdown.addEventListener('change', () => {
    modelInput.value = modelDropdown.value;
  });

  document.getElementById('save').addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const prompt = promptInput.value.trim() || DEFAULT_PROMPT;
    const model = modelInput.value.trim();
    const debug = debugCheckbox.checked;

    if (!model) {
      alert("Please select or enter a model name.");
      return;
    }

    chrome.storage.sync.set({ apiKey, prompt, model, debug }, () => {
      const status = document.getElementById('status');
      status.textContent = 'Saved!';
      setTimeout(() => status.textContent = '', 1500);
    });
  });
});

