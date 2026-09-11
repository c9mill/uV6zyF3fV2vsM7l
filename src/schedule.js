(() => {
  const root = document.getElementById('schedule-app');
  if (!root) return;
  const el = id => document.getElementById(`schedule-${id}`);
  const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  let catalog, mode = 'student', selected = {student:null, teacher:null}, generation = 0, controller;
  const colors = new Map();
  const memory = new Map();
  const hue = id => {let hash = 0; for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0; return (hash * 137.508) % 360;};
  const color = id => colors.get(id) || `hsl(${hue(id).toFixed(2)} 65% 57%)`;
  const dot = id => `<span class="schedule-dot" style="--person:${color(id)}" aria-hidden="true"></span>`;
  const date = value => new Intl.DateTimeFormat('uk-UA', {dateStyle:'short',timeStyle:'short',timeZone:'Europe/Kyiv'}).format(new Date(value));
  async function get(url, signal) {
    const response = await fetch(url, {signal, cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не вдалося отримати розклад.');
    return data;
  }
  function picker() {
    el('picker-title').textContent = mode === 'student' ? 'Обери групу' : 'Викладачі · А–Я';
    el('kind').textContent = mode === 'student' ? 'Група' : 'Викладач';
    el('picker').classList.toggle('is-teacher', mode === 'teacher');
    el('picker').innerHTML = catalog[mode].map(item => `<button type="button" class="schedule-choice" data-id="${escape(item.id)}" aria-pressed="${item.id === selected[mode]}">${mode === 'teacher' ? dot(item.id) : ''}<span>${escape(item.name)}</span></button>`).join('');
  }
  function lessons(items, splitWeeks) {
    if (!items.length) return '<span class="schedule-free">Немає занять</span>';
    return items.map(l => `<div class="schedule-lesson">${splitWeeks ? `<span class="schedule-week-note">${l.week === 'denominator' ? 'Знаменник' : 'Чисельник'}</span>` : ''}<h3>${escape(l.subject)}</h3>${mode === 'teacher' ? `<span class="schedule-groups">${l.groups.length ? `Група ${l.groups.map(escape).join(', ')}` : 'Групу не вказано'}</span>` : `<span class="schedule-teacher">${dot(l.teacherId)}<span>${escape(l.teacher || 'Викладача не вказано')}</span></span>`}${l.note ? `<span class="schedule-week-note">${escape(l.note)}</span>` : ''}<span class="schedule-room">${l.room ? `Кабінет · ${escape(l.room)}` : 'Кабінет не вказано'}</span></div>`).join('');
  }
  function render(data) {
    el('source').href = data.source;
    el('checked').textContent = `Перевірено ${date(data.checkedAt)}`;
    const periodEnd = new Date(`${data.semester.end}T23:59:59+02:00`);
    el('status').textContent = Date.now() > periodEnd.getTime() ? 'Період дії цього розкладу завершився.' : `${data.semester.start.split('-').reverse().join('.')} — ${data.semester.end.split('-').reverse().join('.')} · Оновлення кожні 5 хв`;
    el('table').innerHTML = `<div class="schedule-table-scroll" tabindex="0" role="region" aria-label="Тижневе розкладання занять"><table class="schedule-week"><caption>Розклад · ${escape(data.selected.name)}</caption><thead><tr><th scope="col">Пара</th>${data.days.map(d => `<th scope="col">${escape(d)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(row => `<tr><th scope="row">${escape(row.number)}</th>${row.cells.map(cell => `<td>${lessons(cell, data.splitWeeks)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="schedule-mobile-days">${data.days.map((day, i) => `<section class="schedule-day"><h3>${escape(day)}</h3>${data.rows.map(row => `<div class="schedule-mobile-lesson"><strong>${escape(row.number)}</strong><div>${lessons(row.cells[i], data.splitWeeks)}</div></div>`).join('')}</section>`).join('')}</div>`;
  }
  async function load(force = false) {
    if (!catalog) return boot();
    const id = selected[mode];
    const current = ++generation;
    controller?.abort(); controller = new AbortController();
    el('selected').textContent = catalog[mode].find(x => x.id === id)?.name || '';
    el('table').setAttribute('aria-busy', 'true');
    el('table').innerHTML = '';
    el('status').textContent = 'Завантажуємо заняття…';
    el('checked').textContent = '';
    el('refresh').disabled = true;
    try {
      const key = `${mode}/${id}`;
      const saved = memory.get(key);
      const data = !force && saved && Date.now() - Date.parse(saved.checkedAt) < 300000 ? saved : await get(`/api/schedule?mode=${mode}&id=${id}`, controller.signal);
      if (current !== generation) return;
      memory.set(key, data);
      render(data);
    } catch (error) {
      if (current !== generation || error.name === 'AbortError') return;
      el('status').textContent = error.message;
      el('table').innerHTML = '<p class="schedule-empty">Натисніть «Оновити», щоб спробувати знову, або відкрийте джерело нижче.</p>';
    } finally {
      if (current === generation) {el('table').setAttribute('aria-busy', 'false'); el('refresh').disabled = false;}
    }
  }
  async function boot() {
    el('refresh').disabled = true;
    el('status').textContent = 'Отримуємо групи й викладачів…';
    try {
      catalog = await get('/api/schedule');
      catalog.teacher.forEach(item => colors.set(item.id, `hsl(${hue(item.id).toFixed(2)} 65% 57%)`));
      el('semester').textContent = catalog.semester.title;
      for (const type of ['student','teacher']) selected[type] ||= catalog[type][0]?.id;
      picker(); await load();
    } catch (error) {
      el('semester').textContent = 'Розклад із Всеосвіти';
      el('status').textContent = error.message;
      el('table').setAttribute('aria-busy','false');
      el('refresh').disabled = false;
    }
  }
  root.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.mode === mode) return;
    mode = button.dataset.mode;
    root.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    if (catalog) {picker(); load();}
  }));
  el('picker').addEventListener('click', event => {
    const button = event.target.closest('[data-id]');
    if (!button || button.dataset.id === selected[mode]) return;
    selected[mode] = button.dataset.id;
    el('picker').querySelectorAll('[data-id]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    load();
  });
  el('refresh').addEventListener('click', () => load(true));
  setInterval(() => {if (!document.hidden && catalog) load(true);}, 300000);
  document.addEventListener('visibilitychange', () => {if (!document.hidden && catalog) load();});
  boot();
})();
