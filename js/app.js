/**
 * PDF Creator Pro - Main Application Logic
 */

class PDFCreatorApp {
    constructor() {
        this.files = [];
        this.currentTab = 'files';
        this.currentPDF = null;
        this.currentPDFUrl = null;
        this.thumbnailUrls = [];
        this.deferredPrompt = null;

        this.fileHandler = new FileHandler();
        this.pdfEngine = new PDFEngine();

        this.cacheElements();
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.setupCameraLongPress();
        this.registerServiceWorker();
        this.setupInstallPrompt();
    }

    cacheElements() {
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.cameraInput = document.getElementById('cameraInput');
        this.addFilesBtn = document.getElementById('addFilesBtn');

        this.fileList = document.getElementById('fileList');
        this.fileItems = document.getElementById('fileItems');
        this.fileCount = document.getElementById('fileCount');
        this.clearAllBtn = document.getElementById('clearAllBtn');

        this.settings = document.getElementById('settings');
        this.pageSizeGroup = document.getElementById('pageSizeGroup');
        this.qualityGroup = document.getElementById('qualityGroup');
        this.orientationGroup = document.getElementById('orientationGroup');
        this.marginSlider = document.getElementById('marginSlider');
        this.marginValue = document.getElementById('marginValue');
        this.pageNumbers = document.getElementById('pageNumbers');
        this.compressImages = document.getElementById('compressImages');
        this.watermark = document.getElementById('watermark');
        this.docTitle = document.getElementById('docTitle');

        this.createSection = document.getElementById('createSection');
        this.createPdfBtn = document.getElementById('createPdfBtn');

        this.progressOverlay = document.getElementById('progressOverlay');
        this.progressTitle = document.getElementById('progressTitle');
        this.progressMessage = document.getElementById('progressMessage');
        this.progressFill = document.getElementById('progressFill');
        this.cancelBtn = document.getElementById('cancelBtn');

        this.resultSection = document.getElementById('resultSection');
        this.resultMessage = document.getElementById('resultMessage');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.shareBtn = document.getElementById('shareBtn');

        this.navItems = document.querySelectorAll('.nav-item');
    }

