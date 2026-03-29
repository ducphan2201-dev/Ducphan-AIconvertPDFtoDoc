// Storage utility – localStorage wrapper
const STORAGE_KEYS = {
  API_KEY: 'pdf_converter_api_key',
  MODEL: 'pdf_converter_model',
};

export function getApiKey() {
  return localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
}

export function setApiKey(key) {
  localStorage.setItem(STORAGE_KEYS.API_KEY, key.trim());
}

export function getModel() {
  const model = localStorage.getItem(STORAGE_KEYS.MODEL);
  const validModels = [
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite-preview'
  ];
  return validModels.includes(model) ? model : 'gemini-3-flash-preview';
}

export function setModel(model) {
  localStorage.setItem(STORAGE_KEYS.MODEL, model);
}

export function hasApiKey() {
  return getApiKey().length > 0;
}
