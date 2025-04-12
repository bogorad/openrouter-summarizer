document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const modelDropdown = document.getElementById('modelDropdown');
  const modelInput = document.getElementById('modelInput');
  const debugCheckbox = document.getElementById('debug');
  const bulletCountRadios = document.querySelectorAll('input[name="bulletCount"]');
  const DEFAULT_BULLET_COUNT = "5";

  // Translate settings
  const translateCheckbox = document.getElementById('translate');
  const translateLanguage = document.getElementById('translateLanguage');
  const DEFAULT_TRANSLATE = false;
  const DEFAULT_TRANSLATE_LANG = "english";

  // Load settings
  chrome.storage.sync.get([
    'apiKey', 'model', 'debug', 'bulletCount',
    'translate', 'translateLanguage'
  ], (data) => {
    apiKeyInput.value = data.apiKey || '';
    debugCheckbox.checked = !!data.debug;

    // Bullet count radios
    let countValue = data.bulletCount || DEFAULT_BULLET_COUNT;
    let setOk = false;
    bulletCountRadios.forEach(radio => {
      if (radio.value === countValue) {
        radio.checked = true;
        setOk = true;
      } else {
        radio.checked = false;
      }
    });
    if (!setOk) {
      bulletCountRadios.forEach(radio => {
        if (radio.value === DEFAULT_BULLET_COUNT) radio.checked = true;
      });
    }

    // Model
    if (data.model) {
      modelInput.value = data.model;
      const dropdownOption = modelDropdown.querySelector(`option[value="${data.model}"]`);
      if (dropdownOption) {
        modelDropdown.value = data.model;
      } else {
        modelDropdown.value = '';
      }
    }

    // Translate
    translateCheckbox.checked = ('translate' in data) ? !!data.translate : DEFAULT_TRANSLATE;
    translateLanguage.value = data.translateLanguage || DEFAULT_TRANSLATE_LANG;
  });

  modelDropdown.addEventListener('change', () => {
    modelInput.value = modelDropdown.value;
  });

  document.getElementById('save').addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();
    const debug = debugCheckbox.checked;
    let bulletCount = DEFAULT_BULLET_COUNT;
    bulletCountRadios.forEach(radio => {
      if (radio.checked) bulletCount = radio.value;
    });

    // Translation
    const translate = translateCheckbox.checked;
    const selectedLanguage = translateLanguage.value;

    if (!model) {
      alert("Please select or enter a model name.");
      return;
    }

    chrome.storage.sync.set({
      apiKey,
      model,
      debug,
      bulletCount,
      translate,
      translateLanguage: selectedLanguage
    }, () => {
      const status = document.getElementById('status');
      status.textContent = 'Saved!';
      setTimeout(() => status.textContent = '', 1500);
    });
  });
});

