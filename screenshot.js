const puppeteer = require('puppeteer');

async function generatePdf(pageUrl) {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    try {
        console.log(`Navigating to: ${pageUrl}`);
        await page.goto(pageUrl);

        console.log('Page loaded, triggering print dialog');
        await page.evaluate(() => {
            document.body.focus();
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true }));
        });

        console.log('Waiting for print dialog to open');
        await page.waitForTimeout(5000);

        console.log('Pressing Enter to print');
        await page.keyboard.press('Enter');
        
        console.log('Waiting for printing process to start');
        await page.waitForTimeout(5000);

        console.log('Confirming the print');
        await page.keyboard.press('Enter');

        console.log(`Print process initiated for: ${pageUrl}`);
    } catch (error) {
        console.error(`Failed to navigate to: ${pageUrl} - ${error.message}`);
    } finally {
        await browser.close();
        console.log('Browser closed');
    }
}

// Example usage:
const pageUrl = 'https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API';
generatePdf(pageUrl);
