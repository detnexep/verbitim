/**
 * Professional PDF Creation Engine for Mobile
 * Handles all PDF creation with quality preservation
 */

class PDFEngine {
    constructor() {
        this.pdfDoc = null;
        this.font = null;
        this.pageSize = 'original';
        this.quality = 'maximum';
        this.orientation = 'auto';
        this.margin = 36;
        this.pageNumbers = false;
        this.compressImages = false;
        this.watermark = null;
        this.metadata = {};

        this.PAGE_SIZES = {
            a4: [595.28, 841.89],
            letter: [612, 792],
            legal: [612, 1008],
            a3: [841.89, 1190.55]
        };
    }

    /**
     * Returns { pdfBytes, results }. results is an array of
     * { name, size, ok, label } describing exactly what happened to
     * each input file - this feeds the live processing log and the
     * final build report in the UI.
     */
    async createPDF(files, progressCallback) {
        const { PDFDocument, StandardFonts } = PDFLib;
        this.pdfDoc = await PDFDocument.create();
        this.font = await this.pdfDoc.embedFont(StandardFonts.Helvetica);

        if (this.metadata.title) this.pdfDoc.setTitle(this.metadata.title);
        if (this.metadata.author) this.pdfDoc.setAuthor(this.metadata.author);
        this.pdfDoc.setCreator('PDF Creator Pro');
        this.pdfDoc.setProducer('PDF Creator Pro');

        const results = [];
        let processed = 0;
        const total = files.length;

        for (const file of files) {
            if (progressCallback) {
                progressCallback(Math.round((processed / total) * 90), `Processing ${file.name}...`, null);
            }

            let entry;
            try {
                const label = await this.addFileToPDF(file);
                entry = { name: file.name, size: file.size, ok: true, label };
            } catch (error) {
                console.error(`Error processing ${file.name}:`, error);
                entry = { name: file.name, size: file.size, ok: false, label: error.message || 'Failed to process' };
            }
            results.push(entry);

            processed++;
            if (progressCallback) {
                progressCallback(Math.round((processed / total) * 90), `Processed ${processed} of ${total}`, entry);
            }
        }

        if (progressCallback) progressCallback(95, 'Finalizing PDF...', null);

        const pdfBytes = await this.pdfDoc.save();

        if (progressCallback) progressCallback(100, 'PDF created successfully!', null);

        return { pdfBytes, results };
    }

    async addFileToPDF(file) {
        const extension = file.name.split('.').pop().toLowerCase();

        switch (extension) {
            case 'jpg':
            case 'jpeg':
                return await this.addJPEG(file);
            case 'png':
                return await this.addPNG(file);
            case 'webp':
                return await this.addWebP(file);
            case 'heic':
            case 'heif':
                return await this.addHEIC(file);
            case 'svg':
                return await this.addSVG(file);
            case 'pdf':
                return await this.addExistingPDF(file);
            default:
                return await this.addImageGeneric(file);
        }
    }

    async addJPEG(file) {
        const buffer = await file.arrayBuffer();

        // Always check EXIF orientation first - embedding raw bytes
        // directly would silently skip any needed rotation, since PDF
        // viewers don't read a JPEG's internal EXIF orientation tag.
        const orientation = await this.getExifOrientation(buffer);
        const needsRotation = orientation !== 1;
        const canEmbedDirect = this.quality === 'maximum' && !needsRotation && !this.compressImages;

        if (canEmbedDirect) {
            const image = await this.pdfDoc.embedJpg(buffer);
            await this.addPageWithImage(image, image.width, image.height, 'JPEG (lossless)');
            return 'JPEG · embedded as-is';
        }

        const processedBuffer = await this.processImage(buffer, 'image/jpeg', orientation);
        const image = await this.pdfDoc.embedJpg(processedBuffer);
        const label = needsRotation
            ? (this.compressImages ? 'JPEG · rotated + compressed' : 'JPEG · rotated')
            : (this.compressImages ? 'JPEG · compressed' : 'JPEG · re-encoded');
        await this.addPageWithImage(image, image.width, image.height, label);
        return label;
    }

