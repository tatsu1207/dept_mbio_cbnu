/* ==========================================================================
   Seminar room reservation — month calendar + booking form.
   Talks to a Google Apps Script web app (see apps-script/Code.gs).
   Falls back to a browser-local DEMO mode when no endpoint is configured.
   ========================================================================== */

const CFG = window.DEPT_CONFIG;
const DEMO = !CFG.endpoint;
const DEMO_KEY = 'dept-mbio-demo-reservations';

/* --- time helpers -------------------------------------------------------- */

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const fromMin = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** The earliest moment a booking may start: now plus the lead time. */
function earliestStart() {
  return new Date(Date.now() + (CFG.minLeadHours || 0) * 3600 * 1000);
}

/** Is `date` (ISO) at `hhmm` far enough in the future to be bookable? */
function isBookable(iso, hhmm) {
  return new Date(`${iso}T${hhmm}:00`) >= earliestStart();
}

/** Every selectable time of day, e.g. ["08:00", "08:30", ...]. */
function timeOptions() {
  const out = [];
  for (let m = CFG.openHour * 60; m <= CFG.closeHour * 60; m += CFG.slotMinutes) {
    out.push(fromMin(m));
  }
  return out;
}

/* --- state --------------------------------------------------------------- */

const HOUR_PX = 44;          // pixel height of one hour in the week grid
const VIEW_KEY = 'dept-mbio-view';

const state = {
  mode: localStorage.getItem(VIEW_KEY) === 'week' ? 'week' : 'month',
  view: new Date(),            // any date inside the month/week being displayed
  selected: isoOf(new Date()), // the day shown in the detail panel
  reservations: [],            // reservations covering the displayed month
  loading: false,
};

/* --- backend ------------------------------------------------------------- */

function demoAll() {
  try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '[]'); }
  catch { return []; }
}
function demoSave(list) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(list));
}

