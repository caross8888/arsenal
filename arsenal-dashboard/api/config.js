// api/config.js — Vercel Serverless Function
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ widgetKey: process.env.API_FOOTBALL_WIDGET_KEY || '' });
}
