/* ==========================================================================
   Content pages driven by data/*.json.
   Each renderer is a no-op unless its container exists on the page, so this
   one file can be included everywhere.
   ========================================================================== */

const L = () => document.documentElement.lang || 'en';
const pick = (ko, en) => (L() === 'ko' ? ko : en);

function initials(name) {
  return String(name).trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

/* --- faculty directory (search + filter) --------------------------------- */

async function renderFaculty() {
  const grid = document.getElementById('faculty-grid');
  if (!grid) return;
  const { faculty } = await loadData('faculty');

  const search = document.getElementById('faculty-search');
  const areaSel = document.getElementById('faculty-area');

  // Build the research-area filter from the data itself.
  const areas = [...new Set(faculty.flatMap((f) => f.areas || []))].sort();
  areaSel.innerHTML = `<option value="">${pick('전체 연구분야', 'All research areas')}</option>`
    + areas.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('');

  function draw() {
    const q = (search.value || '').trim().toLowerCase();
    const area = areaSel.value;

    const hits = faculty.filter((f) => {
      if (area && !(f.areas || []).includes(area)) return false;
      if (!q) return true;
      const hay = [t(f.name), t(f.lab), t(f.title), (f.areas || []).join(' '), f.email]
        .join(' ').toLowerCase();
      return hay.includes(q);
    });

    document.getElementById('faculty-count').textContent =
      pick(`${hits.length}명`, `${hits.length} ${hits.length === 1 ? 'person' : 'people'}`);

    if (!hits.length) {
      grid.innerHTML = `<p class="col-span-full text-center text-gray-500 italic py-12">
        ${pick('검색 결과가 없습니다.', 'No matches.')}</p>`;
      return;
    }

    grid.innerHTML = hits.map((f) => `
      <article class="card card-hover p-6 flex gap-4">
        ${f.photo
          ? `<img src="${esc(f.photo)}" alt="" class="h-20 w-20 rounded-lg object-cover flex-shrink-0">`
          : `<div class="h-20 w-20 rounded-lg dept-bg text-white grid place-items-center text-xl font-bold flex-shrink-0">${esc(initials(t(f.name)))}</div>`}
        <div class="min-w-0">
          <h3 class="text-lg font-bold dept-color">${esc(t(f.name))}</h3>
          <p class="text-sm text-gray-500">${esc(t(f.title))} · ${esc(t(f.lab))}</p>
          <div class="mt-2 flex flex-wrap gap-1">
            ${(f.areas || []).map((a) => `<span class="tag">${esc(a)}</span>`).join('')}
          </div>
          <div class="mt-3 text-sm space-y-0.5">
            ${f.email ? `<p><a href="mailto:${esc(f.email)}" class="accent-color hover:underline">${esc(f.email)}</a></p>` : ''}
            ${f.phone ? `<p class="text-gray-500">${esc(f.phone)}</p>` : ''}
            ${f.office ? `<p class="text-gray-500">${esc(t(f.office))}</p>` : ''}
            ${f.website ? `<p><a href="${esc(f.website)}" target="_blank" rel="noopener" class="accent-color hover:underline">${pick('연구실 홈페이지 →', 'Lab website →')}</a></p>` : ''}
          </div>
        </div>
      </article>`).join('');
  }

  search.addEventListener('input', draw);
  areaSel.addEventListener('change', draw);
  document.addEventListener('langchange', draw);
  draw();
}

/* --- courses ------------------------------------------------------------- */

async function renderCourses() {
  const host = document.getElementById('course-list');
  if (!host) return;
  const { courses } = await loadData('courses');
  const tabs = document.querySelectorAll('[data-level]');
  let level = 'undergraduate';

  function draw() {
    tabs.forEach((b) => b.classList.toggle('dept-bg', b.dataset.level === level));
    tabs.forEach((b) => b.classList.toggle('text-white', b.dataset.level === level));

    const hits = courses.filter((c) => c.level === level);
    host.innerHTML = hits.map((c) => `
      <article class="card p-5">
        <div class="flex items-baseline justify-between gap-3">
          <h3 class="font-bold dept-color">${esc(t(c.title))}</h3>
          <span class="text-xs font-mono text-gray-400 flex-shrink-0">${esc(c.code)}</span>
        </div>
        <p class="text-xs text-gray-500 mt-1">
          ${esc(c.credits)} ${pick('학점', 'credits')} ·
          ${c.semester === 'both' ? pick('매 학기', 'Every semester') : pick(`${c.semester}학기`, `Semester ${c.semester}`)}
        </p>
        <p class="text-sm text-gray-600 mt-2">${esc(t(c.desc))}</p>
      </article>`).join('');
  }

  tabs.forEach((b) => b.addEventListener('click', () => { level = b.dataset.level; draw(); }));
  document.addEventListener('langchange', draw);
  draw();
}

/* --- news ---------------------------------------------------------------- */

async function renderNews(limit) {
  const host = document.getElementById('news-list');
  if (!host) return;
  const { news } = await loadData('news');
  const items = [...news].sort((a, b) => b.date.localeCompare(a.date));

  function draw() {
    const shown = limit ? items.slice(0, limit) : items;
    host.innerHTML = shown.map((n) => `
      <article class="border-b border-gray-100 last:border-0 pb-4 mb-4 last:mb-0 last:pb-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="tag">${esc(n.category)}</span>
          <time class="text-xs text-gray-400">${esc(fmtDate(n.date, L()))}</time>
        </div>
        <h3 class="font-semibold text-gray-900">${esc(t(n.title))}</h3>
        <p class="text-sm text-gray-600 mt-1">${esc(t(n.body))}</p>
        ${n.link ? `<a href="${esc(n.link)}" class="text-sm accent-color hover:underline mt-1 inline-block">${pick('자세히 보기 →', 'Read more →')}</a>` : ''}
      </article>`).join('');
  }

  document.addEventListener('langchange', draw);
  draw();
}

/* --- research areas ------------------------------------------------------ */

async function renderResearch() {
  const host = document.getElementById('research-grid');
  if (!host) return;
  const { areas } = await loadData('research');

  function draw() {
    host.innerHTML = areas.map((a) => `
      <article class="card card-hover p-6">
        <div class="text-3xl mb-3">${esc(a.icon)}</div>
        <h3 class="font-bold dept-color mb-2">${esc(t(a.title))}</h3>
        <p class="text-sm text-gray-600">${esc(t(a.desc))}</p>
      </article>`).join('');
  }

  document.addEventListener('langchange', draw);
  draw();
}

/* --- upcoming bookings teaser (home page) -------------------------------- */

async function renderUpcoming() {
  const host = document.getElementById('upcoming-list');
  if (!host) return;

  const today = new Date();
  const in14 = new Date();
  in14.setDate(today.getDate() + 14);
  const iso = (d) => d.toISOString().slice(0, 10);

  let items = [];
  try {
    if (window.DEPT_CONFIG && DEPT_CONFIG.endpoint) {
      const res = await fetch(`${DEPT_CONFIG.endpoint}?action=list&from=${iso(today)}&to=${iso(in14)}`);
      const body = await res.json();
      items = body.ok ? body.reservations : [];
    } else {
      items = JSON.parse(localStorage.getItem('dept-mbio-demo-reservations') || '[]')
        .filter((r) => r.date >= iso(today) && r.date <= iso(in14));
    }
  } catch (err) {
    console.error('upcoming bookings:', err);
  }

  items.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  function draw() {
    if (!items.length) {
      host.innerHTML = `<p class="text-sm text-gray-500 italic">
        ${pick('예정된 예약이 없습니다.', 'No bookings in the next two weeks.')}</p>`;
      return;
    }
    host.innerHTML = items.slice(0, 5).map((r) => `
      <li class="flex items-baseline gap-3 py-2 border-b border-gray-100 last:border-0">
        <span class="text-xs font-mono text-gray-400 flex-shrink-0 w-24">${esc(r.date.slice(5))} ${esc(r.start)}</span>
        <span class="text-sm text-gray-800 truncate">${esc(r.name)}</span>
        <span class="text-xs text-gray-400 truncate">${esc(r.lab || '')}</span>
      </li>`).join('');
  }

  document.addEventListener('langchange', draw);
  draw();
}

/* --- boot ---------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  const limit = Number(document.body.dataset.newsLimit) || 0;
  [renderFaculty, renderCourses, renderResearch, renderUpcoming].forEach((fn) =>
    fn().catch((err) => console.error(err)));
  renderNews(limit).catch((err) => console.error(err));
});
