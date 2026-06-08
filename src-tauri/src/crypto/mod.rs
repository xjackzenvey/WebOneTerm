// Fernet encryption: AES-128-CBC + HMAC-SHA256
// Compatible with the Python cryptography.fernet implementation.

use std::fs;
use std::path::Path;

use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use base64::engine::general_purpose::URL_SAFE;
use base64::Engine as _;
use hmac::{Hmac, Mac};
use rand::Rng;
use sha2::Sha256;

use crate::error::AppError;

type Aes128CbcEnc = cbc::Encryptor<aes::Aes128>;
type Aes128CbcDec = cbc::Decryptor<aes::Aes128>;
type HmacSha256 = Hmac<Sha256>;

/// A Fernet key: 128-bit AES key + 128-bit HMAC-SHA256 signing key.
/// Stored as 32 bytes, base64url-encoded on disk.
#[derive(Clone)]
pub struct Fernet {
    signing_key: [u8; 16],
    encryption_key: [u8; 16],
}

impl Fernet {
    /// Generate a new random Fernet key.
    pub fn generate() -> Self {
        let mut rng = rand::thread_rng();
        let mut key_bytes = [0u8; 32];
        rng.fill(&mut key_bytes);
        Self::from_bytes(&key_bytes)
    }

    /// Create from raw 32-byte key material (first 16 = signing, last 16 = encryption).
    pub fn from_bytes(key: &[u8; 32]) -> Self {
        let mut signing_key = [0u8; 16];
        let mut encryption_key = [0u8; 16];
        signing_key.copy_from_slice(&key[..16]);
        encryption_key.copy_from_slice(&key[16..]);
        Fernet {
            signing_key,
            encryption_key,
        }
    }

    /// Load from a base64url-encoded key file, or generate a new one.
    pub fn load_or_create(key_path: &Path) -> Result<Self, AppError> {
        if key_path.exists() {
            let encoded = fs::read_to_string(key_path)
                .map_err(|e| AppError::Crypto(format!("Cannot read key file: {}", e)))?;
            let encoded = encoded.trim();
            let key_vec = URL_SAFE.decode(encoded)
                .map_err(|e| AppError::Crypto(format!("Invalid key encoding: {}", e)))?;
            let key_bytes: [u8; 32] = key_vec
                .try_into()
                .map_err(|_| AppError::Crypto("Invalid key length".into()))?;
            Ok(Self::from_bytes(&key_bytes))
        } else {
            let fernet = Self::generate();
            let key_bytes: Vec<u8> = fernet
                .signing_key
                .iter()
                .chain(fernet.encryption_key.iter())
                .copied()
                .collect();
            let encoded = URL_SAFE.encode(&key_bytes);
            if let Some(parent) = key_path.parent() {
                fs::create_dir_all(parent).ok();
            }
            fs::write(key_path, &encoded)
                .map_err(|e| AppError::Crypto(format!("Cannot write key file: {}", e)))?;
            // Set file permissions to 0600 on Unix
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(meta) = fs::metadata(key_path) {
                    let mut perms = meta.permissions();
                    perms.set_mode(0o600);
                    fs::set_permissions(key_path, perms).ok();
                }
            }
            Ok(fernet)
        }
    }

    /// Encrypt plaintext. Returns a Fernet token (base64url-encoded).
    pub fn encrypt(&self, plaintext: &str) -> Result<String, AppError> {
        // Fernet token format:
        // Version (1 byte, 0x80) || Timestamp (8 bytes, big-endian) || IV (16 bytes) ||
        // Ciphertext (variable, PKCS7-padded) || HMAC (32 bytes)
        // Everything base64url-encoded.

        let version: u8 = 0x80;
        let timestamp = chrono::Utc::now().timestamp() as u64;

        let mut iv = [0u8; 16];
        rand::thread_rng().fill(&mut iv);

        let plaintext_bytes = plaintext.as_bytes();

        // Pad to AES block size (16 bytes)
        let padded_len = ((plaintext_bytes.len() + 15) / 16) * 16;
        let mut ciphertext = vec![0u8; padded_len];
        ciphertext[..plaintext_bytes.len()].copy_from_slice(plaintext_bytes);

        let cipher = Aes128CbcEnc::new(&self.encryption_key.into(), &iv.into());
        let ciphertext = cipher
            .encrypt_padded_mut::<Pkcs7>(&mut ciphertext, plaintext_bytes.len())
            .map_err(|e| AppError::Crypto(format!("Encryption failed: {}", e)))?;

        // Build the message: version || timestamp || IV || ciphertext
        let mut message = Vec::with_capacity(1 + 8 + 16 + ciphertext.len());
        message.push(version);
        message.extend_from_slice(&timestamp.to_be_bytes());
        message.extend_from_slice(&iv);
        message.extend_from_slice(ciphertext);

        // Compute HMAC over the message
        let mut mac = HmacSha256::new_from_slice(&self.signing_key)
            .map_err(|e| AppError::Crypto(format!("HMAC init failed: {}", e)))?;
        mac.update(&message);
        let hmac_result = mac.finalize().into_bytes();

        // Token: message || HMAC
        let mut token = message;
        token.extend_from_slice(&hmac_result);

        Ok(URL_SAFE.encode(&token))
    }

    /// Decrypt a Fernet token. Returns the original plaintext.
    pub fn decrypt(&self, token: &str) -> Result<String, AppError> {
        let token_bytes = URL_SAFE.decode(token)
            .map_err(|e| AppError::Crypto(format!("Invalid token encoding: {}", e)))?;

        if token_bytes.len() < 57 {
            // 1 (version) + 8 (timestamp) + 16 (IV) + 0 (min ciphertext) + 32 (HMAC)
            return Err(AppError::Crypto("Token too short".into()));
        }

        let hmac_start = token_bytes.len() - 32;
        let message = &token_bytes[..hmac_start];
        let expected_hmac = &token_bytes[hmac_start..];

        // Verify HMAC
        let mut mac = HmacSha256::new_from_slice(&self.signing_key)
            .map_err(|e| AppError::Crypto(format!("HMAC init failed: {}", e)))?;
        mac.update(message);
        mac.verify_slice(expected_hmac)
            .map_err(|_| AppError::Crypto("HMAC verification failed".into()))?;

        // Parse: version (1) || timestamp (8) || IV (16) || ciphertext
        if message[0] != 0x80 {
            return Err(AppError::Crypto("Unsupported token version".into()));
        }

        let iv = &message[9..25];
        let ciphertext = &message[25..];

        let cipher = Aes128CbcDec::new(&self.encryption_key.into(), iv.into());
        let mut buf = ciphertext.to_vec();
        let plaintext = cipher
            .decrypt_padded_mut::<Pkcs7>(&mut buf)
            .map_err(|e| AppError::Crypto(format!("Decryption failed: {}", e)))?;

        String::from_utf8(plaintext.to_vec())
            .map_err(|e| AppError::Crypto(format!("Invalid UTF-8 in decrypted data: {}", e)))
    }
}
