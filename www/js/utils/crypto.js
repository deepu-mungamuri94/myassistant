/**
 * Crypto Module
 * Handles AES-256 encryption/decryption for data export/import
 */

const Crypto = {
    /**
     * Derive encryption key from password using PBKDF2
     */
    async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const passwordKey = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        );

        return window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            passwordKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    },

    /**
     * Encrypt data with password using AES-256-GCM
     */
    async encrypt(data, password) {
        try {
            // Generate random salt and IV
            const salt = window.crypto.getRandomValues(new Uint8Array(16));
            const iv = window.crypto.getRandomValues(new Uint8Array(12));

            // Derive key from password
            const key = await this.deriveKey(password, salt);

            // Convert data to bytes
            const encoder = new TextEncoder();
            const dataBytes = encoder.encode(data);

            // Encrypt
            const encryptedData = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                dataBytes
            );

            // Combine salt + IV + encrypted data
            const result = new Uint8Array(salt.length + iv.length + encryptedData.byteLength);
            result.set(salt, 0);
            result.set(iv, salt.length);
            result.set(new Uint8Array(encryptedData), salt.length + iv.length);

            // Convert to base64 for easy storage
            return this.arrayBufferToBase64(result);
        } catch (error) {
            console.error('Encryption error:', error);
            throw new Error('Encryption failed: ' + error.message);
        }
    },

    /**
     * Decrypt data with password using AES-256-GCM
     */
    async decrypt(encryptedBase64, password) {
        try {
            // Convert from base64
            const encryptedBytes = this.base64ToArrayBuffer(encryptedBase64);

            // Extract salt, IV, and encrypted data
            const salt = encryptedBytes.slice(0, 16);
            const iv = encryptedBytes.slice(16, 28);
            const data = encryptedBytes.slice(28);

            // Derive key from password
            const key = await this.deriveKey(password, salt);

            // Decrypt
            const decryptedData = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                data
            );

            // Convert bytes to string
            const decoder = new TextDecoder();
            return decoder.decode(decryptedData);
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Decryption failed. Wrong password or corrupted data.');
        }
    },

    /**
     * Convert ArrayBuffer to Base64
     */
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    },

    /**
     * Convert Base64 to ArrayBuffer
     */
    base64ToArrayBuffer(base64) {
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Crypto = Crypto;
}

