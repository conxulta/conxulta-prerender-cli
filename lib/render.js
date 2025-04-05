const fs = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');
const xml2js = require('xml2js');
const { program } = require('commander');
const http = require('http');
const https = require('https');

const rawArgs = process.argv.slice(2);
const DEBUG_MODE = rawArgs.includes('--debug') || rawArgs.includes('-d');

function debugLog(...args) {
  if (DEBUG_MODE) console.log('[DEBUG]', ...args);
}
if (DEBUG_MODE) console.log('[DEBUG] Debug attivo');

function getConfigFileFromArgs(args) {
  const cIndex = args.findIndex(arg => ['-c', '--config'].includes(arg));
  if (cIndex !== -1 && args[cIndex + 1]) {
    return args[cIndex + 1];
  }
  return null;
}

let config = {};
const configFileArg = getConfigFileFromArgs(rawArgs);
if (configFileArg) {
  try {
    const configPath = path.resolve(configFileArg);
    debugLog('🗂 Lettura file di configurazione:', configPath);
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    config = parsed;
    debugLog('✅ File JSON valido:', parsed);
  } catch (err) {
    console.error('❌ Errore nella lettura del file JSON:', err.message);
    process.exit(1);
  }
}

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
  program
    .option('-u, --url <url>', 'URL singola o sitemap.xml')
    .option('-f, --formats <formats>', 'html,pdf,screenshot,text')
    .option('-o, --output <folder>', 'Cartella di output')
    .option('-c, --config <file>', 'File JSON di configurazione')
    .option('--csv', 'Salva tempi di caricamento in CSV')
    .option('-d, --debug', 'Attiva modalità debug');

  program.parse(process.argv);

  config = {
    ...config,
    ...(program.url ? { url: program.url } : {}),
    ...(program.output ? { output: program.output } : {}),
    ...(program.formats ? { formats: program.formats.split(',') } : {}),
    ...(program.csv ? { csv: true } : {})
  };

  // Normalizza formats
  if (typeof config.formats === 'string') {
    config.formats = [config.formats];
  }

  debugLog('🛠 Configurazione finale:', config);

  if (!config.url) {
    console.error("❌ Nessun URL specificato né da CLI né da file di configurazione.");
    process.exit(1);
  }

  await fs.ensureDir(config.output || './output');
  const urls = config.url.endsWith('.xml') ? await getUrlsFromSitemap(config.url) : [config.url];
  const csvLog = config.csv ? [['URL', 'Tempo (ms)']] : null;
  const jsonLog = [];

  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  let successCount = 0;
  let failCount = 0;

  for (const url of urls) {
    try {
      console.log(`Render: ${url}`);
      const { results, duration, metadata } = await renderUrl(url, config, page);

      for (const [format, content] of Object.entries(results)) {
        const ext = format === 'screenshot' ? 'png' : (format === 'text' ? 'txt' : format);
        const filename = urlToFilename(url, ext);
        const filepath = path.join(config.output || './output', filename);
        fs.writeFileSync(filepath, content);
        console.log(`  -> Salvato: ${filepath}`);
      }

      if (config.csv) csvLog.push([url, duration.toString()]);
      jsonLog.push(metadata);
      successCount++;
    } catch (err) {
      console.error(`Errore con ${url}: ${err.message}`);
      failCount++;
    }
  }

  if (config.csv && csvLog.length > 1) {
    const csvContent = csvLog.map(line => line.join(',')).join('\n');
    fs.writeFileSync(path.join(config.output || './output', 'tempi.csv'), csvContent);
  }

  fs.writeFileSync(path.join(config.output || './output', 'dati.json'), JSON.stringify(jsonLog, null, 2));

  await browser.close();
  console.log(`Completato. Pagine renderizzate: ${successCount}, errori: ${failCount}`);
}

module.exports = { run };
