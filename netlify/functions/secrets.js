import { createClient } from '@supabase/supabase-js';
import { requireUser } from './utils/auth.js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Derive a 32-byte key from MASTER_KEY for AES-256-GCM (no insecure defaults)
function getEncryptionKey() {
  const MASTER_KEY = process.env.SECRETS_MASTER_KEY;
  if (!MASTER_KEY || MASTER_KEY.length < 16) {
    throw new Error('SECRETS_MASTER_KEY is not configured. Set a strong master key in the environment.');
  }
  if (MASTER_KEY === 'd3Ytc2VjcmV0cy1tYXN0ZXIta2V5LWZvci1kZXYtMTIzNDU=') {
    throw new Error('SECRETS_MASTER_KEY is set to an insecure default. Generate a new key.');
  }
  return crypto.createHash('sha256').update(MASTER_KEY).digest();
}

/**
 * Encrypts plaintext using AES-256-GCM
 * @param {string} text - Plaintext secret
 * @returns {string} Encrypted text prefixed with enc:
 */
export function encrypt(text) {
  if (!text) return '';
  try {
    const ENCRYPTION_KEY = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('base64');
    return `enc:${iv.toString('base64')}:${encrypted}:${authTag}`;
  } catch (err) {
    console.error('[Secrets Encryption] Encryption failed:', err);
    throw err;
  }
}

/**
 * Decrypts ciphertext prefixed with enc: using AES-256-GCM
 * @param {string} encryptedText - Ciphertext secret
 * @returns {string} Decrypted plaintext
 */
export function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.startsWith('enc:')) {
    return encryptedText; // Fallback to plaintext for backward compatibility
  }
  try {
    const ENCRYPTION_KEY = getEncryptionKey();
    const parts = encryptedText.split(':');
    if (parts.length !== 4) return encryptedText;
    const iv = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');
    const authTag = Buffer.from(parts[3], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Secrets Decryption] Decryption failed:', err.message);
    return '[Decryption Failed]';
  }
}

export async function handler(event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // Enforce authentication
  const authResult = await requireUser(event);
  if (authResult.error) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: authResult.error }) };
  }

  // Block flow_owner (guest runners) and service_role from using secrets manager API
  if (authResult.user.role === 'flow_owner' || authResult.user.id === 'service_role') {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Access denied: client secrets management requires direct user authentication' })
    };
  }

  const userId = authResult.user.id;

  try {
    if (event.httpMethod === 'GET') {
      const { data, error } = await supabase
        .from('user_secrets')
        .select('key_name, value')
        .eq('user_id', userId);

      if (error) throw error;

      // Decrypt secrets for client display
      const secrets = (data || []).map(s => ({
        key: s.key_name,
        value: decrypt(s.value)
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(secrets) };
    }

    if (event.httpMethod === 'POST') {
      const { secrets } = JSON.parse(event.body || '{}');
      if (!Array.isArray(secrets)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid secrets payload' }) };
      }

      // Encrypt and upsert secrets
      for (const s of secrets) {
        const encryptedValue = encrypt(s.value);
        const { error } = await supabase
          .from('user_secrets')
          .upsert({
            user_id: userId,
            key_name: s.key,
            value: encryptedValue
          }, { onConflict: 'user_id,key_name' });

        if (error) throw error;
      }

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
    }

    if (event.httpMethod === 'DELETE') {
      const { error } = await supabase
        .from('user_secrets')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };

  } catch (err) {
    console.error('[Secrets API] Unexpected error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', message: err.message }),
    };
  }
};
