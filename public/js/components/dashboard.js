/**
 * Dashboard Component
 * Registers itself to window.Components for Alpine.js to consume
 */
window.Components = window.Components || {};

// Helper to get CSS variable values (alias to window.utils.getThemeColor)
const getThemeColor = (name) => window.utils.getThemeColor(name);

// Color palette for different families and models
const FAMILY_COLORS = {
    get claude() { return getThemeColor('--color-neon-purple'); },
    get gemini() { return getThemeColor('--color-neon-green'); },
    get other() { return getThemeColor('--color-neon-cyan'); }
};

const MODEL_COLORS = Array.from({ length: 16 }, (_, i) => getThemeColor(`--color-chart-${i + 1}`));

window.Components.dashboard = () => ({
    stats: { total: 0, active: 0, limited: 0, overallHealth: 0, hasTrendData: false },
    charts: { quotaDistribution: null, usageTrend: null },

    // Usage stats
    usageStats: { total: 0, today: 0, thisHour: 0 },
    historyData: {},

    // Hierarchical model tree: { claude: ['opus-4-5', 'sonnet-4-5'], gemini: ['3-flash'] }
    modelTree: {},
    families: [],  // ['claude', 'gemini']

    // Display mode: 'family' or 'model'
    displayMode: 'model',

    // Selection state
    selectedFamilies: [],
    selectedModels: {},  // { claude: ['opus-4-5'], gemini: ['3-flash'] }

    showModelFilter: false,

    init() {
        // Load saved preferences from localStorage
        this.loadPreferences();

        // Update stats when dashboard becomes active
        this.$watch('$store.global.activeTab', (val) => {
            if (val === 'dashboard') {
                this.$nextTick(() => {
                    this.updateStats();
                    this.updateCharts();
                    this.fetchHistory();
                });
            }
        });

        // Watch for data changes
        this.$watch('$store.data.accounts', () => {
            if (this.$store.global.activeTab === 'dashboard') {
                this.updateStats();
                this.$nextTick(() => this.updateCharts());
            }
        });

        // Initial update if already on dashboard
        if (this.$store.global.activeTab === 'dashboard') {
            this.$nextTick(() => {
                this.updateStats();
                this.updateCharts();
                this.fetchHistory();
            });
        }

        // Refresh history every 5 minutes
        setInterval(() => {
            if (this.$store.global.activeTab === 'dashboard') {
                this.fetchHistory();
            }
        }, 300000);
    },

    loadPreferences() {
        try {
            const saved = localStorage.getItem('dashboard_chart_prefs');
            if (saved) {
                const prefs = JSON.parse(saved);
                this.displayMode = prefs.displayMode || 'model';
                this.selectedFamilies = prefs.selectedFamilies || [];
                this.selectedModels = prefs.selectedModels || {};
            }
        } catch (e) {
            console.error('Failed to load dashboard preferences:', e);
        }
    },

    savePreferences() {
        try {
            localStorage.setItem('dashboard_chart_prefs', JSON.stringify({
                displayMode: this.displayMode,
                selectedFamilies: this.selectedFamilies,
                selectedModels: this.selectedModels
            }));
        } catch (e) {
            console.error('Failed to save dashboard preferences:', e);
        }
    },

    async fetchHistory() {
        try {
            const password = Alpine.store('global').webuiPassword;
            const { response, newPassword } = await window.utils.request('/api/stats/history', {}, password);
            if (newPassword) Alpine.store('global').webuiPassword = newPassword;

            if (response.ok) {
                const history = await response.json();
                this.historyData = history;
                this.processHistory(history);
                this.stats.hasTrendData = true;
            }
        } catch (error) {
            console.error('Failed to fetch usage history:', error);
            this.stats.hasTrendData = true;
        }
    },

    processHistory(history) {
        // Build model tree from hierarchical data
        const tree = {};
        let total = 0, today = 0, thisHour = 0;

        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const currentHour = new Date(now);
        currentHour.setMinutes(0, 0, 0);

        Object.entries(history).forEach(([iso, hourData]) => {
            const timestamp = new Date(iso);

            // Process each family in the hour data
            Object.entries(hourData).forEach(([key, value]) => {
                // Skip metadata keys
                if (key === '_total' || key === 'total') return;

                // Handle hierarchical format: { claude: { "opus-4-5": 10, "_subtotal": 10 } }
                if (typeof value === 'object' && value !== null) {
                    if (!tree[key]) tree[key] = new Set();

                    Object.keys(value).forEach(modelName => {
                        if (modelName !== '_subtotal') {
                            tree[key].add(modelName);
                        }
                    });
                }
                // Skip old flat format keys (claude, gemini as numbers)
            });

            // Calculate totals
            const hourTotal = hourData._total || hourData.total || 0;
            total += hourTotal;

            if (timestamp >= todayStart) {
                today += hourTotal;
            }
            if (timestamp.getTime() === currentHour.getTime()) {
                thisHour = hourTotal;
            }
        });

        this.usageStats = { total, today, thisHour };

        // Convert Sets to sorted arrays
        this.modelTree = {};
        Object.entries(tree).forEach(([family, models]) => {
            this.modelTree[family] = Array.from(models).sort();
        });
        this.families = Object.keys(this.modelTree).sort();

        // Auto-select new families/models that haven't been configured
        this.autoSelectNew();

        this.updateTrendChart();
    },

    autoSelectNew() {
        // If no preferences saved, select all
        if (this.selectedFamilies.length === 0 && Object.keys(this.selectedModels).length === 0) {
            this.selectedFamilies = [...this.families];
            this.families.forEach(family => {
                this.selectedModels[family] = [...(this.modelTree[family] || [])];
            });
            this.savePreferences();
            return;
        }

        // Add new families/models that appeared
        this.families.forEach(family => {
            if (!this.selectedFamilies.includes(family)) {
                this.selectedFamilies.push(family);
            }
            if (!this.selectedModels[family]) {
                this.selectedModels[family] = [];
            }
            (this.modelTree[family] || []).forEach(model => {
                if (!this.selectedModels[family].includes(model)) {
                    this.selectedModels[family].push(model);
                }
            });
        });
    },

    autoSelectTopN(n = 5) {
        // Calculate usage for each model over past 24 hours
        const usage = {};
        const now = Date.now();
        const dayAgo = now - 24 * 60 * 60 * 1000;

        Object.entries(this.historyData).forEach(([iso, hourData]) => {
            const timestamp = new Date(iso).getTime();
            if (timestamp < dayAgo) return;

            Object.entries(hourData).forEach(([family, familyData]) => {
                if (typeof familyData === 'object' && family !== '_total') {
                    Object.entries(familyData).forEach(([model, count]) => {
                        if (model !== '_subtotal') {
                            const key = `${family}:${model}`;
                            usage[key] = (usage[key] || 0) + count;
                        }
                    });
                }
            });
        });

        // Sort by usage and take top N
        const sorted = Object.entries(usage)
            .sort((a, b) => b[1] - a[1])
            .slice(0, n);

        // Clear current selection
        this.selectedFamilies = [];
        this.selectedModels = {};

        // Select top N models
        sorted.forEach(([key]) => {
            const [family, model] = key.split(':');
            if (!this.selectedFamilies.includes(family)) {
                this.selectedFamilies.push(family);
            }
            if (!this.selectedModels[family]) {
                this.selectedModels[family] = [];
            }
            this.selectedModels[family].push(model);
        });

        this.savePreferences();
        this.refreshChart();
    },

    // Toggle display mode between family and model level
    setDisplayMode(mode) {
        this.displayMode = mode;
        this.savePreferences();
        this.updateTrendChart();
    },

    // Toggle family selection
    toggleFamily(family) {
        const index = this.selectedFamilies.indexOf(family);
        if (index > -1) {
            this.selectedFamilies.splice(index, 1);
        } else {
            this.selectedFamilies.push(family);
        }
        this.savePreferences();
        this.updateTrendChart();
    },

    // Toggle model selection within a family
    toggleModel(family, model) {
        if (!this.selectedModels[family]) {
            this.selectedModels[family] = [];
        }
        const index = this.selectedModels[family].indexOf(model);
        if (index > -1) {
            this.selectedModels[family].splice(index, 1);
        } else {
            this.selectedModels[family].push(model);
        }
        this.savePreferences();
        this.updateTrendChart();
    },

    // Check if family is selected
    isFamilySelected(family) {
        return this.selectedFamilies.includes(family);
    },

    // Check if model is selected
    isModelSelected(family, model) {
        return this.selectedModels[family]?.includes(model) || false;
    },

    // Select all families and models
    selectAll() {
        this.selectedFamilies = [...this.families];
        this.families.forEach(family => {
            this.selectedModels[family] = [...(this.modelTree[family] || [])];
        });
        this.savePreferences();
        this.updateTrendChart();
    },

    // Deselect all
    deselectAll() {
        this.selectedFamilies = [];
        this.selectedModels = {};
        this.savePreferences();
        this.updateTrendChart();
    },

    // Get color for family
    getFamilyColor(family) {
        return FAMILY_COLORS[family] || FAMILY_COLORS.other;
    },

    // Get color for model (with index for variation within family)
    getModelColor(family, modelIndex) {
        const baseIndex = family === 'claude' ? 0 : (family === 'gemini' ? 4 : 8);
        return MODEL_COLORS[(baseIndex + modelIndex) % MODEL_COLORS.length];
    },

    // Get count of selected items for display
    getSelectedCount() {
        if (this.displayMode === 'family') {
            return `${this.selectedFamilies.length}/${this.families.length}`;
        }
        let selected = 0, total = 0;
        this.families.forEach(family => {
            const models = this.modelTree[family] || [];
            total += models.length;
            selected += (this.selectedModels[family] || []).length;
        });
        return `${selected}/${total}`;
    },

    updateTrendChart() {
        const ctx = document.getElementById('usageTrendChart');
        if (!ctx || typeof Chart === 'undefined') return;

        if (this.charts.usageTrend) {
            this.charts.usageTrend.destroy();
        }

        const history = this.historyData;
        const labels = [];
        const datasets = [];

        if (this.displayMode === 'family') {
            // Aggregate by family
            const dataByFamily = {};
            this.selectedFamilies.forEach(family => {
                dataByFamily[family] = [];
            });

            Object.entries(history).forEach(([iso, hourData]) => {
                const date = new Date(iso);
                labels.push(date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

                this.selectedFamilies.forEach(family => {
                    const familyData = hourData[family];
                    const count = familyData?._subtotal || 0;
                    dataByFamily[family].push(count);
                });
            });

            // Build datasets for families
            this.selectedFamilies.forEach(family => {
                const color = this.getFamilyColor(family);
                const familyKey = 'family' + family.charAt(0).toUpperCase() + family.slice(1);
                const label = Alpine.store('global').t(familyKey);
                datasets.push(this.createDataset(
                    label,
                    dataByFamily[family],
                    color,
                    ctx
                ));
            });
        } else {
            // Show individual models
            const dataByModel = {};

            // Initialize data arrays
            this.families.forEach(family => {
                (this.selectedModels[family] || []).forEach(model => {
                    const key = `${family}:${model}`;
                    dataByModel[key] = [];
                });
            });

            Object.entries(history).forEach(([iso, hourData]) => {
                const date = new Date(iso);
                labels.push(date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

                this.families.forEach(family => {
                    const familyData = hourData[family] || {};
                    (this.selectedModels[family] || []).forEach(model => {
                        const key = `${family}:${model}`;
                        dataByModel[key].push(familyData[model] || 0);
                    });
                });
            });

            // Build datasets for models
            this.families.forEach(family => {
                (this.selectedModels[family] || []).forEach((model, modelIndex) => {
                    const key = `${family}:${model}`;
                    const color = this.getModelColor(family, modelIndex);
                    datasets.push(this.createDataset(model, dataByModel[key], color, ctx));
                });
            });
        }

        this.charts.usageTrend = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: getThemeColor('--color-space-950') || 'rgba(24, 24, 27, 0.9)',
                        titleColor: getThemeColor('--color-text-main'),
                        bodyColor: getThemeColor('--color-text-bright'),
                        borderColor: getThemeColor('--color-space-border'),
                        borderWidth: 1,
                        padding: 10,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + context.parsed.y;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: { display: false },
                        ticks: { color: getThemeColor('--color-text-muted'), font: { size: 10 } }
                    },
                    y: {
                        display: true,
                        beginAtZero: true,
                        grid: { display: true, color: getThemeColor('--color-space-border') + '1a' || 'rgba(255,255,255,0.05)' },
                        ticks: { color: getThemeColor('--color-text-muted'), font: { size: 10 } }
                    }
                }
            }
        });
    },

    createDataset(label, data, color, ctx) {
        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(0, this.hexToRgba(color, 0.3));
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        return {
            label,
            data,
            borderColor: color,
            backgroundColor: gradient,
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: color
        };
    },

    hexToRgba(hex, alpha) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
        }
        return hex;
    },

    updateStats() {
        const accounts = Alpine.store('data').accounts;
        let active = 0, limited = 0;

        const isCore = (id) => /sonnet|opus|pro|flash/i.test(id);

        // Only count enabled accounts in statistics
        const enabledAccounts = accounts.filter(acc => acc.enabled !== false);

        enabledAccounts.forEach(acc => {
            if (acc.status === 'ok') {
                const limits = Object.entries(acc.limits || {});
                let hasActiveCore = limits.some(([id, l]) => l && l.remainingFraction > 0.05 && isCore(id));

                if (!hasActiveCore) {
                    const hasAnyCore = limits.some(([id]) => isCore(id));
                    if (!hasAnyCore) {
                        hasActiveCore = limits.some(([_, l]) => l && l.remainingFraction > 0.05);
                    }
                }

                if (hasActiveCore) active++; else limited++;
            } else {
                limited++;
            }
        });

        // TOTAL shows only enabled accounts
        // Disabled accounts are excluded from all statistics
        this.stats.total = enabledAccounts.length;
        this.stats.active = active;
        this.stats.limited = limited;
    },

    updateCharts() {
        const ctx = document.getElementById('quotaChart');
        if (!ctx || typeof Chart === 'undefined') return;

        if (this.charts.quotaDistribution) {
            this.charts.quotaDistribution.destroy();
        }

        const rows = Alpine.store('data').quotaRows;

        // Dynamic family aggregation (supports any model family)
        const familyStats = {};
        rows.forEach(row => {
            if (!familyStats[row.family]) {
                familyStats[row.family] = { used: 0, total: 0 };
            }
            row.quotaInfo.forEach(info => {
                familyStats[row.family].used += info.pct;
                familyStats[row.family].total += 100;
            });
        });

        // Calculate global health
        const globalTotal = Object.values(familyStats).reduce((sum, f) => sum + f.total, 0);
        const globalUsed = Object.values(familyStats).reduce((sum, f) => sum + f.used, 0);
        this.stats.overallHealth = globalTotal > 0 ? Math.round((globalUsed / globalTotal) * 100) : 0;

        // Generate chart data dynamically
        const familyColors = {
            'claude': getThemeColor('--color-neon-purple'),
            'gemini': getThemeColor('--color-neon-green'),
            'other': getThemeColor('--color-neon-cyan'),
            'unknown': '#666666'
        };

        const families = Object.keys(familyStats).sort();
        const segmentSize = families.length > 0 ? 100 / families.length : 100;

        const data = [];
        const colors = [];
        const labels = [];

        families.forEach(family => {
            const stats = familyStats[family];
            const health = stats.total > 0 ? Math.round((stats.used / stats.total) * 100) : 0;
            const activeVal = (health / 100) * segmentSize;
            const inactiveVal = segmentSize - activeVal;

            const familyColor = familyColors[family] || familyColors['unknown'];

            // Get translation keys
            const store = Alpine.store('global');
            const familyKey = 'family' + family.charAt(0).toUpperCase() + family.slice(1);
            const familyName = store.t(familyKey);

            // Labels using translations if possible
            const activeLabel = family === 'claude' ? store.t('claudeActive') :
                              family === 'gemini' ? store.t('geminiActive') :
                              `${familyName} ${store.t('activeSuffix')}`;

            const depletedLabel = family === 'claude' ? store.t('claudeEmpty') :
                                family === 'gemini' ? store.t('geminiEmpty') :
                                `${familyName} ${store.t('depleted')}`;

            // Active segment
            data.push(activeVal);
            colors.push(familyColor);
            labels.push(activeLabel);

            // Inactive segment
            data.push(inactiveVal);
            colors.push(this.hexToRgba(familyColor, 0.1));
            labels.push(depletedLabel);
        });

        this.charts.quotaDistribution = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderColor: getThemeColor('--color-space-950'),
                    borderWidth: 2,
                    hoverOffset: 0,
                    borderRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '85%',
                rotation: -90,
                circumference: 360,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false },
                    title: { display: false }
                },
                animation: {
                    animateScale: true,
                    animateRotate: true
                }
            }
        });
    }
});