/** Reservations between two ISO dates, inclusive. */
async function apiList(from, to) {
  if (DEMO) {
    return demoAll().filter((r) => r.date >= from && r.date <= to);
  }
  const url = `${CFG.endpoint}?action=list&from=${from}&to=${to}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || 'list failed');
  return body.reservations;
}

/**
 * POST to Apps Script. Content-Type is text/plain on purpose: it keeps the
 * request "simple" so the browser skips the CORS preflight, which Apps Script
 * web apps do not answer.
 */
async function apiPost(payload) {
  const res = await fetch(CFG.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || 'request failed');
  return body;
}

function overlaps(a, b) {
  return a.date === b.date && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);
}

async function apiCreate(booking) {
  if (DEMO) {
    const all = demoAll();
    if (all.some((r) => overlaps(r, booking))) {
      throw new Error('SLOT_TAKEN');
    }
    const saved = { ...booking, id: `demo-${Date.now()}`, createdAt: new Date().toISOString() };
    demoSave([...all, saved]);
    return { reservation: saved };
  }
  return apiPost({ action: 'create', ...booking });
}

async function apiCancel(id, pin) {
  if (DEMO) {
    const all = demoAll();
    const hit = all.find((r) => r.id === id);
    if (!hit) throw new Error('NOT_FOUND');
    if (String(hit.pin) !== String(pin)) throw new Error('BAD_PIN');
    demoSave(all.filter((r) => r.id !== id));
    return {};
  }
  return apiPost({ action: 'cancel', id, pin });
}

/* --- rendering ----------------------------------------------------------- */

const lang = () => document.documentElement.lang || 'en';
const say = (ko, en) => (lang() === 'ko' ? ko : en);

function monthBounds(view) {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const last = new Date(view.getFullYear(), view.getMonth() + 1, 0);
  return [isoOf(first), isoOf(last)];
}

/** Sunday of the week containing `view`. */
function weekStart(view) {
  const d = new Date(view);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function weekBounds(view) {
  const first = weekStart(view);
  const last = new Date(first);
  last.setDate(first.getDate() + 6);
  return [isoOf(first), isoOf(last)];
}

/** The date range currently on screen, for whichever view is active. */
function visibleBounds() {
  return state.mode === 'week' ? weekBounds(state.view) : monthBounds(state.view);
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const label = document.getElementById('calendar-label');
  const year = state.view.getFullYear();
  const month = state.view.getMonth();

  label.textContent = lang() === 'ko'
    ? `${year}년 ${month + 1}월`
    : state.view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const dayNames = lang() === 'ko'
    ? ['일', '월', '화', '수', '목', '금', '토']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());              // back up to the Sunday
  const todayIso = isoOf(new Date());

  const byDate = new Map();
  state.reservations.forEach((r) => {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  });

  let html = dayNames.map((d, i) => {
    const tone = i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500';
    return `<div class="bg-gray-50 py-2 text-center text-xs font-bold ${tone}">${d}</div>`;
  }).join('');

  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = isoOf(d);
    const outside = d.getMonth() !== month;
    const items = (byDate.get(iso) || []).sort((a, b) => toMin(a.start) - toMin(b.start));

    const classes = [
      'cal-cell',
      outside ? 'is-outside' : '',
      iso < todayIso ? 'is-past' : '',
      iso === todayIso ? 'is-today' : '',
      iso === state.selected ? 'ring-2 ring-inset ring-slate-800' : '',
    ].join(' ');

    const dots = items.slice(0, 3).map((r) =>
      `<span class="cal-dot" title="${esc(r.start)}–${esc(r.end)} ${esc(r.name)}">${esc(r.start)}`
      + `<span class="dot-name"> ${esc(r.name)}</span></span>`
    ).join('');
    const more = items.length > 3
      ? `<span class="block text-[10px] text-gray-400 mt-0.5">+${items.length - 3}</span>` : '';

    html += `<button type="button" data-date="${iso}" class="${classes} text-left">
      <span class="font-semibold ${outside ? '' : 'text-gray-700'}">${d.getDate()}</span>
      ${dots}${more}
    </button>`;
  }

  grid.innerHTML = html;
  grid.querySelectorAll('[data-date]').forEach((cell) => {
    cell.addEventListener('click', () => {
      selectDate(cell.dataset.date);
    });
  });
}

function renderWeek() {
  const grid = document.getElementById('week-grid');
  const label = document.getElementById('calendar-label');
  const first = weekStart(state.view);
  const todayIso = isoOf(new Date());

  const last = new Date(first);
  last.setDate(first.getDate() + 6);
  label.textContent = lang() === 'ko'
    ? `${first.getMonth() + 1}월 ${first.getDate()}일 – ${last.getMonth() + 1}월 ${last.getDate()}일`
    : `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – `
      + `${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const dayNames = lang() === 'ko'
    ? ['일', '월', '화', '수', '목', '금', '토']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const hours = CFG.closeHour - CFG.openHour;
  const colHeight = hours * HOUR_PX;

  // header row: an empty gutter cell, then the seven days
  let html = '<div class="week-head"></div>';
  for (let i = 0; i < 7; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    const iso = isoOf(d);
    const cls = ['week-head', iso === state.selected ? 'is-selected' : '', iso === todayIso ? 'is-today' : ''].join(' ');
    html += `<div class="${cls}" data-date="${iso}">
      <span class="wd">${dayNames[i]}</span><span class="dd">${d.getDate()}</span>
    </div>`;
  }

  // hour labels down the left
  let gutter = `<div class="week-gutter" style="height:${colHeight}px">`;
  for (let h = CFG.openHour; h <= CFG.closeHour; h++) {
    gutter += `<span style="top:${(h - CFG.openHour) * HOUR_PX}px">${pad(h)}:00</span>`;
  }
  html += gutter + '</div>';

  // one column per day, bookings positioned by time
  for (let i = 0; i < 7; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    const iso = isoOf(d);
    const weekend = i === 0 || i === 6;

    const events = state.reservations.filter((r) => r.date === iso).map((r) => {
      const top = ((toMin(r.start) - CFG.openHour * 60) / 60) * HOUR_PX;
      const height = Math.max(((toMin(r.end) - toMin(r.start)) / 60) * HOUR_PX - 2, 14);
      return `<div class="week-event" style="top:${top}px;height:${height}px"
                   data-cancel="${esc(r.id)}"
                   title="${esc(r.start)}–${esc(r.end)} ${esc(r.name)} (${esc(r.lab || '')})">
                <span class="we-name">${esc(r.name)}</span> ${esc(r.start)}
              </div>`;
    }).join('');

    html += `<div class="week-col ${weekend ? 'is-weekend' : ''}" data-daycol="${iso}"
                  style="height:${colHeight}px;--hour-px:${HOUR_PX}px">${events}</div>`;
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.week-head[data-date]').forEach((el) => {
    el.addEventListener('click', () => selectDate(el.dataset.date));
  });

  grid.querySelectorAll('.week-event[data-cancel]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onCancel(el.dataset.cancel);
    });
  });

  // Clicking empty space picks that day and prefills the nearest start time.
  grid.querySelectorAll('.week-col[data-daycol]').forEach((col) => {
    col.addEventListener('click', (ev) => {
      const y = ev.clientY - col.getBoundingClientRect().top;
      const raw = CFG.openHour * 60 + (y / HOUR_PX) * 60;
      const snapped = Math.round(raw / CFG.slotMinutes) * CFG.slotMinutes;
      const clamped = Math.min(Math.max(snapped, CFG.openHour * 60), CFG.closeHour * 60 - CFG.slotMinutes);
      selectDate(col.dataset.daycol, fromMin(clamped));
    });
  });
}

