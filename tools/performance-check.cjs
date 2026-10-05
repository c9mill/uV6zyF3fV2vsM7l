// Real browser check at 6x CPU slowdown; run against the local preview or live site.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const base = process.argv[2] || 'http://127.0.0.1:4183';
const output = process.argv[3] || 'reports/performance';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  try {
  for (const scenario of [{ name: 'desktop', mobile: false }, { name: 'mobile', mobile: true }, { name: 'mobile-2cores', mobile: true, cores: 2 }]) {
    const { mobile, name, cores } = scenario;
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await cdp.send('Performance.enable');
    await page.addInitScript(cores => {
      if (cores) Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => cores });
      window.performanceLongTasks = [];
      window.motionStarts = [];
      window.motionPainted = [];
      const originalAnimate = Element.prototype.animate;
      Element.prototype.animate = function(frames, options) {
        window.motionStarts.push({ target: this.className, properties: [...new Set(frames.flatMap(frame => Object.keys(frame)))], duration: options.duration });
        const animation = originalAnimate.call(this, frames, options);
        if (this.matches('.program-card,.news-card')) requestAnimationFrame(() => window.motionPainted.push({ transform: getComputedStyle(this).transform, opacity: getComputedStyle(this).opacity }));
        return animation;
      };
      new PerformanceObserver(list => window.performanceLongTasks.push(...list.getEntries().map(e => e.duration))).observe({ type: 'longtask', buffered: true });
    }, cores);
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    const initial = await metrics();
    const beforeIdle = await page.evaluate(() => ({ tasks: window.performanceLongTasks.length, animations: document.getAnimations().length }));
    await page.waitForTimeout(1500);
    const afterIdle = await metrics();
    await page.evaluate(() => { window.performanceLongTasks = []; });
    for (let i = 0; i < 15; i++) { await page.mouse.wheel(0, 310); await page.waitForTimeout(80); }
    await page.waitForTimeout(600);
    const afterScroll = await metrics();
    const scroll = await page.evaluate(() => ({ longTasks: window.performanceLongTasks, transforms: [...document.querySelectorAll('.program-card,.news-card')].filter(card => card.style.transform).length, blurLayers: [...document.querySelectorAll('body *')].filter(el => getComputedStyle(el).backdropFilter !== 'none').length, overflow: document.documentElement.scrollWidth > innerWidth,
      cardEntrances: window.motionStarts.filter(item => /program-card|news-card/.test(item.target)).length,
      visibleCardAnimations: window.motionPainted.filter(item => item.transform !== 'none' && Number(item.opacity) < 1).length,
      animationProperties: [...new Set(window.motionStarts.flatMap(item => item.properties))],
      strayGlow: !!document.querySelector('.motion-atmosphere,.motion-glow')
    }));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.menu-toggle').click();
    await page.waitForTimeout(600);
    await page.locator('.navigation-catalog > details > summary').first().click();
    await page.waitForTimeout(350);
    const menuWorks = mobile ? await page.locator('.navigation-catalog > details[open]').count() > 0 : await page.locator('.navigation-detail h2').count() > 0;
    const menuEntrance = await page.evaluate(() => window.motionStarts.some(item => /navigation-detail|navigation-children/.test(String(item.target))));
    await page.screenshot({ path: `${output}/${name}-menu.png` });
    await page.locator('.menu-toggle').click();
    await page.waitForTimeout(650);
    await page.goto(`${base}/бібліотека/`, { waitUntil: 'networkidle' });
    const gallery = page.locator('[data-library-carousel]').first();
    await gallery.locator('[data-carousel-next]').click();
    await page.waitForTimeout(850);
    const galleryWorks = await gallery.getAttribute('data-index') === '1';
    const stage = await gallery.locator('.library-carousel-stage').boundingBox();
    await page.mouse.move(stage.x + stage.width * .75, stage.y + stage.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width * .25, stage.y + stage.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(850);
    const swipeWorks = await gallery.getAttribute('data-index') === '2';
    await page.locator('[data-library-tab="library-new-books"]').click();
    const record = page.locator('#library-new-books .library-book-record').first();
    await record.locator('summary').click();
    const recordWorks = await record.getAttribute('open') !== null;
    await page.screenshot({ path: `${output}/${name}-library.png` });
    const deferredBefore = await page.locator('details iframe[data-deferred-src]').count();
    const startedBefore = await page.locator('details:not([open]) iframe[src]').count();
    await page.route('https://**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Document test</p>' }));
    await page.locator('[data-library-tab="library-rules"]').click();
    const documentGroup = page.locator('#library-rules .library-document').first();
    await documentGroup.locator('summary').click();
    await documentGroup.locator('iframe[src]').waitFor({ state: 'attached' });
    const documentWorks = await documentGroup.locator('iframe[src]').count() > 0;
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${output}/${name}-home.png` });
    await page.locator('.theme-toggle').click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${output}/${name}-home-dark.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(350);
    const reducedMotionWorks = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length === 0);
    reports.push({ device: name, cpuSlowdown: 6, idleTaskMs: Math.round((afterIdle.TaskDuration - initial.TaskDuration) * 1000), idleAnimations: beforeIdle.animations, scrollTaskMs: Math.round((afterScroll.TaskDuration - afterIdle.TaskDuration) * 1000), scrollLayoutMs: Math.round((afterScroll.LayoutDuration - afterIdle.LayoutDuration) * 1000), ...scroll, menuEntrance, reducedMotionWorks, menuWorks, recordWorks, galleryWorks, swipeWorks, deferredBefore, startedBefore, documentWorks, errors });
    await context.close();
  }
  fs.writeFileSync(`${output}/results.json`, JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports, null, 2));
  if (reports.some(r => r.errors.length || !r.menuWorks || !r.menuEntrance || !r.recordWorks || !r.galleryWorks || !r.swipeWorks || !r.documentWorks || !r.visibleCardAnimations || r.strayGlow || !r.reducedMotionWorks || r.animationProperties.some(p => !['opacity', 'transform'].includes(p)) || r.startedBefore || r.overflow)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
