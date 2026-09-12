(() => {
  const root = document.getElementById('schedule-app');
  if (!root) return;
  const el = id => document.getElementById(`schedule-${id}`);
  const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const LETTERS = [...'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ'];
  const STORAGE = 'fkbad.schedule.selection.v3';
  const DATA_STORAGE = 'fkbad.schedule.data.v3';
  const categoryNames = {architects:'Архітектори · А', designers:'Дизайнери · ОД', builders:'Будівельники · цифри', projects:'Проєктувальники · П', reduced:'Скорочена програма · С'};
  let catalog, mode = 'student', selected = {student:null, teacher:null}, studentCategory = 'all', teacherLetter = 'all', generation = 0, controller;
  const colors = new Map(), memory = new Map();
  let deviceData = {};
  try { const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}'); mode = saved.mode === 'teacher' ? 'teacher' : 'student'; selected = {...selected, ...(saved.selected || {})}; studentCategory = saved.studentCategory || 'all'; teacherLetter = saved.teacherLetter || 'all'; } catch {}
  try { deviceData = JSON.parse(localStorage.getItem(DATA_STORAGE) || '{}'); } catch {}
  const hue = id => { let hash = 0; for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0; return (hash * 137.508) % 360; };
  const color = id => colors.get(id) || `hsl(${hue(id).toFixed(2)} 65% 57%)`;
  const dot = id => `<span class="schedule-dot" style="--person:${color(id)}" aria-hidden="true"></span>`;
  const date = value => new Intl.DateTimeFormat('uk-UA', {dateStyle:'short', timeStyle:'short', timeZone:'Europe/Kyiv'}).format(new Date(value));
  const save = () => { try { localStorage.setItem(STORAGE, JSON.stringify({mode, selected, studentCategory, teacherLetter})); } catch {} };
  const persistData = (key, data) => { deviceData[key] = data; try { localStorage.setItem(DATA_STORAGE, JSON.stringify(deviceData)); } catch {} };
  async function get(url, signal) {
    const response = await fetch(url, {signal, cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не вдалося отримати розклад.');
    return data;
  }
  function groupCategory(name) {
    const value = String(name || '').trim().toLowerCase();
    if (/од$/.test(value)) return 'designers';
    if (/с$/.test(value)) return 'reduced';
    if (/а$/.test(value)) return 'architects';
    if (/п$/.test(value)) return 'projects';
    if (/^\d+$/.test(value)) return 'builders';
    return 'builders';
  }
  function groupItems() {
    return catalog.student.filter(item => studentCategory === 'all' || groupCategory(item.name) === studentCategory);
  }
  function teacherItems() {
    return catalog.teacher.filter(item => teacherLetter === 'all' || item.name.trim().charAt(0).toLocaleUpperCase('uk-UA') === teacherLetter);
  }
  function picker() {
    const isStudent = mode === 'student';
    el('picker-title').textContent = isStudent ? 'Обери групу' : 'Обери викладача';
    el('kind').textContent = isStudent ? 'Студент' : 'Викладач';
    const panel = el('picker');
    panel.classList.toggle('is-teacher', !isStudent);
    if (isStudent) {
      const categories = ['all','architects','projects','builders','designers','reduced'];
      panel.innerHTML = `<div class="group-categories" role="tablist" aria-label="Категорія групи">${categories.map(id => `<button type="button" class="group-category" data-category="${id}" aria-selected="${id === studentCategory}">${id === 'all' ? 'Усі групи' : categoryNames[id]}</button>`).join('')}</div><div class="group-list">${groupItems().map(item => `<button type="button" class="schedule-choice" data-id="${escape(item.id)}" aria-pressed="${item.id === selected.student}"><span class="group-code">${escape(item.name)}</span><span class="group-full-name">Група ${escape(item.name)}</span></button>`).join('') || '<p class="schedule-picker-empty">У цій категорії груп поки немає</p>'}</div>`;
    } else {
      panel.innerHTML = `<div class="teacher-picker"><div class="teacher-list">${teacherItems().map(item => `<button type="button" class="schedule-choice" data-id="${escape(item.id)}" data-letter="${escape(item.name.trim().charAt(0).toLocaleUpperCase('uk-UA'))}" aria-pressed="${item.id === selected.teacher}">${dot(item.id)}<span>${escape(item.name)}</span></button>`).join('') || '<p class="schedule-picker-empty">На цю літеру викладачів немає</p>'}</div><div class="alphabet-index" role="listbox" aria-label="Алфавіт викладачів">${LETTERS.map(letter => `<button type="button" data-letter-select="${letter}" aria-label="Літера ${letter}" aria-selected="${teacherLetter === letter}">${letter}</button>`).join('')}</div></div>`;
      bindAlphabet();
    }
  }
  function applyTeacherLetter(letter) {
    teacherLetter = letter;
    const panel = el('picker');
    panel.querySelectorAll('[data-letter-select]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.letterSelect === letter)));
    panel.querySelectorAll('.teacher-list .schedule-choice').forEach(button => { const visible = letter === 'all' || button.dataset.letter === letter; button.hidden = !visible; });
    const visible = panel.querySelectorAll('.teacher-list .schedule-choice:not([hidden])').length;
    let empty = panel.querySelector('.schedule-picker-empty');
    if (!visible && !empty) { empty = document.createElement('p'); empty.className = 'schedule-picker-empty'; empty.textContent = 'На цю літеру викладачів немає'; panel.querySelector('.teacher-list').append(empty); }
    if (empty) empty.hidden = Boolean(visible);
    save();
  }
  function bindAlphabet() {
    const rail = el('picker').querySelector('.alphabet-index');
    if (!rail) return;
    const choose = event => { const rect = rail.getBoundingClientRect(); const ratio = Math.max(0, Math.min(0.999, (event.clientY - rect.top) / rect.height)); applyTeacherLetter(LETTERS[Math.floor(ratio * LETTERS.length)]); };
    rail.addEventListener('pointerdown', event => { event.preventDefault(); rail.setPointerCapture(event.pointerId); choose(event); });
    rail.addEventListener('pointermove', event => { if (rail.hasPointerCapture(event.pointerId)) choose(event); });
    rail.addEventListener('pointerup', event => { if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId); });
  }
  function lessons(items, splitWeeks, tone) {
    if (!items.length) return '<span class="schedule-free">Немає занять</span>';
    return items.map(l => `<div class="schedule-lesson tone-${tone % 7}">${splitWeeks ? `<span class="schedule-week-note">${l.week === 'denominator' ? 'Знаменник' : 'Чисельник'}</span>` : ''}<h3>${escape(l.subject)}</h3>${mode === 'teacher' ? `<span class="schedule-groups">${l.groups.length ? `Група ${l.groups.map(escape).join(', ')}` : 'Групу не вказано'}</span>` : `<span class="schedule-teacher">${dot(l.teacherId)}<span>${escape(l.teacher || 'Викладача не вказано')}</span></span>`}${l.note ? `<span class="schedule-week-note">${escape(l.note)}</span>` : ''}<span class="schedule-room">${l.room ? `Кабінет · ${escape(l.room)}` : 'Кабінет не вказано'}</span></div>`).join('');
  }
  function render(data) {
    el('source').href = data.source;
    el('checked').textContent = `Перевірено ${date(data.checkedAt)}`;
    const periodEnd = new Date(`${data.semester.end}T23:59:59+02:00`);
    el('status').textContent = Date.now() > periodEnd.getTime() ? 'Період дії цього розкладу завершився.' : `${data.semester.start.split('-').reverse().join('.')} — ${data.semester.end.split('-').reverse().join('.')} · Оновлення кожні 5 хв`;
    el('table').innerHTML = `<div class="schedule-table-scroll" tabindex="0" role="region" aria-label="Тижневе розкладання занять"><table class="schedule-week"><caption>Розклад · ${escape(data.selected.name)}</caption><thead><tr><th scope="col">Пара</th>${data.days.map(d => `<th scope="col">${escape(d)}</th>`).join('')}</tr></thead><tbody>${data.rows.map((row, rowIndex) => `<tr><th scope="row">${escape(row.number)}</th>${row.cells.map(cell => `<td>${lessons(cell, data.splitWeeks, rowIndex)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  async function load(force = false) {
    if (!catalog) return boot();
    const id = selected[mode];
    if (!id) { el('selected').textContent = 'Обери групу або викладача'; el('status').textContent = 'Зроби вибір, щоб побачити розклад.'; el('table').innerHTML = '<p class="schedule-empty">Вибір з’явиться у меню зверху.</p>'; return; }
    const current = ++generation;
    controller?.abort(); controller = new AbortController();
    el('selected').textContent = catalog[mode].find(x => x.id === id)?.name || '';
    el('table').setAttribute('aria-busy', 'true'); el('table').innerHTML = ''; el('status').textContent = 'Завантажуємо заняття…'; el('checked').textContent = ''; el('refresh').disabled = true;
    try {
      const key = `${mode}/${id}`; const local = deviceData[key]; const saved = memory.get(key) || local;
      let data;
      if (!force && saved && Date.now() - Date.parse(saved.checkedAt) < 300000) data = saved;
      else { data = await get(`/api/schedule?mode=${mode}&id=${id}`, controller.signal); memory.set(key, data); persistData(key, data); }
      if (current !== generation) return;
      memory.set(key, data); render(data);
    } catch (error) {
      if (current !== generation || error.name === 'AbortError') return;
      const stale = deviceData[`${mode}/${id}`];
      if (stale) { render(stale); el('status').textContent = 'Показано останнє збережене оновлення. Підключення недоступне.'; }
      else { el('status').textContent = error.message; el('table').innerHTML = '<p class="schedule-empty">Натисніть «Оновити», щоб спробувати знову, або відкрийте джерело нижче.</p>'; }
    } finally { if (current === generation) { el('table').setAttribute('aria-busy', 'false'); el('refresh').disabled = false; } }
  }
  function openPicker() { if (!window.matchMedia('(max-width: 720px)').matches) return; el('selector').classList.add('is-open'); el('picker-backdrop').hidden = false; document.body.classList.add('schedule-sheet-open'); }
  function closePicker() { el('selector').classList.remove('is-open'); el('picker-backdrop').hidden = true; document.body.classList.remove('schedule-sheet-open'); }
  async function boot() {
    el('refresh').disabled = true; el('status').textContent = 'Отримуємо групи й викладачів…';
    try { catalog = await get('/api/schedule'); catalog.teacher.forEach(item => colors.set(item.id, `hsl(${hue(item.id).toFixed(2)} 65% 57%)`)); el('semester').textContent = catalog.semester.title; for (const type of ['student','teacher']) if (selected[type] && !catalog[type].some(item => item.id === selected[type])) selected[type] = null; if (studentCategory !== 'all' && !groupItems().length) studentCategory = 'all'; picker(); save(); if (selected[mode]) await load(); else openPicker(); }
    catch (error) { el('semester').textContent = 'Розклад із Всеосвіти'; el('status').textContent = error.message; el('table').setAttribute('aria-busy','false'); el('refresh').disabled = false; }
  }
  root.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { if (button.dataset.mode === mode) { openPicker(); return; } mode = button.dataset.mode; save(); root.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode))); picker(); openPicker(); if (selected[mode]) load(); }));
  el('picker').addEventListener('click', event => {
    const category = event.target.closest('[data-category]');
    if (category) { studentCategory = category.dataset.category; save(); picker(); return; }
    const letter = event.target.closest('[data-letter-select]');
    if (letter) { applyTeacherLetter(letter.dataset.letterSelect); return; }
    const button = event.target.closest('.schedule-choice');
    if (!button || button.dataset.id === selected[mode]) { if (button) closePicker(); return; }
    selected[mode] = button.dataset.id; save(); picker(); closePicker(); load();
  });
  el('change').addEventListener('click', openPicker); el('picker-close').addEventListener('click', closePicker); el('picker-backdrop').addEventListener('click', closePicker); el('refresh').addEventListener('click', () => load(true));
  setInterval(() => { if (!document.hidden && catalog && selected[mode]) load(true); }, 300000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && catalog && selected[mode]) load(); });
  boot();
})();

