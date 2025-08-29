class BarcodeScanner {
    constructor() {
        this.isScanning = false;
        this.stream = null;
        this.currentCamera = 'environment';
        this.flashEnabled = false;
        this.codeReader = null;
        this.detectionHistory = [];
        this.lastDetectedCode = null;
        this.detectionCount = 0;
        this.scanStartTime = 0;
        this.frameCount = 0;
        this.debugMode = false;
        
        // Settings with real detection requirements
        this.settings = this.loadSettings() || {
            audioFeedback: true,
            autoSearch: true,
            requireMultipleDetections: true,
            minDetections: 2,
            detectionTimeout: 2000,
            formats: {
                UPC: true,
                EAN: true,
                Code128: true,
                Code39: true,
                QR: true,
                DataMatrix: true
            }
        };
        
        this.scanHistory = this.loadHistory() || [];
        this.supportedFormats = ['UPC-A', 'UPC-E', 'EAN-13', 'EAN-8', 'Code-128', 'Code-39', 'QR Code', 'Data Matrix', 'ITF', 'Codabar'];
        this.audioContext = null;
        this.beepBuffer = null;
        this.cameraAvailable = false;
        
        // Initialize immediately
        setTimeout(() => {
            this.initializeApp();
            this.bindEvents();
            this.initializeAudio();
        }, 100);
    }

    loadSettings() {
        try {
            const settings = localStorage.getItem('scannerSettings');
            return settings ? JSON.parse(settings) : null;
        } catch (error) {
            console.warn('Could not load settings:', error);
            return null;
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('scannerSettings', JSON.stringify(this.settings));
        } catch (error) {
            console.warn('Could not save settings:', error);
        }
    }

    loadHistory() {
        try {
            const history = localStorage.getItem('scanHistory');
            return history ? JSON.parse(history) : null;
        } catch (error) {
            console.warn('Could not load history:', error);
            return null;
        }
    }

    saveHistory() {
        try {
            localStorage.setItem('scanHistory', JSON.stringify(this.scanHistory));
        } catch (error) {
            console.warn('Could not save history:', error);
        }
    }

    async initializeApp() {
        console.log('Initializing Barcode Scanner...');
        
        // Initialize ZXing in background
        this.initializeZXing();
        
        // Check camera availability
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('Camera not supported');
            this.showCameraUnavailable();
            return;
        }

        try {
            // Show permission request by default
            this.showElement('permissionRequest');
            this.hideElement('errorState');
            this.cameraAvailable = true;
            
            console.log('App initialized, showing permission request');
        } catch (error) {
            console.warn('Initialization error:', error);
            this.showElement('permissionRequest');
        }
        
        this.loadSettingsUI();
    }

    async initializeZXing() {
        try {
            // Try to load ZXing dynamically if not available
            if (typeof ZXing === 'undefined') {
                await this.loadZXingLibrary();
            }
            
            if (typeof ZXing !== 'undefined') {
                const { BrowserMultiFormatReader } = ZXing;
                this.codeReader = new BrowserMultiFormatReader();
                console.log('ZXing initialized successfully');
            } else {
                console.warn('ZXing not available, using fallback detection');
            }
        } catch (error) {
            console.error('Failed to initialize ZXing:', error);
        }
    }

    async loadZXingLibrary() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/@zxing/library@latest/umd/index.min.js';
            script.onload = () => {
                console.log('ZXing library loaded dynamically');
                resolve();
            };
            script.onerror = () => {
                console.warn('Failed to load ZXing library');
                resolve(); // Don't reject, continue without ZXing
            };
            document.head.appendChild(script);
        });
    }

    showCameraUnavailable() {
        this.hideElement('permissionRequest');
        this.hideElement('errorState');
        
        const cameraView = document.querySelector('.camera-view');
        if (cameraView) {
            cameraView.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; background-color: var(--color-bg-1); color: var(--color-text); padding: var(--space-32);">
                    <h3>Camera Not Available</h3>
                    <p style="text-align: center; margin-bottom: var(--space-16);">Your device doesn't have a camera or camera access is not supported.</p>
                    <button class="btn btn--primary" id="fallbackManualBtn">Manual Entry</button>
                </div>
            `;
            
            // Bind the fallback manual button
            const fallbackBtn = document.getElementById('fallbackManualBtn');
            if (fallbackBtn) {
                fallbackBtn.addEventListener('click', () => this.showManualModal());
            }
        }
        
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
        this.bindEvent('debugToggleBtn', 'click', () => this.toggleDebug());

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
        this.bindEvent('manualCode', 'keypress', (e) => {
            if (e.key === 'Enter') {
                this.submitManualCode();
            }
        });

        // Settings changes
        ['audioFeedback', 'autoSearch', 'requireMultipleDetections', 'formatUPC', 'formatEAN', 'formatCode128', 'formatCode39', 'formatQR', 'formatDataMatrix'].forEach(id => {
            this.bindEvent(id, 'change', () => this.updateSettings());
        });

        // Close modals on background click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });

        console.log('Event binding completed');
    }

    bindEvent(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, handler);
            console.log(`Event bound: ${elementId} -> ${event}`);
        } else {
            console.warn(`Element not found: ${elementId}`);
        }
    }

    async initializeAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            const sampleRate = this.audioContext.sampleRate;
            const duration = 0.2;
            const frequency = 800;
            const buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
            const data = buffer.getChannelData(0);
            
            for (let i = 0; i < buffer.length; i++) {
                data[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3;
            }
            
            this.beepBuffer = buffer;
            console.log('Audio initialized');
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
            } catch (error) {
                console.warn('Could not play beep:', error);
            }
        }
    }

    async requestCameraPermission() {
        console.log('Requesting camera permission...');
        
        this.hideElement('permissionRequest');
        this.hideElement('errorState');
        this.showLoadingState('Accessing camera...');
        
        try {
            const constraints = {
                video: {
                    facingMode: this.currentCamera,
                    width: { ideal: 1280, min: 640 },
                    height: { ideal: 720, min: 480 }
                }
            };

            console.log('Getting user media with constraints:', constraints);
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            const video = document.getElementById('scanner');
            if (video) {
                video.srcObject = this.stream;
                video.style.display = 'block';
                
                await new Promise((resolve, reject) => {
                    video.addEventListener('loadedmetadata', resolve, { once: true });
                    video.addEventListener('error', reject, { once: true });
                    setTimeout(() => reject(new Error('Video load timeout')), 5000);
                });
                
                console.log('Video loaded successfully');
            }
            
            this.hideLoadingState();
            this.enableCameraControls();
            this.checkFlashCapability();
            
        } catch (error) {
            console.error('Camera permission error:', error);
            this.hideLoadingState();
            this.showError(`Camera access failed: ${error.message || 'Permission denied'}`);
        }
    }

    showLoadingState(message) {
        const loadingState = document.getElementById('loadingState');
        if (loadingState) {
            const loadingText = loadingState.querySelector('.loading-text');
            if (loadingText) loadingText.textContent = message;
            loadingState.classList.remove('hidden');
        }
    }

    hideLoadingState() {
        const loadingState = document.getElementById('loadingState');
        if (loadingState) {
            loadingState.classList.add('hidden');
        }
    }

    enableCameraControls() {
        const controls = ['startBtn', 'flashBtn', 'switchCameraBtn'];
        controls.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        });
    }

    checkFlashCapability() {
        if (!this.stream) return;
        
        const track = this.stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();
        const flashBtn = document.getElementById('flashBtn');
        
        if (!capabilities.torch && flashBtn) {
            flashBtn.style.opacity = '0.5';
            flashBtn.title = 'Flash not available on this device';
            flashBtn.disabled = true;
        }
    }

    async startScanning() {
        if (this.isScanning) return;
        
        console.log('Starting barcode scanning...');
        this.isScanning = true;
        this.detectionHistory = [];
        this.detectionCount = 0;
        this.scanStartTime = Date.now();
        this.frameCount = 0;
        
        // Update UI
        this.toggleScanButtons(true);
        
        try {
            const video = document.getElementById('scanner');
            if (!video || !video.srcObject) {
                throw new Error('Video stream not available');
            }

            // Start scanning loop
            this.scanLoop();
            
            // Update debug info
            if (this.debugMode) {
                this.updateDebugInfo();
                this.debugInterval = setInterval(() => this.updateDebugInfo(), 500);
            }
            
            console.log('Barcode scanning started');
        } catch (error) {
            console.error('Failed to start scanning:', error);
            this.stopScanning();
            this.showError(`Failed to start scanning: ${error.message}`);
        }
    }

    async scanLoop() {
        if (!this.isScanning) return;
        
        try {
            const video = document.getElementById('scanner');
            const canvas = document.getElementById('scannerCanvas');
            
            if (!video || !canvas) return;
            
            // Set canvas size to match video
            canvas.width = video.videoWidth || video.clientWidth;
            canvas.height = video.videoHeight || video.clientHeight;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Try ZXing detection if available
            if (this.codeReader) {
                try {
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const result = await this.codeReader.decodeFromImageData(imageData);
                    
                    if (result && result.getText()) {
                        this.handleDetection(result);
                        return; // Stop scanning after successful detection
                    }
                } catch (decodeError) {
                    // No barcode found in this frame, continue
                }
            }
            
            this.frameCount++;
            
            // Continue scanning
            if (this.isScanning) {
                requestAnimationFrame(() => this.scanLoop());
            }
        } catch (error) {
            console.error('Scan loop error:', error);
            if (this.isScanning) {
                requestAnimationFrame(() => this.scanLoop());
            }
        }
    }

    handleDetection(result) {
        const code = result.getText();
        const format = result.getBarcodeFormat ? result.getBarcodeFormat().toString() : 'Unknown';
        
        console.log('Raw detection:', code, format);
        
        // Update debug info
        this.lastDetectedCode = code;
        this.updateDebugDisplay();
        
        // Add to detection history for confirmation
        this.detectionHistory.push({
            code,
            format,
            timestamp: Date.now()
        });
        
        // Keep only recent detections
        const cutoff = Date.now() - this.settings.detectionTimeout;
        this.detectionHistory = this.detectionHistory.filter(d => d.timestamp > cutoff);
        
        // Check if we have enough consistent detections
        const codeMatches = this.detectionHistory.filter(d => d.code === code);
        
        if (this.settings.requireMultipleDetections) {
            if (codeMatches.length >= this.settings.minDetections) {
                this.confirmDetection(code, format);
            }
        } else {
            this.confirmDetection(code, format);
        }
    }

    confirmDetection(code, format) {
        console.log('Confirmed detection:', code, format);
        
        this.playBeep();
        this.showDetectionFeedback();
        this.stopScanning();
        this.processScan(code, format);
    }

    showDetectionFeedback() {
        const feedback = document.getElementById('detectionFeedback');
        if (feedback) {
            feedback.classList.remove('hidden');
            setTimeout(() => {
                feedback.classList.add('hidden');
            }, 1000);
        }
    }

    stopScanning() {
        if (!this.isScanning) return;
        
        console.log('Stopping scan...');
        this.isScanning = false;
        
        if (this.debugInterval) {
            clearInterval(this.debugInterval);
            this.debugInterval = null;
        }
        
        this.toggleScanButtons(false);
        
        // Clear canvas
        const canvas = document.getElementById('scannerCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    toggleScanButtons(scanning) {
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        if (startBtn && stopBtn) {
            if (scanning) {
                startBtn.classList.add('hidden');
                stopBtn.classList.remove('hidden');
            } else {
                stopBtn.classList.add('hidden');
                startBtn.classList.remove('hidden');
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
        
        this.addToHistory(scanData);
        this.showResults(scanData);
        
        if (this.settings.autoSearch) {
            await this.searchProduct(code, format);
        }
    }

    async searchProduct(code, format) {
        console.log('Searching for product:', code, format);
        
        try {
            let productData = null;
            
            // Try Open Food Facts for numeric codes
            if (this.isValidUPCorEAN(code)) {
                productData = await this.searchOpenFoodFacts(code);
            }
            
            // If no result, create fallback
            if (!productData) {
                productData = this.createFallbackResult(code);
            }
            
            this.displayProductInfo(productData, code);
        } catch (error) {
            console.error('Product search failed:', error);
            this.displayProductError(code);
        }
    }

    isValidUPCorEAN(code) {
        return /^\d{8,14}$/.test(code);
    }

    async searchOpenFoodFacts(code) {
        try {
            const url = `https://world.openfoodfacts.org/api/v0/product/${code}.json`;
            console.log('Searching Open Food Facts:', url);
            
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            if (data.status === 1 && data.product) {
                const product = data.product;
                return {
                    name: product.product_name || product.product_name_en || 'Unknown Product',
                    brand: product.brands || 'Unknown Brand',
                    description: this.truncateText(product.ingredients_text_en || product.ingredients_text || ''),
                    image: product.image_url || product.image_front_url || null,
                    source: 'Open Food Facts',
                    sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
                    categories: product.categories || '',
                    nutritionGrades: product.nutrition_grades || null,
                    labels: product.labels || ''
                };
            }
        } catch (error) {
            console.error('Open Food Facts search failed:', error);
        }
        return null;
    }

    createFallbackResult(code) {
        return {
            name: `Product Code: ${code}`,
            brand: 'Unknown',
            description: 'Product information not found in our database. Use the search links below to find more details.',
            source: 'Search Links',
            sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(code)}+barcode+product`,
            searchLinks: [
                {
                    name: 'Google Search',
                    url: `https://www.google.com/search?q=${encodeURIComponent(code)}+barcode+product`
                },
                {
                    name: 'Amazon Search',
                    url: `https://www.amazon.com/s?k=${encodeURIComponent(code)}`
                },
                {
                    name: 'UPC Database',
                    url: `https://www.upcitemdb.com/upc/${encodeURIComponent(code)}`
                }
            ]
        };
    }

    truncateText(text, maxLength = 200) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    displayProductInfo(productData, code) {
        const productInfo = document.getElementById('productInfo');
        if (!productInfo) return;
        
        if (!productData) {
            this.displayProductError(code);
            return;
        }
        
        let html = `<div class="product-card">`;
        
        if (productData.image) {
            html += `<img src="${productData.image}" alt="${productData.name}" class="product-image" onerror="this.style.display='none'">`;
        }
        
        html += `<h4>${this.escapeHtml(productData.name)}</h4>`;
        
        if (productData.brand && productData.brand !== 'Unknown') {
            html += `<p><strong>Brand:</strong> ${this.escapeHtml(productData.brand)}</p>`;
        }
        
        if (productData.description) {
            html += `<p><strong>Description:</strong> ${this.escapeHtml(productData.description)}</p>`;
        }
        
        if (productData.categories) {
            html += `<p><strong>Categories:</strong> ${this.escapeHtml(productData.categories)}</p>`;
        }
        
        if (productData.nutritionGrades) {
            html += `<p><strong>Nutrition Grade:</strong> ${productData.nutritionGrades.toUpperCase()}</p>`;
        }
        
        html += `<p><strong>Source:</strong> ${this.escapeHtml(productData.source)}</p>`;
        
        html += `<div class="product-links">`;
        
        if (productData.sourceUrl) {
            html += `<a href="${this.escapeHtml(productData.sourceUrl)}" target="_blank">View Original</a>`;
        }
        
        if (productData.searchLinks) {
            productData.searchLinks.forEach(link => {
                html += `<a href="${this.escapeHtml(link.url)}" target="_blank">${this.escapeHtml(link.name)}</a>`;
            });
        } else {
            html += `<a href="https://www.google.com/search?q=${encodeURIComponent(productData.name)}" target="_blank">Search Google</a>`;
        }
        
        html += `</div></div>`;
        
        productInfo.innerHTML = html;
        
        // Update history with product info
        if (this.scanHistory.length > 0) {
            this.scanHistory[0].product = productData.name;
            this.saveHistory();
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    displayProductError(code) {
        const productInfo = document.getElementById('productInfo');
        if (productInfo) {
            productInfo.innerHTML = `
                <div class="product-card api-error">
                    <h4>Product Search Failed</h4>
                    <p>Unable to find product information for code: ${this.escapeHtml(code)}</p>
                    <div class="product-links">
                        <a href="https://www.google.com/search?q=${encodeURIComponent(code)}+barcode+product" target="_blank">Search Google</a>
                        <a href="https://www.amazon.com/s?k=${encodeURIComponent(code)}" target="_blank">Search Amazon</a>
                        <a href="https://www.upcitemdb.com/upc/${encodeURIComponent(code)}" target="_blank">UPC Database</a>
                    </div>
                </div>
            `;
        }
    }

    showResults(scanData) {
        const elements = {
            scannedCode: document.getElementById('scannedCode'),
            codeFormat: document.getElementById('codeFormat'),
            scanTime: document.getElementById('scanTime'),
            productInfo: document.getElementById('productInfo')
        };
        
        if (elements.scannedCode) elements.scannedCode.textContent = scanData.code;
        if (elements.codeFormat) elements.codeFormat.textContent = scanData.format;
        if (elements.scanTime) elements.scanTime.textContent = new Date(scanData.timestamp).toLocaleString();
        
        if (elements.productInfo) {
            elements.productInfo.innerHTML = `
                <div class="product-loading">
                    <div class="loading-spinner"></div>
                    <p>Searching for product details...</p>
                </div>
            `;
        }
        
        const resultsPanel = document.getElementById('resultsPanel');
        if (resultsPanel) {
            resultsPanel.classList.add('show');
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
            if (this.cameraAvailable && this.stream) {
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
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            this.showCopyFeedback();
        } catch (err) {
            console.error('Copy failed:', err);
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

    toggleDebug() {
        this.debugMode = !this.debugMode;
        const debugInfo = document.getElementById('debugInfo');
        const debugBtn = document.getElementById('debugToggleBtn');
        
        if (debugInfo) {
            debugInfo.classList.toggle('hidden', !this.debugMode);
        }
        
        if (debugBtn) {
            debugBtn.style.opacity = this.debugMode ? '1' : '0.6';
        }
        
        if (this.debugMode) {
            this.updateDebugDisplay();
        }
    }

    updateDebugInfo() {
        const elapsed = (Date.now() - this.scanStartTime) / 1000;
        const fps = elapsed > 0 ? this.frameCount / elapsed : 0;
        
        this.updateDebugDisplay(fps);
    }

    updateDebugDisplay(fps = 0) {
        const elements = {
            debugLastCode: document.getElementById('debugLastCode'),
            debugCount: document.getElementById('debugCount'),
            debugRate: document.getElementById('debugRate')
        };
        
        if (elements.debugLastCode) elements.debugLastCode.textContent = this.lastDetectedCode || 'None';
        if (elements.debugCount) elements.debugCount.textContent = this.detectionHistory.length;
        if (elements.debugRate) elements.debugRate.textContent = `${fps.toFixed(1)} FPS`;
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
        this.stream.getTracks().forEach(track => track.stop());
        await this.requestCameraPermission();
    }

    showError(message) {
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) {
            errorMessage.textContent = message;
        }
        this.showElement('errorState');
        this.hideElement('permissionRequest');
    }

    // Modal and settings methods
    showHistoryModal() {
        this.updateHistoryDisplay();
        this.showModal('historyModal');
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
                    <span class="history-item__code">${this.escapeHtml(scan.code)}</span>
                    <span class="history-item__format">${this.escapeHtml(scan.format)}</span>
                </div>
                <div class="history-item__time">${new Date(scan.timestamp).toLocaleString()}</div>
                ${scan.product ? `<p class="history-item__product">${this.escapeHtml(scan.product)}</p>` : ''}
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
                    sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(scan.product)}`
                }, scan.code);
            }
        }
    }

    clearHistory() {
        if (confirm('Clear all scan history?')) {
            this.scanHistory = [];
            this.saveHistory();
            this.updateHistoryDisplay();
        }
    }

    showSettingsModal() {
        this.loadSettingsUI();
        this.showModal('settingsModal');
    }

    loadSettingsUI() {
        const checkboxes = {
            audioFeedback: this.settings.audioFeedback,
            autoSearch: this.settings.autoSearch,
            requireMultipleDetections: this.settings.requireMultipleDetections,
            formatUPC: this.settings.formats.UPC,
            formatEAN: this.settings.formats.EAN,
            formatCode128: this.settings.formats.Code128,
            formatCode39: this.settings.formats.Code39,
            formatQR: this.settings.formats.QR,
            formatDataMatrix: this.settings.formats.DataMatrix
        };
        
        Object.keys(checkboxes).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.checked = checkboxes[id];
            }
        });
    }

    updateSettings() {
        const elements = {
            audioFeedback: document.getElementById('audioFeedback'),
            autoSearch: document.getElementById('autoSearch'),
            requireMultipleDetections: document.getElementById('requireMultipleDetections'),
            formatUPC: document.getElementById('formatUPC'),
            formatEAN: document.getElementById('formatEAN'),
            formatCode128: document.getElementById('formatCode128'),
            formatCode39: document.getElementById('formatCode39'),
            formatQR: document.getElementById('formatQR'),
            formatDataMatrix: document.getElementById('formatDataMatrix')
        };
        
        this.settings = {
            audioFeedback: elements.audioFeedback?.checked ?? true,
            autoSearch: elements.autoSearch?.checked ?? true,
            requireMultipleDetections: elements.requireMultipleDetections?.checked ?? true,
            minDetections: 2,
            detectionTimeout: 2000,
            formats: {
                UPC: elements.formatUPC?.checked ?? true,
                EAN: elements.formatEAN?.checked ?? true,
                Code128: elements.formatCode128?.checked ?? true,
                Code39: elements.formatCode39?.checked ?? true,
                QR: elements.formatQR?.checked ?? true,
                DataMatrix: elements.formatDataMatrix?.checked ?? true
            }
        };
        
        this.saveSettings();
        console.log('Settings updated:', this.settings);
    }

    showManualModal() {
        console.log('Showing manual modal...');
        this.showModal('manualModal');
        const input = document.getElementById('manualCode');
        if (input) {
            setTimeout(() => input.focus(), 200);
        }
    }

    submitManualCode() {
        const codeInput = document.getElementById('manualCode');
        const formatSelect = document.getElementById('manualFormat');
        
        if (!codeInput || !formatSelect) {
            console.error('Manual input elements not found');
            return;
        }
        
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

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            console.log(`Modal ${modalId} shown`);
        } else {
            console.error(`Modal ${modalId} not found`);
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
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

// Initialize app when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Barcode Scanner...');
    
    // Initialize app
    window.app = new BarcodeScanner();
    
    console.log('Barcode Scanner initialized');
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (window.app && document.hidden && window.app.isScanning) {
        window.app.stopScanning();
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.app?.stream) {
        window.app.stream.getTracks().forEach(track => track.stop());
    }
});