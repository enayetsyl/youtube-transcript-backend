const puppeteer = require('puppeteer');
const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');

async function savePageContentAsPdf(pageUrl) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        console.log(`Navigating to: ${pageUrl}`);
        await page.goto(pageUrl, { waitUntil: 'load', timeout: 180000 });

        console.log('Extracting page content...');
        const content = await page.evaluate(() => {
            return document.body.innerText;
        });

        console.log('Creating PDF...');
        const pdfDoc = await PDFDocument.create();
        let pdfPage = pdfDoc.addPage();
        const { width, height } = pdfPage.getSize();
        const fontSize = 12;

        // Split text into lines to fit page width
        const lines = content.split('\n');
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
        const pdfPath = 'page_content.pdf';
        fs.writeFileSync(pdfPath, pdfBytes);
        console.log(`PDF saved: ${pdfPath}`);
    } catch (error) {
        console.error(`Failed to navigate to: ${pageUrl} - ${error.message}`);
    } finally {
        await browser.close();
        console.log('Browser closed');
    }
}

// Example usage:
const pageUrl = 'https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API';
savePageContentAsPdf(pageUrl);
