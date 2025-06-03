# ARZOLA SCAPS BOT

This repository contains an automation script that scrapes hat listings from **BigBossCaps** and publishes them to Shopify. Images are cleaned using the Pixian.AI service. The bot runs hourly via GitHub Actions.

## Setup

1. Copy `.env.example` to `.env` and fill in your credentials.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the bot locally:
   ```bash
   npm start
   ```

The workflow in `.github/workflows/run-bot.yml` runs `npm start` every hour on GitHub Actions. Logs are saved to `logs.txt`.
