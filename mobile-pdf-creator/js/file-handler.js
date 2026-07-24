/**
 * File Management System
 * Handles file validation, organization, and processing queue
 */

class FileHandler {
    constructor() {
        this.supportedFormats = {
            images: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'svg', 'bmp', 'gif', 'tiff', 'tif'],
            documents: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'],
            text: ['txt', 'rtf', 'html', 'htm']
        };
        
        this.maxFileSize = 100 * 1024 * 1024; // 100MB max per file
        this.maxTotalSize = 500 * 1024 * 1024; // 500MB total
        this.fileIcons = this.createFileIcons();
    }

    /**
     * Validate and filter supported files
     */
    validateFiles(fileList) {
        const validFiles = [];
        const errors = [];
        
        for (const file of Array.from(fileList)) {
            const validation = this.validateFile(file);
            if (validation.valid) {
                validFiles.push(file);
            } else {
                errors.push({ file: file.name, error: validation.error });
            }
        }
        
        return { validFiles, errors };
    }

    /**
     * Validate a single file
     */
    validateFile(file) {
        // Check file size
        if (file.size === 0) {
            return { valid: false, error: 'Empty file' };
        }
        
        if (file.size > this.maxFileSize) {
            return { 
                valid: false, 
                error: `File too large (max ${this.formatSize(this.maxFileSize)})` 
            };
        }
        
        // Check format
        const extension = this.getExtension(file.name);
        const format = this.getFormatCategory(extension);
        
        if (!format) {
            return { valid: false, error: 'Unsupported format' };
        }
        
        return { valid: true, format, extension };
    }

    /**
     * Get file extension
     */
    getExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }

    /**
     * Get format category
     */
    getFormatCategory(extension) {
        for (const [category, formats] of Object.entries(this.supportedFormats)) {
            if (formats.includes(extension)) {
                return category;
            }
        }
        return null;
    }

    /**
     * Organize files by type
     */
    organizeByType(files) {
        const organized = {
            images: [],
            documents: [],
            text: [],
            unknown: []
        };
        
        for (const file of files) {
            const extension = this.getExtension(file.name);
            const category = this.getFormatCategory(extension);
            
            if (category) {
                organized[category].push(file);
            } else {
                organized.unknown.push(file);
            }
        }
        
        return organized;
    }

    /**
     * Sort files by name, date, or size
     */
    sortFiles(files, sortBy = 'name') {
        const sortedFiles = [...files];
        
        switch (sortBy) {
            case 'name':
                sortedFiles.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'date':
                sortedFiles.sort((a, b) => b.lastModified - a.lastModified);
                break;
            case 'size':
                sortedFiles.sort((a, b) => b.size - a.size);
                break;
            case 'type':
                sortedFiles.sort((a, b) => {
                    const extA = this.getExtension(a.name);
                    const extB = this.getExtension(b.name);
                    return extA.localeCompare(extB);
                });
                break;
        }
        
        return sortedFiles;
    }

    /**
     * Generate file preview data
     */
    async generatePreview(file) {
        const extension = this.getExtension(file.name);
        const category = this.getFormatCategory(extension);
        
        const preview = {
            name: file.name,
            size: this.formatSize(file.size),
            type: extension.toUpperCase(),
            category: category,
            icon: this.getFileIcon(extension, category),
            thumbnail: null,
            lastModified: file.lastModified,
            path: file.webkitRelativePath || null
        };
        
        // Generate thumbnail for images
        if (category === 'images') {
            try {
                preview.thumbnail = await this.createImageThumbnail(file);
            } catch (error) {
                console.warn('Could not create thumbnail:', error);
            }
        }
        
        return preview;
    }

    /**
     * Create image thumbnail
     */
    async createImageThumbnail(file, maxSize = 150) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // Calculate thumbnail size
                let width, height;
                if (img.width > img.height) {
                    width = maxSize;
                    height = (img.height / img.width) * maxSize;
                } else {
                    height = maxSize;
                    width = (img.width / img.height) * maxSize;
                }
                
                // Create canvas
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                resolve(canvas.toDataURL('image/jpeg', 0.7));
                URL.revokeObjectURL(img.src);
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * Get appropriate icon for file type
     */
    getFileIcon(extension, category) {
        // SVG icons for different file types
        const icons = {
            pdf: `<svg viewBox="0 0 24 24" fill="#EA4335"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-1.5v2H13V7h1.5c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/></svg>`,
            image: `<svg viewBox="0 0 24 24" fill="#4285F4"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,
            document: `<svg viewBox="0 0 24 24" fill="#34A853"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
            text: `<svg viewBox="0 0 24 24" fill="#FBBC04"><path d="M14 17H4v2h10v-2zm6-8H4v2h16V9zM4 15h16v-2H4v2zM4 5v2h16V5H4z"/></svg>`,
            unknown: `<svg viewBox="0 0 24 24" fill="#9AA0A6"><path d="M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z"/></svg>`
        };
        
        return icons[category] || icons.unknown;
    }

    /**
     * Create file icons mapping
     */
    createFileIcons() {
        return {
            jpg: 'image',
            jpeg: 'image',
            png: 'image',
            webp: 'image',
            heic: 'image',
            heif: 'image',
            svg: 'image',
            bmp: 'image',
            gif: 'image',
            tiff: 'image',
            tif: 'image',
            pdf: 'pdf',
            doc: 'document',
            docx: 'document',
            ppt: 'document',
            pptx: 'document',
            xls: 'document',
            xlsx: 'document',
            txt: 'text',
            rtf: 'text',
            html: 'text',
            htm: 'text'
        };
    }

    /**
     * Format file size for display
     */
    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * Calculate total size of files
     */
    getTotalSize(files) {
        return files.reduce((total, file) => total + file.size, 0);
    }

    /**
     * Check if total size exceeds limit
     */
    exceedsTotalLimit(files) {
        return this.getTotalSize(files) > this.maxTotalSize;
    }

    /**
     * Get file count by type
     */
    getFileCountByType(files) {
        const counts = {
            images: 0,
            documents: 0,
            text: 0,
            unknown: 0,
            total: files.length
        };
        
        for (const file of files) {
            const extension = this.getExtension(file.name);
            const category = this.getFormatCategory(extension);
            
            if (category) {
                counts[category]++;
            } else {
                counts.unknown++;
            }
        }
        
        return counts;
    }

    /**
     * Read file as text (for SVG, HTML, etc.)
     */
    async readAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    /**
     * Read file as ArrayBuffer
     */
    async readAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Read file as Data URL
     */
    async readAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Create a downloadable file from blob
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Get mime type from file extension
     */
    getMimeType(extension) {
        const mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'bmp': 'image/bmp',
            'tiff': 'image/tiff',
            'tif': 'image/tiff',
            'heic': 'image/heic',
            'heif': 'image/heif',
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'txt': 'text/plain',
            'html': 'text/html',
            'htm': 'text/html'
        };
        
        return mimeTypes[extension] || 'application/octet-stream';
    }

    /**
     * Sanitize filename for download
     */
    sanitizeFilename(filename) {
        return filename
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 200);
    }

    /**
     * Generate unique filename
     */
    generateUniqueFilename(baseName, existingFiles) {
        let counter = 1;
        let name = baseName;
        
        while (existingFiles.some(f => f.name === name)) {
            const ext = baseName.split('.').pop();
            const base = baseName.substring(0, baseName.lastIndexOf('.'));
            name = `${base}_${counter}.${ext}`;
            counter++;
        }
        
        return name;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileHandler;
}
;