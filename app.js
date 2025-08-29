class BarcodeScanner {
    constructor() {
        this.isScanning = false;
        this.stream = null;
        this.currentCamera = 'environment';
        this.flashEnabled = false;
        this.scanHistory = JSON.parse(this.getFromStorage('scanHistory')) || [];
        this.settings = JSON.parse(this.getFromStorage('scannerSettings')) || {
            audioFeedback: true,
            autoSearch: true,
            formats: {
                UPC: true,
                EAN: true,
                Code128: true,
                Code39: true,
                QR: true
            }
        };
        
        this.supportedFormats = ['UPC-A', 'UPC-E', 'EAN-13', 'EAN-8', 'Code-128', 'Code-39', 'QR Code', 'Data Matrix'];
        this.audioContext = null;
        this.beepBuffer = null;
        this.cameraAvailable = false;
        
        this.initializeApp();
        this.bindEvents();
        this.initializeAudio();
    }

    getFromStorage(key) {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            console.warn('localStorage not available:', error);
            return null;
        }
    }

    saveToStorage(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            console.warn('Could not save to localStorage:', error);
        }
    }

    async initializeApp() {
        console.log('Initializing app...');
        
        // Check if camera is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('Camera not supported, showing manual mode');
            this.showCameraUnavailable();
            return;
        }

        // Load settings into UI
        this.loadSettings();
        
        // Try to check camera availability without requesting permission yet
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            this.cameraAvailable = videoDevices.length > 0;
            
            if (this.cameraAvailable) {
                console.log('Camera devices found:', videoDevices.length);
                this.showElement('permissionRequest');
            } else {
                console.warn('No camera devices found');
                this.showCameraUnavailable();
            }
        } catch (error) {
            console.warn('Could not enumerate devices:', error);
            this.showElement('permissionRequest');
        }
        
        this.hideElement('errorState');
    }

    showCameraUnavailable() {
        this.hideElement('permissionRequest');
        this.hideElement('errorState');
        
        // Show camera view but disable camera-dependent features
        const video = document.getElementById('scanner');
        if (video) {
            video.style.display = 'none';
        }
        
        // Create a placeholder for camera view
        const cameraView = document.querySelector('.camera-view');
        if (cameraView) {
            cameraView.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; background-color: var(--color-bg-1); color: var(--color-text);">
                    <h3>Camera Not Available</h3>
                    <p>Use manual entry to search for products</p>
                    <button class="btn btn--primary" onclick="app.showManualModal()">Manual Entry</button>
                </div>
                ${cameraView.innerHTML}
            `;
        }
        
        // Disable camera-dependent buttons
        this.disableCameraControls();
    }

    disableCameraControls() {
        const buttons = ['startBtn', 'stopBtn', 'flashBtn', 'switchCameraBtn'];
        buttons.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
            }
        });
    }

    bindEvents() {
        console.log('Binding events...');
        
        // Camera controls
        this.bindEvent('startBtn', 'click', () => this.startScanning());
        this.bindEvent('stopBtn', 'click', () => this.stopScanning());
        this.bindEvent('flashBtn', 'click', () => this.toggleFlash());
        this.bindEvent('switchCameraBtn', 'click', () => this.switchCamera());
        this.bindEvent('requestPermissionBtn', 'click', () => this.requestCameraPermission());
        this.bindEvent('retryBtn', 'click', () => this.requestCameraPermission());

        // Modal controls
        this.bindEvent('historyBtn', 'click', () => this.showHistoryModal());
        this.bindEvent('settingsBtn', 'click', () => this.showSettingsModal());
        this.bindEvent('manualEntryBtn', 'click', () => this.showManualModal());
        this.bindEvent('manualModeBtn', 'click', () => this.showManualModal());

        // Results panel
        this.bindEvent('closeResultsBtn', 'click', () => this.hideResults());
        this.bindEvent('scanAgainBtn', 'click', () => this.scanAgain());
        this.bindEvent('copyCodeBtn', 'click', () => this.copyCode());

        // Modal close events
        this.bindEvent('closeHistoryBtn', 'click', () => this.hideModal('historyModal'));
        this.bindEvent('closeSettingsBtn', 'click', () => this.hideModal('settingsModal'));
        this.bindEvent('closeManualBtn', 'click', () => this.hideModal('manualModal'));
        this.bindEvent('clearHistoryBtn', 'click', () => this.clearHistory());

        // Manual entry
        this.bindEvent('submitManualBtn', 'click', () => this.submitManualCode());
        
        // Manual code input enter key
        this.bindEvent('manualCode', 'keypress', (e) => {
            if (e.key === 'Enter') {
                this.submitManualCode();
            }
        });

        // Settings changes
        this.bindEvent('audioFeedback', 'change', () => this.saveSettings());
        this.bindEvent('autoSearch', 'change', () => this.saveSettings());
        
        ['formatUPC', 'formatEAN', 'formatCode128', 'formatCode39', 'formatQR'].forEach(id => {
            this.bindEvent(id, 'change', () => this.saveSettings());
        });

        // Close modals on background click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });
    }

    bindEvent(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`Element not found: ${elementId}`);
        }
    }

    async initializeAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create beep sound
            const sampleRate = this.audioContext.sampleRate;
            const duration = 0.2;
            const frequency = 800;
            const buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
            const data = buffer.getChannelData(0);
            
            for (let i = 0; i < buffer.length; i++) {
                data[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3;
            }
            
            this.beepBuffer = buffer;
            console.log('Audio initialized successfully');
        } catch (error) {
            console.warn('Audio initialization failed:', error);
        }
    }

    playBeep() {
        if (this.settings.audioFeedback && this.audioContext && this.beepBuffer) {
            try {
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }
                
                const source = this.audioContext.createBufferSource();
                source.buffer = this.beepBuffer;
                source.connect(this.audioContext.destination);
                source.start();
                console.log('Beep played');
            } catch (error) {
                console.warn('Could not play beep:', error);
            }
        }
    }

    async requestCameraPermission() {
        console.log('Requesting camera permission...');
        
        this.hideElement('permissionRequest');
        this.hideElement('errorState');
        
        // Show loading state
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'cameraLoading';
        loadingDiv.className = 'loading-state';
        loadingDiv.innerHTML = `
            <div class="loading-spinner"></div>
            <p class="loading-text">Accessing camera...</p>
        `;
        
        const cameraView = document.querySelector('.camera-view');
        if (cameraView) {
            cameraView.appendChild(loadingDiv);
        }
        
        try {
            const constraints = {
                video: {
                    facingMode: this.currentCamera,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };

            console.log('Getting user media with constraints:', constraints);
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            const video = document.getElementById('scanner');
            if (video) {
                video.srcObject = this.stream;
                video.style.display = 'block';
                
                // Wait for video to load
                await new Promise((resolve, reject) => {
                    video.addEventListener('loadedmetadata', resolve, { once: true });
                    video.addEventListener('error', reject, { once: true });
                    setTimeout(reject, 5000); // timeout after 5 seconds
                });
                
                console.log('Video loaded successfully');
            }
            
            // Remove loading state
            const loading = document.getElementById('cameraLoading');
            if (loading) {
                loading.remove();
            }
            
            // Enable camera controls
            this.enableCameraControls();
            
            // Check for flash capability
            const track = this.stream.getVideoTracks()[0];
            const capabilities = track.getCapabilities();
            const flashBtn = document.getElementById('flashBtn');
            if (!capabilities.torch && flashBtn) {
                flashBtn.style.opacity = '0.5';
                flashBtn.title = 'Flash not available on this device';
                flashBtn.disabled = true;
            }
            
        } catch (error) {
            console.error('Camera permission error:', error);
            
            // Remove loading state
            const loading = document.getElementById('cameraLoading');
            if (loading) {
                loading.remove();
            }
            
            this.showError(`Camera access failed: ${error.message || 'Permission denied'}`);
        }
    }

    enableCameraControls() {
        const startBtn = document.getElementById('startBtn');
        const flashBtn = document.getElementById('flashBtn');
        const switchBtn = document.getElementById('switchCameraBtn');
        
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
        }
        if (flashBtn) {
            flashBtn.disabled = false;
            flashBtn.style.opacity = '1';
        }
        if (switchBtn) {
            switchBtn.disabled = false;
            switchBtn.style.opacity = '1';
        }
        
        console.log('Camera controls enabled');
    }

    async startScanning() {
        if (this.isScanning) return;
        
        console.log('Starting scan...');
        this.isScanning = true;
        
        // Update button states
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        if (startBtn) {
            startBtn.classList.add('hidden');
        }
        if (stopBtn) {
            stopBtn.classList.remove('hidden');
        }
        
        // Start simulated scanning since QuaggaJS might not work reliably in all environments
        this.startSimulatedScanning();
    }

    startSimulatedScanning() {
        console.log('Starting simulated scanning...');
        
        // Show visual feedback that scanning is active
        const scanOverlay = document.querySelector('.scan-overlay');
        if (scanOverlay) {
            scanOverlay.style.opacity = '1';
        }
        
        // Simulate a barcode detection after 3 seconds for demo
        this.scanTimeout = setTimeout(() => {
            if (this.isScanning) {
                const sampleResult = {
                    codeResult: {
                        code: '012345678905',
                        format: 'UPC-A'
                    },
                    line: [
                        { x: 100, y: 200 },
                        { x: 300, y: 200 }
                    ]
                };
                this.handleDetection(sampleResult);
            }
        }, 3000);
        
        console.log('Simulated scanning started - will detect sample barcode in 3 seconds');
    }

    stopScanning() {
        if (!this.isScanning) return;
        
        console.log('Stopping scan...');
        this.isScanning = false;
        
        // Clear any pending scan timeout
        if (this.scanTimeout) {
            clearTimeout(this.scanTimeout);
        }
        
        // Update button states
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        if (stopBtn) {
            stopBtn.classList.add('hidden');
        }
        if (startBtn) {
            startBtn.classList.remove('hidden');
        }
        
        // Hide scan overlay
        const scanOverlay = document.querySelector('.scan-overlay');
        if (scanOverlay) {
            scanOverlay.style.opacity = '0.7';
        }
        
        // Stop QuaggaJS if it was initialized
        if (typeof Quagga !== 'undefined') {
            try {
                Quagga.stop();
                Quagga.offDetected();
                Quagga.offProcessed();
            } catch (error) {
                console.warn('Error stopping Quagga:', error);
            }
        }
        
        // Clear canvas
        const canvas = document.getElementById('scannerCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    async handleDetection(result) {
        if (!result || !result.codeResult || !result.codeResult.code) return;
        
        const code = result.codeResult.code;
        const format = result.codeResult.format || 'Unknown';
        
        console.log('Code detected:', code, format);
        
        // Play audio feedback
        this.playBeep();
        
        // Show visual feedback
        this.showDetectionFeedback(result);
        
        // Stop scanning temporarily
        this.stopScanning();
        
        // Process the scan
        await this.processScan(code, format);
    }

    showDetectionFeedback(result) {
        const feedback = document.getElementById('detectionFeedback');
        const box = feedback?.querySelector('.detection-box');
        
        if (result.line && feedback && box) {
            const video = document.getElementById('scanner');
            const videoRect = video?.getBoundingClientRect();
            
            if (videoRect) {
                const scaleX = videoRect.width / (video.videoWidth || 640);
                const scaleY = videoRect.height / (video.videoHeight || 480);
                
                const x = result.line[0].x * scaleX;
                const y = result.line[0].y * scaleY;
                const width = Math.abs(result.line[1].x - result.line[0].x) * scaleX;
                const height = 40;
                
                box.style.left = `${x}px`;
                box.style.top = `${y - height/2}px`;
                box.style.width = `${width}px`;
                box.style.height = `${height}px`;
                
                feedback.classList.remove('hidden');
                
                setTimeout(() => {
                    feedback.classList.add('hidden');
                }, 1000);
            }
        }
    }

    async processScan(code, format) {
        const scanData = {
            code,
            format,
            timestamp: new Date().toISOString(),
            product: null
        };
        
        console.log('Processing scan:', scanData);
        
        // Add to history
        this.addToHistory(scanData);
        
        // Show results panel
        this.showResults(scanData);
        
        // Search for product if enabled
        if (this.settings.autoSearch) {
            await this.searchProduct(code, format);
        }
    }

    async searchProduct(code, format) {
        console.log('Searching for product:', code, format);
        
        try {
            let productData = await this.searchGeneral(code);
            this.displayProductInfo(productData);
        } catch (error) {
            console.error('Product search failed:', error);
            this.displayProductError();
        }
    }

    async searchGeneral(code) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    name: `Sample Product (${code})`,
                    brand: 'Sample Brand',
                    description: 'This is a sample product for demonstration purposes.',
                    source: 'Demo Database',
                    url: `https://www.google.com/search?q=${encodeURIComponent(code)}`
                });
            }, 1500);
        });
    }

    displayProductInfo(productData) {
        const productInfo = document.getElementById('productInfo');
        if (!productInfo) return;
        
        if (!productData) {
            productInfo.innerHTML = `
                <div class="product-card">
                    <h4>No Product Information Found</h4>
                    <p>We couldn't find details for this product. You can try searching manually.</p>
                    <div class="product-links">
                        <a href="https://www.google.com/search?q=${encodeURIComponent(document.getElementById('scannedCode')?.textContent || '')}" target="_blank">Search Google</a>
                    </div>
                </div>
            `;
            return;
        }
        
        productInfo.innerHTML = `
            <div class="product-card">
                <h4>${productData.name}</h4>
                ${productData.brand ? `<p><strong>Brand:</strong> ${productData.brand}</p>` : ''}
                ${productData.description ? `<p><strong>Description:</strong> ${productData.description}</p>` : ''}
                <p><strong>Source:</strong> ${productData.source}</p>
                <div class="product-links">
                    <a href="${productData.url}" target="_blank">View Details</a>
                    <a href="https://www.google.com/search?q=${encodeURIComponent(productData.name)}" target="_blank">Search More</a>
                </div>
            </div>
        `;
        
        // Update history with product info
        if (this.scanHistory.length > 0) {
            this.scanHistory[0].product = productData.name;
            this.saveHistory();
        }
    }

    displayProductError() {
        const productInfo = document.getElementById('productInfo');
        if (productInfo) {
            productInfo.innerHTML = `
                <div class="product-card">
                    <h4>Search Error</h4>
                    <p>There was an error searching for product information. Please check your internet connection and try again.</p>
                </div>
            `;
        }
    }

    showResults(scanData) {
        const scannedCodeEl = document.getElementById('scannedCode');
        const codeFormatEl = document.getElementById('codeFormat');
        const scanTimeEl = document.getElementById('scanTime');
        
        if (scannedCodeEl) scannedCodeEl.textContent = scanData.code;
        if (codeFormatEl) codeFormatEl.textContent = scanData.format;
        if (scanTimeEl) scanTimeEl.textContent = new Date(scanData.timestamp).toLocaleString();
        
        // Show loading in product info
        const productInfo = document.getElementById('productInfo');
        if (productInfo) {
            productInfo.innerHTML = `
                <div class="product-loading">
                    <div class="loading-spinner"></div>
                    <p>Searching for product details...</p>
                </div>
            `;
        }
        
        const resultsPanel = document.getElementById('resultsPanel');
        if (resultsPanel) {
            resultsPanel.classList.add('show');
            console.log('Results panel shown');
        }
    }

    hideResults() {
        const resultsPanel = document.getElementById('resultsPanel');
        if (resultsPanel) {
            resultsPanel.classList.remove('show');
        }
    }

    scanAgain() {
        this.hideResults();
        setTimeout(() => {
            if (this.cameraAvailable) {
                this.startScanning();
            } else {
                this.showManualModal();
            }
        }, 300);
    }

    async copyCode() {
        const codeElement = document.getElementById('scannedCode');
        if (!codeElement) return;
        
        const code = codeElement.textContent;
        try {
            await navigator.clipboard.writeText(code);
            this.showCopyFeedback();
        } catch (error) {
            console.error('Failed to copy code:', error);
            this.fallbackCopy(code);
        }
    }

    showCopyFeedback() {
        const btn = document.getElementById('copyCodeBtn');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            btn.style.backgroundColor = 'var(--color-success)';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.backgroundColor = '';
            }, 2000);
        }
    }

    fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            this.showCopyFeedback();
        } catch (err) {
            console.error('Fallback copy failed:', err);
        }
        
        document.body.removeChild(textArea);
    }

    addToHistory(scanData) {
        this.scanHistory.unshift(scanData);
        if (this.scanHistory.length > 50) {
            this.scanHistory = this.scanHistory.slice(0, 50);
        }
        this.saveHistory();
    }

    saveHistory() {
        this.saveToStorage('scanHistory', JSON.stringify(this.scanHistory));
    }

    updateHistoryDisplay() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;
        
        if (this.scanHistory.length === 0) {
            historyList.innerHTML = '<p class="empty-history">No scans yet. Start scanning to see your history here.</p>';
            return;
        }
        
        historyList.innerHTML = this.scanHistory.map((scan, index) => `
            <div class="history-item" onclick="app.showHistoryDetails(${index})">
                <div class="history-item__header">
                    <span class="history-item__code">${scan.code}</span>
                    <span class="history-item__format">${scan.format}</span>
                </div>
                <div class="history-item__time">${new Date(scan.timestamp).toLocaleString()}</div>
                ${scan.product ? `<p class="history-item__product">${scan.product}</p>` : ''}
            </div>
        `).join('');
    }

    showHistoryDetails(index) {
        const scan = this.scanHistory[index];
        if (scan) {
            this.hideModal('historyModal');
            this.showResults(scan);
            if (scan.product) {
                this.displayProductInfo({
                    name: scan.product,
                    source: 'History',
                    url: `https://www.google.com/search?q=${encodeURIComponent(scan.product)}`
                });
            }
        }
    }

    clearHistory() {
        if (confirm('Are you sure you want to clear all scan history?')) {
            this.scanHistory = [];
            this.saveHistory();
            this.updateHistoryDisplay();
        }
    }

    showHistoryModal() {
        this.updateHistoryDisplay();
        this.showModal('historyModal');
    }

    showSettingsModal() {
        this.loadSettings();
        this.showModal('settingsModal');
    }

    showManualModal() {
        this.showModal('manualModal');
        const manualCodeInput = document.getElementById('manualCode');
        if (manualCodeInput) {
            setTimeout(() => manualCodeInput.focus(), 100);
        }
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            console.log(`Modal ${modalId} shown`);
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    submitManualCode() {
        const codeInput = document.getElementById('manualCode');
        const formatSelect = document.getElementById('manualFormat');
        
        if (!codeInput || !formatSelect) return;
        
        const code = codeInput.value.trim();
        const format = formatSelect.value;
        
        if (!code) {
            alert('Please enter a barcode or QR code');
            codeInput.focus();
            return;
        }
        
        console.log('Manual code submitted:', code, format);
        
        this.hideModal('manualModal');
        this.processScan(code, format);
        
        // Clear form
        codeInput.value = '';
        formatSelect.value = 'UPC-A';
    }

    loadSettings() {
        const settings = [
            { id: 'audioFeedback', key: 'audioFeedback' },
            { id: 'autoSearch', key: 'autoSearch' },
            { id: 'formatUPC', key: 'formats.UPC' },
            { id: 'formatEAN', key: 'formats.EAN' },
            { id: 'formatCode128', key: 'formats.Code128' },
            { id: 'formatCode39', key: 'formats.Code39' },
            { id: 'formatQR', key: 'formats.QR' }
        ];
        
        settings.forEach(setting => {
            const element = document.getElementById(setting.id);
            if (element) {
                const keys = setting.key.split('.');
                let value = this.settings;
                for (const key of keys) {
                    value = value[key];
                }
                element.checked = value;
            }
        });
    }

    saveSettings() {
        const elements = {
            audioFeedback: document.getElementById('audioFeedback'),
            autoSearch: document.getElementById('autoSearch'),
            formatUPC: document.getElementById('formatUPC'),
            formatEAN: document.getElementById('formatEAN'),
            formatCode128: document.getElementById('formatCode128'),
            formatCode39: document.getElementById('formatCode39'),
            formatQR: document.getElementById('formatQR')
        };
        
        this.settings = {
            audioFeedback: elements.audioFeedback?.checked ?? true,
            autoSearch: elements.autoSearch?.checked ?? true,
            formats: {
                UPC: elements.formatUPC?.checked ?? true,
                EAN: elements.formatEAN?.checked ?? true,
                Code128: elements.formatCode128?.checked ?? true,
                Code39: elements.formatCode39?.checked ?? true,
                QR: elements.formatQR?.checked ?? true
            }
        };
        
        this.saveToStorage('scannerSettings', JSON.stringify(this.settings));
        console.log('Settings saved:', this.settings);
    }

    async toggleFlash() {
        if (!this.stream) return;
        
        try {
            const track = this.stream.getVideoTracks()[0];
            const capabilities = track.getCapabilities();
            
            if (capabilities.torch) {
                this.flashEnabled = !this.flashEnabled;
                await track.applyConstraints({
                    advanced: [{ torch: this.flashEnabled }]
                });
                
                const btn = document.getElementById('flashBtn');
                if (btn) {
                    btn.style.opacity = this.flashEnabled ? '1' : '0.6';
                    btn.title = this.flashEnabled ? 'Turn off flash' : 'Turn on flash';
                }
            }
        } catch (error) {
            console.error('Flash toggle failed:', error);
        }
    }

    async switchCamera() {
        if (!this.stream) return;
        
        this.currentCamera = this.currentCamera === 'environment' ? 'user' : 'environment';
        
        // Stop current stream
        this.stream.getTracks().forEach(track => track.stop());
        
        // Request new stream with different camera
        await this.requestCameraPermission();
    }

    showError(message) {
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) {
            errorMessage.textContent = message;
        }
        this.showElement('errorState');
        this.hideElement('permissionRequest');
        
        // Add manual entry button to error state if not present
        const errorActions = document.querySelector('.error-actions');
        if (errorActions && !errorActions.querySelector('#errorManualBtn')) {
            const manualBtn = document.createElement('button');
            manualBtn.id = 'errorManualBtn';
            manualBtn.className = 'btn btn--outline';
            manualBtn.textContent = 'Use Manual Entry';
            manualBtn.onclick = () => this.showManualModal();
            errorActions.appendChild(manualBtn);
        }
    }

    showElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.remove('hidden');
        }
    }

    hideElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.add('hidden');
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Barcode Scanner App...');
    window.app = new BarcodeScanner();
});

// Handle page visibility changes to manage camera
document.addEventListener('visibilitychange', () => {
    if (window.app && document.hidden) {
        window.app.stopScanning();
    }
});

// Handle page unload to clean up resources
window.addEventListener('beforeunload', () => {
    if (window.app?.stream) {
        window.app.stream.getTracks().forEach(track => track.stop());
    }
});