const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { log } = require('./utils');

const SHOP_URL = `https://${process.env.SHOPIFY_API_KEY}:${process.env.SHOPIFY_PASSWORD}` +
  `@${process.env.SHOPIFY_STORE_NAME}.myshopify.com/admin/api/2023-10`;

async function productExists(handle) {
  try {
    const url = `${SHOP_URL}/products.json?handle=${handle}`;
    const { data } = await axios.get(url);
    const product = data.products && data.products[0];
    return product ? { id: product.id, variantId: product.variants[0].id } : null;
  } catch (err) {
    log(`Shopify check error: ${err.message}`);
    return null;
  }
}

async function uploadImage(filePath) {
  const imageData = await fs.readFile(filePath, { encoding: 'base64' });
  return { attachment: imageData };
}

async function uploadProduct({ title, body_html, images, price, tags }) {
  try {
    const imgs = [];
    for (const imgPath of images) {
      imgs.push(await uploadImage(imgPath));
    }
    const payload = {
      product: {
        title,
        body_html,
        tags: tags.join(', '),
        images: imgs,
        variants: [
          {
            price,
            inventory_management: 'shopify',
            inventory_quantity: 50
          }
        ]
      }
    };
    const url = `${SHOP_URL}/products.json`;
    const { data } = await axios.post(url, payload);
    log(`Uploaded product ${title} with id ${data.product.id}`);
  } catch (err) {
    log(`Shopify upload error for ${title}: ${err.message}`);
  }
}

async function updateInventory(variantId, quantity) {
  try {
    const url = `${SHOP_URL}/variants/${variantId}.json`;
    const payload = { variant: { id: variantId, inventory_quantity: quantity } };
    await axios.put(url, payload);
    log(`Updated inventory for variant ${variantId} to ${quantity}`);
  } catch (err) {
    log(`Inventory update error: ${err.message}`);
  }
}

module.exports = { uploadProduct, productExists, updateInventory };
