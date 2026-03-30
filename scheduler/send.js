#!/usr/bin/env node
"use strict";

require("dotenv").config();
const nodemailer = require("nodemailer");
const fetch      = require("node-fetch");

// ── Config ───────────────────────────────────────────────────────────────────

const CONFIG = {
  smtp: {
    host:   process.env.SMTP_HOST   || "smtp.gmail.com",
    port:   Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== "false",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },
  from:        `"${process.env.FROM_NAME || "The Finance Daily"}" <${process.env.FROM_EMAIL}>`,
  to:          process.env.TO_EMAIL,
  maxArticles: Number(process.env.MAX_ARTICLES || 30),
  isTest:      process.argv.includes("--test"),
};

// ── Sources (mirrors finance-news.html) ──────────────────────────────────────

const SOURCES = [
  // Americas
  { id: "yahoo",       name: "Yahoo Finance",         region: "Americas", url: "https://finance.yahoo.com/news/rssindex" },
  { id: "reuters",     name: "Reuters Business",      region: "Americas", url: "https://feeds.reuters.com/reuters/businessNews" },
  { id: "cnbc",        name: "CNBC",                  region: "Americas", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { id: "marketwatch", name: "MarketWatch",           region: "Americas", url: "https://feeds.marketwatch.com/marketwatch/topstories/" },
  { id: "wsj",         name: "WSJ Markets",           region: "Americas", url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml" },
  // Europe
  { id: "ft",          name: "FT Markets",            region: "Europe",   url: "https://www.ft.com/rss/markets" },
  { id: "bbc",         name: "BBC Business",          region: "Europe",   url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { id: "economist",   name: "The Economist",         region: "Europe",   url: "https://www.economist.com/finance-and-economics/rss.xml" },
  // Asia-Pacific
  { id: "nikkei",      name: "Nikkei Asia",           region: "Asia-Pacific", url: "https://asia.nikkei.com/rss/feed/nar" },
  { id: "scmp",        name: "S. China Morning Post", region: "Asia-Pacific", url: "https://www.scmp.com/rss/91/feed" },
  { id: "et",          name: "Economic Times",        region: "Asia-Pacific", url: "https://economictimes.indiatimes.com/markets/rss.cms" },
  { id: "cna",         name: "Channel NewsAsia",      region: "Asia-Pacific", url: "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511" },
  { id: "straits",     name: "Straits Times",         region: "Asia-Pacific", url: "https://www.straitstimes.com/business/rss.xml" },
  { id: "caixin",      name: "Caixin Global",         region: "Asia-Pacific", url: "https://www.caixinglobal.com/rss/en_top_news.xml" },
];

const REGION_COLOR = { Americas: "#154320", Europe: "#4a1a6e", "Asia-Pacific": "#1a5276" };

const RSS2JSON = "https://api.rss2json.com/v1/api.json?rss_url=";

// ── Fetch feeds ───────────────────────────────────────────────────────────────

async function fetchSource(source) {
  const url = `${RSS2JSON}${encodeURIComponent(source.url)}`;
  const res  = await fetch(url, { timeout: 10000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== "ok") throw new Error("Feed error");
  return (data.items || []).map(item => ({
    source:      source.name,
    region:      source.region,
    title:       (item.title || "").trim(),
    link:        item.link || "#",
    description: stripHtml(item.description || ""),
    pubDate:     item.pubDate ? new Date(item.pubDate) : new Date(),
  }));
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchAllSources() {
  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  const articles = [], errors = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") articles.push(...r.value);
    else { errors.push(SOURCES[i].name); console.warn(`[WARN] ${SOURCES[i].name}: ${r.reason.message}`); }
  });
  articles.sort((a, b) => b.pubDate - a.pubDate);
  return { articles, errors };
}

// ── Build HTML email ──────────────────────────────────────────────────────────

function formatDate(d) {
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60)    return "Just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(articles, errors, dateStr) {
  const top     = articles[0];
  const rest    = articles.slice(1, CONFIG.maxArticles);

  // Group remaining by region for section headers
  const byRegion = {};
  rest.forEach(a => {
    if (!byRegion[a.region]) byRegion[a.region] = [];
    byRegion[a.region].push(a);
  });

  const regionSections = Object.entries(byRegion).map(([region, items]) => `
    <tr><td colspan="3" style="padding:18px 0 8px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:Georgia,serif;font-size:11px;font-weight:700;letter-spacing:2px;
                   text-transform:uppercase;color:#fff;background:${REGION_COLOR[region] || "#333"};
                   padding:4px 12px;white-space:nowrap;">${esc(region)}</td>
        <td style="border-bottom:2px solid ${REGION_COLOR[region] || "#333"};width:100%;"></td>
      </tr></table>
    </td></tr>
    ${items.map(a => `
    <tr>
      <td style="padding:10px 14px 10px 0;border-bottom:1px solid #e8e0d4;vertical-align:top;width:130px;">
        <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.5px;
                    text-transform:uppercase;color:#7a6a56;">${esc(a.source)}</div>
        <div style="font-family:Arial,sans-serif;font-size:10px;color:#aaa;margin-top:2px;">${formatDate(a.pubDate)}</div>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #e8e0d4;vertical-align:top;">
        <a href="${esc(a.link)}" style="font-family:Georgia,serif;font-size:14px;font-weight:700;
                 color:#1a1008;text-decoration:none;line-height:1.35;">${esc(a.title)}</a>
        ${a.description ? `<p style="font-family:Arial,sans-serif;font-size:12px;color:#555;
                   margin:5px 0 0;line-height:1.5;">${esc(a.description.slice(0, 180))}${a.description.length > 180 ? "…" : ""}</p>` : ""}
      </td>
    </tr>`).join("")}
  `).join("");

  const errorBanner = errors.length ? `
    <tr><td style="padding:8px 12px;background:#fff3cd;font-family:Arial,sans-serif;
                   font-size:11px;color:#856404;border:1px solid #ffc107;">
      Could not load: ${errors.map(esc).join(", ")}
    </td></tr>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>The Finance Daily — ${esc(dateStr)}</title>
</head>
<body style="margin:0;padding:0;background:#f0ebe0;font-family:Georgia,serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ebe0;">
<tr><td align="center" style="padding:24px 12px;">
<table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;background:#faf7f2;">

  <!-- Masthead -->
  <tr><td style="padding:24px 32px 16px;border-bottom:3px double #1a1008;text-align:center;">
    <h1 style="font-family:Georgia,serif;font-size:38px;font-weight:900;letter-spacing:6px;
               text-transform:uppercase;margin:0 0 6px;color:#1a1008;">The Finance Daily</h1>
    <p style="font-family:Arial,sans-serif;font-size:11px;color:#7a6a56;margin:0;">
      ${esc(dateStr)}&nbsp;&nbsp;·&nbsp;&nbsp;${articles.length} articles from ${SOURCES.length} sources
    </p>
  </td></tr>

  ${errorBanner}

  <!-- Lead story -->
  ${top ? `
  <tr><td style="padding:24px 32px;border-bottom:2px solid #1a1008;">
    <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;
                text-transform:uppercase;color:${REGION_COLOR[top.region] || "#333"};margin-bottom:8px;">
      ${esc(top.region)} &nbsp;·&nbsp; ${esc(top.source)}
    </div>
    <a href="${esc(top.link)}" style="font-family:Georgia,serif;font-size:24px;font-weight:700;
             color:#1a1008;text-decoration:none;line-height:1.25;display:block;margin-bottom:10px;">
      ${esc(top.title)}
    </a>
    ${top.description ? `<p style="font-family:Arial,sans-serif;font-size:13px;color:#3d3022;
                 line-height:1.6;margin:0 0 10px;">${esc(top.description.slice(0, 300))}${top.description.length > 300 ? "…" : ""}</p>` : ""}
    <span style="font-family:Arial,sans-serif;font-size:11px;color:#aaa;">${formatDate(top.pubDate)}</span>
  </td></tr>` : ""}

  <!-- Articles by region -->
  <tr><td style="padding:0 32px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${regionSections}
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 32px;background:#1a1008;text-align:center;">
    <p style="font-family:Arial,sans-serif;font-size:10px;color:#7a6a56;margin:0;letter-spacing:1px;">
      THE FINANCE DAILY &nbsp;·&nbsp; AUTOMATED HOURLY DIGEST &nbsp;·&nbsp;
      <a href="https://finance.yahoo.com" style="color:#c8b89a;text-decoration:none;">Unsubscribe</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Send email ────────────────────────────────────────────────────────────────

async function sendEmail(html, dateStr, articles) {
  if (!CONFIG.smtp.auth.user || !CONFIG.smtp.auth.pass) {
    throw new Error("SMTP credentials not set. Copy .env.example → .env and fill in your details.");
  }
  if (!CONFIG.to) {
    throw new Error("TO_EMAIL not set in .env");
  }

  const transporter = nodemailer.createTransport(CONFIG.smtp);
  await transporter.verify();

  // Attach a standalone HTML file as well
  const attachment = Buffer.from(html);

  const info = await transporter.sendMail({
    from:    CONFIG.from,
    to:      CONFIG.to,
    subject: `The Finance Daily — ${dateStr} (${articles.length} stories)`,
    html,
    attachments: [{
      filename: `finance-daily-${new Date().toISOString().slice(0, 13).replace("T", "-")}h.html`,
      content:  attachment,
      contentType: "text/html",
    }],
  });

  return info.messageId;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });

  console.log(`[${new Date().toISOString()}] Finance Daily — fetching feeds…`);

  const { articles, errors } = await fetchAllSources();
  console.log(`  ✓ ${articles.length} articles fetched (${errors.length} sources failed)`);

  if (articles.length === 0) {
    console.error("  ✗ No articles fetched — aborting send.");
    process.exit(1);
  }

  const html = buildHtml(articles, errors, dateStr);

  if (CONFIG.isTest) {
    const fs   = require("fs");
    const path = require("path");
    const out  = path.join(__dirname, "test-output.html");
    fs.writeFileSync(out, html);
    console.log(`  ✓ TEST MODE — HTML saved to ${out} (no email sent)`);
    return;
  }

  console.log(`  Sending to ${CONFIG.to}…`);
  const msgId = await sendEmail(html, dateStr, articles);
  console.log(`  ✓ Sent! Message-ID: ${msgId}`);
}

main().catch(err => {
  console.error(`[${new Date().toISOString()}] FATAL: ${err.message}`);
  process.exit(1);
});
