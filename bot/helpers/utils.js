const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

const LOG_FILE = path.join(__dirname, '..', '..', 'logs.txt');

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(message);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadImage(url) {
  const fileName = path.basename(url.split('?')[0]);
  const filePath = path.join(__dirname, '..', '..', 'tmp', fileName);
  await fs.ensureDir(path.dirname(filePath));
  const writer = fs.createWriteStream(filePath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(filePath));
    writer.on('error', reject);
  });
}

module.exports = { log, delay, downloadImage };
