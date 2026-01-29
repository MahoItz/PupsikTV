/**
 * DiagnosticManager - Real-time performance monitoring and site diagnostics
 */
class DiagnosticManager {
    constructor() {
        this.panel = null;
        this.isOpen = false;
        this.fps = 0;
        this.frameTime = 0;
        this.lastFrameTime = performance.now();
        this.frames = 0;
        this.lastFpsUpdate = performance.now();
        this.longTasks = [];
        this.startTime = performance.now();
        this.revertTimer = null;
        this.metrics = {
            fps: null,
            frameTime: null,
            domCount: null,
            longTasks: null,
            memory: null,
            network: null
        };

        this.init();
    }

    init() {
        this.createPanel();
        this.setupEventListeners();
        this.setupPerformanceObserver();
        this.startReporting();
        this.restoreSettings();
    }

    createPanel() {
        const panel = document.createElement('div');
        panel.id = 'diagnosticPanel';
        panel.className = 'diagnostic-panel';
        panel.innerHTML = `
            <div class="diagnostic-header">
                <h2>Diagnostic Mode</h2>
                <button class="diagnostic-close" id="diagClose">&times;</button>
            </div>
            <div class="diagnostic-content">
                <div class="diagnostic-section">
                    <div class="diagnostic-section-title"><i class="fas fa-tachometer-alt"></i> Performance</div>
                    <div class="metric-grid">
                        <div class="metric-card" id="m-fps">
                            <div class="metric-label">FPS</div>
                            <div class="metric-value">--</div>
                        </div>
                        <div class="metric-card" id="m-frame">
                            <div class="metric-label">Frame (ms)</div>
                            <div class="metric-value">--</div>
                        </div>
                        <div class="metric-card" id="m-dom">
                            <div class="metric-label">DOM Nodes</div>
                            <div class="metric-value">--</div>
                        </div>
                        <div class="metric-card" id="m-mem">
                            <div class="metric-label">RAM (MB)</div>
                            <div class="metric-value">--</div>
                        </div>
                    </div>
                    <div class="long-tasks-list" id="longTasksList"></div>
                </div>

                <div class="diagnostic-section">
                    <div class="diagnostic-section-title"><i class="fas fa-wifi"></i> Network & System</div>
                    <div id="systemInfo" style="font-size: 11px; opacity: 0.8; line-height: 1.4;"></div>
                </div>

                <div class="diagnostic-section">
                    <div class="diagnostic-section-title"><i class="fas fa-sliders-h"></i> Feature Toggles</div>
                    <div class="toggle-item">
                        <span>Disable Blur</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="t-blur" data-class="diag-no-blur">
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="toggle-item">
                        <span>Disable Shadows</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="t-shadows" data-class="diag-no-shadow">
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="toggle-item">
                        <span>Disable Transitions</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="t-anim" data-class="diag-no-anim">
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="toggle-item">
                        <span>Disable Background Effects</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="t-particles" data-class="diag-no-particles">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>

                <div class="diagnostic-section">
                    <div class="diagnostic-section-title"><i class="fas fa-file-code"></i> CSS Files</div>
                    <div id="cssToggles"></div>
                </div>

                <div class="diagnostic-actions">
                    <button class="diag-btn primary" id="copyReport"><i class="fas fa-copy"></i> Copy Full Report</button>
                    <button class="diag-btn danger" id="resetDiag"><i class="fas fa-undo"></i> Reset to Defaults</button>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        this.panel = panel;
        this.renderCssToggles();
    }

    setupEventListeners() {
        const toggleBtn = document.getElementById('diagnosticToggleButton');
        const closeBtn = document.getElementById('diagClose');
        const resetBtn = document.getElementById('resetDiag');
        const copyBtn = document.getElementById('copyReport');

        toggleBtn?.addEventListener('click', () => this.toggle());
        closeBtn?.addEventListener('click', () => this.toggle());
        resetBtn?.addEventListener('click', () => this.resetDefaults());
        copyBtn?.addEventListener('click', () => this.copyReport());

        // Event for feature toggles
        this.panel.querySelectorAll('.toggle-switch input').forEach(input => {
            input.addEventListener('change', (e) => {
                const className = e.target.getAttribute('data-class');
                if (className) {
                    document.body.classList.toggle(className, e.target.checked);
                    this.saveSettings();
                    this.startPanicTimer();
                }
            });
        });
    }

    setupPerformanceObserver() {
        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.entryType === 'longtask') {
                        this.addLongTask(entry);
                    }
                }
            });
            observer.observe({ entryTypes: ['longtask'] });
        } catch (e) {
            console.warn('PerformanceObserver longtask not supported');
        }
    }

    addLongTask(entry) {
        const task = {
            duration: Math.round(entry.duration),
            startTime: Math.round(entry.startTime),
            timestamp: new Date().toLocaleTimeString()
        };
        this.longTasks.unshift(task);
        if (this.longTasks.length > 10) this.longTasks.pop();
        this.updateLongTasksUI();
    }

    updateLongTasksUI() {
        const container = document.getElementById('longTasksList');
        if (!container) return;
        container.innerHTML = this.longTasks.map(t => `
            <div class="long-task-item">
                <span style="color:var(--diag-danger)">BLOCK: ${t.duration}ms</span>
                <span style="opacity:0.5">${t.timestamp}</span>
            </div>
        `).join('');
    }

    startReporting() {
        const update = () => {
            const now = performance.now();
            this.frames++;
            
            if (now >= this.lastFpsUpdate + 1000) {
                this.fps = Math.round((this.frames * 1000) / (now - this.lastFpsUpdate));
                this.frames = 0;
                this.lastFpsUpdate = now;
                this.updateUI();
            }

            this.frameTime = Math.round((now - this.lastFrameTime) * 10) / 10;
            this.lastFrameTime = now;

            if (this.isOpen) {
                requestAnimationFrame(update);
            }
        };
        requestAnimationFrame(update);
    }

    updateUI() {
        if (!this.isOpen) return;

        // FPS
        const fpsEl = document.getElementById('m-fps');
        if (fpsEl) {
            const val = fpsEl.querySelector('.metric-value');
            val.textContent = this.fps;
            fpsEl.className = 'metric-card ' + (this.fps > 50 ? 'good' : (this.fps > 30 ? 'warning' : 'danger'));
        }

        // Frame Time
        const frameEl = document.getElementById('m-frame');
        if (frameEl) {
            const val = frameEl.querySelector('.metric-value');
            val.textContent = this.frameTime;
            frameEl.className = 'metric-card ' + (this.frameTime < 20 ? 'good' : (this.frameTime < 40 ? 'warning' : 'danger'));
        }

        // DOM Count
        const domEl = document.getElementById('m-dom');
        if (domEl) {
            const count = document.getElementsByTagName('*').length;
            domEl.querySelector('.metric-value').textContent = count;
            domEl.className = 'metric-card ' + (count < 2000 ? 'good' : (count < 5000 ? 'warning' : 'danger'));
        }

        // Memory
        if (performance.memory) {
            const memEl = document.getElementById('m-mem');
            if (memEl) {
                const used = Math.round(performance.memory.usedJSHeapSize / 1048576);
                memEl.querySelector('.metric-value').textContent = used;
                memEl.className = 'metric-card ' + (used < 100 ? 'good' : (used < 300 ? 'warning' : 'danger'));
            }
        }

        // System Info
        const sysEl = document.getElementById('systemInfo');
        if (sysEl) {
            const conn = navigator.connection || {};
            sysEl.innerHTML = `
                Viewport: ${window.innerWidth}x${window.innerHeight} (DPR: ${window.devicePixelRatio})<br>
                Cores: ${navigator.hardwareConcurrency || '--'} | Prefers Reduced: ${window.matchMedia('(prefers-reduced-motion: reduce)').matches}<br>
                Net: ${conn.effectiveType || '--'} (${conn.downlink || '--'}Mbps) ${conn.saveData ? ' | SaveData' : ''}<br>
                Session: ${Math.round((performance.now() - this.startTime) / 1000)}s
            `;
        }
    }

    renderCssToggles() {
        const container = document.getElementById('cssToggles');
        if (!container) return;
        
        const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
        container.innerHTML = links.map((link, idx) => {
            const fileName = link.href.split('/').pop() || 'style';
            const isEssential = link.hasAttribute('data-essential');
            if (isEssential) return ''; // Hide essential files from toggling
            
            return `
                <div class="toggle-item">
                    <span title="${link.href}">${fileName}</span>
                    <label class="toggle-switch">
                        <input type="checkbox" class="css-toggle" data-idx="${idx}" ${!link.disabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.css-toggle').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.getAttribute('data-idx'));
                links[idx].disabled = !e.target.checked;
                this.saveSettings();
                this.startPanicTimer();
            });
        });
    }

    toggle() {
        this.isOpen = !this.isOpen;
        this.panel.classList.toggle('visible', this.isOpen);
        document.getElementById('diagnosticToggleButton')?.classList.toggle('active', this.isOpen);
        if (this.isOpen) {
            this.startReporting();
        }
    }

    startPanicTimer() {
        if (this.revertTimer) clearTimeout(this.revertTimer);
        
        const banner = document.createElement('div');
        banner.id = 'panicBanner';
        banner.className = 'panic-banner';
        banner.innerHTML = `
            <span>Settings will revert in <span id="revertCountdown">10</span>s</span>
            <button class="diag-btn primary" id="keepSettings" style="padding: 4px 12px; font-size: 11px;">Keep</button>
        `;
        
        const existing = document.getElementById('panicBanner');
        if (existing) existing.remove();
        document.body.appendChild(banner);

        let countdown = 10;
        const interval = setInterval(() => {
            countdown--;
            const countEl = document.getElementById('revertCountdown');
            if (countEl) countEl.textContent = countdown;
            if (countdown <= 0) {
                clearInterval(interval);
                this.resetDefaults();
                banner.remove();
            }
        }, 1000);

        document.getElementById('keepSettings')?.addEventListener('click', () => {
            clearInterval(interval);
            banner.remove();
            clearTimeout(this.revertTimer);
            this.revertTimer = null;
        });

        this.revertTimer = interval;
    }

    resetDefaults() {
        // Restore all CSS
        document.querySelectorAll('link[rel="stylesheet"]').forEach(l => l.disabled = false);
        // Remove classes
        const featureClasses = ['diag-no-blur', 'diag-no-shadow', 'diag-no-anim', 'diag-no-particles'];
        document.body.classList.remove(...featureClasses);
        
        // Sync UI
        this.panel.querySelectorAll('input[type="checkbox"]').forEach(input => {
            input.checked = true;
            if (input.classList.contains('css-toggle')) input.checked = true;
        });
        
        localStorage.removeItem('diag_settings');
        this.renderCssToggles();
    }

    saveSettings() {
        const settings = {
            css: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.disabled),
            features: {
                blur: document.body.classList.contains('diag-no-blur'),
                shadows: document.body.classList.contains('diag-no-shadow'),
                anim: document.body.classList.contains('diag-no-anim'),
                particles: document.body.classList.contains('diag-no-particles')
            }
        };
        localStorage.setItem('diag_settings', JSON.stringify(settings));
    }

    restoreSettings() {
        const saved = localStorage.getItem('diag_settings');
        if (!saved) return;
        try {
            const settings = JSON.parse(saved);
            const links = document.querySelectorAll('link[rel="stylesheet"]');
            settings.css.forEach((disabled, i) => {
                if (links[i] && !links[i].hasAttribute('data-essential')) {
                    links[i].disabled = disabled;
                }
            });
            
            if (settings.features.blur) document.body.classList.add('diag-no-blur');
            if (settings.features.shadows) document.body.classList.add('diag-no-shadow');
            if (settings.features.anim) document.body.classList.add('diag-no-anim');
            if (settings.features.particles) document.body.classList.add('diag-no-particles');
            
            // Sync toggles UI
            document.getElementById('t-blur').checked = settings.features.blur;
            document.getElementById('t-shadows').checked = settings.features.shadows;
            document.getElementById('t-anim').checked = settings.features.anim;
            document.getElementById('t-particles').checked = settings.features.particles;
            
            this.renderCssToggles();
        } catch (e) {
            console.error('Failed to restore diagnostic settings');
        }
    }

    async copyReport() {
        const conn = navigator.connection || {};
        const report = {
            userAgent: navigator.userAgent,
            dpr: window.devicePixelRatio,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            cores: navigator.hardwareConcurrency,
            memory: performance.memory ? Math.round(performance.memory.jsHeapSizeLimit / 1048576) + 'MB limit' : 'unknown',
            reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            network: {
                type: conn.effectiveType,
                downlink: conn.downlink,
                saveData: conn.saveData
            },
            perf: {
                currentFps: this.fps,
                lastFrameMs: this.frameTime,
                longTasksCount: this.longTasks.length,
                domNodes: document.getElementsByTagName('*').length
            },
            timestamp: new Date().toISOString()
        };

        try {
            await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
            const btn = document.getElementById('copyReport');
            const oldText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => btn.innerHTML = oldText, 2000);
        } catch (err) {
            alert('Failed to copy report to clipboard');
        }
    }
}

// Initialize when ready
window.addEventListener('load', () => {
    window.diagnosticManager = new DiagnosticManager();
});
