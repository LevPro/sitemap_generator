import sitemapGenerator from 'sitemap-generator';

import fs from 'fs';

console.log('Start creating sitemap');

const args = process.argv.slice(2);

let savePath = process.cwd() + '/sitemap.xml';

if (args[1]) {
    savePath = args[1];
}

// Remove file if exists
if (fs.existsSync(savePath)) {
    console.log('Remove old file')

    fs.unlinkSync(savePath);
}

// create generator
const generator = sitemapGenerator(
    args[0],
    {
        maxDepth: 0,
        changeFreq: 'weekly',
        priorityMap: [1.0, 0.8, 0.6, 0.4, 0.2, 0],
        filepath: savePath,
        maxEntriesPerFile: 500000,
        stripQuerystring: true,
        lastMod: true
    }
);

// register event listeners
generator.on('done', () => {
    console.log('Sitemap created');
});
generator.on('error', (error) => {
    console.error(error);
});

// start the crawler
generator.start();
