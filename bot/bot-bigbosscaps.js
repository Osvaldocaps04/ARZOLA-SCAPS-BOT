/**
 * BOT AUTOMATIZADO PARA SHOPIFY – EXTRAER GORRAS DE BigBossCaps
 *
 * 1. Usar Puppeteer o Axios/Cheerio para scrapear bigbosscaps.com:
 *    - Recorrer todas las páginas de gorras.
 *    - Para cada gorra obtener: nombre, precio original, URL de imágenes, colección (por ejemplo “Dandy Hats” si el nombre incluye esas palabras).
 *    - Detectar si la gorra ya existe en Shopify (buscando por handle o SKU).
 *
 * 2. Para cada gorra nueva (no exista en Shopify):
 *    a) Descargar todas las imágenes.
 *    b) Llamar a un servicio de eliminación de marca de agua (por ejemplo, la API de Pixian.AI):
 *       • Enviar cada imagen a Pixian.AI y recibir la imagen limpia sin marca de agua.
 *    c) Calcular el precio de venta: precio_original + 1500 MXN.
 *    d) Subir producto a Shopify usando Admin API (requiere API Key y password):
 *       • title: nombre de la gorra.
 *       • body_html: descripción (puede copiar la descripción de BigBossCaps si la hay).
 *       • images: las URLs resultantes de Pixian.AI (subirlas a Shopify).
 *       • variants:
 *           – price: precio calculado.
 *           – inventory_quantity: 50.
 *           – inventory_management: “shopify”.
 *       • tags/collections: asignar la colección según corresponda. Si el nombre incluye “Dandy Hats”, meterlo en la colección “Dandy Hats”.
 *
 * 3. Para cada gorra que ya exista en Shopify:
 *    a) Comprobar el stock en BigBossCaps (por ejemplo, si en la ficha aparece “Agotado” o no hay stock visible).
 *    b) Si está agotada en BigBossCaps, hacer un “UPDATE” vía API de Shopify para poner inventory_quantity en 0 y marcar como “sold out”.
 *    c) Si vuelve a haber stock, actualizar inventory_quantity a 50 (o a la cantidad correcta).
 *
 * 4. Ejecutar este script cada hora:
 *    • Configurar GitHub Actions (o un cron local) que corra `node bot-bigbosscaps.js` cada 60 min.
 *    • Guardar logs de ejecución (puedes usar consola o escribir a un archivo `logs.txt`).
 *
 * 5. Manejo de errores:
 *    • Si falla el scrapeo, reintentar 3 veces con retraso.
 *    • Si falla la llamada a Shopify, loguear el error y seguir con el siguiente producto.
 *
 * 6. Variables de entorno necesarias (en un `.env`):
 *    - SHOPIFY_API_KEY
 *    - SHOPIFY_PASSWORD
 *    - SHOPIFY_STORE_NAME
 *    - PIXIAN_API_KEY
 *
 * 7. Estructura de carpetas sugerida:
 *    /bot
 *      │– bot-bigbosscaps.js       ← Aquí pega este comentario y deja que Copilot genere el código.
 *      │– package.json
 *      │– .env                    ← Llena con tus credenciales.
 *      │– helpers/                 ← Si Copilot separa lógica (e.g., `shopify.js`, `scraper.js`).
 *
 * Con estos comentarios, Codex (vía Copilot) te completará:
 *  - Importaciones (axios, puppeteer, dotenv, etc.).
 *  - Funciones de scraping.
 *  - Llamadas HTTP a la API de Shopify.
 *  - Integración con Pixian.AI.
 *  - Estructura de loop para revisar stock y actualizar.
 *
 * PASOS PARA USARLO EN VS CODE CON COPILOT:
 * 1. Crea un repositorio nuevo y habilita GitHub Copilot.
 * 2. Dentro, crea la carpeta `/bot` y el archivo `bot-bigbosscaps.js`.
 * 3. Pega este bloque de comentarios EXACTO al inicio de `bot-bigbosscaps.js`.
 * 4. Guarda el archivo. Copilot te sugerirá automáticamente el resto del código; acepta las sugerencias o pídele “generate the code”.
 * 5. Revisa que en `package.json` estén las dependencias necesarias: `axios`, `cheerio` o `puppeteer`, `dotenv`, etc.
 * 6. Configura en GitHub Actions un workflow `.github/workflows/run-bot.yml` que ejecute `node bot/bot-bigbosscaps.js` cada hora.
 *
 * De esta forma, Codex sabrá todo lo que debe hacer y generará el esqueleto completo. Luego tú solo revisas y afin­as detalles puntuales (por ejemplo, rutas específicas, nombres de variables).  
 */

// Load environment variables
require('dotenv').config();
const path = require('path');
const fs = require('fs-extra');
const axios = require('axios');
const cheerio = require('cheerio');
const FormData = require('form-data');

const { uploadProduct, productExists, updateInventory } = require('./helpers/shopify');
const { delay, downloadImage, log } = require('./helpers/utils');

const BASE_URL = 'https://bigbosscaps.com';
const START_PAGE = `${BASE_URL}/collections/gorras`; // example collection page

async function fetchHTML(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const { data } = await axios.get(url);
      return cheerio.load(data);
    } catch (error) {
      await delay(1000 * (i + 1));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

async function scrapeProducts() {
  let page = 1;
  let products = [];
  while (true) {
    const url = `${START_PAGE}?page=${page}`;
    log(`Scraping ${url}`);
    let $;
    try {
      $ = await fetchHTML(url);
    } catch (err) {
      log(`Error fetching ${url}: ${err.message}`);
      break;
    }

    const items = $('.product-card');
    if (!items.length) break;

    items.each((_, el) => {
      const name = $(el).find('.product-card__title').text().trim();
      const price = $(el).find('.price').first().text().trim();
      const handle = $(el).find('a').attr('href');
      const img = $(el).find('img').attr('src');
      products.push({ name, price, handle, img });
    });
    page++;
  }
  return products;
}

async function removeWatermark(filePath) {
  const form = new FormData();
  form.append('image', fs.createReadStream(filePath));
  try {
    const { data } = await axios.post('https://api.pixian.ai/remove', form, {
      headers: {
        'Authorization': `Bearer ${process.env.PIXIAN_API_KEY}`,
        ...form.getHeaders(),
      },
    });
    const outPath = filePath.replace(/(\.\w+)$/, '_clean$1');
    await fs.writeFile(outPath, data);
    return outPath;
  } catch (err) {
    log(`Pixian error: ${err.message}`);
    return filePath;
  }
}

async function processProduct(prod) {
  const exists = await productExists(prod.handle);
  if (exists) {
    // check stock page
    const $ = await fetchHTML(`${BASE_URL}${prod.handle}`);
    const soldOut = $('button.sold-out, .sold-out').length > 0;
    const qty = soldOut ? 0 : 50;
    await updateInventory(exists.variantId, qty);
    return;
  }

  const imgPath = await downloadImage(prod.img);
  const cleanPath = await removeWatermark(imgPath);

  const priceNumber = parseFloat(prod.price.replace(/[^\d.]/g, '')) + 1500;

  await uploadProduct({
    title: prod.name,
    body_html: '',
    images: [cleanPath],
    price: priceNumber.toFixed(2),
    tags: prod.name.includes('Dandy Hats') ? ['Dandy Hats'] : [],
  });
}

async function main() {
  try {
    const products = await scrapeProducts();
    for (const p of products) {
      try {
        await processProduct(p);
      } catch (err) {
        log(`Error processing ${p.name}: ${err.message}`);
      }
    }
  } catch (err) {
    log(`Fatal error: ${err.message}`);
  }
}

main();
