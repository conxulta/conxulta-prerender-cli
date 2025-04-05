const fs = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');
const xml2js = require('xml2js');
const { program } = require('commander');
const http = require('http');
const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function urlToFilename(url, extension = 'html') {
  let pathname = new URL(url).pathname;
  if (pathname === '/' || pathname === '') return `index.${extension}`;
  if (pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  return pathname.replace(/^\//, '').replace(/\//g, '_') + `.${extension}`;
}

async function getUrlsFromSitemap(sitemapUrl) {
  const xml = await fetch(sitemapUrl);
  const parsed = await new xml2js.Parser().parseStringPromise(xml);
  return parsed.urlset.url.map(entry => entry.loc[0]);
}

async function renderUrl(url, options, page) {
  await page.emulateNetworkConditions({
    offline: false,
    downloadThroughput: (750 * 1024) / 8,
    uploadThroughput: (250 * 1024) / 8,
    latency: 150
  });

  const startTime = Date.now();
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 0 });
  const duration = Date.now() - startTime;

  const metadata = await page.evaluate(() => {
    const getContent = (selector, attr) => {
      const el = document.querySelector(selector);
      return el ? el.getAttribute(attr || 'content') : '';
    };
    const getText = selector => {
      const el = document.querySelector(selector);
      return el ? el.innerText : '';
    };

    return {
      title: document.title,
      description: getContent('meta[name="description"]'),
      canonical: getContent('link[rel="canonical"]', 'href'),
      h1: getText('h1')
    };
  });

  const results = {};
  const fileSizes = {};

  if (options.formats.includes('html')) {
    const html = await page.content();
    const buffer = Buffer.from(html, 'utf8');
    results.html = buffer;
    fileSizes.html = buffer.length;
  }

  if (options.formats.includes('pdf')) {
    const pdf = await page.pdf({ format: 'A4' });
    results.pdf = pdf;
    fileSizes.pdf = pdf.length;
  }

  if (options.formats.includes('screenshot')) {
    const png = await page.screenshot({ fullPage: true });
    results.screenshot = png;
    fileSizes.screenshot = png.length;
  }

  if (options.formats.includes('text')) {
    const text = await page.evaluate(() => document.body.innerText);
    const buffer = Buffer.from(text, 'utf8');
    results.text = buffer;
    fileSizes.text = buffer.length;
  }

  return {
    results,
    duration,
    metadata: { ...metadata, url, loadTime: duration, fileSizes }
  };
}

async function run() {
  const showExampleConfig = process.argv.includes('-h') && process.argv.includes('config');

  program
    .name('prerender')
    .description('CLI per il prerendering di siti JavaScript')
    .usage("-u <url|sitemap> -f <formati> -o <output> [options]\n       -h, --help [config] per mostrare l'esempio config")
    .requiredOption('-u, --url <url>', 'URL singola o sitemap.xml')
    .option('-f, --formats <formats>', 'html,pdf,screenshot,text', 'html')
    .option('-o, --output <folder>', 'Cartella di output', './output')
    .option('-c, --config <file>', 'File JSON di configurazione')
    .option('--csv', 'Salva tempi di caricamento in CSV')
    .helpOption('-h, --help [config]', 'Mostra l\'help (aggiungi "config" per esempio JSON)');

  if (process.argv.length <= 2 || showExampleConfig) {
    program.outputHelp();
    if (showExampleConfig) {
      console.log('\nEsempio di file config.json:\n');
      console.log(JSON.stringify({
        url: "https://www.miosito.it/sitemap.xml",
        formats: ["html", "pdf", "screenshot", "text"],
        output: "./output",
        csv: true
      }, null, 2));
    }
    process.exit(0);
  }

  program.parse(process.argv);

  let config = {
    url: program.url,
    formats: program.formats.split(','),
    output: program.output,
    csv: program.csv || false
  };

  if (program.config) {
    const fileConfig = JSON.parse(fs.readFileSync(program.config));
    config = { ...config, ...fileConfig };
  }

  await fs.ensureDir(config.output);
  const urls = config.url.endsWith('.xml') ? await getUrlsFromSitemap(config.url) : [config.url];
  const csvLog = config.csv ? [['URL', 'Tempo (ms)']] : null;
  const jsonLog = [];

  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  for (const url of urls) {
    try {
      console.log(`Render: ${url}`);
      const { results, duration, metadata } = await renderUrl(url, config, page);

      for (const [format, content] of Object.entries(results)) {
        const ext = format === 'screenshot' ? 'png' : (format === 'text' ? 'txt' : format);
        const filename = urlToFilename(url, ext);
        const filepath = path.join(config.output, filename);
        fs.writeFileSync(filepath, content);
        console.log(`  -> Salvato: ${filepath}`);
      }

      if (config.csv) csvLog.push([url, duration.toString()]);
      jsonLog.push(metadata);
    } catch (err) {
      console.error(`Errore con ${url}: ${err.message}`);
    }
  }

  if (config.csv && csvLog.length > 1) {
    const csvContent = csvLog.map(line => line.join(',')).join('\n');
    fs.writeFileSync(path.join(config.output, 'tempi.csv'), csvContent);
  }

  fs.writeFileSync(path.join(config.output, 'dati.json'), JSON.stringify(jsonLog, null, 2));
  await browser.close();
  console.log('Completato.');
}

module.exports = { run };
