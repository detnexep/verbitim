 /**
 * Main Application Controller
 * Handles UI interactions and app flow
 */

class App {
    constructor() {
        this.files = [];
        this.pdfEngine = new PDFEngine();
        this.currentTab = 'files';
        this.init();
    }
    
    init() {
        this.setupElements();
        this.setupEventListeners();
        this.registerServiceWorker();
        this.loadHistory();
    }
    
    setupElements() {
        // Main elements
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.cameraInput = document.getElementById('cameraInput');
        this.fileList = document.getElementById('fileList');
        this.fileItems = document.getElementById('fileItems');
        this.settings = document.getElementById('settings');
        this.createSection = document.getElementById('createSection');
        this.progressOverlay = document.getElementById('progressOverlay');
        this.resultSection = document.getElementById('resultSection');
        
        // Buttons
        this.addFilesBtn = document.getElementById('addFilesBtn');
        this.clearAllBtn = document.getElementById('clearAllBtn');
        this.createPdfBtn = document.getElementById('createPdfBtn');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.shareBtn = document.getElementById('shareBtn');
        
        // Settings
        this.pageSizeGroup = document.getElementById('pageSizeGroup');
        this.qualityGroup = document.getElementById('qualityGroup');
        this.orientationGroup = document.getElementById('orientationGroup');
        this.marginSlider = document.getElementById('marginSlider');
        this.pageNumbers = document.getElementById('pageNumbers');
        this.compressImages = document.getElementById('compressImages');
        this.watermark = document.getElementById('watermark');
        this.docTitle = document.getElementById('docTitle');
        
        // Progress
        this.progressFill = document.getElementById('progressFill');
        this.progressTitle = document.getElementById('progressTitle');
        this.progressMessage = document.getElementById('progressMessage');
    }
    
