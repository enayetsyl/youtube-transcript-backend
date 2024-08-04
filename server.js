const express = require('express');
const puppeteer = require('puppeteer');
const { PDFDocument, rgb } = require('pdf-lib');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
app.use(bodyParser.json());
app.use(cors());

app.get('/', async (req, res) => {
    res.send('Welcome to youtube transcript generator')
})

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
        res.json({ transcript });
        
    } catch (error) {
        console.error('Error extracting transcript:', error);
        res.status(500).send('Error extracting transcript');
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
