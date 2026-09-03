/* ==========================================================================
   Department of Microbiology, CBNU — shared site script
   Responsibilities: language toggle, shared header/footer injection,
   JSON data loading helpers, and the small interactive widgets.
   ========================================================================== */

/* --- language ------------------------------------------------------------ */

const LANG_KEY = 'dept-mbio-lang';

/** Current language: 'ko' | 'en'. Falls back to browser preference, then Korean. */
function currentLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === 'ko' || saved === 'en') return saved;
  return navigator.language && navigator.language.startsWith('ko') ? 'ko' : 'en';
}

/**
 * Apply a language across the document.
 * Elements carrying BOTH data-ko and data-en have their text swapped.
 * Elements carrying only one are shown/hidden by CSS (see style.css).
 */
function applyLang(lang) {
  document.documentElement.lang = lang;
  localStorage.setItem(LANG_KEY, lang);

  document.querySelectorAll('[data-ko][data-en]').forEach((el) => {
    const text = el.dataset[lang];
    if (text === undefined) return;
    // Allow simple inline markup (e.g. <br>) inside translations.
    if (/<[a-z][\s\S]*>/i.test(text)) el.innerHTML = text;
    else el.textContent = text;
  });

  document.querySelectorAll('[data-ko-placeholder][data-en-placeholder]').forEach((el) => {
    el.placeholder = lang === 'ko' ? el.dataset.koPlaceholder : el.dataset.enPlaceholder;
  });

  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.lang === lang);
  });

  // Let page scripts re-render anything built from JSON.
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

/** Pick the right field from a `{ ko, en }` pair in the JSON data files. */
function t(value, lang = document.documentElement.lang || 'en') {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return value[lang] || value.en || value.ko || '';
}

/* --- shared header / footer ---------------------------------------------- */

/**
 * Inject partials/nav.html and partials/footer.html so navigation lives in
 * one file. `depth` is how many directories deep the page sits (0 for root).
 */
async function injectPartials() {
  const prefix = document.body.dataset.root || './';
  const targets = [
    ['main-nav', `${prefix}partials/nav.html`],
    ['main-footer', `${prefix}partials/footer.html`],
  ];

  await Promise.all(targets.map(async ([id, url]) => {
    const host = document.getElementById(id);
    if (!host) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      host.innerHTML = await res.text();
      // Rewrite relative hrefs/srcs for pages that are not at the site root.
      if (prefix !== './') {
        host.querySelectorAll('[href^="./"], [src^="./"]').forEach((el) => {
          const attr = el.hasAttribute('href') ? 'href' : 'src';
          el.setAttribute(attr, prefix + el.getAttribute(attr).slice(2));
        });
      }
    } catch (err) {
      console.error(`Could not load ${url}:`, err);
    }
  }));

  markCurrentNavLink();
  wireMobileMenu();
  wireLangButtons();
  const year = document.getElementById('copyright-year');
  if (year) year.textContent = new Date().getFullYear();
}

function markCurrentNavLink() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('#main-nav a[href]').forEach((a) => {
    if (a.getAttribute('href').split('/').pop() === page) {
      a.setAttribute('aria-current', 'page');
    }
  });
}

function wireMobileMenu() {
  const button = document.getElementById('mobile-menu-button');
  const menu = document.getElementById('mobile-menu');
  if (!button || !menu) return;
  button.addEventListener('click', () => {
    const open = !menu.classList.toggle('hidden');
    button.setAttribute('aria-expanded', String(open));
  });
}

function wireLangButtons() {
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => applyLang(btn.dataset.lang));
  });
}

/* --- data ---------------------------------------------------------------- */

const _dataCache = new Map();

/** Load and cache a JSON file from data/. */
async function loadData(name) {
  if (_dataCache.has(name)) return _dataCache.get(name);
  const prefix = document.body.dataset.root || './';
  const promise = fetch(`${prefix}data/${name}.json`).then((res) => {
    if (!res.ok) throw new Error(`data/${name}.json → ${res.status}`);
    return res.json();
  });
  _dataCache.set(name, promise);
  return promise;
}

/** Escape untrusted-ish strings before dropping them into innerHTML. */
function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Format an ISO date (YYYY-MM-DD) for the active language. */
function fmtDate(iso, lang = document.documentElement.lang || 'en') {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric', month: lang === 'ko' ? 'long' : 'short', day: 'numeric',
  });
}

/* --- boot ---------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', async () => {
  await injectPartials();
  applyLang(currentLang());
});
