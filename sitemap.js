const SitemapGenerator = require('./src/SitemapGenerator');

// Запуск приложения
if (require.main === module) {
    const generator = new SitemapGenerator();
    generator.run();
}