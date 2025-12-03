#!/usr/bin/env node

const SitemapGenerator = require('./src/SitemapGenerator');

if (require.main === module) {
    const generator = new SitemapGenerator();
    generator.run().catch(err => {
        console.error('Build failed:', err);
        process.exit(1);
    });
}