/** Select a day, optionally prefilling a start time, and refresh the panel. */
function selectDate(iso, startTime) {
  state.selected = iso;
  draw();
  renderDay();
  if (startTime) {
    const startSel = document.getElementById('f-start');
    if ([...startSel.options].some((o) => o.value === startTime && !o.disabled)) {
      startSel.value = startTime;
      syncEndAfterStart();
    }
  }
  // On phones the day panel and form sit below the calendar, out of sight.
  if (window.matchMedia('(max-width: 1023px)').matches) {
    document.getElementById('day-list').closest('.card')
      .scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/** Render whichever view is active. */
function draw() {
  const month = document.getElementById('calendar-grid');
  const week = document.getElementById('week-scroll');
  const isWeek = state.mode === 'week';
  month.hidden = isWeek;
  week.hidden = !isWeek;
  document.getElementById('view-month').classList.toggle('is-active', !isWeek);
  document.getElementById('view-week').classList.toggle('is-active', isWeek);
  if (isWeek) renderWeek(); else renderCalendar();
}

function renderDay() {
  const panel = document.getElementById('day-list');
  const heading = document.getElementById('day-heading');
  heading.textContent = fmtDate(state.selected, lang());

  const items = state.reservations
    .filter((r) => r.date === state.selected)
    .sort((a, b) => toMin(a.start) - toMin(b.start));

  if (!items.length) {
    panel.innerHTML = `<p class="text-sm text-gray-500 italic py-6 text-center">
      ${say('예약이 없습니다. 이 날은 하루 종일 사용 가능합니다.', 'No bookings yet — the room is free all day.')}
    </p>`;
  } else {
    panel.innerHTML = items.map((r) => `
      <div class="flex items-start justify-between gap-3 py-3 border-b border-gray-100 last:border-0">
        <div class="min-w-0">
          <p class="font-semibold text-sm dept-color">${esc(r.start)} – ${esc(r.end)}</p>
          <p class="text-sm text-gray-800 truncate">${esc(r.name)}
            <span class="text-gray-400">·</span>
            <span class="text-gray-500">${esc(r.lab || '')}</span>
          </p>
        </div>
        <button type="button" data-cancel="${esc(r.id)}"
                class="flex-shrink-0 text-xs text-red-600 hover:text-red-700 hover:underline">
          ${say('취소', 'Cancel')}
        </button>
      </div>`).join('');

    panel.querySelectorAll('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => onCancel(btn.dataset.cancel));
    });
  }

  // Keep the form's date in step with the selected day.
  const dateField = document.getElementById('f-date');
  if (dateField) dateField.value = state.selected;
  refreshTimeMenus();
}

/** Grey out start times that are already taken on the selected day. */
function refreshTimeMenus() {
  const startSel = document.getElementById('f-start');
  const endSel = document.getElementById('f-end');
  if (!startSel || !endSel) return;

  const taken = state.reservations.filter((r) => r.date === state.selected);
  const busy = (min) => taken.some((r) => min >= toMin(r.start) && min < toMin(r.end));

  const opts = timeOptions();
  const keepStart = startSel.value;
  const keepEnd = endSel.value;

  startSel.innerHTML = opts.slice(0, -1).map((time) => {
    const isBusy = busy(toMin(time));
    const tooSoon = !isBookable(state.selected, time);
    let suffix = '';
    if (isBusy) suffix = say(' (예약됨)', ' (booked)');
    else if (tooSoon) suffix = say(' (마감)', ' (closed)');
    return `<option value="${time}" ${isBusy || tooSoon ? 'disabled' : ''}>${time}${suffix}</option>`;
  }).join('');
  endSel.innerHTML = opts.slice(1).map((t) => `<option value="${t}">${t}</option>`).join('');

  if (opts.includes(keepStart)) startSel.value = keepStart;
  if (opts.includes(keepEnd)) endSel.value = keepEnd;
  if (startSel.selectedOptions[0] && startSel.selectedOptions[0].disabled) {
    const first = [...startSel.options].find((o) => !o.disabled);
    startSel.value = first ? first.value : '';
  }
  renderDayNotice();
  syncEndAfterStart();
}

/** Explain a fully closed day rather than leaving an empty menu. */
function renderDayNotice() {
  const box = document.getElementById('day-notice');
  if (!box) return;
  const startSel = document.getElementById('f-start');
  const anyOpen = [...startSel.options].some((o) => !o.disabled);
  const lead = CFG.minLeadHours || 0;

  if (!anyOpen) {
    box.textContent = say(
      '이 날은 예약 가능한 시간이 없습니다. 다른 날짜를 선택해 주세요.',
      'No bookable times left on this day. Please pick another date.');
    box.hidden = false;
  } else if (state.selected === isoOf(new Date()) && lead > 0) {
    box.textContent = say(
      `현재 시각 기준 ${lead}시간 이후부터 예약할 수 있습니다.`,
      `Bookings must start at least ${lead} hours from now.`);
    box.hidden = false;
  } else {
    box.hidden = true;
  }
}

/** The end time must sit after the start and within maxHours. */
function syncEndAfterStart() {
  const startSel = document.getElementById('f-start');
  const endSel = document.getElementById('f-end');
  if (!startSel || !endSel || !startSel.value) return;
  const s = toMin(startSel.value);
  [...endSel.options].forEach((o) => {
    const e = toMin(o.value);
    o.disabled = e <= s || e - s > CFG.maxHours * 60;
  });
  if (endSel.selectedOptions[0]?.disabled || toMin(endSel.value) <= s) {
    const next = [...endSel.options].find((o) => !o.disabled);
    if (next) endSel.value = next.value;
  }
}

/* --- actions ------------------------------------------------------------- */

function flash(message, kind = 'info') {
  const box = document.getElementById('form-status');
  const tones = {
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    ok: 'bg-green-50 text-green-800 border-green-200',
    error: 'bg-red-50 text-red-800 border-red-200',
  };
  box.className = `text-sm rounded-lg border px-3 py-2 ${tones[kind]}`;
  box.textContent = message;
  box.hidden = false;
}

async function refresh() {
  const [from, to] = visibleBounds();
  state.loading = true;
  document.getElementById('calendar-loading').hidden = false;
  try {
    state.reservations = await apiList(from, to);
  } catch (err) {
    console.error(err);
    flash(say('예약 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
              'Could not load bookings. Please try again shortly.'), 'error');
    state.reservations = [];
  } finally {
    state.loading = false;
    document.getElementById('calendar-loading').hidden = true;
  }
  draw();
  renderDay();
}

async function onSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector('button[type="submit"]');

  const booking = {
    date: document.getElementById('f-date').value,
    start: document.getElementById('f-start').value,
    end: document.getElementById('f-end').value,
    name: document.getElementById('f-name').value.trim(),
    lab: document.getElementById('f-lab').value.trim(),
    pin: document.getElementById('f-pin').value.trim(),
  };

  if (!booking.name || !booking.lab) {
    return flash(say('이름과 연구실을 입력해 주세요.', 'Name and lab are required.'), 'error');
  }
  if (!/^\d{4}$/.test(booking.pin)) {
    return flash(say('취소용 PIN 4자리를 입력해 주세요.', 'Please choose a 4-digit cancellation PIN.'), 'error');
  }
  if (toMin(booking.end) <= toMin(booking.start)) {
    return flash(say('종료 시간이 시작 시간보다 늦어야 합니다.', 'End time must be after the start time.'), 'error');
  }
  if (!isBookable(booking.date, booking.start)) {
    const lead = CFG.minLeadHours || 0;
    return flash(say(
      `지난 시간은 예약할 수 없습니다. 현재 시각 기준 ${lead}시간 이후부터 예약해 주세요.`,
      `That time has passed. Bookings must start at least ${lead} hours from now.`), 'error');
  }
  if (state.reservations.some((r) => overlaps(r, booking))) {
    return flash(say('선택하신 시간에 이미 예약이 있습니다.', 'That time overlaps an existing booking.'), 'error');
  }

  submit.disabled = true;
  flash(say('예약 중…', 'Booking…'), 'info');
  try {
    await apiCreate(booking);
    form.reset();
    flash(say('예약이 완료되었습니다. 취소하려면 PIN이 필요하니 기억해 주세요.',
              'Booked. Keep your PIN — you need it to cancel.'), 'ok');
    await refresh();
  } catch (err) {
    const known = {
      SLOT_TAKEN: say('선택하신 시간에 이미 예약이 있습니다.', 'That time was just taken by someone else.'),
      TOO_FAR: say(`${CFG.maxDaysAhead}일 이내의 날짜만 예약할 수 있습니다.`,
                   `Bookings are accepted up to ${CFG.maxDaysAhead} days ahead.`),
      PAST_DATE: say('지난 날짜는 예약할 수 없습니다.', 'That date is in the past.'),
      TOO_SOON: say(
        `지난 시간이거나 너무 임박한 예약입니다. 현재 시각 기준 ${CFG.minLeadHours}시간 이후부터 가능합니다.`,
        `That time has passed or is too soon. Bookings must start at least ${CFG.minLeadHours} hours from now.`),
    };
    flash(known[err.message] || say('예약에 실패했습니다: ', 'Booking failed: ') + err.message, 'error');
  } finally {
    submit.disabled = false;
  }
}

