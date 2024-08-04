const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');
const multer = require('multer');


const app = express();
const port = 3000;

app.use(cors())
app.use(bodyParser.json());


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/') // Specify the folder to save files
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname) // Use a unique filename
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB file size limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Only PDF files are allowed'));
        }
        cb(null, true);
    }
});


app.post('/merge-pdf', upload.array('pdfs', 100), async (req, res) => {
    try {
        // Log files information for debugging
        console.log('Uploaded files:', req.files);

        // Ensure all files have a valid path
        const pdfDocs = await Promise.all(req.files.map(async (file) => {
            if (!file.path) {
                console.error('File path is undefined for file:', file);
                throw new Error('File path is undefined');
            }
            const pdfBytes = fs.readFileSync(file.path);
            return PDFDocument.load(pdfBytes);
        }));

        const mergedPdf = await PDFDocument.create();
        for (const pdfDoc of pdfDocs) {
            const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach(page => mergedPdf.addPage(page));
        }

        const mergedPdfBytes = await mergedPdf.save();
        const outputPath = path.join(__dirname, 'merged.pdf');
        fs.writeFileSync(outputPath, mergedPdfBytes);

        // Cleanup uploaded files
        req.files.forEach(file => fs.unlinkSync(file.path));

        res.download(outputPath, 'merged.pdf', (err) => {
            if (err) {
                console.error('Error sending merged PDF:', err);
            }
            fs.unlinkSync(outputPath); // Delete the merged file after sending it
        });
    } catch (error) {
        console.error('Error merging PDF files:', error);
        res.status(500).send('Error merging PDF files');
    }
});


app.post('/generate-link', async (req, res) => {
    const pageUrl = req.body.url;
    if (!pageUrl) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const links = await getSubRouteLinks(pageUrl);
        res.json({ links });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/generate-pdf', async (req, res) => {
    const urls = req.body.urls;
    if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ error: 'URLs array is required' });
    }

    try {
        const tempDir = path.join(__dirname, 'temp');
        await fs.ensureDir(tempDir);

        // Process URLs in batches
        const batchSize = 5;
        const pdfPaths = [];
        for (let i = 0; i < urls.length; i += batchSize) {
            const batchUrls = urls.slice(i, i + batchSize);
            const batchPdfPaths = await Promise.all(batchUrls.map(async (pageUrl, index) => {
                return await savePageContentAsPdf(pageUrl, tempDir, i + index);
            }));
            pdfPaths.push(...batchPdfPaths);
        }

        // Merging PDFs
        const pdfDocs = await Promise.all(pdfPaths.map(async (pdfPath) => {
            const pdfBytes = fs.readFileSync(pdfPath);
            return PDFDocument.load(pdfBytes);
        }));

        const mergedPdf = await PDFDocument.create();
        for (const pdfDoc of pdfDocs) {
            const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach(page => mergedPdf.addPage(page));
        }

        const mergedPdfBytes = await mergedPdf.save();
        const mergedPdfPath = path.join(__dirname, 'merged.pdf');
        fs.writeFileSync(mergedPdfPath, mergedPdfBytes);

        // Cleanup individual PDF files
        pdfPaths.forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });

        res.download(mergedPdfPath, 'merged.pdf', (err) => {
            if (err) {
                console.error(err);
            }
            fs.unlinkSync(mergedPdfPath); // Delete the merged file after sending it
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error generating or merging PDF files');
    }
});

