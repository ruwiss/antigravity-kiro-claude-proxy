/**
 * Server Config Component
 * Registers itself to window.Components for Alpine.js to consume
 */
window.Components = window.Components || {};

window.Components.serverConfig = () => ({
    serverConfig: {},
    loading: false,
    advancedExpanded: false,
    debounceTimers: {}, // Store debounce timers for each config field

    init() {
        // Initial fetch if this is the active sub-tab
        if (this.activeTab === 'server') {
            this.fetchServerConfig();
        }

        // Watch local activeTab (from parent settings scope)
        this.$watch('activeTab', (tab) => {
            if (tab === 'server') {
                this.fetchServerConfig();
            }
        });
    },

    async fetchServerConfig() {
        const password = Alpine.store('global').webuiPassword;
        try {
            const { response, newPassword } = await window.utils.request('/api/config', {}, password);
            if (newPassword) Alpine.store('global').webuiPassword = newPassword;

            if (!response.ok) throw new Error('Failed to fetch config');
            const data = await response.json();
            this.serverConfig = data.config || {};
        } catch (e) {
            console.error('Failed to fetch server config:', e);
        }
    },



    // Password management
    passwordDialog: {
        show: false,
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
    },

    showPasswordDialog() {
        this.passwordDialog = {
            show: true,
            oldPassword: '',
            newPassword: '',
            confirmPassword: ''
        };
    },

    hidePasswordDialog() {
        this.passwordDialog = {
            show: false,
            oldPassword: '',
            newPassword: '',
            confirmPassword: ''
        };
    },

    async changePassword() {
        const store = Alpine.store('global');
        const { oldPassword, newPassword, confirmPassword } = this.passwordDialog;

        if (newPassword !== confirmPassword) {
            store.showToast(store.t('passwordsNotMatch'), 'error');
            return;
        }
        if (newPassword.length < 6) {
            store.showToast(store.t('passwordTooShort'), 'error');
            return;
        }

        try {
            const { response } = await window.utils.request('/api/config/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPassword, newPassword })
            }, store.webuiPassword);

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to change password');
            }

            // Update stored password
            store.webuiPassword = newPassword;
            store.showToast('Password changed successfully', 'success');
            this.hidePasswordDialog();
        } catch (e) {
            store.showToast('Failed to change password: ' + e.message, 'error');
        }
    },

    // Toggle Debug Mode with instant save
    async toggleDebug(enabled) {
        const store = Alpine.store('global');

        // Optimistic update
        const previousValue = this.serverConfig.debug;
        this.serverConfig.debug = enabled;

        try {
            const { response, newPassword } = await window.utils.request('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ debug: enabled })
            }, store.webuiPassword);

            if (newPassword) store.webuiPassword = newPassword;

            const data = await response.json();
            if (data.status === 'ok') {
                const status = enabled ? 'enabled' : 'disabled';
                store.showToast(`Debug mode ${status}`, 'success');
                await this.fetchServerConfig(); // Confirm server state
            } else {
                throw new Error(data.error || 'Failed to update debug mode');
            }
        } catch (e) {
            // Rollback on error
            this.serverConfig.debug = previousValue;
            store.showToast('Failed to update debug mode: ' + e.message, 'error');
        }
    },

    // Toggle Token Cache with instant save
    async toggleTokenCache(enabled) {
        const store = Alpine.store('global');

        // Optimistic update
        const previousValue = this.serverConfig.persistTokenCache;
        this.serverConfig.persistTokenCache = enabled;

        try {
            const { response, newPassword } = await window.utils.request('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ persistTokenCache: enabled })
            }, store.webuiPassword);

            if (newPassword) store.webuiPassword = newPassword;

            const data = await response.json();
            if (data.status === 'ok') {
                const status = enabled ? 'enabled' : 'disabled';
                store.showToast(`Token cache ${status}`, 'success');
                await this.fetchServerConfig(); // Confirm server state
            } else {
                throw new Error(data.error || 'Failed to update token cache');
            }
        } catch (e) {
            // Rollback on error
            this.serverConfig.persistTokenCache = previousValue;
            store.showToast('Failed to update token cache: ' + e.message, 'error');
        }
    },

    // Generic debounced save method for numeric configs
    async saveConfigField(fieldName, value, displayName) {
        const store = Alpine.store('global');

        // Clear existing timer for this field
        if (this.debounceTimers[fieldName]) {
            clearTimeout(this.debounceTimers[fieldName]);
        }

        // Optimistic update
        const previousValue = this.serverConfig[fieldName];
        this.serverConfig[fieldName] = parseInt(value);

        // Set new timer
        this.debounceTimers[fieldName] = setTimeout(async () => {
            try {
                const payload = {};
                payload[fieldName] = parseInt(value);

                const { response, newPassword } = await window.utils.request('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }, store.webuiPassword);

                if (newPassword) store.webuiPassword = newPassword;

                const data = await response.json();
                if (data.status === 'ok') {
                    store.showToast(`${displayName} updated to ${value}`, 'success');
                    await this.fetchServerConfig(); // Confirm server state
                } else {
                    throw new Error(data.error || `Failed to update ${displayName}`);
                }
            } catch (e) {
                // Rollback on error
                this.serverConfig[fieldName] = previousValue;
                store.showToast(`Failed to update ${displayName}: ` + e.message, 'error');
            }
        }, 500); // 500ms debounce
    },

    // Individual toggle methods for each Advanced Tuning field
    toggleMaxRetries(value) {
        this.saveConfigField('maxRetries', value, 'Max Retries');
    },

    toggleRetryBaseMs(value) {
        this.saveConfigField('retryBaseMs', value, 'Retry Base Delay');
    },

    toggleRetryMaxMs(value) {
        this.saveConfigField('retryMaxMs', value, 'Retry Max Delay');
    },

    toggleDefaultCooldownMs(value) {
        this.saveConfigField('defaultCooldownMs', value, 'Default Cooldown');
    },

    toggleMaxWaitBeforeErrorMs(value) {
        this.saveConfigField('maxWaitBeforeErrorMs', value, 'Max Wait Threshold');
    }
});
