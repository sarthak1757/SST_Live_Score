// Small date + time picker popup. Usage: attachDateTimePicker(inputElement)
// The input becomes a read-only field; the chosen value is kept in input.dataset.iso as local
// "YYYY-MM-DDTHH:mm" (parse with new Date(iso)). Past days are disabled.

const DP_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DP_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function dpPad(n) { return String(n).padStart(2, '0'); }

// Weeks of a month, Monday first: array of 6 rows x 7 cells, each a day number or null.
function dpMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const total = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

// 12-hour clock parts + date -> local ISO string "YYYY-MM-DDTHH:mm"
function dpToIso(year, month, day, hour12, minute, pm) {
  const hour = (hour12 % 12) + (pm ? 12 : 0);
  return year + '-' + dpPad(month + 1) + '-' + dpPad(day) + 'T' + dpPad(hour) + ':' + dpPad(minute);
}

function dpLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' +
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function attachDateTimePicker(input) {
  const wrap = document.createElement('div');
  wrap.className = 'dp-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  input.type = 'text';
  input.readOnly = true;
  input.required = false;
  input.placeholder = 'Pick a date and time';
  input.setAttribute('aria-haspopup', 'dialog');
  input.classList.add('dp-input');

  const pop = document.createElement('div');
  pop.className = 'dp-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Choose date and time');
  pop.hidden = true;
  wrap.appendChild(pop);

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  let picked = null; // { y, m, d }
  let hour = 4, minute = 0, pm = true;

  function draw() {
    const atCurrentMonth = viewYear === todayStart.getFullYear() && viewMonth === todayStart.getMonth();
    let html = '<div class="dp-head"><button type="button" class="dp-nav" data-nav="-1" aria-label="Previous month"' + (atCurrentMonth ? ' disabled' : '') + '>&#8249;</button>' +
      '<strong>' + DP_MONTHS[viewMonth] + ' ' + viewYear + '</strong><button type="button" class="dp-nav" data-nav="1" aria-label="Next month">&#8250;</button></div>' +
      '<div class="dp-grid dp-dow">' + DP_DAYS.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div><div class="dp-grid">';
    dpMonthGrid(viewYear, viewMonth).forEach(function (row) {
      row.forEach(function (day) {
        if (!day) { html += '<span></span>'; return; }
        const past = new Date(viewYear, viewMonth, day) < todayStart;
        const isToday = viewYear === todayStart.getFullYear() && viewMonth === todayStart.getMonth() && day === todayStart.getDate();
        const sel = picked && picked.y === viewYear && picked.m === viewMonth && picked.d === day;
        html += '<button type="button" class="dp-day' + (sel ? ' sel' : '') + (isToday ? ' today' : '') + '" data-day="' + day + '"' + (past ? ' disabled' : '') +
          ' aria-label="' + day + ' ' + DP_MONTHS[viewMonth] + ' ' + viewYear + '"' + (sel ? ' aria-pressed="true"' : '') + '>' + day + '</button>';
      });
    });
    html += '</div><div class="dp-time"><label>Time</label><select data-t="h" aria-label="Hour">';
    for (let h = 1; h <= 12; h++) html += '<option value="' + h + '"' + (h === hour ? ' selected' : '') + '>' + h + '</option>';
    html += '</select><span>:</span><select data-t="m" aria-label="Minute">';
    for (let m = 0; m < 60; m += 5) html += '<option value="' + m + '"' + (m === minute ? ' selected' : '') + '>' + dpPad(m) + '</option>';
    html += '</select><select data-t="p" aria-label="AM or PM"><option value="am"' + (pm ? '' : ' selected') + '>AM</option><option value="pm"' + (pm ? ' selected' : '') + '>PM</option></select></div>' +
      '<div class="dp-foot"><span class="muted">' + (picked ? dpLabel(dpToIso(picked.y, picked.m, picked.d, hour, minute, pm)) : 'Select a date') + '</span>' +
      '<button type="button" class="dp-apply"' + (picked ? '' : ' disabled') + '>Apply</button></div>';
    pop.innerHTML = html;
  }

  function open() {
    if (input.dataset.iso) {
      const d = new Date(input.dataset.iso);
      picked = { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
      viewYear = picked.y; viewMonth = picked.m;
      pm = d.getHours() >= 12; hour = d.getHours() % 12 || 12; minute = Math.round(d.getMinutes() / 5) * 5 % 60;
    }
    draw();
    pop.hidden = false;
  }
  function close() { pop.hidden = true; }

  input.addEventListener('click', function () { if (pop.hidden) open(); else close(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); open(); }
    if (e.key === 'Escape') close();
  });
  pop.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); input.focus(); } });
  // composedPath() is taken at click time, so it still works after a redraw removed the clicked button
  document.addEventListener('click', function (e) { if (e.composedPath().indexOf(wrap) === -1) close(); });

  pop.addEventListener('click', function (e) {
    const nav = e.target.closest('[data-nav]');
    const day = e.target.closest('[data-day]');
    if (nav) {
      viewMonth += Number(nav.dataset.nav);
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      draw();
    } else if (day && !day.disabled) {
      picked = { y: viewYear, m: viewMonth, d: Number(day.dataset.day) };
      draw();
    } else if (e.target.closest('.dp-apply') && picked) {
      input.dataset.iso = dpToIso(picked.y, picked.m, picked.d, hour, minute, pm);
      input.value = dpLabel(input.dataset.iso);
      close();
      input.focus();
    }
  });
  pop.addEventListener('change', function (e) {
    const t = e.target.dataset.t;
    if (t === 'h') hour = Number(e.target.value);
    if (t === 'm') minute = Number(e.target.value);
    if (t === 'p') pm = e.target.value === 'pm';
    draw();
  });
}

if (typeof module !== 'undefined') module.exports = { dpMonthGrid, dpToIso };