async function onCancel(id) {
  const pin = prompt(say('예약 시 설정한 PIN 4자리를 입력하세요.',
                         'Enter the 4-digit PIN used when booking.'));
  if (pin === null) return;
  try {
    await apiCancel(id, pin.trim());
    flash(say('예약이 취소되었습니다.', 'Booking cancelled.'), 'ok');
    await refresh();
  } catch (err) {
    const known = {
      BAD_PIN: say('PIN이 일치하지 않습니다.', 'That PIN does not match.'),
      NOT_FOUND: say('예약을 찾을 수 없습니다.', 'Booking not found.'),
    };
    flash(known[err.message] || say('취소에 실패했습니다: ', 'Cancellation failed: ') + err.message, 'error');
  }
}

/* --- boot ---------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  if (DEMO) document.getElementById('demo-banner').hidden = false;

  document.getElementById('room-name').textContent = t(CFG.room.name);
  document.getElementById('room-location').textContent = t(CFG.room.location);

  const dateField = document.getElementById('f-date');
  dateField.min = isoOf(new Date());
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + CFG.maxDaysAhead);
  dateField.max = isoOf(maxDate);
  dateField.addEventListener('change', () => {
    if (!dateField.value) return;
    state.selected = dateField.value;
    state.view = new Date(`${dateField.value}T00:00:00`);
    refresh();
  });

  document.getElementById('f-start').addEventListener('change', syncEndAfterStart);

  const step = (dir) => {
    if (state.mode === 'week') {
      const d = new Date(state.view);
      d.setDate(d.getDate() + dir * 7);
      state.view = d;
    } else {
      state.view = new Date(state.view.getFullYear(), state.view.getMonth() + dir, 1);
    }
    refresh();
  };
  document.getElementById('cal-prev').addEventListener('click', () => step(-1));
  document.getElementById('cal-next').addEventListener('click', () => step(1));

  const setMode = (mode) => {
    if (state.mode === mode) return;
    state.mode = mode;
    localStorage.setItem(VIEW_KEY, mode);
    // Keep the selected day on screen when switching views.
    state.view = new Date(`${state.selected}T00:00:00`);
    refresh();
  };
  document.getElementById('view-month').addEventListener('click', () => setMode('month'));
  document.getElementById('view-week').addEventListener('click', () => setMode('week'));
  document.getElementById('cal-today').addEventListener('click', () => {
    state.view = new Date();
    state.selected = isoOf(new Date());
    refresh();
  });

  document.getElementById('booking-form').addEventListener('submit', onSubmit);

  // Re-render text that JS generated whenever the language toggle fires.
  document.addEventListener('langchange', () => {
    document.getElementById('room-name').textContent = t(CFG.room.name);
    document.getElementById('room-location').textContent = t(CFG.room.location);
    draw();
    renderDay();
  });

  refresh();
});