    async addPNG(file) {
        const buffer = await file.arrayBuffer();

        if (this.quality === 'maximum' && !this.compressImages) {
            const image = await this.pdfDoc.embedPng(buffer);
            await this.addPageWithImage(image, image.width, image.height, 'PNG (lossless)');
            return 'PNG · embedded as-is';
        }

        if (this.compressImages) {
            // Converting to JPEG is the only way to meaningfully shrink a
            // PNG - unavoidably drops transparency.
            const processedBuffer = await this.processImage(buffer, 'image/jpeg', 1);
            const image = await this.pdfDoc.embedJpg(processedBuffer);
            await this.addPageWithImage(image, image.width, image.height, 'PNG → JPEG (compressed)');
            return 'PNG · compressed to JPEG';
        }

        const processedBuffer = await this.processImage(buffer, 'image/png', 1);
        const image = await this.pdfDoc.embedPng(processedBuffer);
        await this.addPageWithImage(image, image.width, image.height, 'PNG');
        return 'PNG · re-encoded';
    }

    async addWebP(file) {
        const buffer = await file.arrayBuffer();
        const pngBuffer = await this.convertToPNG(buffer);
        const image = await this.pdfDoc.embedPng(pngBuffer);
        await this.addPageWithImage(image, image.width, image.height, 'WebP → PNG');
        return 'WebP · converted to PNG';
    }

    async addHEIC(file) {
        try {
            const blob = await heic2any({
                blob: file,
                toType: 'image/jpeg',
                quality: this.getQualityValue()
            });

            const buffer = await new Response(blob).arrayBuffer();
            const image = await this.pdfDoc.embedJpg(buffer);
            await this.addPageWithImage(image, image.width, image.height, 'HEIC → JPEG');
            return 'HEIC · converted to JPEG';
        } catch (error) {
            console.error('HEIC conversion failed:', error);
            throw new Error('Cannot process HEIC file. Try converting to JPEG first.');
        }
    }

    async addSVG(file) {
        const svgText = await file.text();
        const canvas = await this.rasterizeSVG(svgText);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const buffer = await blob.arrayBuffer();

        const image = await this.pdfDoc.embedPng(buffer);
        await this.addPageWithImage(image, image.width, image.height, 'SVG → PNG');
        return 'SVG · rasterized to PNG';
    }

    async addImageGeneric(file) {
        const buffer = await file.arrayBuffer();
        const canvas = await this.createImageCanvas(buffer);
        const blob = await new Promise(resolve =>
            canvas.toBlob(resolve, 'image/png')
        );
        const pngBuffer = await blob.arrayBuffer();

        const image = await this.pdfDoc.embedPng(pngBuffer);
        await this.addPageWithImage(image, image.width, image.height, 'Image → PNG');
        return 'Converted to PNG';
    }

    /**
     * Embed every page of an existing PDF into the output document.
     */
    async addExistingPDF(file) {
        const { PDFDocument } = PDFLib;
        const buffer = await file.arrayBuffer();
        const srcDoc = await PDFDocument.load(buffer);
        const pageIndices = srcDoc.getPageIndices();
        const copiedPages = await this.pdfDoc.copyPages(srcDoc, pageIndices);

        copiedPages.forEach((copiedPage) => {
            const page = this.pdfDoc.addPage(copiedPage);
            const { width, height } = page.getSize();
            this.decoratePage(page, width, height);
        });

        return `PDF · ${pageIndices.length} page${pageIndices.length === 1 ? '' : 's'} merged`;
    }

