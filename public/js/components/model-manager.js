/**
 * Model Manager Component
 * Handles model configuration (pinning, hiding, aliasing, mapping)
 * Registers itself to window.Components for Alpine.js to consume
 */
window.Components = window.Components || {};

window.Components.modelManager = () => ({
    init() {
        // Component is ready
    },

    /**
     * Update model configuration with authentication
     * @param {string} modelId - The model ID to update
     * @param {object} configUpdates - Configuration updates (pinned, hidden, alias, mapping)
     */
    async updateModelConfig(modelId, configUpdates) {
        const store = Alpine.store('global');
        try {
            const { response, newPassword } = await window.utils.request('/api/models/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelId, config: configUpdates })
            }, store.webuiPassword);

            if (newPassword) store.webuiPassword = newPassword;

            if (!response.ok) {
                throw new Error('Failed to update model config');
            }

            // Optimistic update
            Alpine.store('data').modelConfig[modelId] = {
                ...Alpine.store('data').modelConfig[modelId],
                ...configUpdates
            };
            Alpine.store('data').computeQuotaRows();
        } catch (e) {
            store.showToast('Failed to update model config: ' + e.message, 'error');
        }
    }
});
