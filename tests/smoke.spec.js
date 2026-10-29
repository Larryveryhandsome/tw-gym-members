// 冒煙測試：頁面載入沒有 JS 錯誤、一鍵示範流程跑完、手機寬度沒有橫向捲動
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const url = (p, hash = '') => pathToFileURL(path.join(ROOT, p)).href + hash;

// 外部資源（Google 字型）在測試裡一律回空內容，測試結果不受網路影響
async function open(page, p, hash) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route(/^https?:\/\//, r => r.fulfill({ status: 200, body: '' }));
  await page.goto(url(p, hash));
  return errors;
}

const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('說明頁 index.html', () => {
  test('載入沒有 JS 錯誤、內容與連結正確', async ({ page }) => {
    const errors = await open(page, 'index.html');
    await expect(page.locator('h1')).toContainText('教練臨時請假');
    await expect(page.locator('#ledger .lg')).toHaveCount(4);          // JS 產生的對照表
    await expect(page.locator('#feed > *').first()).toBeVisible();      // 手機動畫
    await page.locator('#L').fill('100');                               // 試算拉桿
    await expect(page.locator('#out')).toHaveText('NT$ 18,000');        // 100 × 15% × 1200
    const demoLinks = await page.locator('a[href="demo/index.html#auto"]').count();
    expect(demoLinks).toBeGreaterThan(0);
    await expect(page.locator('a[href="https://line.me/ti/p/xzHT2IywOM"]').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('手機 375px 沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const errors = await open(page, 'index.html');
    expect(await noHScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('示範 demo/index.html', () => {
  test('載入沒有 JS 錯誤，課表與設定檔內容一致', async ({ page }) => {
    const errors = await open(page, 'demo/index.html');
    await expect(page.locator('#gymName')).toHaveText('示範健身房');
    const n = await page.evaluate(() => window.GYM_CONFIG.schedule.trim().split('\n').length);
    expect(await page.evaluate(() => S.courses.length)).toBe(n);
    await page.click('#atabs button[data-t="sched"]');
    await expect(page.locator('#a-sched .cls')).toHaveCount(n);
    expect(errors).toEqual([]);
  });

  test('一鍵示範：請假 → 通知會員 → 邀請代課 → 接下 → 課表與公告更新', async ({ page }) => {
    const errors = await open(page, 'demo/index.html', '#auto');
    // 最後一步會切到「公告推播」分頁
    await expect(page.locator('#atabs button[data-t="post"]')).toHaveClass(/on/, { timeout: 30000 });
    const r = await page.evaluate(() => {
      const ch = S.changes[0], x = S.courses.find(c => c.id === ch.courseId);
      return {
        status: ch.status, orig: x.orig, coach: x.coach, sub: ch.sub, notified: ch.notified,
        member: S.inbox.M001.map(m => m.text).join('\n'),
        poster: document.querySelector('#a-post .poster').textContent
      };
    });
    expect(r.status).toBe('done');
    expect(r.orig).toBe('B');
    expect(r.coach).toBe('F');            // 帶過同一門課、當天有空、代課最少的老師
    expect(r.notified).toBeGreaterThan(5); // 只通知常上這堂的會員
    expect(r.member).toContain('課程異動通知');
    expect(r.member).toContain('代課確定');
    expect(r.poster).toContain('B ➜ F');
    expect(errors).toEqual([]);
  });

  test('代課人選都婉拒時，轉給店長決定，可改成停課', async ({ page }) => {
    const errors = await open(page, 'demo/index.html');
    const r = await page.evaluate(() => {
      const id = S.cast.course;
      startChange(id, 'leave', '身體不適');
      const ch = S.changes[0];
      const order = [];
      while (ch.status === 'finding') { const k = ch.invites.at(-1).k; order.push(k); declineSub(ch.id, k); }
      const st = ch.status;
      cancelChange(ch.id);
      return { order, st, after: ch.status, course: S.courses.find(c => c.id === id).status, group: S.inbox.G.map(m => m.text).join('\n') };
    });
    expect(r.order).toEqual(['F', 'K']);
    expect(r.st).toBe('nobody');
    expect(r.after).toBe('cancelled');
    expect(r.course).toBe('cancel');
    expect(r.group).toContain('找不到代課老師');
    expect(errors).toEqual([]);
  });

  test('會員關懷：一鍵送出、會員回覆「我要去」記為喚回', async ({ page }) => {
    const errors = await open(page, 'demo/index.html');
    await page.click('#atabs button[data-t="crm"]');
    await page.locator('#a-crm .kpi button').nth(1).click();   // 30–59 天沒來
    await page.selectOption('#who', 'M002');
    await page.locator('#chat .fx button', { hasText: '我要去' }).click();
    const back = await page.evaluate(() => S.members.find(m => m.id === 'M002').back);
    expect(back).toBe(1);
    await expect(page.locator('#chat')).toContainText('已幫你記下');
    expect(errors).toEqual([]);
  });

  test('會員在 LINE 打字與點選單有自動回覆，輸入的 HTML 不會被執行', async ({ page }) => {
    const errors = await open(page, 'demo/index.html');
    await page.fill('#say', '<img src=x onerror="window.__x=1">營業時間');
    await page.press('#say', 'Enter');
    await expect(page.locator('#chat')).toContainText('營業時間');
    expect(await page.evaluate(() => window.__x)).toBeUndefined();
    await page.locator('#rich button', { hasText: '會籍方案' }).click();
    await expect(page.locator('#chat')).toContainText('會籍方案');
    expect(errors).toEqual([]);
  });

  test('手機 375px 沒有橫向捲動（課表在自己的框內左右滑）', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const errors = await open(page, 'demo/index.html');
    for (const t of ['home', 'sched', 'change', 'crm', 'equip', 'post', 'log']) {
      await page.click(`#atabs button[data-t="${t}"]`);
      expect(await noHScroll(page), t).toBe(true);
    }
    expect(errors).toEqual([]);
  });
});