    setupEventListeners() {
        // File selection
        this.addFilesBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
        this.cameraInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        // File list actions
        this.clearAllBtn.addEventListener('click', () => this.clearAllFiles());

        // Settings chips
        this.setupChipGroup(this.pageSizeGroup, (value) => {
            this.pdfEngine.pageSize = value;
        });
        this.setupChipGroup(this.qualityGroup, (value) => {
            this.pdfEngine.quality = value;
        });
        this.setupChipGroup(this.orientationGroup, (value) => {
            this.pdfEngine.orientation = value;
        });

        // Margin slider
        this.marginSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.pdfEngine.margin = value;
            this.marginValue.textContent = `${value}pt`;
        });

        // Advanced options
        this.pageNumbers.addEventListener('change', (e) => {
            this.pdfEngine.pageNumbers = e.target.checked;
        });
        this.compressImages.addEventListener('change', (e) => {
            this.pdfEngine.compressImages = e.target.checked;
        });
        this.watermark.addEventListener('input', (e) => {
            this.pdfEngine.watermark = e.target.value.trim() || null;
        });
        this.docTitle.addEventListener('input', (e) => {
            this.pdfEngine.metadata.title = e.target.value.trim();
        });

        // Create PDF
        this.createPdfBtn.addEventListener('click', () => this.createPDF());
        this.cancelBtn.addEventListener('click', () => this.cancelCreation());

        // Result actions
        this.downloadBtn.addEventListener('click', () => this.downloadPDF());
        this.shareBtn.addEventListener('click', () => this.sharePDF());

        // Bottom nav
        this.navItems.forEach((item) => {
            item.addEventListener('click', () => this.switchTab(item.dataset.tab));
        });
    }

    setupChipGroup(group, onChange) {
        const chips = group.querySelectorAll('.chip');
        chips.forEach((chip) => {
            chip.addEventListener('click', () => {
                chips.forEach((c) => c.classList.remove('active'));
                chip.classList.add('active');
                onChange(chip.dataset.value);
            });
        });
    }

    setupDragAndDrop() {
        ['dragover', 'dragenter'].forEach((evt) => {
            this.dropZone.addEventListener(evt, (e) => {
                e.preventDefault();
                this.dropZone.classList.add('drag-active');
            });
        });

        ['dragleave', 'dragend'].forEach((evt) => {
            this.dropZone.addEventListener(evt, () => {
                this.dropZone.classList.remove('drag-active');
            });
        });

        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('drag-active');
            this.handleFiles(e.dataTransfer.files);
        });

        // Prevent the whole page from navigating away if a file is
        // dropped outside the drop zone.
        ['dragover', 'drop'].forEach((evt) => {
            document.body.addEventListener(evt, (e) => e.preventDefault());
        });
    }

    /**
     * Hold anywhere on the drop zone to open the camera.
     * The previous version listened for a 'long-press' event, which
     * doesn't exist as a native DOM event and so never fired. This uses
     * real pointer events with a timer instead. A quick tap (e.g. on the
     * "Add Files" button inside the drop zone) cancels the timer before
     * it completes, so it doesn't interfere with normal taps.
     */
    setupCameraLongPress() {
        let pressTimer = null;
        const LONG_PRESS_MS = 550;

        const start = () => {
            pressTimer = setTimeout(() => {
                pressTimer = null;
                this.cameraInput.click();
            }, LONG_PRESS_MS);
        };
        const cancel = () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        this.dropZone.addEventListener('pointerdown', start);
        this.dropZone.addEventListener('pointerup', cancel);
        this.dropZone.addEventListener('pointerleave', cancel);
        this.dropZone.addEventListener('pointercancel', cancel);
    }

    async handleFiles(fileList) {
        const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'svg', 'bmp', 'gif', 'pdf'];
        const newFiles = Array.from(fileList).filter((file) => {
            const ext = file.name.split('.').pop().toLowerCase();
            return validExtensions.includes(ext);
        });

        if (newFiles.length === 0) {
            this.showSnackbar('No supported files selected');
            return;
        }

        if (newFiles.length < fileList.length) {
            this.showSnackbar(`${fileList.length - newFiles.length} unsupported file(s) skipped`);
        }

        this.files.push(...newFiles);
        this.updateFileList();
        this.fileInput.value = '';
        this.cameraInput.value = '';
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
        this.files = [];
        this.updateFileList();
    }

    /**
     * Refreshes fileItems.innerHTML from the current this.files array
     * and rewires its listeners, WITHOUT touching section visibility.
     * Kept separate from updateFileList() so switchTab('files') can call
     * this to restore the real list after the History tab has
     * temporarily replaced fileItems.innerHTML with history entries.
     */
    renderFileItemsContent() {
        // Revoke previous thumbnail object URLs before creating new ones,
        // otherwise every add/remove/reorder leaks one URL per image.
        this.thumbnailUrls.forEach((url) => URL.revokeObjectURL(url));
        this.thumbnailUrls = [];

        this.fileCount.textContent = this.files.length;
        this.fileItems.innerHTML = this.files
            .map((file, index) => this.createFileItem(file, index))
            .join('');
        this.attachFileItemListeners();
    }

    updateFileList() {
        this.renderFileItemsContent();

        const hasFiles = this.files.length > 0;
        this.fileList.style.display = hasFiles ? 'block' : 'none';
        this.settings.style.display = hasFiles ? 'block' : 'none';
        this.createSection.style.display = hasFiles ? 'block' : 'none';
    }

    createFileItem(file, index) {
        const size = this.formatFileSize(file.size);
        const ext = file.name.split('.').pop().toUpperCase();

        let thumbnailHtml = `<div class="file-thumbnail-placeholder">${ext}</div>`;
        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            this.thumbnailUrls.push(url);
            thumbnailHtml = `<img src="${url}" class="file-thumbnail" alt="${file.name}">`;
        }

        return `
            <div class="file-item">
                ${thumbnailHtml}
                <div class="file-info">
                    <div class="file-name">${this.escapeHtml(file.name)}</div>
                    <div class="file-meta">${size}</div>
                </div>
                <div class="file-actions">
                    <button class="move-up" data-index="${index}" aria-label="Move up" ${index === 0 ? 'disabled' : ''}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>
                    </button>
                    <button class="move-down" data-index="${index}" aria-label="Move down" ${index === this.files.length - 1 ? 'disabled' : ''}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                    <button class="remove-file" data-index="${index}" aria-label="Remove">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * These handlers previously read e.target.dataset.index. Since each
     * button contains a nested <svg> icon, tapping the icon itself made
     * e.target the SVG (with no dataset.index), producing NaN and
     * silently acting on index 0 regardless of which row was tapped.
     * e.currentTarget is always the button the listener is attached to,
     * so it's correct no matter what nested element the tap actually hit.
     */
    attachFileItemListeners() {
        this.fileItems.querySelectorAll('.remove-file').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index, 10);
                this.removeFile(index);
            });
        });
        this.fileItems.querySelectorAll('.move-up').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index, 10);
                this.moveFile(index, -1);
            });
        });
        this.fileItems.querySelectorAll('.move-down').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index, 10);
                this.moveFile(index, 1);
            });
        });
    }

    escapeHtml(str) {
        return str.replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    switchTab(tab) {
        this.currentTab = tab;

        this.navItems.forEach((item) => {
            item.classList.toggle('active', item.dataset.tab === tab);
        });

        switch (tab) {
            case 'files':
                this.dropZone.style.display = 'block';
                this.fileList.style.display = this.files.length > 0 ? 'block' : 'none';
                this.settings.style.display = 'none';
                // Restore the real file list content in case History
                // overwrote fileItems.innerHTML.
                this.renderFileItemsContent();
                break;
            case 'settings':
                this.dropZone.style.display = 'none';
                this.fileList.style.display = 'none';
                this.settings.style.display = this.files.length > 0 ? 'block' : 'none';
                break;
            case 'history':
                this.dropZone.style.display = 'none';
                this.fileList.style.display = 'block';
                this.settings.style.display = 'none';
                this.showHistory();
                break;
        }
    }

    showHistory() {
        const history = JSON.parse(localStorage.getItem('pdfHistory') || '[]');

        if (history.length === 0) {
            this.fileItems.innerHTML = '<div class="file-item"><div class="file-info"><div class="file-name">No history yet</div></div></div>';
            this.fileCount.textContent = 0;
            return;
        }

        this.fileCount.textContent = history.length;
        this.fileItems.innerHTML = history.map((entry) => `
            <div class="file-item">
                <div class="file-thumbnail-placeholder">PDF</div>
                <div class="file-info">
                    <div class="file-name">${this.escapeHtml(entry.name)}</div>
                    <div class="file-meta">${entry.files} file(s) · ${this.formatFileSize(entry.size)} · ${new Date(entry.date).toLocaleDateString()}</div>
                </div>
            </div>
        `).join('');
    }

    async createPDF() {
        if (this.files.length === 0) return;

        this.progressOverlay.style.display = 'flex';
        this.progressFill.style.width = '0%';
        this.cancelled = false;

        try {
            const pdfBytes = await this.pdfEngine.createPDF(this.files, (percent, message) => {
                if (this.cancelled) throw new Error('Cancelled');
                this.progressFill.style.width = `${percent}%`;
                this.progressMessage.textContent = message;
            });

            if (this.cancelled) return;

            this.currentPDF = new Blob([pdfBytes], { type: 'application/pdf' });
            if (this.currentPDFUrl) URL.revokeObjectURL(this.currentPDFUrl);
            this.currentPDFUrl = URL.createObjectURL(this.currentPDF);

            this.saveToHistory();

            this.progressOverlay.style.display = 'none';
            this.resultSection.style.display = 'block';
            this.resultMessage.textContent = `${this.files.length} file(s) combined · ${this.formatFileSize(this.currentPDF.size)}`;
        } catch (error) {
            this.progressOverlay.style.display = 'none';
            if (error.message !== 'Cancelled') {
                console.error('PDF creation failed:', error);
                this.showSnackbar('Failed to create PDF: ' + error.message);
            }
        }
    }

    cancelCreation() {
        this.cancelled = true;
        this.progressOverlay.style.display = 'none';
    }

    /**
     * Sanitizes the document title into a safe filename and guarantees a
     * .pdf extension. Previously downloadPDF/saveToHistory/sharePDF each
     * used this.docTitle.value directly with no extension check, so a
     * title like "My Notes" downloaded as a file with no .pdf suffix.
     */
    getOutputFilename() {
        let name = (this.docTitle.value || 'document').trim();
        name = name.replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/_+/g, '_') || 'document';
        if (!/\.pdf$/i.test(name)) name += '.pdf';
        return name;
    }

    downloadPDF() {
        if (!this.currentPDFUrl) return;

        const a = document.createElement('a');
        a.href = this.currentPDFUrl;
        a.download = this.getOutputFilename();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        this.showSnackbar('PDF saved to device');
    }

    async sharePDF() {
        if (!this.currentPDF) return;

        const filename = this.getOutputFilename();

        if (navigator.share && navigator.canShare) {
            try {
                const file = new File([this.currentPDF], filename, { type: 'application/pdf' });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: 'Share PDF',
                        text: 'Created with PDF Creator Pro'
                    });
                    return;
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Share failed:', error);
                }
                return;
            }
        }

        // Fallback: just download it
        this.downloadPDF();
    }

    saveToHistory() {
        const history = JSON.parse(localStorage.getItem('pdfHistory') || '[]');
        history.unshift({
            date: new Date().toISOString(),
            files: this.files.length,
            size: this.currentPDF.size,
            name: this.getOutputFilename()
        });
        if (history.length > 20) history.pop();
        localStorage.setItem('pdfHistory', JSON.stringify(history));
    }

    showSnackbar(message) {
        const existing = document.querySelector('.snackbar');
        if (existing) existing.remove();

        const snackbar = document.createElement('div');
        snackbar.className = 'snackbar';
        snackbar.textContent = message;
        document.body.appendChild(snackbar);

        setTimeout(() => snackbar.remove(), 3000);
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').catch((err) => {
                    console.error('Service worker registration failed:', err);
                });
            });
        }
    }

    setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallPrompt();
        });
    }

    showInstallPrompt() {
        if (document.querySelector('.install-banner')) return;

        const banner = document.createElement('div');
        banner.className = 'install-banner';
        banner.innerHTML = `
            <p>Install PDF Creator Pro for quick access</p>
            <button class="btn btn-primary" id="installBtn">Install</button>
        `;
        document.body.appendChild(banner);

        banner.querySelector('#installBtn').addEventListener('click', async () => {
            banner.remove();
            if (!this.deferredPrompt) return;
            this.deferredPrompt.prompt();
            await this.deferredPrompt.userChoice;
            this.deferredPrompt = null;
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.pdfApp = new PDFCreatorApp();
});
