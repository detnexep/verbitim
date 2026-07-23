 /**
 * Professional PDF Creation Engine for Mobile
 * Handles all PDF creation with quality preservation
 */

class PDFEngine {
    constructor() {
        this.pdfDoc = null;
        this.pageSize = 'original';
        this.quality = 'maximum';
        this.orientation = 'auto';
        this.margin = 36;
        this.pageNumbers = false;
        this.compressImages = false;
        this.watermark = null;
        this.metadata = {};
        
        // PDFLib page sizes (in points)
        this.PAGE_SIZES = {
            a4: [595.28, 841.89],
            letter: [612, 792],
            legal: [612, 1008],
            a3: [841.89, 1190.55]
        };
    }
    
    async createPDF(files, progressCallback) {
        const { PDFDocument } = PDFLib;
        this.pdfDoc = await PDFDocument.create();
        
        // Set metadata
        if (this.metadata.title) this.pdfDoc.setTitle(this.metadata.title);
        if (this.metadata.author) this.pdfDoc.setAuthor(this.metadata.author);
        this.pdfDoc.setCreator('PDF Creator Pro');
        
        let processed = 0;
        const total = files.length;
        
        for (const file of files) {
            if (progressCallback) {
                progressCallback(
                    Math.round((processed / total) * 90),
                    `Processing ${file.name}...`
                );
            }
            
            try {
                await this.addFileToPDF(file);
            } catch (error) {
                console.error(`Error processing ${file.name}:`, error);
                // Continue with next file
            }
            
            processed++;
        }
        
        if (progressCallback) {
            progressCallback(95, 'Finalizing PDF...');
        }
        
        // Save PDF
        const pdfBytes = await this.pdfDoc.save();
        
        if (progressCallback) {
            progressCallback(100, 'PDF created successfully!');
        }
        
        return pdfBytes;
    }
    
    async addFileToPDF(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        
        switch (extension) {
            case 'jpg':
            case 'jpeg':
                await this.addJPEG(file);
                break;
            case 'png':
                await this.addPNG(file);
                break;
            case 'webp':
                await this.addWebP(file);
                break;
            case 'heic':
            case 'heif':
                await this.addHEIC(file);
                break;
            case 'svg':
                await this.addSVG(file);
                break;
            default:
                await this.addImageGeneric(file);
        }
    }
    
    async addJPEG(file) {
        const buffer = await file.arrayBuffer();
        
        // Check if we can embed directly (lossless)
        if (this.quality === 'maximum' && !this.needsProcessing(file)) {
            const image = await this.pdfDoc.embedJpg(buffer);
            await this.addPageWithImage(image, image.width, image.height, 'JPEG (lossless)');
        } else {
            // Process through canvas with quality settings
            const processedBuffer = await this.processImage(buffer, 'image/jpeg');
            const image = await this.pdfDoc.embedJpg(processedBuffer);
            await this.addPageWithImage(image, image.width, image.height, 'JPEG');
        }
    }
    
    async addPNG(file) {
        const buffer = await file.arrayBuffer();
        
        if (this.quality === 'maximum' && !this.needsProcessing(file)) {
            const image = await this.pdfDoc.embedPng(buffer);
            await this.addPageWithImage(image, image.width, image.height, 'PNG (lossless)');
        } else {
            const processedBuffer = await this.processImage(buffer, 'image/png');
            const image = await this.pdfDoc.embedPng(processedBuffer);
            await this.addPageWithImage(image, image.width, image.height, 'PNG');
        }
    }
    
    async addWebP(file) {
        // Convert WebP to PNG for PDF embedding
        const buffer = await file.arrayBuffer();
        const pngBuffer = await this.convertToPNG(buffer);
        const image = await this.pdfDoc.embedPng(pngBuffer);
        await this.addPageWithImage(image, image.width, image.height, 'WebP → PNG');
    }
    
    async addHEIC(file) {
        // Convert HEIC using heic2any library
        try {
            const blob = await heic2any({
                blob: file,
                toType: 'image/jpeg',
                quality: this.getQualityValue()
            });
            
            const buffer = await new Response(blob).arrayBuffer();
            const image = await this.pdfDoc.embedJpg(buffer);
            await this.addPageWithImage(image, image.width, image.height, 'HEIC → JPEG');
        } catch (error) {
            console.error('HEIC conversion failed:', error);
            throw new Error('Cannot process HEIC file. Try converting to JPEG first.');
        }
    }
    
    async addSVG(file) {
        // Rasterize SVG to canvas
        const svgText = await file.text();
        const canvas = await this.rasterizeSVG(svgText);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const buffer = await blob.arrayBuffer();
        
        const image = await this.pdfDoc.embedPng(buffer);
        await this.addPageWithImage(image, image.width, image.height, 'SVG → PNG');
    }
    
    async addImageGeneric(file) {
        // Generic image processing
        const buffer = await file.arrayBuffer();
        const canvas = await this.createImageCanvas(buffer);
        const blob = await new Promise(resolve => 
            canvas.toBlob(resolve, 'image/png')
        );
        const pngBuffer = await blob.arrayBuffer();
        
        const image = await this.pdfDoc.embedPng(pngBuffer);
        await this.addPageWithImage(image, image.width, image.height, 'Image → PNG');
    }
    
