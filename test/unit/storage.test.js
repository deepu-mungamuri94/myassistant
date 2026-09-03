/**
 * Storage Module Unit Tests
 * Tests debounced save, flush, quota handling, load, import/export
 */

const { loadModule } = require('../helpers/loadModule.js');

describe('Storage Module', () => {
    let Storage;

    beforeEach(() => {
        vi.useFakeTimers();

        // Must mock localStorage BEFORE loading module
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: vi.fn(),
                setItem: vi.fn(),
                removeItem: vi.fn()
            },
            writable: true,
            configurable: true
        });

        window.DB = {
            expenses: [],
            cards: [],
            settings: {},
            security: { masterPassword: 'test123' }
        };

        window.CloudBackup = { scheduleUpload: vi.fn() };

        window.Crypto = {
            encrypt: vi.fn(async (data, pw) => 'encrypted-data'),
            decrypt: vi.fn(async (data, pw) => data)
        };

        window.DataLifecycle = {
            summarize: vi.fn(() => ({
                total: 5,
                expenses: 3,
                cardBills: 2,
                retentionYears: 2
            })),
            prune: vi.fn(() => ({
                expensesRemoved: 3,
                cardBillsRemoved: 2
            }))
        };

        window.Loading = {
            show: vi.fn(),
            hide: vi.fn()
        };

        window.Utils = {
            showError: vi.fn(),
            showSuccess: vi.fn(),
            showInfo: vi.fn(),
            confirm: vi.fn(async () => true)
        };

        window.Capacitor = undefined;

        // Load the Storage module
        Storage = loadModule('core/storage.js', 'Storage');

        // Reset internal state after loading
        Storage._dirty = false;
        Storage._saveTimer = null;
        Storage._flushHooksInstalled = false;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('save() - debounced writes', () => {
        it('marks dirty and schedules timer on first call', () => {
            const result = Storage.save();

            expect(result).toBe(true);
            expect(Storage._dirty).toBe(true);
            expect(Storage._saveTimer).not.toBeNull();
            expect(window.localStorage.setItem).not.toHaveBeenCalled();
        });

        it('writes to localStorage after SAVE_DEBOUNCE_MS (500ms)', () => {
            Storage.save();

            vi.advanceTimersByTime(500);

            expect(window.localStorage.setItem).toHaveBeenCalledWith(
                Storage.STORAGE_KEY,
                JSON.stringify(window.DB)
            );
            expect(Storage._dirty).toBe(false);
            expect(Storage._saveTimer).toBeNull();
        });

        it('coalesces multiple save() calls within 500ms (only writes once)', () => {
            Storage.save();
            Storage.save();
            Storage.save();

            expect(Storage._saveTimer).not.toBeNull();
            expect(window.localStorage.setItem).not.toHaveBeenCalled();

            vi.advanceTimersByTime(500);

            expect(window.localStorage.setItem).toHaveBeenCalledTimes(1);
            expect(Storage._dirty).toBe(false);
        });

        it('schedules CloudBackup.scheduleUpload after write', () => {
            Storage.save();
            vi.advanceTimersByTime(500);

            expect(window.CloudBackup.scheduleUpload).toHaveBeenCalled();
        });

        it('does not throw if CloudBackup.scheduleUpload fails', () => {
            window.CloudBackup.scheduleUpload = vi.fn(() => {
                throw new Error('Cloud sync error');
            });

            Storage.save();

            expect(() => {
                vi.advanceTimersByTime(500);
            }).not.toThrow();

            expect(window.localStorage.setItem).toHaveBeenCalled();
            expect(Storage._dirty).toBe(false);
        });
    });

    describe('flush() - immediate write', () => {
        it('writes immediately when dirty', () => {
            Storage.save();
            expect(Storage._dirty).toBe(true);

            const result = Storage.flush();

            expect(result).toBe(true);
            expect(Storage._saveTimer).toBeNull();
            expect(window.localStorage.setItem).toHaveBeenCalledWith(
                Storage.STORAGE_KEY,
                JSON.stringify(window.DB)
            );
            expect(Storage._dirty).toBe(false);
        });

        it('returns true when not dirty (no-op)', () => {
            expect(Storage._dirty).toBe(false);

            const result = Storage.flush();

            expect(result).toBe(true);
            expect(window.localStorage.setItem).not.toHaveBeenCalled();
        });

        it('clears pending timer before writing', () => {
            Storage.save();
            const timerId = Storage._saveTimer;
            expect(timerId).not.toBeNull();

            Storage.flush();

            expect(Storage._saveTimer).toBeNull();
            expect(window.localStorage.setItem).toHaveBeenCalled();
        });
    });

    describe('_writeNow() - localStorage interaction', () => {
        it('calls localStorage.setItem with correct key and serialized DB', () => {
            Storage._dirty = true;

            const result = Storage._writeNow();

            expect(result).toBe(true);
            expect(window.localStorage.setItem).toHaveBeenCalledWith(
                'myassistant_db',
                JSON.stringify(window.DB)
            );
            expect(Storage._dirty).toBe(false);
        });

        it('triggers CloudBackup.scheduleUpload after successful write', () => {
            Storage._dirty = true;

            Storage._writeNow();

            expect(window.CloudBackup.scheduleUpload).toHaveBeenCalled();
        });

        it('keeps dirty=true on localStorage.setItem failure', () => {
            Storage._dirty = true;
            window.localStorage.setItem.mockImplementation(() => {
                throw new Error('Generic storage error');
            });

            const result = Storage._writeNow();

            expect(result).toBe(false);
            expect(Storage._dirty).toBe(true);
            expect(window.Utils.showError).toHaveBeenCalledWith('Failed to save data');
        });

        it('handles quota error by calling _handleQuotaExceeded', async () => {
            Storage._dirty = true;
            const quotaError = new Error('Quota exceeded');
            quotaError.name = 'QuotaExceededError';
            window.localStorage.setItem.mockImplementation(() => {
                throw quotaError;
            });

            const handleSpy = vi.spyOn(Storage, '_handleQuotaExceeded');

            const result = Storage._writeNow();

            expect(result).toBe(false);
            expect(Storage._dirty).toBe(true);
            expect(handleSpy).toHaveBeenCalled();
        });
    });

    describe('_isQuotaError() - error detection', () => {
        it('detects QuotaExceededError by name', () => {
            const err = new Error('Quota exceeded');
            err.name = 'QuotaExceededError';

            expect(Storage._isQuotaError(err)).toBe(true);
        });

        it('detects NS_ERROR_DOM_QUOTA_REACHED by name', () => {
            const err = new Error('Quota reached');
            err.name = 'NS_ERROR_DOM_QUOTA_REACHED';

            expect(Storage._isQuotaError(err)).toBe(true);
        });

        it('detects quota error by code 22', () => {
            const err = new Error('Storage error');
            err.code = 22;

            expect(Storage._isQuotaError(err)).toBe(true);
        });

        it('detects quota error by code 1014', () => {
            const err = new Error('Storage error');
            err.code = 1014;

            expect(Storage._isQuotaError(err)).toBe(true);
        });

        it('detects quota error by message regex /quota/i', () => {
            const err = new Error('Out of quota space');

            expect(Storage._isQuotaError(err)).toBe(true);
        });

        it('returns false for non-quota errors', () => {
            const err = new Error('Network error');

            expect(Storage._isQuotaError(err)).toBe(false);
        });

        it('returns false for null or undefined', () => {
            expect(Storage._isQuotaError(null)).toBe(false);
            expect(Storage._isQuotaError(undefined)).toBe(false);
        });
    });

    describe('_handleQuotaExceeded() - quota recovery', () => {
        it('offers to prune old records when DataLifecycle.summarize returns data', async () => {
            window.DataLifecycle.summarize.mockReturnValue({
                total: 5,
                expenses: 3,
                cardBills: 2,
                retentionYears: 2
            });
            window.Utils.confirm.mockResolvedValue(true);
            window.DataLifecycle.prune.mockReturnValue({
                expensesRemoved: 3,
                cardBillsRemoved: 2
            });

            await Storage._handleQuotaExceeded();

            expect(window.Utils.confirm).toHaveBeenCalledWith(
                expect.stringContaining('Device storage is full'),
                'Storage Full'
            );
            expect(window.DataLifecycle.prune).toHaveBeenCalled();
            expect(window.Utils.showSuccess).toHaveBeenCalledWith(
                expect.stringContaining('Freed space')
            );
        });

        it('shows guidance message when user declines pruning', async () => {
            window.DataLifecycle.summarize.mockReturnValue({ total: 5, expenses: 3, cardBills: 2, retentionYears: 2 });
            window.Utils.confirm.mockResolvedValue(false);

            await Storage._handleQuotaExceeded();

            expect(window.DataLifecycle.prune).not.toHaveBeenCalled();
            expect(window.Utils.showError).toHaveBeenCalledWith(
                expect.stringContaining('Device storage is full')
            );
        });

        it('shows fallback error when no records to prune', async () => {
            window.DataLifecycle.summarize.mockReturnValue({ total: 0, expenses: 0, cardBills: 0, retentionYears: 2 });

            await Storage._handleQuotaExceeded();

            expect(window.Utils.confirm).not.toHaveBeenCalled();
            expect(window.Utils.showError).toHaveBeenCalledWith(
                expect.stringContaining('Device storage is full')
            );
        });
    });

    describe('load() - reading from localStorage', () => {
        it('reads and merges data into window.DB', () => {
            const stored = {
                expenses: [{ id: 1 }],
                cards: [{ id: 2 }],
                settings: { theme: 'dark' },
                security: { masterPassword: 'stored-pass' }
            };
            window.localStorage.getItem.mockReturnValue(JSON.stringify(stored));

            const result = Storage.load();

            expect(result).toBe(true);
            expect(window.DB.expenses).toEqual([{ id: 1 }]);
            expect(window.DB.cards).toEqual([{ id: 2 }]);
            expect(window.DB.settings.theme).toBe('dark');
            expect(window.DB.security.masterPassword).toBe('stored-pass');
        });

        it('returns false when localStorage is empty', () => {
            window.localStorage.getItem.mockReturnValue(null);

            const result = Storage.load();

            expect(result).toBe(false);
        });

        it('returns false and logs error for corrupted JSON', () => {
            window.localStorage.getItem.mockReturnValue('{ invalid json }');
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const result = Storage.load();

            expect(result).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith('Load error:', expect.any(Error));
        });

        it('installs flush hooks on first load', () => {
            window.localStorage.getItem.mockReturnValue(JSON.stringify({}));

            Storage.load();

            expect(Storage._flushHooksInstalled).toBe(true);
        });

        it('does not re-install flush hooks on subsequent loads', () => {
            window.localStorage.getItem.mockReturnValue(JSON.stringify({}));
            Storage._flushHooksInstalled = true;

            const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

            Storage.load();

            expect(addEventListenerSpy).not.toHaveBeenCalled();
        });
    });

    describe('isNativeApp() - Capacitor detection', () => {
        it('returns false when Capacitor is undefined', () => {
            window.Capacitor = undefined;

            expect(Storage.isNativeApp()).toBe(false);
        });

        it('returns true when Capacitor.isNativePlatform() returns true', () => {
            window.Capacitor = {
                isNativePlatform: vi.fn(() => true)
            };

            expect(Storage.isNativeApp()).toBe(true);
        });

        it('returns false when Capacitor.isNativePlatform() returns false', () => {
            window.Capacitor = {
                isNativePlatform: vi.fn(() => false)
            };

            expect(Storage.isNativeApp()).toBe(false);
        });
    });

    describe('importData() - restore from backup', () => {
        it('validates file and password before import', async () => {
            const result = await Storage.importData(null, 'password');

            expect(result).toBe(false);
            expect(window.Utils.showError).toHaveBeenCalledWith(
                expect.stringContaining('select a file')
            );
        });

        it('validates password is provided', async () => {
            const file = { name: 'backup.enc', text: async () => 'encrypted' };

            const result = await Storage.importData(file, '');

            expect(result).toBe(false);
            expect(window.Utils.showError).toHaveBeenCalledWith(
                expect.stringContaining('master password')
            );
        });

        it('decrypts and merges imported data into window.DB', async () => {
            const importedData = {
                expenses: [{ id: 99 }],
                cards: [{ id: 88 }],
                settings: { imported: true },
                security: { masterPassword: '' }
            };
            const file = {
                name: 'backup.enc',
                text: async () => 'encrypted-content'
            };
            window.Crypto.decrypt.mockResolvedValue(JSON.stringify(importedData));

            const result = await Storage.importData(file, 'import-password');

            expect(result).toBe(true);
            expect(window.Crypto.decrypt).toHaveBeenCalledWith('encrypted-content', 'import-password');
            expect(window.DB.expenses).toEqual([{ id: 99 }]);
            expect(window.DB.cards).toEqual([{ id: 88 }]);
            expect(window.DB.settings.imported).toBe(true);
        });

        it('preserves local PIN hash after import (device-specific)', async () => {
            window.DB.security.pinHash = 'local-pin-hash';
            window.DB.security.biometricEnabled = true;
            window.DB.security.isSetup = true;

            const importedData = {
                expenses: [],
                security: {
                    pinHash: 'imported-pin',
                    biometricEnabled: false,
                    isSetup: false,
                    masterPassword: ''
                }
            };
            const file = {
                name: 'backup.enc',
                text: async () => 'encrypted-content'
            };
            window.Crypto.decrypt.mockResolvedValue(JSON.stringify(importedData));

            await Storage.importData(file, 'import-password');

            expect(window.DB.security.pinHash).toBe('local-pin-hash');
            expect(window.DB.security.biometricEnabled).toBe(true);
            expect(window.DB.security.isSetup).toBe(true);
        });

        it('sets masterPassword to the decryption password', async () => {
            const importedData = {
                expenses: [],
                security: { masterPassword: '' }
            };
            const file = {
                name: 'backup.enc',
                text: async () => 'encrypted-content'
            };
            window.Crypto.decrypt.mockResolvedValue(JSON.stringify(importedData));

            await Storage.importData(file, 'new-master-pass');

            expect(window.DB.security.masterPassword).toBe('new-master-pass');
        });

        it('calls flush() after successful import', async () => {
            const importedData = { expenses: [], security: { masterPassword: '' } };
            const file = {
                name: 'backup.enc',
                text: async () => 'encrypted-content'
            };
            window.Crypto.decrypt.mockResolvedValue(JSON.stringify(importedData));

            const flushSpy = vi.spyOn(Storage, 'flush');

            await Storage.importData(file, 'password');

            expect(flushSpy).toHaveBeenCalled();
        });

        it('shows loading indicators during import', async () => {
            const importedData = { expenses: [], security: { masterPassword: '' } };
            const file = {
                name: 'backup.enc',
                text: async () => 'encrypted-content'
            };
            window.Crypto.decrypt.mockResolvedValue(JSON.stringify(importedData));

            await Storage.importData(file, 'password');

            expect(window.Loading.show).toHaveBeenCalledWith('Decrypting backup...');
            expect(window.Loading.show).toHaveBeenCalledWith('Restoring data...');
            expect(window.Loading.hide).toHaveBeenCalled();
        });

        it('handles invalid backup file format', async () => {
            const file = {
                name: 'backup.enc',
                text: async () => 'encrypted-content'
            };
            window.Crypto.decrypt.mockResolvedValue('not-valid-json');

            const result = await Storage.importData(file, 'password');

            expect(result).toBe(false);
            expect(window.Loading.hide).toHaveBeenCalled();
            expect(window.Utils.showError).toHaveBeenCalledWith(
                expect.stringContaining('Import failed')
            );
        });

        it('handles decryption failure with wrong password', async () => {
            const file = {
                name: 'backup.enc',
                text: async () => 'encrypted-content'
            };
            window.Crypto.decrypt.mockRejectedValue(new Error('Decryption failed'));

            const result = await Storage.importData(file, 'wrong-password');

            expect(result).toBe(false);
            expect(window.Utils.showError).toHaveBeenCalledWith(
                expect.stringContaining('Wrong password or corrupted file')
            );
        });
    });

    describe('exportData() - create backup', () => {
        it('validates masterPassword is set before export', async () => {
            window.DB.security.masterPassword = '';

            const result = await Storage.exportData();

            expect(result).toBe(false);
            expect(window.Utils.showError).toHaveBeenCalledWith(
                expect.stringContaining('Master password not set'),
                'error',
                5000
            );
        });

        it('encrypts data excluding device-specific security settings', async () => {
            window.DB.security.pinHash = 'device-pin';
            window.DB.security.biometricEnabled = true;
            window.DB.security.isSetup = true;
            window.DB.security.masterPassword = 'master123';

            // Mock DOM APIs for browser download (needed by exportData)
            window.Capacitor = undefined;
            const mockAnchor = {
                href: '',
                download: '',
                click: vi.fn()
            };
            vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
            global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
            global.URL.revokeObjectURL = vi.fn();
            global.Blob = vi.fn((content, options) => ({ content, options }));

            await Storage.exportData();

            expect(window.Crypto.encrypt).toHaveBeenCalledWith(
                expect.any(String),
                'master123'
            );

            const encryptedArg = window.Crypto.encrypt.mock.calls[0][0];
            const exported = JSON.parse(encryptedArg);

            expect(exported.security.pinHash).toBeNull();
            expect(exported.security.biometricEnabled).toBe(false);
            expect(exported.security.isSetup).toBe(false);
            expect(exported.security.masterPassword).toBe('');
        });

        it('exports all DB fields (future-proof)', async () => {
            window.DB.customField = 'custom-value';
            window.DB.anotherField = { nested: 'data' };

            // Mock DOM APIs for browser download (needed by exportData)
            window.Capacitor = undefined;
            const mockAnchor = {
                href: '',
                download: '',
                click: vi.fn()
            };
            vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
            global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
            global.URL.revokeObjectURL = vi.fn();
            global.Blob = vi.fn((content, options) => ({ content, options }));

            await Storage.exportData();

            const encryptedArg = window.Crypto.encrypt.mock.calls[0][0];
            const exported = JSON.parse(encryptedArg);

            expect(exported.customField).toBe('custom-value');
            expect(exported.anotherField).toEqual({ nested: 'data' });
        });

        it('triggers browser download in web mode', async () => {
            window.Capacitor = undefined;

            // Mock DOM APIs needed for browser download
            const mockAnchor = {
                href: '',
                download: '',
                click: vi.fn()
            };
            const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
            const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
            const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

            // Mock URL.createObjectURL and URL.revokeObjectURL
            const mockObjectURL = 'blob:mock-url';
            global.URL.createObjectURL = vi.fn(() => mockObjectURL);
            global.URL.revokeObjectURL = vi.fn();

            // Mock Blob
            global.Blob = vi.fn((content, options) => ({ content, options }));

            await Storage.exportData();

            expect(createElementSpy).toHaveBeenCalledWith('a');
            expect(appendChildSpy).toHaveBeenCalled();
            expect(removeChildSpy).toHaveBeenCalled();
            expect(mockAnchor.click).toHaveBeenCalled();
            expect(global.URL.createObjectURL).toHaveBeenCalled();
            expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(mockObjectURL);
            expect(window.Utils.showSuccess).toHaveBeenCalledWith(
                expect.stringContaining('Encrypted backup downloaded'),
                4000
            );
        });

        it('uses Capacitor Share in native app mode', async () => {
            window.Capacitor = {
                isNativePlatform: vi.fn(() => true),
                Plugins: {
                    Filesystem: {
                        writeFile: vi.fn(async () => ({ uri: 'file://backup.enc' }))
                    },
                    Share: {
                        share: vi.fn(async () => ({ activityType: 'com.android.share' }))
                    }
                }
            };

            const result = await Storage.exportData();

            expect(result).toBe(true);
            expect(window.Capacitor.Plugins.Filesystem.writeFile).toHaveBeenCalledWith({
                path: expect.stringContaining('myassistant_backup_'),
                data: 'encrypted-data',
                directory: 'CACHE',
                encoding: 'utf8'
            });
            expect(window.Capacitor.Plugins.Share.share).toHaveBeenCalledWith({
                title: 'Export My Assistant Backup',
                text: 'My Assistant app backup data',
                url: 'file://backup.enc',
                dialogTitle: 'Save backup to...'
            });
        });

        it('returns "cancelled" when user cancels native share', async () => {
            // Android's Share plugin REJECTS with "Share canceled" on cancel — it does
            // not resolve with a null activityType.
            window.Capacitor = {
                isNativePlatform: vi.fn(() => true),
                Plugins: {
                    Filesystem: {
                        writeFile: vi.fn(async () => ({ uri: 'file://backup.enc' }))
                    },
                    Share: {
                        share: vi.fn(async () => { throw new Error('Share canceled'); })
                    }
                }
            };

            const result = await Storage.exportData();

            expect(result).toBe('cancelled');
        });

        it('returns true on successful native share (Android resolves with empty activityType)', async () => {
            // Regression: Android resolves with activityType === '' on success. This must
            // NOT be misread as a cancellation — otherwise Drive export gives no feedback.
            window.Capacitor = {
                isNativePlatform: vi.fn(() => true),
                Plugins: {
                    Filesystem: {
                        writeFile: vi.fn(async () => ({ uri: 'file://backup.enc' }))
                    },
                    Share: {
                        share: vi.fn(async () => ({ activityType: '' }))
                    }
                }
            };

            const result = await Storage.exportData();

            expect(result).toBe(true);
        });

        it('shows loading indicators during export', async () => {
            window.Capacitor = {
                isNativePlatform: vi.fn(() => true),
                Plugins: {
                    Filesystem: {
                        writeFile: vi.fn(async () => ({ uri: 'file://backup.enc' }))
                    },
                    Share: {
                        share: vi.fn(async () => ({ activityType: 'share' }))
                    }
                }
            };

            await Storage.exportData();

            expect(window.Loading.show).toHaveBeenCalledWith('Preparing backup...');
            expect(window.Loading.hide).toHaveBeenCalled();
        });

        it('handles Capacitor plugin failure gracefully', async () => {
            window.Capacitor = {
                isNativePlatform: vi.fn(() => true),
                Plugins: {
                    Filesystem: {
                        writeFile: vi.fn(async () => {
                            throw new Error('Permission denied');
                        })
                    }
                }
            };

            const result = await Storage.exportData();

            expect(result).toBe(false);
            expect(window.Loading.hide).toHaveBeenCalled();
            expect(window.Utils.showError).toHaveBeenCalledWith(
                expect.stringContaining('Export failed')
            );
        });
    });

    describe('_installFlushHooks() - lifecycle events', () => {
        it('installs pagehide, beforeunload, and visibilitychange listeners', () => {
            const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
            const docAddEventListenerSpy = vi.spyOn(document, 'addEventListener');

            Storage._installFlushHooks();

            expect(addEventListenerSpy).toHaveBeenCalledWith('pagehide', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
            expect(docAddEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
        });

        it('does not re-install hooks if already installed', () => {
            Storage._flushHooksInstalled = true;
            const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

            Storage._installFlushHooks();

            expect(addEventListenerSpy).not.toHaveBeenCalled();
        });

        it('calls flush() when pagehide event fires', () => {
            const flushSpy = vi.spyOn(Storage, 'flush');
            Storage._installFlushHooks();

            window.dispatchEvent(new Event('pagehide'));

            expect(flushSpy).toHaveBeenCalled();
        });

        it('calls flush() when beforeunload event fires', () => {
            const flushSpy = vi.spyOn(Storage, 'flush');
            Storage._installFlushHooks();

            window.dispatchEvent(new Event('beforeunload'));

            expect(flushSpy).toHaveBeenCalled();
        });

        it('calls flush() when document visibility changes to hidden', () => {
            const flushSpy = vi.spyOn(Storage, 'flush');
            Storage._installFlushHooks();

            Object.defineProperty(document, 'visibilityState', {
                value: 'hidden',
                writable: true,
                configurable: true
            });

            document.dispatchEvent(new Event('visibilitychange'));

            expect(flushSpy).toHaveBeenCalled();
        });
    });

    describe('_repairDuplicateIds() - duplicate id healing', () => {
        let idCounter;

        beforeEach(() => {
            // Add generateId mock to window.Utils (returns unique increasing values)
            idCounter = 900000;
            window.Utils.generateId = vi.fn(() => ++idCounter);
        });

        it('reassigns colliding expense ids (CORE regression test)', () => {
            // Simulate two recurring expenses auto-added in the same millisecond
            window.DB.expenses = [
                { id: 100, title: 'amma', amount: 10000 },
                { id: 100, title: 'wife', amount: 10000 }
            ];

            Storage._repairDuplicateIds();

            // Both expenses should now have DIFFERENT ids
            expect(window.DB.expenses[0].id).toBe(100);
            expect(window.DB.expenses[1].id).toBe(900001);
            // Titles unchanged - proving they're independently addressable
            expect(window.DB.expenses[0].title).toBe('amma');
            expect(window.DB.expenses[1].title).toBe('wife');
            expect(window.Utils.generateId).toHaveBeenCalled();
        });

        it('no-op when all ids unique (does not call save or generateId)', () => {
            window.DB.expenses = [
                { id: 1, title: 'a', amount: 100 },
                { id: 2, title: 'b', amount: 200 },
                { id: 3, title: 'c', amount: 300 }
            ];

            const saveSpy = vi.spyOn(Storage, 'save');

            Storage._repairDuplicateIds();

            expect(window.DB.expenses[0].id).toBe(1);
            expect(window.DB.expenses[1].id).toBe(2);
            expect(window.DB.expenses[2].id).toBe(3);
            expect(window.Utils.generateId).not.toHaveBeenCalled();
            expect(saveSpy).not.toHaveBeenCalled();
        });

        it('preserves id type (string stays string)', () => {
            window.DB.expenses = [
                { id: '5', title: 'first', amount: 100 },
                { id: '5', title: 'second', amount: 200 }
            ];

            Storage._repairDuplicateIds();

            expect(window.DB.expenses[0].id).toBe('5');
            expect(typeof window.DB.expenses[1].id).toBe('string');
            expect(window.DB.expenses[1].id).toBe('900001');
        });

        it('cross-collection independence (expense id 100 and card id 100 do not collide)', () => {
            window.DB.expenses = [{ id: 100, title: 'expense', amount: 100 }];
            window.DB.cards = [{ id: 100, name: 'card' }];

            Storage._repairDuplicateIds();

            // Both should keep id 100 (they're in different collections)
            expect(window.DB.expenses[0].id).toBe(100);
            expect(window.DB.cards[0].id).toBe(100);
            expect(window.Utils.generateId).not.toHaveBeenCalled();
        });

        it('handles duplicates across 3+ items (all three get distinct ids)', () => {
            window.DB.expenses = [
                { id: 100, title: 'first', amount: 100 },
                { id: 100, title: 'second', amount: 200 },
                { id: 100, title: 'third', amount: 300 }
            ];

            Storage._repairDuplicateIds();

            const ids = window.DB.expenses.map(e => e.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(3);
            expect(ids[0]).toBe(100);
            expect(ids[1]).toBe(900001);
            expect(ids[2]).toBe(900002);
        });

        it('calls save() when repairs happen', () => {
            window.DB.expenses = [
                { id: 100, title: 'first', amount: 100 },
                { id: 100, title: 'second', amount: 200 }
            ];

            const saveSpy = vi.spyOn(Storage, 'save');

            Storage._repairDuplicateIds();

            expect(saveSpy).toHaveBeenCalled();
        });

        it('load() invokes repair and heals duplicates', () => {
            const stored = {
                expenses: [
                    { id: 100, title: 'amma', amount: 10000 },
                    { id: 100, title: 'wife', amount: 10000 }
                ],
                cards: [],
                settings: {},
                security: { masterPassword: 'test123' }
            };
            window.localStorage.getItem.mockReturnValue(JSON.stringify(stored));

            const result = Storage.load();

            expect(result).toBe(true);
            // Duplicates should be healed
            expect(window.DB.expenses[0].id).toBe(100);
            expect(window.DB.expenses[1].id).toBe(900001);
            expect(window.DB.expenses[0].title).toBe('amma');
            expect(window.DB.expenses[1].title).toBe('wife');
        });

        it('handles numeric 5 and string "5" as collision', () => {
            window.DB.expenses = [
                { id: 5, title: 'numeric', amount: 100 },
                { id: '5', title: 'string', amount: 200 }
            ];

            Storage._repairDuplicateIds();

            // Should detect collision and reassign the second one
            expect(window.DB.expenses[0].id).toBe(5);
            expect(window.DB.expenses[1].id).toBe('900001');
            expect(typeof window.DB.expenses[1].id).toBe('string');
        });

        it('does not throw when window.DB is missing or collections are not arrays', () => {
            window.DB = null;

            expect(() => Storage._repairDuplicateIds()).not.toThrow();

            window.DB = { expenses: 'not-an-array' };

            expect(() => Storage._repairDuplicateIds()).not.toThrow();
        });

        it('scans all expected collections', () => {
            // Set up duplicates across multiple collections
            window.DB.credentials = [{ id: 1 }, { id: 1 }];
            window.DB.cards = [{ id: 2 }, { id: 2 }];
            window.DB.expenses = [{ id: 3 }, { id: 3 }];
            window.DB.portfolioInvestments = [{ id: 4 }, { id: 4 }];
            window.DB.monthlyInvestments = [{ id: 5 }, { id: 5 }];
            window.DB.recurringExpenses = [{ id: 6 }, { id: 6 }];
            window.DB.sips = [{ id: 7 }, { id: 7 }];
            window.DB.plans = [{ id: 8 }, { id: 8 }];
            window.DB.loans = [{ id: 9 }, { id: 9 }];
            window.DB.moneyLent = [{ id: 10 }, { id: 10 }];
            window.DB.additionalIncome = [{ id: 11 }, { id: 11 }];
            window.DB.cardBills = [{ id: 12 }, { id: 12 }];
            window.DB.cardGroups = [{ id: 13 }, { id: 13 }];

            Storage._repairDuplicateIds();

            // All second items should have been reassigned
            expect(window.DB.credentials[1].id).toBe(900001);
            expect(window.DB.cards[1].id).toBe(900002);
            expect(window.DB.expenses[1].id).toBe(900003);
            expect(window.DB.portfolioInvestments[1].id).toBe(900004);
            expect(window.DB.monthlyInvestments[1].id).toBe(900005);
            expect(window.DB.recurringExpenses[1].id).toBe(900006);
            expect(window.DB.sips[1].id).toBe(900007);
            expect(window.DB.plans[1].id).toBe(900008);
            expect(window.DB.loans[1].id).toBe(900009);
            expect(window.DB.moneyLent[1].id).toBe(900010);
            expect(window.DB.additionalIncome[1].id).toBe(900011);
            expect(window.DB.cardBills[1].id).toBe(900012);
            expect(window.DB.cardGroups[1].id).toBe(900013);
        });

        it('guards against fresh id itself colliding', () => {
            window.DB.expenses = [
                { id: 100, title: 'first' },
                { id: 100, title: 'second' }
            ];

            // Mock generateId to return an id that already exists, then a unique one
            let callCount = 0;
            window.Utils.generateId = vi.fn(() => {
                callCount++;
                // First call returns 100 (collides), second call returns 900001 (unique)
                return callCount === 1 ? 100 : 900001;
            });

            Storage._repairDuplicateIds();

            // Should have called generateId twice to avoid collision
            expect(window.Utils.generateId).toHaveBeenCalledTimes(2);
            expect(window.DB.expenses[1].id).toBe(900001);
        });
    });

    describe('_migrateDeprecatedAIModels() - retired model healing', () => {
        beforeEach(() => {
            window.DB.settings = {};
        });

        it('rewrites the deprecated Groq llama-3.3-70b-versatile to openai/gpt-oss-120b', () => {
            window.DB.settings.groqModel = 'llama-3.3-70b-versatile';

            Storage._migrateDeprecatedAIModels();

            expect(window.DB.settings.groqModel).toBe('openai/gpt-oss-120b');
        });

        it('rewrites the deprecated llama-3.1-8b-instant to openai/gpt-oss-120b', () => {
            window.DB.settings.groqModel = 'llama-3.1-8b-instant';

            Storage._migrateDeprecatedAIModels();

            expect(window.DB.settings.groqModel).toBe('openai/gpt-oss-120b');
        });

        it('rewrites the legacy mixtral-8x7b-32768 placeholder to openai/gpt-oss-120b', () => {
            window.DB.settings.groqModel = 'mixtral-8x7b-32768';

            Storage._migrateDeprecatedAIModels();

            expect(window.DB.settings.groqModel).toBe('openai/gpt-oss-120b');
        });

        it('trims whitespace when matching a deprecated model id', () => {
            window.DB.settings.groqModel = '  llama-3.3-70b-versatile  ';

            Storage._migrateDeprecatedAIModels();

            expect(window.DB.settings.groqModel).toBe('openai/gpt-oss-120b');
        });

        it('persists the migration via save() so it sticks across reloads', () => {
            window.DB.settings.groqModel = 'llama-3.3-70b-versatile';
            const saveSpy = vi.spyOn(Storage, 'save');

            Storage._migrateDeprecatedAIModels();

            expect(saveSpy).toHaveBeenCalledTimes(1);
        });

        it('leaves the current model untouched and does not write', () => {
            window.DB.settings.groqModel = 'openai/gpt-oss-120b';
            const saveSpy = vi.spyOn(Storage, 'save');

            Storage._migrateDeprecatedAIModels();

            expect(window.DB.settings.groqModel).toBe('openai/gpt-oss-120b');
            expect(saveSpy).not.toHaveBeenCalled();
        });

        it('leaves a user-set custom model untouched', () => {
            window.DB.settings.groqModel = 'openai/gpt-oss-20b';
            const saveSpy = vi.spyOn(Storage, 'save');

            Storage._migrateDeprecatedAIModels();

            expect(window.DB.settings.groqModel).toBe('openai/gpt-oss-20b');
            expect(saveSpy).not.toHaveBeenCalled();
        });

        it('does not touch other providers (gemini/chatgpt/perplexity)', () => {
            window.DB.settings.geminiModel = 'gemini-2.5-flash-lite';
            window.DB.settings.chatGptModel = 'gpt-4o-mini';
            window.DB.settings.perplexityModel = 'sonar-pro';
            window.DB.settings.groqModel = 'llama-3.3-70b-versatile';

            Storage._migrateDeprecatedAIModels();

            expect(window.DB.settings.geminiModel).toBe('gemini-2.5-flash-lite');
            expect(window.DB.settings.chatGptModel).toBe('gpt-4o-mini');
            expect(window.DB.settings.perplexityModel).toBe('sonar-pro');
        });

        it('is a no-op when settings is missing', () => {
            window.DB.settings = undefined;

            expect(() => Storage._migrateDeprecatedAIModels()).not.toThrow();
        });

        it('is a no-op when groqModel is unset', () => {
            const saveSpy = vi.spyOn(Storage, 'save');

            Storage._migrateDeprecatedAIModels();

            expect(saveSpy).not.toHaveBeenCalled();
        });

        it('runs automatically from load() and heals a persisted stale model', () => {
            const stored = {
                settings: { groqModel: 'llama-3.3-70b-versatile' }
            };
            window.localStorage.getItem.mockReturnValue(JSON.stringify(stored));

            Storage.load();

            expect(window.DB.settings.groqModel).toBe('openai/gpt-oss-120b');
        });
    });
});
