#!/usr/bin/env node
const { run } = require('../lib/render');
const { program } = require('commander');

// Controllo esplicito di -h config o --help config
const args = process.argv.slice(2);
if ((args.includes('-h') || args.includes('--help')) && args.includes('config')) {
  console.log('\n📄 Example JSON configuration file:\n');
  console.log(JSON.stringify({
    url: "https://www.mysite.com/sitemap.xml",
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
  .description('CLI for prerendering JavaScript-based web pages\\n© 2025 Francesco Saverio Giudice – Conxulta CLI Tools')
  .version('1.4.0', '-v, --version', 'Show current version')
  .usage('-u <url|sitemap> -f <formats> -o <output> [options]')
  .option('-u, --url <url>', 'single URL or sitemap.xml')
  .option('-f, --formats <formats>', 'html, pdf, screenshot, text, html-embedded')
  .option('-o, --output <folder>', 'Output folder')
  .option('-c, --config <file>', 'Configuration JSON file')
  .option('--cookies <json>', 'JSON string with cookies to set')
  .option('--csv', 'Save timing in CSV file')
  .option('-w, --width <pixel>', 'Viewport width for screenshots')
  .option('-d, --debug', 'Enable debug')
  .helpOption('-h, --help [config]', 'Display this help (add "config" to see JSON example)')
  .parse();

if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

run();
