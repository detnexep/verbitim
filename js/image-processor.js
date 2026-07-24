/**
 * Image Processing & Optimization Engine
 * Handles image manipulation, EXIF rotation, and format conversions
 */

class ImageProcessor {
    constructor() {
        this.maxDimension = 4096; // Max pixel dimension for mobile
        this.jpegQuality = 0.92;  // Default JPEG quality
    }

    /**
     * Load image from various sources
     */
    async loadImage(source) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            
            if (source instanceof File || source instanceof Blob) {
                img.src = URL.createObjectURL(source);
            } else if (typeof source === 'string') {
                img.src = source;
            } else if (source instanceof ArrayBuffer) {
                const blob = new Blob([source]);
                img.src = URL.createObjectURL(blob);
            }
        });
    }

    /**
     * Get image dimensions without fully loading
     */
    async getImageDimensions(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(img.src);
                resolve({ width: img.width, height: img.height });
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * Read EXIF orientation from JPEG
     */
    async getExifOrientation(file) {
        try {
            const buffer = await file.arrayBuffer();
            const view = new DataView(buffer);
            
            // Check JPEG header
            if (view.getUint16(0, false) !== 0xFFD8) {
                return 1; // Not a JPEG
            }
            
            let offset = 2;
            const length = view.byteLength;
            
            // Find EXIF marker (0xFFE1)
            while (offset < length) {
                if (view.getUint8(offset) !== 0xFF) {
                    return 1; // Invalid marker
                }
                
                const marker = view.getUint8(offset + 1);
                
                if (marker === 0xE1) {
                    // EXIF data found
                    return this.parseExifOrientation(view, offset + 4);
                }
                
                // Skip to next marker
                offset += 2 + view.getUint16(offset + 2, false);
            }
            
            return 1; // No EXIF found
        } catch (error) {
            console.warn('Error reading EXIF:', error);
            return 1;
        }
    }

    /**
     * Parse orientation from EXIF data
     */
    parseExifOrientation(view, offset) {
        // Check EXIF header
        const exifHeader = view.getUint32(offset, false);
        if (exifHeader !== 0x45786966) { // 'Exif'
            return 1;
        }
        
        // Skip TIFF header
        const tiffOffset = offset + 6;
        const isBigEndian = view.getUint16(tiffOffset, false) === 0x4D4D;
        
        // Get IFD0 offset
        const ifdOffset = view.getUint32(tiffOffset + 4, !isBigEndian) + tiffOffset;
        
        // Parse IFD entries
        const entries = view.getUint16(ifdOffset, !isBigEndian);
        
        for (let i = 0; i < entries; i++) {
            const entryOffset = ifdOffset + 2 + i * 12;
            
            if (view.getUint16(entryOffset, !isBigEndian) === 0x0112) {
                // Orientation tag found
                return view.getUint16(entryOffset + 8, !isBigEndian);
            }
        }
        
        return 1;
    }

    /**
     * Apply EXIF rotation to canvas
     */
    applyOrientation(canvas, orientation) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        switch (orientation) {
            case 1:
                // Normal - no transformation
                break;
            case 2:
                // Flip horizontal
                ctx.translate(width, 0);
                ctx.scale(-1, 1);
                break;
            case 3:
                // Rotate 180
                ctx.translate(width, height);
                ctx.rotate(Math.PI);
                break;
            case 4:
                // Flip vertical
                ctx.translate(0, height);
                ctx.scale(1, -1);
                break;
            case 5:
                // Flip horizontal and rotate 270
                ctx.rotate(0.5 * Math.PI);
                ctx.scale(1, -1);
                break;
            case 6:
                // Rotate 90
                ctx.rotate(0.5 * Math.PI);
                ctx.translate(0, -height);
                break;
            case 7:
                // Flip horizontal and rotate 90
                ctx.rotate(-0.5 * Math.PI);
                ctx.translate(-width, height);
                ctx.scale(1, -1);
                break;
            case 8:
                // Rotate 270
                ctx.rotate(-0.5 * Math.PI);
                ctx.translate(-width, 0);
                break;
            default:
                break;
        }
    }

    /**
     * Get rotated dimensions based on orientation
     */
    getRotatedDimensions(width, height, orientation) {
        if (orientation >= 5 && orientation <= 8) {
            return { width: height, height: width };
        }
        return { width, height };
    }

    /**
     * Resize image if too large
     */
    async resizeIfNeeded(file, maxDimension = null) {
        const maxDim = maxDimension || this.maxDimension;
        const img = await this.loadImage(file);
        
        if (img.width <= maxDim && img.height <= maxDim) {
            return file; // No resize needed
        }
        
        // Calculate new dimensions
        let newWidth, newHeight;
        if (img.width > img.height) {
            newWidth = maxDim;
            newHeight = Math.round((img.height / img.width) * maxDim);
        } else {
            newHeight = maxDim;
            newWidth = Math.round((img.width / img.height) * maxDim);
        }
        
        // Create canvas and resize
        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        
        // Convert back to blob
        const blob = await new Promise(resolve => 
            canvas.toBlob(resolve, file.type || 'image/jpeg', this.jpegQuality)
        );
        
        return new File([blob], file.name, { type: blob.type });
    }

    /**
     * Convert image to JPEG with quality setting
     */
    async convertToJPEG(file, quality = 0.92) {
        const img = await this.loadImage(file);
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        
        // Fill with white background for transparent images
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        const blob = await new Promise(resolve => 
            canvas.toBlob(resolve, 'image/jpeg', quality)
        );
        
        return blob;
    }

    /**
     * Convert image to PNG (lossless)
     */
    async convertToPNG(file) {
        const img = await this.loadImage(file);
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        const blob = await new Promise(resolve => 
            canvas.toBlob(resolve, 'image/png')
        );
        
        return blob;
    }

    /**
     * Create thumbnail for preview
     */
    async createThumbnail(file, size = 150) {
        const img = await this.loadImage(file);
        
        // Calculate thumbnail dimensions
        let thumbWidth, thumbHeight;
        if (img.width > img.height) {
            thumbWidth = size;
            thumbHeight = Math.round((img.height / img.width) * size);
        } else {
            thumbHeight = size;
            thumbWidth = Math.round((img.width / img.height) * size);
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = thumbWidth;
        canvas.height = thumbHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);
        
        return canvas.toDataURL('image/jpeg', 0.7);
    }

    /**
     * Optimize image for PDF embedding
     */
    async optimizeForPDF(file) {
        // Check format
        const ext = file.name.split('.').pop().toLowerCase();
        
        // JPEG and PNG can be used directly if no rotation needed
        if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
            const orientation = await this.getExifOrientation(file);
            if (orientation === 1) {
                return file; // No optimization needed
            }
            
            // Need to rotate
            const img = await this.loadImage(file);
            const dims = this.getRotatedDimensions(img.width, img.height, orientation);
            
            const canvas = document.createElement('canvas');
            canvas.width = dims.width;
            canvas.height = dims.height;
            
            const ctx = canvas.getContext('2d');
            this.applyOrientation(canvas, orientation);
            ctx.drawImage(img, 0, 0);
            
            const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
            const quality = ext === 'png' ? 1.0 : this.jpegQuality;
            
            const blob = await new Promise(resolve => 
                canvas.toBlob(resolve, mimeType, quality)
            );
            
            return new File([blob], file.name, { type: mimeType });
        }
        
        // Other formats: convert to PNG for lossless quality
        return await this.convertToPNG(file);
    }

    /**
     * Detect if image has transparency
     */
    hasTransparency(img) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Check alpha channel
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 255) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Apply watermark to canvas
     */
    applyWatermark(canvas, text, options = {}) {
        const ctx = canvas.getContext('2d');
        const {
            fontSize = Math.min(canvas.width, canvas.height) * 0.05,
            fontFamily = 'Arial, sans-serif',
            color = 'rgba(128, 128, 128, 0.3)',
            angle = -45,
            repeat = true
        } = options;
        
        ctx.save();
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        if (repeat) {
            // Tiled watermark
            const spacing = fontSize * 4;
            ctx.rotate(angle * Math.PI / 180);
            
            for (let y = -canvas.height; y < canvas.height * 2; y += spacing) {
                for (let x = -canvas.width; x < canvas.width * 2; x += spacing) {
                    ctx.fillText(text, x, y);
                }
            }
        } else {
            // Single centered watermark
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(angle * Math.PI / 180);
            ctx.fillText(text, 0, 0);
        }
        
        ctx.restore();
    }

    /**
     * Compress image using quality setting
     */
    async compressImage(file, quality) {
        const img = await this.loadImage(file);
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        const blob = await new Promise(resolve => 
            canvas.toBlob(resolve, 'image/jpeg', quality)
        );
        
        return blob;
    }

    /**
     * Get image format from file
     */
    async detectFormat(file) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer.slice(0, 12));
        
        // Check magic bytes
        if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'jpeg';
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png';
        if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
        if (bytes[0] === 0x42 && bytes[1] === 0x4D) return 'bmp';
        if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
            if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'webp';
        }
        
        // Check for HEIC/HEIF
        if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
            const type = String.fromCharCode(...bytes.slice(8, 12));
            if (type.includes('heic') || type.includes('heif') || type.includes('mif1')) return 'heic';
        }
        
        return 'unknown';
    }

    /**
     * Create a blank canvas with specified color
     */
    createBlankCanvas(width, height, color = '#FFFFFF') {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, width, height);
        
        return canvas;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageProcessor;
}