    async addPageWithImage(image, imgWidth, imgHeight, label) {
        let pageWidth, pageHeight, page;

        if (this.pageSize === 'original') {
            const pxToPt = 0.75;
            pageWidth = imgWidth * pxToPt;
            pageHeight = imgHeight * pxToPt;

            const maxDim = 14000;
            const scale = Math.min(1, maxDim / pageWidth, maxDim / pageHeight);
            pageWidth *= scale;
            pageHeight *= scale;

            page = this.pdfDoc.addPage([pageWidth, pageHeight]);
            page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
        } else {
            const [baseW, baseH] = this.PAGE_SIZES[this.pageSize];

            if (this.orientation === 'landscape') {
                pageWidth = baseH; pageHeight = baseW;
            } else if (this.orientation === 'portrait') {
                pageWidth = baseW; pageHeight = baseH;
            } else {
                if (imgWidth > imgHeight) { pageWidth = baseH; pageHeight = baseW; }
                else { pageWidth = baseW; pageHeight = baseH; }
            }

            const margin = this.margin;
            const maxW = pageWidth - margin * 2;
            const maxH = pageHeight - margin * 2;

            const imgAspect = imgWidth / imgHeight;
            const pageAspect = maxW / maxH;

            let drawW, drawH;
            if (imgAspect > pageAspect) {
                drawW = maxW; drawH = maxW / imgAspect;
            } else {
                drawH = maxH; drawW = maxH * imgAspect;
            }

            const x = (pageWidth - drawW) / 2;
            const y = (pageHeight - drawH) / 2;

            page = this.pdfDoc.addPage([pageWidth, pageHeight]);
            page.drawImage(image, { x, y, width: drawW, height: drawH });
        }

        this.decoratePage(page, pageWidth, pageHeight);
    }

    decoratePage(page, pageWidth, pageHeight) {
        const { rgb, degrees } = PDFLib;

        if (this.pageNumbers) {
            const pageNum = this.pdfDoc.getPages().length;
            const text = `${pageNum}`;
            const size = 8;
            const textWidth = this.font.widthOfTextAtSize(text, size);

            page.drawText(text, {
                x: pageWidth / 2 - textWidth / 2,
                y: 20,
                size,
                font: this.font,
                color: rgb(0.4, 0.4, 0.4)
            });
        }

        if (this.watermark) {
            const size = Math.min(pageWidth, pageHeight) * 0.08;
            const textWidth = this.font.widthOfTextAtSize(this.watermark, size);

            page.drawText(this.watermark, {
                x: pageWidth / 2 - textWidth / 2,
                y: pageHeight / 2,
                size,
                font: this.font,
                color: rgb(0.6, 0.6, 0.6),
                opacity: 0.3,
                rotate: degrees(-45)
            });
        }
    }

    async processImage(buffer, mimeType, orientation = null) {
        const blob = new Blob([buffer], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const img = await this.loadImage(url);

        if (orientation === null) {
            orientation = await this.getExifOrientation(buffer);
        }
        const [width, height] = this.getRotatedDimensions(img.width, img.height, orientation);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (mimeType === 'image/jpeg') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
        }

        ctx.save();
        this.applyOrientation(ctx, orientation, width, height);
        ctx.drawImage(img, 0, 0);
        ctx.restore();

        URL.revokeObjectURL(url);

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

        const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
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
        const blob = new Blob([svgText], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const img = await this.loadImage(url);

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

    async getExifOrientation(buffer) {
        try {
            const view = new DataView(buffer);
            if (view.getUint16(0, false) !== 0xFFD8) return 1;

            let offset = 2;
            const length = view.byteLength;

            while (offset < length) {
                if (view.getUint8(offset) !== 0xFF) return 1;
                const marker = view.getUint8(offset + 1);

                if (marker === 0xE1) {
                    return this.parseExifOrientation(view, offset + 4);
                }

                offset += 2 + view.getUint16(offset + 2, false);
            }

            return 1;
        } catch (error) {
            console.warn('Error reading EXIF:', error);
            return 1;
        }
    }

    parseExifOrientation(view, offset) {
        const exifHeader = view.getUint32(offset, false);
        if (exifHeader !== 0x45786966) return 1;

        const tiffOffset = offset + 6;
        const isBigEndian = view.getUint16(tiffOffset, false) === 0x4D4D;
        const ifdOffset = view.getUint32(tiffOffset + 4, !isBigEndian) + tiffOffset;
        const entries = view.getUint16(ifdOffset, !isBigEndian);

        for (let i = 0; i < entries; i++) {
            const entryOffset = ifdOffset + 2 + i * 12;
            if (view.getUint16(entryOffset, !isBigEndian) === 0x0112) {
                return view.getUint16(entryOffset + 8, !isBigEndian);
            }
        }

        return 1;
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
