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

if (DEBUG_MODE) console.log('[DEBUG] Debug attivo');

function getConfigFileFromArgs(args) {
  const cIndex = args.findIndex(arg => ['-c', '--config'].includes(arg));
  if (cIndex !== -1 && args[cIndex + 1]) {
    return args[cIndex + 1];
  }
  return null;
}

async function getUrlsFromSitemap(sitemapUrl) {
  const xml = await fetch(sitemapUrl);
  const parsed = await new xml2js.Parser().parseStringPromise(xml);
  return parsed.urlset.url.map(entry => entry.loc[0]);
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

function urlToFilename(url, extension) {
  let pathname = new URL(url).pathname;
  if (pathname === '/' || pathname === '') return `index${extension}`;
  if (pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  return pathname.replace(/^\//, '').replace(/\//g, '_') + extension;
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


async function revealFooter(page) {
  await page.waitForTimeout(1000); // attesa extra per animazioni
  await page.evaluate(() => {
    const footer = document.querySelector('footer.q-footer');
    if (footer) {
      footer.style.display = 'block';
      footer.style.visibility = 'visible';
      footer.style.opacity = '1';
      footer.style.transform = 'translateY(0)';
      footer.classList.add('q-footer--revealed');
    }
  });
}

async function revealFooter(page) {
  await page.evaluate(() => {
    const footer = document.querySelector('footer.q-footer');
    if (footer) {
      footer.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  });
  await page.waitForTimeout(800);
}

async function inlineImages(page) {
  await page.evaluate(async () => {
    const toDataURL = async (url) => {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    };

    const imgs = Array.from(document.querySelectorAll('img'));
    for (const img of imgs) {
      const dataUrl = await toDataURL(img.src);
      if (dataUrl) {
        img.src = dataUrl;
      }
    }
  });
}
async function run() {
  program
    .option('-u, --url <url>', 'URL singola o sitemap.xml')
    .option('-f, --formats <formats>', 'html,pdf,screenshot,text,html-embedded,html-minified')
    .option('-o, --output <folder>', 'Cartella di output')
    .option('-c, --config <file>', 'File JSON di configurazione')
    .option('--csv', 'Salva tempi di caricamento in CSV')
    .option('--cookies <json>', 'JSON con cookie da impostare')
    .option('-w, --width <pixel>', 'Larghezza del viewport per screenshot')
    .option('-d, --debug', 'Modalità debug');

  program.parse(process.argv);

  let config = {};
  const configFileArg = getConfigFileFromArgs(process.argv.slice(2));
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

  config = {
    ...config,
    ...(program.url ? { url: program.url } : {}),
    ...(program.output ? { output: program.output } : {}),
    ...(program.formats ? { formats: program.formats.split(',') } : {}),
    ...(program.csv ? { csv: true } : {}),
    ...(program.width ? { width: parseInt(program.width, 10) } : { width: 1024 })
  };

  if (typeof config.formats === 'string') {
    config.formats = [config.formats];
  }

  if (program.cookies) {
    try {
      const cliCookies = JSON.parse(program.cookies);
      config.cookies = { ...config.cookies, ...cliCookies };
    } catch (err) {
      console.error("❌ Errore nel parsing del parametro --cookies");
      process.exit(1);
    }
  }

  debugLog('🛠 Configurazione finale:', config);

  if (!config.url) {
    console.error("❌ Nessun URL specificato.");
    process.exit(1);
  }

  await fs.ensureDir(config.output || './output');
  const urls = config.url.endsWith('.xml') ? await getUrlsFromSitemap(config.url) : [config.url];

  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.setViewport({ width: config.width, height: 1000 });

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
      await inlineImages(page);
      await autoScroll(page);
      await revealFooter(page);
      await revealFooter(page);

      const baseFilename = urlToFilename(url, '');

      const html = await page.evaluate(() => document.documentElement.outerHTML);
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const comment = `<!-- Pagina salvata offline il ${now} -->\n`;
      const fullHTML = comment + html;

      if (config.formats.includes('html-embedded')) {
        const filePath = path.join(config.output, baseFilename + '_embedded.html');
        fs.writeFileSync(filePath, fullHTML);
        console.log(`  -> Salvato: ${filePath}`);
      }

      if (config.formats.includes('html-minified')) {
        const minified = await minify(fullHTML, {
          collapseWhitespace: true,
          minifyCSS: true,
          removeComments: true
        });
        const filePath = path.join(config.output, baseFilename + '_minified.html');
        fs.writeFileSync(filePath, minified);
        console.log(`  -> Salvato: ${filePath}`);
      }

      if (config.formats.includes('screenshot')) {
        const suffix = `_${config.width}px.png`;
        const screenshotPath = path.join(config.output, baseFilename + suffix);
await page.evaluate(() => {
  const footer = document.querySelector('footer.q-footer');
  if (footer) {
    footer.style.display = 'block';
    footer.style.visibility = 'visible';
    footer.style.opacity = '1';
    footer.style.transform = 'translateY(0)';
    footer.classList.add('q-footer--revealed');
  }
});

        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`  -> Salvato: ${screenshotPath}`);
      }

      if (config.formats.includes('pdf')) {
        const pdfPath = path.join(config.output, baseFilename + '.pdf');
        await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
        console.log(`  -> Salvato: ${pdfPath}`);
      }
      success++;
    } catch (err) {
      console.error(`Errore con ${url}: ${err.message}`);
      fail++;
    }
  }

  await browser.close();
  console.log(`Completato. Pagine renderizzate: ${success}, errori: ${fail}`);
}

module.exports = { run };
