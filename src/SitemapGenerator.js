#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Импортируем необходимые модули
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

class SitemapGenerator {
    constructor() {
        this.visitedUrls = new Set();
        this.sitemapData = [];
        this.htmlTreeStructure = [];
        this.browser = null;
    }

    // Проверка корректности URL
    validateUrl(url) {
        try {
            new URL(url);
            return true;
        } catch (error) {
            return false;
        }
    }

    // Инициализация параметров
    initOptions(args) {
        const options = {
            domain: args[2],
            changefreq: 'weekly',
            savePath: null,
            excludePatterns: []
        };

        for (let i = 3; i < args.length; i++) {
            const arg = args[i];
            if (arg.startsWith('--changefreq=')) {
                options.changefreq = arg.split('=')[1];
            } else if (arg.startsWith('--save-path=')) {
                options.savePath = arg.split('=')[1];
            } else if (arg.startsWith('--exclude-patterns=')) {
                options.excludePatterns = arg.split('=')[1].split(',').map(p => p.trim()).filter(p => p);
            }
        }

        return options;
    }

    // Инициализация браузера
    async initBrowser() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--disable-gpu'
                ]
            });
        }
    }

    // Закрытие браузера
    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    // Создание запроса с заголовками через puppeteer
    async makeRequest(url, depth = 1.0) {
        try {
            await this.initBrowser();

            const page = await this.browser.newPage();

            // Установка заголовков
            await page.setExtraHTTPHeaders({
                'User-Agent': 'LevPro Spider 1.0.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            });

            // Установка таймаута
            await page.setDefaultTimeout(30000);

            // Навигация к странице
            const response = await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Получение HTML содержимого
            const html = await page.content();

            // Получение статуса и заголовков
            const status = response.status();
            const headers = response.headers();

            await page.close();

            return {
                data: html,
                headers: headers,
                status: status,
                url: url,
                depth: depth
            };
        } catch (error) {
            throw new Error(`Request failed for ${url}: ${error.message}`);
        }
    }

    // Парсинг HTML
    parseHtml(html, url) {
        const $ = cheerio.load(html);
        const title = $('title').first().text() || '';
        const links = [];

        $('a[href]').each((index, element) => {
            const href = $(element).attr('href');
            if (!href || href.startsWith('#') || href.includes('rel="nofollow"')) {
                return;
            }

            try {
                const normalizedHref = this.normalizeUrl(href, url);
                if (normalizedHref && normalizedHref.startsWith(url)) {
                    links.push(normalizedHref);
                }
            } catch (error) {
                // Пропускаем ошибочные ссылки
            }
        });

        return { title, links };
    }

    // Нормализация URL
    normalizeUrl(href, baseUrl) {
        if (!href) return null;

        try {
            if (href.startsWith('http')) {
                return href;
            }

            const urlObj = new URL(baseUrl);
            const normalized = new URL(href, baseUrl);
            return normalized.href;
        } catch (error) {
            return null;
        }
    }

    // Проверка исключения по паттерну
    shouldExcludeUrl(url, patterns) {
        if (!patterns || patterns.length === 0) return false;

        return patterns.some(pattern => {
            if (pattern.startsWith('/')) {
                try {
                    const regex = new RegExp(pattern);
                    return regex.test(url);
                } catch (error) {
                    return url.includes(pattern);
                }
            } else {
                return url.includes(pattern);
            }
        });
    }

    // Генерация дерева для HTML
    buildHtmlTreeStructure(url, title, parentUrl, path) {
        const level = this.calculateLevel(path);
        this.htmlTreeStructure.push({
            url,
            title,
            parent: parentUrl,
            path,
            level
        });
    }

    // Вычисление уровня вложенности
    calculateLevel(path) {
        return (path.match(/\//g) || []).length + 1;
    }

    // Строит дерево из структуры
    buildTree(items) {
        const map = {};
        const roots = [];

        items.forEach(item => {
            map[item.url] = { ...item, children: [] };
        });

        items.forEach(item => {
            if (item.parent && map[item.parent]) {
                map[item.parent].children.push(map[item.url]);
            } else {
                roots.push(map[item.url]);
            }
        });

        return roots;
    }

    // Рендер дерева в HTML
    renderTree(tree, level = 0) {
        let html = '';
        const indent = '  '.repeat(level);

        tree.forEach(item => {
            const title = item.title || item.url;
            html += `${indent}<li>\n`;
            html += `${indent}  <a href="${item.url}">${title}</a>\n`;

            if (item.children && item.children.length > 0) {
                html += `${indent}  <ul>\n`;
                html += this.renderTree(item.children, level + 2);
                html += `${indent}  </ul>\n`;
            }

            html += `${indent}</li>\n`;
        });

        return html;
    }

    // Генерация HTML-карты сайта
    generateHtmlTree(siteUrl) {
        const sortedItems = [...this.htmlTreeStructure].sort((a, b) => a.level - b.level);
        const tree = this.buildTree(sortedItems);

        let htmlOutput = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Карта сайта</title>
    <link href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
    <div class="container">
        <h1>Карта сайта</h1>
        <div class="row">
            <div class="col-md-12">
                <ul>`;

        htmlOutput += this.renderTree(tree, 0);

        htmlOutput += `</ul></div></div></div></body></html>`;

        return htmlOutput;
    }

    // Основной метод генерации
    async generateSitemap(options) {
        if (!this.validateUrl(options.domain)) {
            console.error(`Invalid domain format: ${options.domain}`);
            process.exit(1);
        }

        const siteUrl = options.domain;
        let queue = [{
            loc: siteUrl,
            depth: 1.0,
            lastmod: new Date().toISOString(),
            priority: 1.0,
            parent: null,
            path: '/'
        }];

        // Создаем пул для одновременных запросов
        const maxConcurrent = 10;
        let index = 0;

        while (queue.length > 0) {
            if (index >= queue.length) break;

            const batch = queue.slice(index, Math.min(index + maxConcurrent, queue.length));
            const results = await Promise.allSettled(batch.map(async (item) => {
                try {
                    return await this.makeRequest(item.loc, item.depth);
                } catch (error) {
                    console.error(`Error fetching ${item.loc}: ${error.message}`);
                    return { error: error.message };
                }
            }));

            for (const result of results) {
                if (result.status === 'fulfilled' && !result.value.error) {
                    const data = result.value;
                    await this.processUrl(data, siteUrl, options, queue);
                }
            }

            index += batch.length;
        }

        // Удаляем ссылки с query параметрами
        this.sitemapData = this.sitemapData.filter(item => !item.loc.includes('?'));

        // Генерируем XML
        const xmlOutput = this.generateXml(options.changefreq);

        // Определяем путь сохранения
        let savePath = options.savePath;
        if (!savePath) {
            savePath = path.join(process.cwd(), 'public', 'sitemap.xml');
        }

        // Создаем директорию если нужно
        const dir = path.dirname(savePath);
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (error) {
            console.error('Error creating directory:', error.message);
        }

        // Сохраняем XML
        fs.writeFileSync(savePath, xmlOutput);
        console.log(`Sitemap saved to ${savePath}`);

        // Генерируем и сохраняем HTML
        const htmlOutput = this.generateHtmlTree(siteUrl);
        const htmlPath = savePath.replace('.xml', '.html');
        fs.writeFileSync(htmlPath, htmlOutput);
        console.log(`HTML sitemap saved to ${htmlPath}`);
    }

    // Обработка URL
    async processUrl(data, siteUrl, options, queue) {
        const url = data.url;

        if (this.visitedUrls.has(url) || this.visitedUrls.has(url.replace(/\/$/, ''))) {
            return;
        }

        if (this.shouldExcludeUrl(url, options.excludePatterns)) {
            console.log(`Excluded by pattern: ${url}`);
            return;
        }

        this.visitedUrls.add(url);

        try {
            const { title, links } = this.parseHtml(data.data, url);

            // Добавляем в sitemap
            const sitemapItem = {
                loc: url,
                lastmod: data.lastmod || new Date().toISOString(),
                priority: data.depth.toFixed(1),
                page_title: title,
                redirect_url: null
            };

            this.sitemapData.push(sitemapItem);

            // Строим иерархическую структуру
            const urlObj = new URL(url);
            const path = urlObj.pathname;
            this.buildHtmlTreeStructure(url, title, data.parent, path);

            // Добавляем внутренние ссылки в очередь
            const depth = Math.max(0.1, data.depth - 0.2);

            for (const link of new Set(links)) {
                if (!this.visitedUrls.has(link) && !this.isUrlInQueue(link, queue)) {
                    queue.push({
                        loc: link,
                        depth: depth,
                        lastmod: new Date().toISOString(),
                        priority: depth,
                        parent: url,
                        path: path
                    });
                }
            }

            console.log(`Visited: ${url}`);
        } catch (error) {
            console.log(error)
            console.error(`Error processing ${url}: ${error.message}`);
        }
    }

    // Проверка наличия URL в очереди
    isUrlInQueue(url, queue) {
        return queue.some(item => item.loc === url);
    }

    // Генерация XML
    generateXml(changefreq) {
        let xmlOutput = '<?xml version="1.0" encoding="utf-8" standalone="yes" ?>\n';
        xmlOutput += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

        this.sitemapData.forEach(item => {
            xmlOutput += `  <url>
    <loc>${this.escapeXml(item.loc)}</loc>
    <lastmod>${item.lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>\n`;
        });

        xmlOutput += '</urlset>';
        return xmlOutput;
    }

    // Экранирование XML
    escapeXml(unsafe) {
        return unsafe.replace(/[<>&'"]/g, function (c) {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case "'": return '&apos;';
                case '"': return '&quot;';
            }
        });
    }

    // Основной метод запуска
    async run() {
        try {
            const args = process.argv;
            const options = this.initOptions(args);

            if (!options.domain) {
                console.error('Usage: node sitemap.js <domain> [options]');
                console.error('Example: node sitemap.js https://example.com --changefreq=weekly --save-path=/var/www/sitemap.xml');
                process.exit(1);
            }

            await this.generateSitemap(options);

            console.log('Sitemap generation completed successfully.');

            process.exit(1);
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    }
}

module.exports = SitemapGenerator;