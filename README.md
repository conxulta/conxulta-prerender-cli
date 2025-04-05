# Prerender CLI Conxulta

CLI per il prerendering completo e offline di pagine web JavaScript.  
Consente di generare snapshot delle pagine con contenuti completamente embedded e pronti per uso offline.

---

## ✅ Funzionalità principali

- 🔁 Rendering da URL singola o sitemap XML
- 📦 Generazione formati:
  - `html` → versione completa renderizzata
  - `html-embedded` → HTML con immagini, CSS, favicon inline
  - `screenshot` → immagine PNG della pagina con scroll completo
  - `pdf` → esportazione in formato PDF
  - `text` → solo contenuto testuale della pagina
- 🧠 Scroll automatico fino al fondo della pagina (`autoScroll`)
- 📐 Larghezza viewport personalizzabile (`--width`, default `1024px`)
- 📸 Nomi dei file salvati con suffisso dimensione (`_1024px.png`)
- 🍪 Gestione cookie (`--cookies` o da `config.json`)
- 📄 Salvataggio metadati e tempi (`dati.json`, `tempi.csv`)
- 💬 Commento HTML con timestamp di generazione
- 🧪 Supporta banner cookie tipo GDPR (es. `gdpr: true`)
- 🆘 Comando `-h config` per visualizzare esempio JSON
- 📌 Comando `-v` per visualizzare la versione

---

## 📄 Esempio di file `config.default.json`

```json
{
  "url": "https://www.miosito.it/sitemap.xml",
  "formats": ["html-embedded", "screenshot", "pdf"],
  "output": "./output",
  "width": 1024,
  "csv": true,
  "cookies": {
    "gdpr": "true"
  }
}
```

---

## 🧪 Esempio uso CLI

```bash
# Con configurazione JSON
prerender -c config.default.json --debug

# Direttamente da riga di comando
prerender -u https://example.com -f screenshot,html -w 1440 --cookies '{"gdpr": "true"}'
```

---

## 🔍 Help CLI

```bash
prerender -h
prerender -h config
prerender -v
```

---

© Francesco Saverio Giudice – Conxulta CLI Tools
