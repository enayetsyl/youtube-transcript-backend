const puppeteer = require('puppeteer');

async function logSubRouteLinks(pageUrl) {
    const browser = await puppeteer.launch({ headless: false });
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
    } catch (error) {
        console.error(`Failed to navigate to: ${pageUrl} - ${error.message}`);
    } finally {
        await browser.close();
        console.log('Browser closed');
    }
}

// Example usage:
const pageUrl = 'https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API';
logSubRouteLinks(pageUrl);