app.post('/extract-transcript', async (req, res) => {
    const { videoUrl, videoTitle } = req.body;

    if (!videoUrl || !videoTitle) {
        return res.status(400).send('videoUrl and videoTitle are required');
    }

    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        await page.goto(videoUrl, { waitUntil: 'networkidle2' });

        // Maximize the window
        await page.setViewport({ width: 1920, height: 1080 });

        // Click the "Expand" button to expand the video description
        await page.waitForSelector('tp-yt-paper-button#expand', { timeout: 60000 });
        await page.click('tp-yt-paper-button#expand');

        // Wait for the "Show transcript" button and click it
        await page.waitForSelector('button[aria-label="Show transcript"]', { timeout: 60000 });
        await page.click('button[aria-label="Show transcript"]');

        // Wait for the transcript container to appear
        await page.waitForSelector('ytd-transcript-segment-list-renderer', { timeout: 60000 });

        // Extract the transcript text
        const transcript = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('ytd-transcript-segment-renderer .segment-text'));
            return elements.map(element => element.innerText).join('\n');
        });

        await browser.close();

        // Create PDF document and save the transcript
        const pdfDoc = await PDFDocument.create();
        const page1 = pdfDoc.addPage();
        const { width, height } = page1.getSize();
        const fontSize = 12;
        const textWidth = width - 2 * 50;
        const textHeight = height - 2 * 50;
        const textLines = transcript.split('\n');
        const linesPerPage = Math.floor(textHeight / fontSize);

        let currentPage = page1;
        let currentY = height - 50 - fontSize;

        for (let i = 0; i < textLines.length; i++) {
            if (currentY < 50) {
                currentPage = pdfDoc.addPage();
                currentY = height - 50 - fontSize;
            }
            currentPage.drawText(textLines[i], {
                x: 50,
                y: currentY,
                size: fontSize,
                color: rgb(0, 0, 0),
                maxWidth: textWidth,
                lineHeight: fontSize * 1.5
            });
            currentY -= fontSize * 1.5;
        }

        const pdfBytes = await pdfDoc.save();
        const fileName = `${videoTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
        const pdfPath = path.join(__dirname, fileName);
        fs.writeFileSync(pdfPath, pdfBytes);

        // Send the PDF file to the frontend and delete it after sending
        res.download(pdfPath, fileName, (err) => {
            if (err) {
                console.error('Error sending PDF:', err);
                res.status(500).send('Error sending PDF');
            } else {
                fs.unlinkSync(pdfPath); // Delete the file after sending it
                console.log(`Transcript sent and deleted: ${pdfPath} for ${videoTitle}`);
            }
        });
    } catch (error) {
        console.error('Error extracting transcript:', error);
        res.status(500).send('Error extracting transcript');
    }
});


async function savePageContentAsPdf(pageUrl, tempDir, index) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        console.log(`Navigating to: ${pageUrl}`);
        await page.goto(pageUrl, { waitUntil: 'load', timeout: 180000 });

        console.log('Extracting page content...');
        const content = await page.evaluate(() => {
            return document.body.innerText;
        });

        const filteredContent = filterUnsupportedCharacters(content); // Filter unsupported characters

        console.log('Creating PDF...');
        const pdfDoc = await PDFDocument.create();
        let pdfPage = pdfDoc.addPage();
        const { width, height } = pdfPage.getSize();
        const fontSize = 12;

        // Split text into lines to fit page width
        const lines = filteredContent.split('\n');
        const maxLineWidth = width - 50;
        const maxLinesPerPage = Math.floor((height - 50) / fontSize);

        let y = height - 25;

        lines.forEach((line) => {
            if (y < 25) {
                y = height - 25;
                pdfPage = pdfDoc.addPage();
            }

            const textWidth = fontSize * 0.6 * line.length;
            const linesToPrint = Math.ceil(textWidth / maxLineWidth);

            for (let i = 0; i < linesToPrint; i++) {
                const start = i * Math.floor(maxLineWidth / (fontSize * 0.6));
                const end = (i + 1) * Math.floor(maxLineWidth / (fontSize * 0.6));
                pdfPage.drawText(line.substring(start, end), {
                    x: 25,
                    y: y,
                    size: fontSize,
                    color: rgb(0, 0, 0),
                });
                y -= fontSize + 2;
                if (y < 25) {
                    y = height - 25;
                    pdfPage = pdfDoc.addPage();
                }
            }
        });

        const pdfBytes = await pdfDoc.save();
        const pdfFilename = `${index}_${pageUrl.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
        const pdfPath = path.join(tempDir, pdfFilename);
        await fs.writeFile(pdfPath, pdfBytes);
        console.log(`PDF saved: ${pdfPath}`);
        return pdfPath;
    } catch (error) {
        console.error(`Failed to navigate to: ${pageUrl} - ${error.message}`);
        throw error;
    } finally {
        await browser.close();
        console.log('Browser closed');
    }
}


function filterUnsupportedCharacters(text) {
    const winAnsiChars = /[\u0000-\u007F\u00A0-\u00FF]/g;
    return text.replace(/[^\u0000-\u007F\u00A0-\u00FF]/g, ''); // Removing unsupported characters
}


async function getSubRouteLinks(pageUrl) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        console.log(`Navigating to: ${pageUrl}`);
        await page.goto(pageUrl, { waitUntil: 'load', timeout: 180000 });

        console.log('Extracting sub-route links...');
        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(anchor => anchor.href)
                .filter(href => href.startsWith(window.location.origin));
        });

        console.log('Found sub-route links:', links);
        return links;
    } catch (error) {
        console.error(`Failed to navigate to: ${pageUrl} - ${error.message}`);
        throw error;
    } finally {
        await browser.close();
        console.log('Browser closed');
    }
}

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
