/**
 * Cloud Backup Module
 *
 * Automatic, encrypted, end-to-end private backups to the user's Google Drive
 * using the `drive.appdata` scope (a hidden folder only this app can see).
 *
 * Auth: OAuth 2.0 Authorization Code flow with PKCE. We never store an
 * access_token (short-lived) - only the refresh_token, encrypted at rest
 * with the user's master password.
 *
 * Privacy: the payload uploaded is the SAME AES-256-GCM blob produced by
 * Storage.exportData(). Google sees ciphertext only.
 */

const CloudBackup = {
    // ---- Constants ----
    REDIRECT_URI: 'com.personal.myassistant:/oauth2redirect',
    DRIVE_SCOPE: 'https://www.googleapis.com/auth/drive.appdata',
    AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
    TOKEN_URL: 'https://oauth2.googleapis.com/token',
    DRIVE_API: 'https://www.googleapis.com/drive/v3',
    DRIVE_UPLOAD: 'https://www.googleapis.com/upload/drive/v3/files',

    // ---- Runtime state (never persisted) ----
    _accessToken: null,
    _accessTokenExpiresAt: 0,
    _pkceVerifier: null,
    _oauthState: null,
    _debounceTimer: null,
    _inFlight: false,
    _appUrlListenerRegistered: false,

    // ===========================================================
    // PUBLIC API
    // ===========================================================

    /**
     * Wire up the deep-link listener so we can complete the OAuth flow
     * when Google redirects back to com.personal.myassistant:/oauth2redirect.
     * Safe to call multiple times.
     */
    async init() {
        if (this._appUrlListenerRegistered) return;
        if (!this._isNative()) return;
        const App = window.Capacitor?.Plugins?.App;
        if (!App) {
            console.warn('[CloudBackup] @capacitor/app not available; OAuth redirect cannot be captured');
            return;
        }
        try {
            await App.addListener('appUrlOpen', (event) => {
                if (!event?.url) return;
                if (!event.url.startsWith('com.personal.myassistant:')) return;
                this._handleOAuthRedirect(event.url).catch((e) => {
                    console.error('[CloudBackup] OAuth callback failed:', e);
                    this._setStatus('error', e.message || 'OAuth callback failed');
                });
            });
            this._appUrlListenerRegistered = true;
            console.log('[CloudBackup] appUrlOpen listener registered');
        } catch (e) {
            console.error('[CloudBackup] Failed to register appUrlOpen listener:', e);
        }

        // Flush a pending backup when the app is backgrounded. Without this,
        // closing the app inside the debounce window (default 5 min) would lose
        // the most recent changes from the cloud copy until the next launch.
        try {
            await App.addListener('appStateChange', ({ isActive }) => {
                if (!isActive) this._onAppPaused();
            });
            console.log('[CloudBackup] appStateChange listener registered');
        } catch (e) {
            console.error('[CloudBackup] Failed to register appStateChange listener:', e);
        }
    },

    /**
     * App went to the background. Persist to disk immediately, and if a cloud
     * backup is still pending (i.e. the user changed something within the
     * debounce window), push it now before the OS can suspend/kill us.
     */
    _onAppPaused() {
        try {
            if (window.Storage && typeof window.Storage.flush === 'function') {
                window.Storage.flush();
            }
        } catch (e) {
            console.warn('[CloudBackup] flush-on-pause failed:', e);
        }
        if (this._debounceTimer && this.isReady()) {
            console.log('[CloudBackup] App paused with pending changes — uploading now');
            this.uploadNow().catch((e) => console.warn('[CloudBackup] pause upload failed:', e));
        }
    },

    /**
     * Whether cloud backup is currently usable (configured + signed in).
     */
    isReady() {
        const cb = window.DB?.cloudBackup;
        return !!(cb && cb.enabled && cb.clientId && cb.refreshTokenEnc);
    },

    /**
     * Start the OAuth sign-in flow. Opens the Google consent screen in an
     * in-app browser. The flow completes asynchronously via _handleOAuthRedirect.
     */
    async signIn() {
        if (!this._isNative()) {
            throw new Error('Cloud backup currently requires the native Android app.');
        }
        const cb = window.DB.cloudBackup;
        if (!cb.clientId) {
            throw new Error('Google OAuth Client ID is not configured. Open Settings → Cloud Backup and paste your Client ID first.');
        }
        if (!window.DB.security.masterPassword) {
            throw new Error('Set a master password in Settings first - it is used to encrypt the saved refresh token.');
        }

        const Browser = window.Capacitor?.Plugins?.Browser;
        if (!Browser) {
            throw new Error('@capacitor/browser plugin not available. Run "npm install && npx cap sync".');
        }

        // Generate PKCE pair + state
        this._pkceVerifier = this._randomUrlSafe(64);
        this._oauthState = this._randomUrlSafe(24);
        const challenge = await this._sha256Base64Url(this._pkceVerifier);

        const params = new URLSearchParams({
            client_id: cb.clientId,
            redirect_uri: this.REDIRECT_URI,
            response_type: 'code',
            scope: this.DRIVE_SCOPE,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            access_type: 'offline',
            prompt: 'consent', // force refresh_token issuance every time
            state: this._oauthState
        });
        const url = `${this.AUTH_URL}?${params.toString()}`;

        console.log('[CloudBackup] Opening OAuth consent screen');
        await Browser.open({ url, presentationStyle: 'popover' });
    },

    /**
     * Sign out: revoke the refresh token (best effort) and wipe local state.
     */
    async signOut() {
        const cb = window.DB.cloudBackup;
        const refreshToken = await this._getRefreshToken().catch(() => null);
        if (refreshToken) {
            try {
                await fetch('https://oauth2.googleapis.com/revoke', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ token: refreshToken }).toString()
                });
            } catch (e) {
                console.warn('[CloudBackup] Token revoke failed (non-fatal):', e);
            }
        }
        cb.enabled = false;
        cb.refreshTokenEnc = '';
        cb.userEmail = '';
        cb.lastBackupStatus = '';
        cb.lastError = '';
        this._accessToken = null;
        this._accessTokenExpiresAt = 0;
        window.Storage.save();
        console.log('[CloudBackup] Signed out');
    },

    /**
     * Schedule a debounced backup. Safe to call on every Storage.save().
     * No-op if not configured, not signed in, or an upload is already in flight.
     */
    scheduleUpload() {
        if (!this.isReady()) return;
        if (this._inFlight) return; // don't reschedule from inside our own upload
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        const minutes = Math.max(1, window.DB.cloudBackup.debounceMinutes || 5);
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            this.uploadNow().catch((e) => {
                console.error('[CloudBackup] Debounced upload failed:', e);
            });
        }, minutes * 60 * 1000);
    },

    /**
     * Upload an encrypted backup immediately. Idempotent under concurrency
     * (a second concurrent call is dropped, not queued).
     */
    async uploadNow() {
        if (!this.isReady()) {
            throw new Error('Cloud backup is not configured or not signed in.');
        }
        if (this._inFlight) {
            console.log('[CloudBackup] Upload already in flight, skipping');
            return false;
        }
        // An immediate upload supersedes any pending debounced one.
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }
        this._inFlight = true;
        this._setStatus('uploading', '');
        try {
            const masterPassword = window.DB.security.masterPassword;
            if (!masterPassword) {
                throw new Error('Master password is not set; cannot encrypt backup.');
            }

            // Build the SAME payload structure as Storage.exportData(), but
            // crucially excluding the cloudBackup section itself so a restore
            // on a new device starts cleanly.
            const payload = {
                ...window.DB,
                security: {
                    pinHash: null,
                    biometricEnabled: false,
                    isSetup: false,
                    masterPassword: ''
                },
                cloudBackup: {
                    // strip device-specific tokens; new device will sign in fresh
                    enabled: false,
                    clientId: window.DB.cloudBackup.clientId || '', // OK to carry: it's a public identifier
                    refreshTokenEnc: '',
                    userEmail: '',
                    lastBackupAt: 0,
                    lastBackupStatus: '',
                    lastError: '',
                    debounceMinutes: window.DB.cloudBackup.debounceMinutes || 5,
                    keepCount: window.DB.cloudBackup.keepCount || 10,
                    bytesUploaded: 0
                }
            };

            const dataStr = JSON.stringify(payload);
            const encrypted = await window.Crypto.encrypt(dataStr, masterPassword);

            const fileName = `myassistant_backup_${Date.now()}.enc`;
            const accessToken = await this._getAccessToken();

            console.log(`[CloudBackup] Uploading ${fileName} (${encrypted.length} bytes ciphertext)`);
            const file = await this._uploadMultipart(accessToken, fileName, encrypted);

            window.DB.cloudBackup.lastBackupAt = Date.now();
            window.DB.cloudBackup.bytesUploaded = encrypted.length;
            this._setStatus('ok', '');

            // Rotate old backups (fire and forget; failure is non-fatal)
            this._rotateOldBackups(accessToken).catch((e) => {
                console.warn('[CloudBackup] Rotation failed (non-fatal):', e);
            });

            console.log('[CloudBackup] Upload complete:', file.id);
            return true;
        } catch (e) {
            console.error('[CloudBackup] Upload failed:', e);
            this._setStatus('error', e.message || String(e));
            throw e;
        } finally {
            this._inFlight = false;
        }
    },

    /**
     * List all backups in the user's appDataFolder, newest first.
     * Returns: [{ id, name, createdTime, size }]
     */
    async listBackups() {
        if (!this.isReady()) {
            throw new Error('Cloud backup is not configured or not signed in.');
        }
        const accessToken = await this._getAccessToken();
        const params = new URLSearchParams({
            spaces: 'appDataFolder',
            fields: 'files(id,name,createdTime,size)',
            orderBy: 'createdTime desc',
            pageSize: '50'
        });
        const res = await fetch(`${this.DRIVE_API}/files?${params.toString()}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`Drive list failed (${res.status}): ${txt}`);
        }
        const json = await res.json();
        return json.files || [];
    },

    /**
     * Download an encrypted backup blob (returns the encrypted base64 string).
     */
    async downloadBackup(fileId) {
        if (!this.isReady()) {
            throw new Error('Cloud backup is not configured or not signed in.');
        }
        const accessToken = await this._getAccessToken();
        const res = await fetch(`${this.DRIVE_API}/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`Drive download failed (${res.status}): ${txt}`);
        }
        return await res.text();
    },

    /**
     * Restore a backup by fileId using the supplied master password.
     * Mirrors Storage.importData() but reads from Drive instead of a File.
     */
    async restoreFromBackup(fileId, password) {
        if (!password) throw new Error('Master password is required to decrypt the backup.');
        const encrypted = await this.downloadBackup(fileId);
        const decrypted = await window.Crypto.decrypt(encrypted, password);
        const imported = JSON.parse(decrypted);
        if (!imported || typeof imported !== 'object') {
            throw new Error('Backup file is corrupted (invalid JSON after decryption).');
        }

        // Preserve device-specific bits
        const localPinHash = window.DB.security.pinHash;
        const localBiometric = window.DB.security.biometricEnabled;
        const localIsSetup = window.DB.security.isSetup;
        const localCloudBackup = { ...window.DB.cloudBackup };

        Object.assign(window.DB, imported);

        window.DB.security.pinHash = localPinHash;
        window.DB.security.biometricEnabled = localBiometric;
        window.DB.security.isSetup = localIsSetup;
        window.DB.security.masterPassword = password;
        // keep the currently-signed-in Drive session intact
        window.DB.cloudBackup = localCloudBackup;

        window.Storage.save();
        console.log('[CloudBackup] Restore complete');
        return true;
    },

    // ===========================================================
    // PRIVATE: OAuth flow
    // ===========================================================

    async _handleOAuthRedirect(url) {
        console.log('[CloudBackup] OAuth redirect received');
        const Browser = window.Capacitor?.Plugins?.Browser;
        try { await Browser?.close(); } catch (_) { /* ignore */ }

        // url looks like: com.personal.myassistant:/oauth2redirect?code=XXX&state=YYY
        const qIndex = url.indexOf('?');
        if (qIndex < 0) throw new Error('OAuth redirect has no query string');
        const query = new URLSearchParams(url.substring(qIndex + 1));
        const code = query.get('code');
        const state = query.get('state');
        const error = query.get('error');
        if (error) throw new Error(`Google returned error: ${error}`);
        if (!code) throw new Error('OAuth redirect missing "code" parameter');
        if (!state || state !== this._oauthState) {
            throw new Error('OAuth state mismatch (possible CSRF). Try signing in again.');
        }
        if (!this._pkceVerifier) {
            throw new Error('Local OAuth state lost (was the app killed mid-flow?). Try signing in again.');
        }

        const cb = window.DB.cloudBackup;
        const tokenRes = await fetch(this.TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: cb.clientId,
                code_verifier: this._pkceVerifier,
                grant_type: 'authorization_code',
                redirect_uri: this.REDIRECT_URI
            }).toString()
        });
        if (!tokenRes.ok) {
            const txt = await tokenRes.text().catch(() => '');
            throw new Error(`Token exchange failed (${tokenRes.status}): ${txt}`);
        }
        const tokens = await tokenRes.json();
        if (!tokens.refresh_token) {
            throw new Error('Google did not return a refresh_token. Revoke app access in your Google account and try again with prompt=consent.');
        }

        const masterPassword = window.DB.security.masterPassword;
        if (!masterPassword) {
            throw new Error('Master password is not set; cannot store refresh token securely.');
        }
        const refreshEnc = await window.Crypto.encrypt(tokens.refresh_token, masterPassword);

        cb.enabled = true;
        cb.refreshTokenEnc = refreshEnc;
        this._accessToken = tokens.access_token;
        this._accessTokenExpiresAt = Date.now() + (tokens.expires_in || 3600) * 1000 - 60_000;

        // Best-effort: fetch user email for display
        try {
            const ui = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${this._accessToken}` }
            });
            if (ui.ok) {
                const json = await ui.json();
                cb.userEmail = json.email || '';
            }
        } catch (_) { /* non-fatal */ }

        this._setStatus('', '');
        window.Storage.save();

        // Clear PKCE state
        this._pkceVerifier = null;
        this._oauthState = null;

        // When control returns from the in-app browser the WebView is in a
        // transitional state - immediate DOM writes happen but don't repaint
        // until the user touches the screen. Defer toast + UI refresh by a
        // short delay so the user sees both immediately, and explicitly make
        // sure the Settings modal is showing.
        const showFeedback = () => {
            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal) {
                settingsModal.classList.remove('hidden');
            }
            if (window.Navigation && typeof window.Navigation.refreshCloudBackupUI === 'function') {
                window.Navigation.refreshCloudBackupUI();
            }
            if (window.Utils) {
                window.Utils.showSuccess(
                    `Google Drive connected${cb.userEmail ? ' (' + cb.userEmail + ')' : ''}.\nBackups will run automatically.`,
                    4000
                );
            }
        };
        setTimeout(showFeedback, 200);
        // Belt-and-suspenders: run once more after a longer delay in case the
        // first repaint was still pre-empted by browser teardown.
        setTimeout(() => {
            if (window.Navigation && typeof window.Navigation.refreshCloudBackupUI === 'function') {
                window.Navigation.refreshCloudBackupUI();
            }
        }, 800);

        // Kick off an immediate first backup
        this.uploadNow().catch((e) => console.error('[CloudBackup] Initial upload failed:', e));
    },

    async _getRefreshToken() {
        const cb = window.DB.cloudBackup;
        if (!cb.refreshTokenEnc) throw new Error('Not signed in');
        const masterPassword = window.DB.security.masterPassword;
        if (!masterPassword) throw new Error('Master password missing - cannot decrypt refresh token.');
        return await window.Crypto.decrypt(cb.refreshTokenEnc, masterPassword);
    },

    async _getAccessToken() {
        if (this._accessToken && Date.now() < this._accessTokenExpiresAt) {
            return this._accessToken;
        }
        const refreshToken = await this._getRefreshToken();
        const cb = window.DB.cloudBackup;
        const res = await fetch(this.TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: cb.clientId,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            }).toString()
        });
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            // 400 invalid_grant means the refresh token is dead - force re-auth
            if (res.status === 400) {
                cb.refreshTokenEnc = '';
                cb.enabled = false;
                window.Storage.save();
            }
            throw new Error(`Token refresh failed (${res.status}): ${txt}`);
        }
        const tokens = await res.json();
        this._accessToken = tokens.access_token;
        this._accessTokenExpiresAt = Date.now() + (tokens.expires_in || 3600) * 1000 - 60_000;
        return this._accessToken;
    },

    // ===========================================================
    // PRIVATE: Drive operations
    // ===========================================================

    async _uploadMultipart(accessToken, fileName, content) {
        const boundary = '-------MyAssistantBoundary' + Math.random().toString(36).slice(2);
        const metadata = {
            name: fileName,
            parents: ['appDataFolder'],
            mimeType: 'application/octet-stream'
        };
        const body =
            `--${boundary}\r\n` +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) + '\r\n' +
            `--${boundary}\r\n` +
            'Content-Type: application/octet-stream\r\n\r\n' +
            content + '\r\n' +
            `--${boundary}--`;

        const res = await fetch(`${this.DRIVE_UPLOAD}?uploadType=multipart&fields=id,name,size,createdTime`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body
        });
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`Drive upload failed (${res.status}): ${txt}`);
        }
        return await res.json();
    },

    async _rotateOldBackups(accessToken) {
        const keep = Math.max(1, window.DB.cloudBackup.keepCount || 10);
        const params = new URLSearchParams({
            spaces: 'appDataFolder',
            fields: 'files(id,name,createdTime)',
            orderBy: 'createdTime desc',
            pageSize: '100'
        });
        const res = await fetch(`${this.DRIVE_API}/files?${params.toString()}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) return;
        const json = await res.json();
        const files = json.files || [];
        const stale = files.slice(keep);
        for (const f of stale) {
            try {
                await fetch(`${this.DRIVE_API}/files/${f.id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                console.log('[CloudBackup] Rotated out', f.name);
            } catch (e) {
                console.warn('[CloudBackup] Failed to delete', f.name, e);
            }
        }
    },

    // ===========================================================
    // PRIVATE: helpers
    // ===========================================================

    _isNative() {
        return typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
    },

    _setStatus(status, error) {
        const cb = window.DB.cloudBackup;
        cb.lastBackupStatus = status;
        cb.lastError = error || '';
        // Persist directly to localStorage, bypassing Storage.save() so we
        // don't re-trigger scheduleUpload() from our own status writes
        // (which would cause phantom periodic uploads with no real activity).
        try {
            localStorage.setItem(window.Storage.STORAGE_KEY, JSON.stringify(window.DB));
        } catch (_) { /* ignore */ }
        if (window.Navigation && typeof window.Navigation.refreshCloudBackupUI === 'function') {
            window.Navigation.refreshCloudBackupUI();
        }
    },

    _randomUrlSafe(byteLen) {
        const bytes = new Uint8Array(byteLen);
        window.crypto.getRandomValues(bytes);
        return this._base64UrlEncode(bytes);
    },

    async _sha256Base64Url(input) {
        const data = new TextEncoder().encode(input);
        const digest = await window.crypto.subtle.digest('SHA-256', data);
        return this._base64UrlEncode(new Uint8Array(digest));
    },

    _base64UrlEncode(bytes) {
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return window.btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
};

if (typeof window !== 'undefined') {
    window.CloudBackup = CloudBackup;
}
