(() => {
  const root = document.getElementById('schedule-app');
  if (!root) return;
  const el = id => document.getElementById(`schedule-${id}`);
  const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const LETTERS = [...'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ'];
  const STORAGE = 'fkbad.schedule.selection.v3';
  const DATA_STORAGE = 'fkbad.schedule.data.v3';
  const STUDENT_CATEGORIES = [
    {id:'architects', label:'А'},
    {id:'builders', label:'Б'},
    {id:'designers', label:'ОД'},
    {id:'projects', label:'П'},
    {id:'reduced', label:'С'}
  ];
  let catalog, mode = 'student', selected = {student:null, teacher:null}, studentCategory = 'all', teacherLetter = 'all', generation = 0, controller;
  const colors = new Map(), memory = new Map();
  let deviceData = {};
  try { const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}'); mode = saved.mode === 'teacher' ? 'teacher' : 'student'; selected = {...selected, ...(saved.selected || {})}; studentCategory = saved.studentCategory || 'all'; teacherLetter = saved.teacherLetter || 'all'; } catch {}
  try { deviceData = JSON.parse(localStorage.getItem(DATA_STORAGE) || '{}'); } catch {}
  const hue = id => { let hash = 0; for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0; return (hash * 137.508) % 360; };
  const color = id => colors.get(id) || `hsl(${hue(id).toFixed(2)} 65% 57%)`;
  const dot = id => `<span class="schedule-dot" style="--person:${color(id)}" aria-hidden="true"></span>`;
  const date = value => new Intl.DateTimeFormat('uk-UA', {dateStyle:'short', timeStyle:'short', timeZone:'Europe/Kyiv'}).format(new Date(value));
  const syncModeButtons = () => root.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
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
  function teacherLetters() {
    const present = new Set(catalog.teacher.map(item => item.name.trim().charAt(0).toLocaleUpperCase('uk-UA')));
    return LETTERS.filter(letter => present.has(letter));
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
      const choices = catalog.student.map(item => {
        const category = groupCategory(item.name);
        const hidden = category !== studentCategory ? ' hidden' : '';
        return `<button type="button" class="schedule-choice" data-id="${escape(item.id)}" data-group-category="${category}" aria-pressed="${item.id === selected.student}"${hidden}><span class="group-code">${escape(item.name)}</span><span class="group-full-name">Група ${escape(item.name)}</span></button>`;
      }).join('');
      panel.innerHTML = `<div class="teacher-picker group-picker"><div class="group-list">${choices}<p class="schedule-picker-empty"${groupItems().length ? ' hidden' : ''}>У цій категорії груп поки немає</p></div><div class="alphabet-index group-index" role="listbox" aria-label="Категорії груп">${STUDENT_CATEGORIES.map(category => `<button type="button" data-category-select="${category.id}" aria-label="Категорія ${category.label}" aria-selected="${studentCategory === category.id}">${category.label}</button>`).join('')}</div></div>`;
      bindCategoryRail();
    } else {
      const availableLetters = teacherLetters();
      if (teacherLetter !== 'all' && !availableLetters.includes(teacherLetter)) teacherLetter = 'all';
      const choices = catalog.teacher.map(item => {
        const letter = item.name.trim().charAt(0).toLocaleUpperCase('uk-UA');
        const hidden = teacherLetter !== 'all' && letter !== teacherLetter ? ' hidden' : '';
        return `<button type="button" class="schedule-choice" data-id="${escape(item.id)}" data-letter="${escape(letter)}" aria-pressed="${item.id === selected.teacher}"${hidden}>${dot(item.id)}<span>${escape(item.name)}</span></button>`;
      }).join('');
      panel.innerHTML = `<div class="teacher-picker"><div class="teacher-list">${choices}<p class="schedule-picker-empty"${teacherItems().length ? ' hidden' : ''}>На цю літеру викладачів немає</p></div><div class="alphabet-index" role="listbox" aria-label="Алфавіт викладачів">${availableLetters.map(letter => `<button type="button" data-letter-select="${letter}" aria-label="Літера ${letter}" aria-selected="${teacherLetter === letter}">${letter}</button>`).join('')}</div></div>`;
      bindAlphabet();
    }
  }
  function applyTeacherLetter(letter) {
    if (teacherLetter === letter) return;
    const letters = teacherLetters();
    teacherLetter = letter === 'all' || letters.includes(letter) ? letter : 'all';
    const active = teacherLetter;
    const panel = el('picker');
    panel.querySelectorAll('[data-letter-select]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.letterSelect === active)));
    panel.querySelectorAll('.teacher-list .schedule-choice').forEach(button => { const visible = active === 'all' || button.dataset.letter === active; button.hidden = !visible; });
    const visible = panel.querySelectorAll('.teacher-list .schedule-choice:not([hidden])').length;
    let empty = panel.querySelector('.schedule-picker-empty');
    if (!visible && !empty) { empty = document.createElement('p'); empty.className = 'schedule-picker-empty'; empty.textContent = 'На цю літеру викладачів немає'; panel.querySelector('.teacher-list').append(empty); }
    if (empty) empty.hidden = Boolean(visible);
    save();
  }
  function applyStudentCategory(category) {
    if (studentCategory === category) return;
    const valid = STUDENT_CATEGORIES.some(item => item.id === category);
    studentCategory = valid ? category : STUDENT_CATEGORIES[0].id;
    const panel = el('picker');
    panel.querySelectorAll('[data-category-select]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.categorySelect === studentCategory)));
    panel.querySelectorAll('.group-list .schedule-choice').forEach(button => { button.hidden = button.dataset.groupCategory !== studentCategory; });
    const visible = panel.querySelectorAll('.group-list .schedule-choice:not([hidden])').length;
    const empty = panel.querySelector('.schedule-picker-empty');
    if (empty) empty.hidden = Boolean(visible);
    save();
  }
  function bindRail(rail, values, apply) {
    if (!rail || !values.length) return;
    let centers = [], pointer = null, frame = 0, y = 0, last = null;
    const choose = () => {
      frame = 0;
      if (!centers.length) return;
      let index = 0;
      centers.forEach((center, i) => { if (Math.abs(y - center) < Math.abs(y - centers[index])) index = i; });
      if (values[index] !== last) { last = values[index]; apply(last); }
    };
    rail.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault(); pointer = event.pointerId; last = null;
      centers = [...rail.querySelectorAll('button')].map(button => { const rect = button.getBoundingClientRect(); return rect.top + rect.height / 2; });
      rail.setPointerCapture(pointer); y = event.clientY; choose();
    });
    rail.addEventListener('pointermove', event => {
      if (event.pointerId !== pointer) return;
      y = event.clientY; if (!frame) frame = requestAnimationFrame(choose);
    });
    const finish = event => {
      if (event.pointerId !== pointer) return;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (event.type === 'pointerup') { y = event.clientY; choose(); }
      const id = pointer; pointer = null; centers = [];
      if (rail.hasPointerCapture(id)) rail.releasePointerCapture(id);
    };
    rail.addEventListener('pointerup', finish);
    rail.addEventListener('pointercancel', finish);
    rail.addEventListener('lostpointercapture', finish);
  }
  function bindCategoryRail() {
    bindRail(el('picker').querySelector('.group-index'), STUDENT_CATEGORIES.map(item => item.id), applyStudentCategory);
  }
  function bindAlphabet() {
    const rail = el('picker').querySelector('.alphabet-index');
    bindRail(rail, teacherLetters(), applyTeacherLetter);
  }
  function subjectColor(subject) {
    const key = String(subject || '').trim().toLocaleLowerCase('uk-UA');
    return `hsl(${hue(key).toFixed(2)} 72% 58%)`;
  }
  function mergeLessons(items) {
    const merged = new Map();
    items.forEach(lesson => {
      const key = `${String(lesson.subject || '').trim().toLocaleLowerCase('uk-UA')}|${lesson.week || ''}`;
      if (!merged.has(key)) merged.set(key, {...lesson, variants:[lesson]});
      else merged.get(key).variants.push(lesson);
    });
    return [...merged.values()];
  }
  function lessons(items, splitWeeks) {
    if (!items.length) return '<span class="schedule-free">Немає занять</span>';
    return mergeLessons(items).map(l => `<div class="schedule-lesson" style="--lesson-color:${subjectColor(l.subject)}">${splitWeeks ? `<span class="schedule-week-note">${l.week === 'denominator' ? 'Знаменник' : 'Чисельник'}</span>` : ''}<h3>${escape(l.subject)}</h3><div class="schedule-variants">${mode === 'teacher' ? (() => { const groups = [...new Set(l.variants.flatMap(item => item.groups || []))]; return `<span class="schedule-groups">${groups.length ? `Група ${groups.map(escape).join(', ')}` : 'Групу не вказано'}</span>`; })() : l.variants.map(item => `<div class="schedule-variant"><span class="schedule-teacher">${dot(item.teacherId)}<span>${escape(item.teacher || 'Викладача не вказано')}</span></span><span class="schedule-room">${item.room ? `Кабінет · ${escape(item.room)}` : 'Кабінет не вказано'}</span></div>`).join('')}</div>${l.note ? `<span class="schedule-week-note">${escape(l.note)}</span>` : ''}</div>`).join('');
  }
  function render(data) {
    el('source').href = data.source;
    el('checked').textContent = `Перевірено ${date(data.checkedAt)}`;
    const periodEnd = new Date(`${data.semester.end}T23:59:59+02:00`);
    el('status').textContent = Date.now() > periodEnd.getTime() ? 'Період дії цього розкладу завершився.' : `${data.semester.start.split('-').reverse().join('.')} — ${data.semester.end.split('-').reverse().join('.')} · Оновлення кожні 5 хв`;
    el('table').innerHTML = `<div class="schedule-table-scroll" role="region" aria-label="Тижневе розкладання занять"><table class="schedule-week"><caption>Розклад · ${escape(data.selected.name)}</caption><thead><tr><th scope="col">Пара</th>${data.days.map((d, i) => `<th scope="col" data-weekday="${i + 1}">${escape(d)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(row => `<tr><th scope="row">${escape(row.number)}</th>${row.cells.map(cell => `<td>${lessons(cell, data.splitWeeks)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function markToday() {
    const normalize = value => String(value).toLocaleLowerCase('uk-UA').replace(/[^а-яіїєґ]/g, '');
    const now = new Date();
    const weekdayShort = new Intl.DateTimeFormat('en-US', {weekday:'short', timeZone:'Europe/Kyiv'}).format(now);
    const kyivDay = ({Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6})[weekdayShort];
    const today = normalize(new Intl.DateTimeFormat('uk-UA', {weekday:'long', timeZone:'Europe/Kyiv'}).format(now));
    let column = -1;
    el('table').querySelectorAll('thead th').forEach((header, index) => {
      header.querySelector('.schedule-today-label')?.remove();
      const active = index > 0 && (Number(header.dataset.weekday) === kyivDay || normalize(header.textContent) === today);
      header.classList.toggle('schedule-today', active); header.removeAttribute('aria-current');
      if (active) {
        column = index; header.setAttribute('aria-current', 'date');
        const label = document.createElement('span'); label.className = 'schedule-today-label'; label.textContent = 'Сьогодні'; header.append(label);
      }
    });
    el('table').querySelectorAll('tbody tr').forEach(row => [...row.children].forEach((cell, index) => cell.classList.toggle('schedule-today-cell', index === column)));
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
      memory.set(key, data); render(data); markToday();
    } catch (error) {
      if (current !== generation || error.name === 'AbortError') return;
      const stale = deviceData[`${mode}/${id}`];
      if (stale) { render(stale); markToday(); el('status').textContent = 'Показано останнє збережене оновлення. Підключення недоступне.'; }
      else { el('status').textContent = error.message; el('table').innerHTML = '<p class="schedule-empty">Натисніть «Оновити», щоб спробувати знову, або відкрийте джерело нижче.</p>'; }
    } finally { if (current === generation) { el('table').setAttribute('aria-busy', 'false'); el('refresh').disabled = false; } }
  }
  function openPicker() { if (!window.matchMedia('(max-width: 900px), (hover: none) and (pointer: coarse)').matches) return; el('selector').classList.add('is-open'); el('picker-backdrop').hidden = false; document.body.classList.add('schedule-sheet-open'); }
  function closePicker() { el('selector').classList.remove('is-open'); el('picker-backdrop').hidden = true; document.body.classList.remove('schedule-sheet-open'); }
  async function boot() {
    el('refresh').disabled = true; el('status').textContent = 'Отримуємо групи й викладачів…';
    try { catalog = await get('/api/schedule'); catalog.teacher.forEach(item => colors.set(item.id, `hsl(${hue(item.id).toFixed(2)} 65% 57%)`)); el('semester').textContent = catalog.semester.title; for (const type of ['student','teacher']) if (selected[type] && !catalog[type].some(item => item.id === selected[type])) selected[type] = null; if (studentCategory === 'all') studentCategory = groupCategory(catalog.student.find(item => item.id === selected.student)?.name || catalog.student[0]?.name); if (!groupItems().length) studentCategory = STUDENT_CATEGORIES.find(category => catalog.student.some(item => groupCategory(item.name) === category.id))?.id || STUDENT_CATEGORIES[0].id; picker(); save(); if (selected[mode]) await load(); else { el('status').textContent = 'Зроби вибір, щоб побачити розклад.'; openPicker(); } }
    catch (error) { el('semester').textContent = 'Розклад із Всеосвіти'; el('status').textContent = error.message; el('table').setAttribute('aria-busy','false'); el('refresh').disabled = false; }
  }
  syncModeButtons();
  root.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.mode === mode) { syncModeButtons(); if (catalog) openPicker(); return; }
    mode = button.dataset.mode;
    syncModeButtons();
    save();
    if (!catalog) return;
    picker();
    openPicker();
    if (selected[mode]) load();
  }));
  el('picker').addEventListener('click', event => {
    const category = event.target.closest('[data-category-select]');
    if (category) { applyStudentCategory(category.dataset.categorySelect); return; }
    const letter = event.target.closest('[data-letter-select]');
    if (letter) { applyTeacherLetter(letter.dataset.letterSelect); return; }
    const button = event.target.closest('.schedule-choice');
    if (!button || button.dataset.id === selected[mode]) { if (button) closePicker(); return; }
    selected[mode] = button.dataset.id; save(); picker(); closePicker(); load();
  });
  el('change').addEventListener('click', openPicker); el('picker-close').addEventListener('click', closePicker); el('picker-backdrop').addEventListener('click', closePicker); el('refresh').addEventListener('click', () => load(true));
  setInterval(() => { if (!document.hidden && catalog && selected[mode]) load(true); }, 300000);
  setInterval(() => { if (!document.hidden) markToday(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && catalog && selected[mode]) load(); });
  boot();
})();
