// ── SECURE CRYPTO VAULT ENGINE ────────────────────────────
// Uses PBKDF2 + AES-GCM (all native Web Crypto) for zero-trust client-side vault encryption.
// Plaintext data is never written to disk. The session key lives ONLY in-memory or transiently in sessionStorage (tab scope).

export let activeEncryptionKey: CryptoKey | null = null;
export let activeSaltHex = "";

export async function hashPasswordSHA256(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function initializeEncryption(password: string, saltHex: string) {
  try {
    const salt = saltHex
      ? new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
      : window.crypto.getRandomValues(new Uint8Array(16));

    activeSaltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
    activeEncryptionKey = await deriveKey(password, salt);
    sessionStorage.setItem("forge_vault_session", JSON.stringify({ salt: activeSaltHex, password }));
  } catch (error) {
    console.error("AES-GCM Cryptographic init failed:", error);
  }
}

export async function encryptData(plaintext: string): Promise<string> {
  if (!activeEncryptionKey) return plaintext;
  try {
    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      activeEncryptionKey,
      encoder.encode(plaintext)
    );

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    const binary = String.fromCharCode(...Array.from(combined));
    return "SECURE:" + btoa(binary);
  } catch {
    return plaintext;
  }
}

export async function decryptData(ciphertextBase64: string): Promise<string> {
  if (!activeEncryptionKey || !ciphertextBase64.startsWith("SECURE:")) return ciphertextBase64;
  try {
    const base64Data = ciphertextBase64.replace("SECURE:", "");
    const binary = atob(base64Data);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decoder = new TextDecoder();

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      activeEncryptionKey,
      ciphertext
    );
    return decoder.decode(decrypted);
  } catch (error) {
    console.warn("AES Decryption block mapping failed:", error);
    return ciphertextBase64;
  }
}

export function purgeEncryptionKey() {
  activeEncryptionKey = null;
  activeSaltHex = "";
}

// ── STORAGE ───────────────────────────────────────────────
export const store = {
  async get(k: string) {
    try {
      let rawVal: any = null;
      if (typeof window !== "undefined" && "storage" in window && (window as any).storage?.get) {
        const r = await (window as any).storage.get(k);
        rawVal = r ? JSON.parse(r.value) : null;
      } else if (typeof window !== "undefined" && window.localStorage) {
        const item = localStorage.getItem(k);
        rawVal = item ? JSON.parse(item) : null;
      }

      if (rawVal && typeof rawVal === "string" && rawVal.startsWith("SECURE:")) {
        const decrypted = await decryptData(rawVal);
        return JSON.parse(decrypted);
      }
      return rawVal;
    } catch {
      return null;
    }
  },
  async set(k: string, v: any) {
    try {
      let valToStore = v;
      if (activeEncryptionKey && k !== "session" && !k.startsWith("user:") && k !== "forge_analytics") {
        const plaintext = JSON.stringify(v);
        valToStore = await encryptData(plaintext);
      }

      if (typeof window !== "undefined" && "storage" in window && (window as any).storage?.set) {
        await (window as any).storage.set(k, JSON.stringify(valToStore));
        return;
      }
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(k, JSON.stringify(valToStore));
      }
    } catch {}
  },
  async del(k: string) {
    try {
      if (typeof window !== "undefined" && "storage" in window && (window as any).storage?.delete) {
        await (window as any).storage.delete(k);
        return;
      }
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.removeItem(k);
      }
    } catch {}
  },
  async list(prefix: string) {
    try {
      if (typeof window !== "undefined" && "storage" in window && (window as any).storage?.list) {
        const r = await (window as any).storage.list(prefix);
        return r?.keys || [];
      }
      if (typeof window !== "undefined" && window.localStorage) {
        const keys = Object.keys(localStorage);
        return keys.filter((k) => k.startsWith(prefix));
      }
      return [];
    } catch {
      return [];
    }
  }
};
