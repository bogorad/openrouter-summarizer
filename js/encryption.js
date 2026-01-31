// js/encryption.js - Encryption utilities for sensitive tokens

const ENCRYPTION_KEY_NAME = 'encryptionKey_v1';

/**
 * Gets or creates an AES-GCM encryption key stored in chrome.storage.local
 * @returns {Promise<CryptoKey>} The encryption key
 */
export async function getOrCreateEncryptionKey() {
  const stored = await chrome.storage.local.get(ENCRYPTION_KEY_NAME);
  if (stored[ENCRYPTION_KEY_NAME]) {
    return crypto.subtle.importKey(
      'raw',
      new Uint8Array(stored[ENCRYPTION_KEY_NAME]),
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  
  // Generate new key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  const exported = await crypto.subtle.exportKey('raw', key);
  await chrome.storage.local.set({ 
    [ENCRYPTION_KEY_NAME]: Array.from(new Uint8Array(exported)) 
  });
  
  return key;
}

/**
 * Encrypts plaintext using AES-GCM
 * @param {string} plaintext - Text to encrypt
 * @returns {Promise<string>} Base64 encoded encrypted data
 */
export async function encryptSensitiveData(plaintext) {
  if (!plaintext) return '';
  const key = await getOrCreateEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  
  // Store IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts encrypted data using AES-GCM
 * @param {string} encrypted - Base64 encoded encrypted data
 * @returns {Promise<{success: boolean, data: string, error: string|null}>} Result object
 *   - success: true if decryption succeeded or input was empty, false on failure
 *   - data: decrypted plaintext (empty string if failed or input was empty)
 *   - error: error message if decryption failed, null otherwise
 * Called by: background.js, options.js, chatHandler.js, summaryHandler.js, settingsManager.js, pricingService.js
 */
export async function decryptSensitiveData(encrypted) {
  if (!encrypted) return { success: true, data: '', error: null };
  try {
    const key = await getOrCreateEncryptionKey();
    const combined = new Uint8Array(
      atob(encrypted).split('').map(c => c.charCodeAt(0))
    );
    
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    
    return { success: true, data: new TextDecoder().decode(decrypted), error: null };
  } catch (e) {
    console.error('[Encryption] Decryption failed:', e);
    return { success: false, data: '', error: e.message || 'Decryption failed' };
  }
}
