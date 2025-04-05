#!/usr/bin/env node
const { run } = require('../lib/render');
const { program } = require('commander');

// Controllo esplicito di -h config o --help config
const args = process.argv.slice(2);
if ((args.includes('-h') || args.includes('--help')) && args.includes('config')) {
  console.log('\n📄 Esempio file di configurazione JSON:\n');
  console.log(JSON.stringify({
    url: "https://www.miosito.it/sitemap.xml",
    formats: ["html-embedded", "screenshot"],
    output: "./output",
    width: 1024,
    csv: true,
    cookies: {
      gdpr: "true"
    }
  }, null, 2));
  process.exit(0);
}

program
  .name('prerender')
  .description('CLI per il prerendering di siti JavaScript offline')
  .version('1.3.3', '-v, --version', 'Mostra la versione corrente')
  .usage('-u <url|sitemap> -f <formati> -o <output> [options]')
  .option('-u, --url <url>', 'URL singola o sitemap.xml')
  .option('-f, --formats <formats>', 'html, pdf, screenshot, text, html-embedded')
  .option('-o, --output <folder>', 'Cartella di output')
  .option('-c, --config <file>', 'File JSON di configurazione')
  .option('--cookies <json>', 'Stringa JSON con cookie da impostare')
  .option('--csv', 'Salva tempi in CSV')
  .option('-w, --width <pixel>', 'Larghezza del viewport per screenshot')
  .option('-d, --debug', 'Modalità debug')
  .helpOption('-h, --help [config]', 'Mostra l\'help (aggiungi "config" per esempio JSON)')
  .parse();

if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

run();
