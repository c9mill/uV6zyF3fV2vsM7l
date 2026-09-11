// Cloudflare Pages advanced-mode worker. Only /api/schedule uses server execution.
const SOURCE = 'https://school.vseosvita.ua/private/school-schedule';
const BASE = {id: '11778', hash: '55b2f59c', id_schedule: '107911'};
const TYPES = {student: '44', teacher: '14'};
const clean = value => value.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n)))
  .replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, n) => ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '})[n]).replace(/\s+/g, ' ').trim();
const sourceURL = (params = {}) => `${SOURCE}?${new URLSearchParams({...BASE, ...params})}`;

async function source(params) {
  const response = await fetch(sourceURL(params), {redirect: 'manual', signal: AbortSignal.timeout(12000), headers: {Accept:'text/html'}});
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Source unavailable');
  const html = await response.text();
  if (!html.includes('vo.scheduleV1.selectSchedule')) throw new Error('Schedule no longer public');
  return html;
}

function metadata(html) {
  const match = html.match(/vo\.scheduleV1\.selectSchedule\("#select",\s*(\{[^\n]+\})\)/);
  const schedule = match && JSON.parse(match[1]).schedules.find(s => String(s.id) === BASE.id_schedule);
  if (!schedule) throw new Error('Missing semester');
  return {title:schedule.title, start:schedule.start_at_ymd, end:schedule.end_at_ymd, weeks:schedule.cnt_week};
}

async function readList(html, type) {
  const entries = new Map();
  let current;
  const parser = new HTMLRewriter().on('li a', {
    element(el) {
      const url = new URL(clean(el.getAttribute('href') || ''), SOURCE);
      current = null;
      if (url.origin !== new URL(SOURCE).origin || url.searchParams.get('obj_type') !== type || !url.searchParams.get('obj_id')) return;
      current = {id:url.searchParams.get('obj_id'), name:''};
      const entry = current;
      el.onEndTag(() => {entry.name = clean(entry.name); if (entry.name) entries.set(entry.id, entry); current = null;});
    },
    text(chunk) {if (current) current.name += chunk.text;}
  });
  await parser.transform(new Response(html)).text();
  if (!entries.size) throw new Error('Missing schedule list');
  return [...entries.values()].sort((a,b) => a.name.localeCompare(b.name, 'uk', {numeric:true}));
}

async function readTable(html) {
  const days = [], rows = [];
  let row, cell, lesson;
  const parser = new HTMLRewriter();
  function field(selector, getTarget, key) {
    let target, value;
    parser.on(selector, {
      element(el) {target = getTarget(); value = ''; const saved = target; el.onEndTag(() => {if (saved) saved[key] = clean(value); target = null;});},
      text(chunk) {if (target) value += chunk.text;}
    });
  }
  parser.on('.fixed-table td.size-schedule', {element() {days.push({name:''});}});
  field('.fixed-table td.size-schedule p', () => days.at(-1), 'name');
  parser.on('.body-table tr', {element() {row = {number:'', cells:[]}; rows.push(row);}});
  field('.body-table .size-numb p', () => row, 'number');
  parser.on('.body-table td.size-schedule', {element() {cell = []; row.cells.push(cell);}});
  parser.on('.body-table .block-cn-zn', {element(el) {
    lesson = {subject:'', teacher:'', teacherId:'', room:'', groups:[], note:'', week:el.getAttribute('class')?.split(/\s+/).includes('zn') ? 'denominator' : 'numerator'};
    cell.push(lesson);
  }});
  field('.body-table .schedule-block > p.schedule-title', () => lesson, 'subject');
  field('.body-table .schedule-block .vo-form-help', () => lesson, 'room');
  field('.body-table .schedule-list__item', () => lesson, 'note');
  parser.on('.body-table .user-row a', {element(el) {lesson.teacherId = new URL(clean(el.getAttribute('href')), SOURCE).searchParams.get('obj_id') || '';}});
  field('.body-table .user-row a', () => lesson, 'teacher');
  parser.on('.body-table .schedule-list a', {element() {lesson.groups.push({name:''});}});
  field('.body-table .schedule-list a', () => lesson.groups.at(-1), 'name');
  await parser.transform(new Response(html)).text();
  if (!days.length || !rows.length || rows.some(r => r.cells.length !== days.length)) throw new Error('Schedule structure changed');
  for (const r of rows) for (const c of r.cells) for (const l of c) {
    if (!l.subject) throw new Error('Missing subject');
    l.groups = l.groups.map(g => g.name);
    l.room = l.room.replace(/^Каб:\s*/, '');
  }
  return {days:days.map(d => d.name), rows, splitWeeks:metadata(html).weeks > 1 || rows.some(r => r.cells.some(c => c.some(l => l.week === 'denominator')))};
}

async function cached(key, ttl, loader, ctx) {
  const request = new Request(`https://fkbad.pages.dev/api/schedule-cache/v1/${key}`);
  const hit = await caches.default.match(request);
  if (hit) return hit.json();
  const data = {...await loader(), checkedAt:new Date().toISOString()};
  ctx.waitUntil(caches.default.put(request, Response.json(data, {headers:{'Cache-Control':`public, max-age=${ttl}`}})));
  return data;
}

async function catalog(ctx) {
  return cached('catalog', 300, async () => {
    const [students, teachers] = await Promise.all([source({obj_type:'44'}), source({obj_type:'14'})]);
    const [student, teacher] = await Promise.all([readList(students, '44'), readList(teachers, '14')]);
    return {semester:metadata(students), student, teacher, source:sourceURL()};
  }, ctx);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/schedule') return env.ASSETS.fetch(request);
    if (request.method !== 'GET') return new Response('Method not allowed', {status:405, headers:{Allow:'GET'}});
    const mode = url.searchParams.get('mode'), id = url.searchParams.get('id');
    if ((mode || id) && (!TYPES[mode] || !/^\d{1,10}$/.test(id || ''))) return Response.json({error:'Некоректний вибір розкладу.'}, {status:400});
    try {
      const list = await catalog(ctx);
      if (!mode) return Response.json(list, {headers:{'Cache-Control':'no-store'}});
      const selected = list[mode].find(item => item.id === id);
      if (!selected) return Response.json({error:'Цього розкладу немає у списку Всеосвіти.'}, {status:404});
      const data = await cached(`${mode}/${id}`, 300, async () => ({...await readTable(await source({obj_type:TYPES[mode], obj_id:id})), selected, semester:list.semester, source:sourceURL({obj_type:TYPES[mode], obj_id:id})}), ctx);
      return Response.json(data, {headers:{'Cache-Control':'no-store'}});
    } catch (error) {
      console.error('Schedule fetch failed:', error.message);
      return Response.json({error:'Зараз не вдалося отримати розклад із Всеосвіти. Спробуйте ще раз трохи пізніше.'}, {status:503, headers:{'Cache-Control':'no-store','Retry-After':'60'}});
    }
  }
};