    setupEventListeners() {
        // File input
        this.addFilesBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
        
        // Camera
        this.dropZone.addEventListener('long-press', () => this.cameraInput.click());
        
        // Drag and drop
        this.setupDragAndDrop();
        
        // Clear all
        this.clearAllBtn.addEventListener('click', () => this.clearAllFiles());
        
        // Create PDF
        this.createPdfBtn.addEventListener('click', () => this.createPDF());
        
        // Cancel
        this.cancelBtn.addEventListener('click', () => this.cancelCreation());
        
        // Download
        this.downloadBtn.addEventListener('click', () => this.downloadPDF());
        
        // Share
        this.shareBtn.addEventListener('click', () => this.sharePDF());
        
        // Settings chips
        this.setupChipGroups();
        
        // Range slider
        this.marginSlider.addEventListener('input', (e) => {
            document.getElementById('marginValue').textContent = `${e.target.value}pt`;
            this.pdfEngine.margin = parseInt(e.target.value);
        });
        
        // Toggles
        this.pageNumbers.addEventListener('change', (e) => {
            this.pdfEngine.pageNumbers = e.target.checked;
        });
        
        this.compressImages.addEventListener('change', (e) => {
            this.pdfEngine.compressImages = e.target.checked;
        });
        
        // Text inputs
        this.watermark.addEventListener('input', (e) => {
            this.pdfEngine.watermark = e.target.value || null;
        });
        
        this.docTitle.addEventListener('input', (e) => {
            this.pdfEngine.metadata.title = e.target.value;
        });
        
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => this.switchTab(e.currentTarget.dataset.tab));
        });
        
        // Add to home screen prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            this.installPrompt = e;
            this.showInstallPrompt();
        });
    }
    
    setupDragAndDrop() {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.body.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        
        // Highlight drop zone
        ['dragenter', 'dragover'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => {
                this.dropZone.classList.add('drag-active');
            });
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => {
                this.dropZone.classList.remove('drag-active');
            });
        });
        
        // Handle dropped files
        this.dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            this.handleFiles(files);
        });
    }
    
    setupChipGroups() {
        // Page size
        this.pageSizeGroup.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.pageSizeGroup.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.pdfEngine.pageSize = chip.dataset.value;
            });
        });
        
        // Quality
        this.qualityGroup.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.qualityGroup.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.pdfEngine.quality = chip.dataset.value;
            });
        });
        
        // Orientation
        this.orientationGroup.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.orientationGroup.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.pdfEngine.orientation = chip.dataset.value;
            });
        });
    }
    
    handleFiles(fileList) {
        const newFiles = Array.from(fileList).filter(file => {
            // Filter supported files
            const ext = file.name.split('.').pop().toLowerCase();
            const supported = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'svg', 'bmp', 'gif', 'pdf'];
            return supported.includes(ext);
        });
        
        if (newFiles.length === 0) {
            this.showSnackbar('No supported files selected');
            return;
        }
        
        this.files.push(...newFiles);
        this.updateFileList();
        this.showSnackbar(`Added ${newFiles.length} file(s)`);
    }
    
    updateFileList() {
        if (this.files.length === 0) {
            this.fileList.style.display = 'none';
            this.settings.style.display = 'none';
            this.createSection.style.display = 'none';
            return;
        }
        
        this.fileList.style.display = 'block';
        this.settings.style.display = 'block';
        this.createSection.style.display = 'block';
        
        document.getElementById('fileCount').textContent = this.files.length;
        
        this.fileItems.innerHTML = this.files.map((file, index) => this.createFileItem(file, index)).join('');
        
        // Add event listeners to file action buttons
        this.fileItems.querySelectorAll('.remove-file').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.removeFile(index);
            });
        });
        
        this.fileItems.querySelectorAll('.move-up').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.moveFile(index, -1);
            });
        });
        
        this.fileItems.querySelectorAll('.move-down').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.moveFile(index, 1);
            });
        });
    }
    
    createFileItem(file, index) {
        const size = this.formatFileSize(file.size);
        const ext = file.name.split('.').pop().toUpperCase();
        
        // Create thumbnail if it's an image
        let thumbnailHtml = `<div class="file-thumbnail-placeholder">${ext}</div>`;
        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            thumbnailHtml = `<img src="${url}" class="file-thumbnail" alt="${file.name}">`;
        }
        
        return `
            <div class="file-item">
                ${thumbnailHtml}
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-meta">${size} · ${ext}</div>
                </div>
                <div class="file-actions">
                    <button class="move-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
                        </svg>
                    </button>
                    <button class="move-down" data-index="${index}" ${index === this.files.length - 1 ? 'disabled' : ''}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
                        </svg>
                    </button>
                    <button class="remove-file" data-index="${index}">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }
    
    removeFile(index) {
        this.files.splice(index, 1);
        this.updateFileList();
    }
    
    moveFile(index, direction) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.files.length) return;
        
        [this.files[index], this.files[newIndex]] = [this.files[newIndex], this.files[index]];
        this.updateFileList();
    }
    
    clearAllFiles() {
        if (this.files.length === 0) return;
        
        if (confirm('Remove all files?')) {
            this.files = [];
            this.updateFileList();
        }
    }
    
    async createPDF() {
        if (this.files.length === 0) {
            this.showSnackbar('Please add files first');
            return;
        }
        
        // Show progress
        this.progressOverlay.style.display = 'flex';
        this.resultSection.style.display = 'none';
        
        try {
            const pdfBytes = await this.pdfEngine.createPDF(
                this.files,
                (progress, message) => this.updateProgress(progress, message)
            );
            
            // Store the PDF for download
            this.currentPDF = new Blob([pdfBytes], { type: 'application/pdf' });
            this.currentPDFUrl = URL.createObjectURL(this.currentPDF);
            
            // Save to history
            this.saveToHistory();
            
            // Show result
            this.progressOverlay.style.display = 'none';
            this.resultSection.style.display = 'block';
            
            const size = this.formatFileSize(this.currentPDF.size);
            document.getElementById('resultMessage').textContent = 
                `Created PDF with ${this.files.length} page(s) · ${size}`;
            
            // Auto-download on mobile
            if (this.isMobile()) {
                this.downloadPDF();
            }
            
        } catch (error) {
            this.progressOverlay.style.display = 'none';
            this.showSnackbar('Error: ' + error.message);
            console.error('PDF creation error:', error);
        }
    }
    
    updateProgress(percentage, message) {
        this.progressFill.style.width = percentage + '%';
        this.progressMessage.textContent = message;
        
        if (percentage >= 100) {
            this.progressTitle.textContent = 'Complete!';
        }
    }
    
    cancelCreation() {
        // In a real implementation, this would cancel the PDF creation
        this.progressOverlay.style.display = 'none';
    }
    
    downloadPDF() {
        if (!this.currentPDFUrl) return;
        
        const a = document.createElement('a');
        a.href = this.currentPDFUrl;
        a.download = this.docTitle.value || 'document.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        this.showSnackbar('PDF saved to device');
    }
    
    async sharePDF() {
        if (!this.currentPDF) return;
        
        if (navigator.share) {
            try {
                await navigator.share({
                    files: [new File([this.currentPDF], 'document.pdf', { type: 'application/pdf' })],
                    title: 'Share PDF',
                    text: 'Created with PDF Creator Pro'
                });
            } catch (error) {
                console.log('Share failed:', error);
            }
        } else {
            this.downloadPDF();
            this.showSnackbar('Sharing not supported - PDF downloaded instead');
        }
    }
    
    switchTab(tab) {
        this.currentTab = tab;
        
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.tab === tab);
        });
        
        // Show/hide sections based on tab
        switch (tab) {
            case 'files':
                this.dropZone.style.display = 'block';
                this.fileList.style.display = this.files.length > 0 ? 'block' : 'none';
                this.settings.style.display = 'none';
                break;
            case 'settings':
                this.dropZone.style.display = 'none';
                this.fileList.style.display = 'none';
                this.settings.style.display = 'block';
                break;
            case 'history':
                this.dropZone.style.display = 'none';
                this.fileList.style.display = 'none';
                this.settings.style.display = 'none';
                this.showHistory();
                break;
        }
    }
    
    saveToHistory() {
        const history = JSON.parse(localStorage.getItem('pdfHistory') || '[]');
        history.unshift({
            date: new Date().toISOString(),
            files: this.files.length,
            size: this.currentPDF.size,
            name: this.docTitle.value || 'document.pdf'
        });
        
        // Keep last 20 items
        if (history.length > 20) history.pop();
        
        localStorage.setItem('pdfHistory', JSON.stringify(history));
    }
    
    loadHistory() {
        const history = JSON.parse(localStorage.getItem('pdfHistory') || '[]');
        this.history = history;
    }
    
    showHistory() {
        // Create history view
        const historyHtml = this.history.map(item => `
            <div class="file-item">
                <div class="file-info">
                    <div class="file-name">${item.name}</div>
                    <div class="file-meta">${new Date(item.date).toLocaleDateString()} · ${item.files} files · ${this.formatFileSize(item.size)}</div>
                </div>
            </div>
        `).join('');
        
        if (historyHtml) {
            this.fileItems.innerHTML = historyHtml;
            this.fileList.style.display = 'block';
        } else {
            this.fileList.style.display = 'none';
            this.showSnackbar('No PDFs created yet');
        }
    }
    
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('sw.js');
                console.log('Service worker registered');
            } catch (error) {
                console.log('Service worker registration failed:', error);
            }
        }
    }
    
    showInstallPrompt() {
        // Show install button or banner
        const installBanner = document.createElement('div');
        installBanner.className = 'install-banner';
        installBanner.innerHTML = `
            <p>Install this app on your device</p>
            <button class="btn btn-primary" id="installBtn">Install</button>
        `;
        
        document.body.appendChild(installBanner);
        
        document.getElementById('installBtn').addEventListener('click', async () => {
            if (this.installPrompt) {
                await this.installPrompt.prompt();
                const result = await this.installPrompt.userChoice;
                console.log('Install result:', result);
                this.installPrompt = null;
                installBanner.remove();
            }
        });
    }
    
    showSnackbar(message) {
        const snackbar = document.createElement('div');
        snackbar.className = 'snackbar';
        snackbar.textContent = message;
        document.body.appendChild(snackbar);
        
        setTimeout(() => {
            snackbar.remove();
        }, 3000);
    }
    
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    
    isMobile() {
        return /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