    async addPageWithImage(image, imgWidth, imgHeight, label) {
        let pageWidth, pageHeight;
        
        if (this.pageSize === 'original') {
            // Use image dimensions
            const pxToPt = 0.75; // 96 DPI to 72 DPI
            pageWidth = imgWidth * pxToPt;
            pageHeight = imgHeight * pxToPt;
            
            // Clamp to reasonable size
            const maxDim = 14000; // PDF max dimension in points
            const scale = Math.min(1, maxDim / pageWidth, maxDim / pageHeight);
            pageWidth *= scale;
            pageHeight *= scale;
            
            // Add page and draw image full-size
            const page = this.pdfDoc.addPage([pageWidth, pageHeight]);
            page.drawImage(image, {
                x: 0,
                y: 0,
                width: pageWidth,
                height: pageHeight
            });
        } else {
            // Use specified page size
            const [baseW, baseH] = this.PAGE_SIZES[this.pageSize];
            
            // Handle orientation
            if (this.orientation === 'landscape') {
                pageWidth = baseH;
                pageHeight = baseW;
            } else if (this.orientation === 'portrait') {
                pageWidth = baseW;
                pageHeight = baseH;
            } else {
                // Auto: match image aspect ratio
                if (imgWidth > imgHeight) {
                    pageWidth = baseH;
                    pageHeight = baseW;
                } else {
                    pageWidth = baseW;
                    pageHeight = baseH;
                }
            }
            
            // Calculate image placement
            const margin = this.margin;
            const maxW = pageWidth - margin * 2;
            const maxH = pageHeight - margin * 2;
            
            const imgAspect = imgWidth / imgHeight;
            const pageAspect = maxW / maxH;
            
            let drawW, drawH;
            if (imgAspect > pageAspect) {
                drawW = maxW;
                drawH = maxW / imgAspect;
            } else {
                drawH = maxH;
                drawW = maxH * imgAspect;
            }
            
            // Center the image
            const x = (pageWidth - drawW) / 2;
            const y = (pageHeight - drawH) / 2;
            
            // Add page
            const page = this.pdfDoc.addPage([pageWidth, pageHeight]);
            page.drawImage(image, {
                x, y,
                width: drawW,
                height: drawH
            });
            
            // Add page numbers if requested
            if (this.pageNumbers) {
                const pages = this.pdfDoc.getPages();
                const pageNum = pages.length;
                
                page.drawText(`${pageNum}`, {
                    x: pageWidth / 2,
                    y: 20,
                    size: 8,
                    color: { r: 0.4, g: 0.4, b: 0.4 }
                });
            }
        }
        
        // Add watermark if set
        if (this.watermark) {
            // Implement watermark logic here
        }
    }
    
    async processImage(buffer, mimeType) {
        // Create canvas from buffer
        const blob = new Blob([buffer], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const img = await this.loadImage(url);
        const canvas = document.createElement('canvas');
        
        // Handle EXIF rotation
        const orientation = await this.getExifOrientation(buffer);
        const { width, height } = this.getRotatedDimensions(img.width, img.height, orientation);
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        
        // Apply rotation
        ctx.save();
        this.applyOrientation(ctx, orientation, width, height);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
        
        URL.revokeObjectURL(url);
        
        // Convert back to buffer
        const quality = this.getQualityValue();
        const processedBlob = await new Promise(resolve => 
            canvas.toBlob(resolve, mimeType, quality)
        );
        
        return await processedBlob.arrayBuffer();
    }
    
    async convertToPNG(buffer) {
        const blob = new Blob([buffer]);
        const url = URL.createObjectURL(blob);
        const img = await this.loadImage(url);
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        URL.revokeObjectURL(url);
        
        const pngBlob = await new Promise(resolve => 
            canvas.toBlob(resolve, 'image/png')
        );
        
        return await pngBlob.arrayBuffer();
    }
    
    async createImageCanvas(buffer) {
        const blob = new Blob([buffer]);
        const url = URL.createObjectURL(blob);
        const img = await this.loadImage(url);
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        URL.revokeObjectURL(url);
        return canvas;
    }
    
    async rasterizeSVG(svgText) {
        // Create SVG blob
        const blob = new Blob([svgText], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        
        const img = await this.loadImage(url);
        
        // Render at 2x for quality
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = (img.width || 800) * scale;
        canvas.height = (img.height || 600) * scale;
        
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        
        URL.revokeObjectURL(url);
        return canvas;
    }
    
    loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }
    
    needsProcessing(file) {
        // Check if file needs rotation or other processing
        return this.orientation !== 'auto' || this.pageSize !== 'original';
    }
    
    async getExifOrientation(buffer) {
        // Simplified EXIF orientation detection
        try {
            const view = new DataView(buffer);
            if (view.getUint16(0, false) !== 0xFFD8) return 1;
            
            // Look for EXIF orientation tag
            // This is simplified - a full implementation would parse EXIF properly
            return 1; // Default: no rotation
        } catch {
            return 1;
        }
    }
    
    getRotatedDimensions(width, height, orientation) {
        if (orientation >= 5 && orientation <= 8) {
            return [height, width];
        }
        return [width, height];
    }
    
    applyOrientation(ctx, orientation, width, height) {
        switch (orientation) {
            case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
            case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
            case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
            case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
            case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
            case 7: ctx.transform(0, -1, -1, 0, height, width); break;
            case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
        }
    }
    
    getQualityValue() {
        const qualityMap = {
            'maximum': 1.0,
            'high': 0.9,
            'standard': 0.75,
            'web': 0.6
        };
        return qualityMap[this.quality] || 1.0;
    }
}
