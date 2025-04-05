const fs = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');
const xml2js = require('xml2js');
const { minify } = require('html-minifier-terser');
const { program } = require('commander');
const http = require('http');
const https = require('https');

const rawArgs = process.argv.slice(2);
const DEBUG_MODE = rawArgs.includes('--debug') || rawArgs.includes('-d');

function debugLog(...args) {
  if (DEBUG_MODE) console.log('[DEBUG]', ...args);
}

if (DEBUG_MODE) console.log('[DEBUG] Debug mode active');

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

function urlToFilename(url, extension) {
  let pathname = new URL(url).pathname;
  if (pathname === '/' || pathname === '') return `index${extension}`;
  if (pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  return pathname.replace(/^\//, '').replace(/\//g, '_') + extension;
}

async function getUrlsFromSitemap(sitemapUrl) {
  const xml = await fetch(sitemapUrl);
  const parsed = await new xml2js.Parser().parseStringPromise(xml);
  return parsed.urlset.url.map(entry => entry.loc[0]);
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 50;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          setTimeout(resolve, 500);
        }
      }, 100);
    });
  });
}

function getConfigFileFromArgs(args) {
  const cIndex = args.findIndex(arg => ['-c', '--config'].includes(arg));
  if (cIndex !== -1 && args[cIndex + 1]) {
    return args[cIndex + 1];
  }
  return null;
}

async function run() {
  program
    .option('-u, --url <url>', 'URL singola o sitemap.xml')
    .option('-f, --formats <formats>', 'html,pdf,screenshot,text,html-embedded')
    .option('-o, --output <folder>', 'Output folder')
    .option('-c, --config <file>', 'Configuration JSON file')
    .option('--csv', 'Salva tempi di caricamento in CSV')
    .option('--cookies <json>', 'JSON con cookie da impostare')
    .option('-w, --width <pixel>', 'Larghezza del viewport per screenshot')
    .option('-d, --debug', 'Debug mode');

  program.parse(process.argv);

  const opts = program.opts();

  debugLog('Opts:', opts);

  const configFileArg = process.argv.includes('-c') || process.argv.includes('--config')
    ? process.argv[process.argv.indexOf('-c') + 1] || process.argv[process.argv.indexOf('--config') + 1]
    : null;

  if (configFileArg) {
    try {
      const configPath = path.resolve(configFileArg);
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content);
      config = parsed;
      debugLog('✅ File JSON valido:', parsed);
    } catch (err) {
      console.error("❌ Error reading JSON configuration file:", err.message);
      process.exit(1);
    }
  }

  config = {
    ...config,
    ...(opts.url && { url: opts.url }),
    ...(opts.output && { output: opts.output }),
    ...(opts.formats && { formats: opts.formats.split(',') }),
    ...(opts.csv && { csv: true }),
    ...(opts.width && { width: parseInt(opts.width, 10) }),
    ...(opts.cookies && { cookies: JSON.parse(opts.cookies) })
  };

  if (typeof config.formats === 'string') {
    config.formats = [config.formats];
  }

  debugLog('🛠 Final configuration:', config);

  if (!config.url) {
    console.error("❌ Nessun URL specificato.");
    process.exit(1);
  }

  await fs.ensureDir(config.output || './output');
  const urls = config.url.endsWith('.xml') ? await getUrlsFromSitemap(config.url) : [config.url];

  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.setViewport({ width: config.width || 1024, height: 1000 });

  if (config.cookies) {
    const cookieList = Object.entries(config.cookies).map(([name, value]) => ({
      name,
      value: String(value),
      domain: new URL(config.url).hostname
    }));
    await page.setCookie(...cookieList);
    debugLog('🍪 Cookie impostati:', cookieList);
  }

  let success = 0, fail = 0;

  for (const url of urls) {
    try {
      console.log(`Render: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 0 });
      await autoScroll(page);

      const baseFilename = urlToFilename(url, '');

      if (config.formats.includes('screenshot')) {
        const suffix = `_${config.width || 1024}px.png`;
        const screenshotPath = path.join(config.output, baseFilename + suffix);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`  -> Saved: ${screenshotPath}`);
      }

      if (config.formats.includes('pdf')) {
        const pdfPath = path.join(config.output, baseFilename + '.pdf');
        await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
        console.log(`  -> Saved: ${pdfPath}`);
      }

      success++;
    } catch (err) {
      console.error(`Error with ${url}: ${err.message}`);
      fail++;
    }
  }

  await browser.close();
  console.log(`Completato. Pagine renderizzate: ${success}, errori: ${fail}`);
}

module.exports = { run };
