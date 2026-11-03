// 포르투판 시험 장치 (v1.2.0 기준) · 모든 자료는 합성 — 설계서 4번
// 1) 320·390px 5탭 가로 넘침 · JS 오류
// 2) 카미노 저장소 불변 (같은 출처의 camino:* 키 · caminoMedia)
// 3) 모르는 칸 보존 — 기기(저장 왕복) · 동기화 경로(docGet/docPut, plan.json) · 백업 경로(빠른 백업 → 복원)
// 4) 동영상 29·30·31초 경계, 사진 1280/1600px, 동영상 자동 백업 기본 끄기
// 5) 저장 이름 분리 · 날짜 축(10/31부터 열린 날짜) · 카미노 저장소 이름 거부 · 카미노 백업 거부
// 6) v1.1 카미노 기록 가져오기: 10/31 이후만 · 바이트 일치 · 매체 복사 · 덮어쓰기 없음 · 카미노 불변 · 매체 DB 새로 만들지 않음
// 7) v1.2 카미노 앱 토큰 이어 쓰기: 토큰은 화면에 안 보임 · camino:gh 불변 · Porto-data로 연결 시험
// 사용: node tests/smoke-porto.js porto/index.html [porto백업.json]
// 실제 포르투 백업 파일을 둘째 인자로 주면, 그 기록을 넣고 열기·저장 왕복 대조까지 한다.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const file = path.resolve(process.argv[2] || 'porto/index.html');
const backup = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : null;
const dir = path.dirname(file), base = path.basename(file);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'porto-t-'));

const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/blank.html') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<!doctype html><title>b</title>'); }
  const p = path.join(dir, u.replace(/^\/$/, '/' + base));
  if (!fs.existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' });
  fs.createReadStream(p).pipe(r);
}).listen(0);
const ORIGIN = `http://127.0.0.1:${srv.address().port}`;
const url = `${ORIGIN}/${base}`;

let fails = 0;
const uniqPaths = (h) => [...new Set(h.map(x => x[0].split('?')[0]))].join(', ');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// ── 시험 자료 ──
function makeVideo(sec) {
  const f = path.join(tmp, `v${sec}.webm`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=blue:s=64x64:r=10:d=${sec}`, '-c:v', 'libvpx', '-b:v', '50k', f]);
  return f;
}
function makePhoto() {
  const f = path.join(tmp, 'big.jpg');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=4000x3000:d=1', '-frames:v', '1', f]);
  return f;
}
// 같은 출처에 이미 있는 카미노 기록 (합성)
const CAMINO_LS = {
  'camino:me': 'p2', 'camino:view': 'p2', 'camino:v6': '1', 'camino:mig5': '1',
  'camino:cfg': JSON.stringify({ budget: '120', rate: '1740', pm: ['현금', '트래블카드'], book: { s7: { m: 'BK', i: 'x' } } }),
  'camino:stages': JSON.stringify([['D1', '보행', '시험 구간 A → B', 9, 'D', '', 0, '', '', '', '', '', 's6']]),
  'camino:plan': JSON.stringify([0, 1, 2]),
  'camino:d:p2:2026-10-31': JSON.stringify({ km: '0', note: '카미노 시험 기록', items: [{ c: '교통', a: '40', u: 'EUR', iid: 'i1' }], media: [{ id: 'cm1', t: 'image', sz: 3 }] }),
  'camino:d:p2:2026-11-01': JSON.stringify({ note: '카미노 앱에 적은 11/1', a1: '3' }),
  'camino:gh': JSON.stringify({ token: 'x', repo: 'vNext2026/Camino-data' }),
  'camino:out': '[]', 'camino:sy': '{}', 'camino:draft': JSON.stringify({ o: 'p2', d: '2026-10-31', v: { note: 'draft' } }),
};
// 포르투 기록 — 이 판이 모르는 칸을 일부러 넣는다
const PORTO_DAY = {
  kind: 'base', sched: '오전 연구실 · 오후 장보기', note: '포르투 둘째 날. '.repeat(250) + 'https://example.com/아주아주긴주소_' + 'x'.repeat(120),
  items: [
    { c: '식비', a: '12.5', u: 'EUR', m: 'Bolhão 시장', pm: '현금', iid: 'iA', zzItem: 'keep-item' },
    { c: '주거비', a: '800', u: 'EUR', iid: 'iB' },
    { c: '교통', a: '150', u: 'NOK', iid: 'iC' },
    { c: '기타', a: '20000', u: 'KRW', iid: 'iD' },
  ],
  media: [], ha: '두통 조금', hb: '', zzFuture: { keep: 'me' }, km: '12.3', a1: '3', st: 'more',
};

async function idbDump(pg, name) {
  return pg.evaluate((n) => new Promise((res) => {
    const q = indexedDB.open(n);
    q.onupgradeneeded = () => { q.transaction.abort(); res({ missing: true }); };
    q.onerror = () => res({ missing: true });
    q.onsuccess = () => {
      const db = q.result; if (!db.objectStoreNames.contains('m')) { db.close(); return res({ stores: [] }); }
      const out = {}, tx = db.transaction('m', 'readonly'), st = tx.objectStore('m'), cur = st.openCursor();
      cur.onsuccess = async () => {
        const c = cur.result; if (!c) return;
        const v = c.value; out[c.key] = v instanceof Blob ? 'blob:' + v.size + ':' + v.type : JSON.stringify(v); c.continue();
      };
      tx.oncomplete = () => { db.close(); res(out); };
    };
  }), name);
}
const snapLS = (pg) => pg.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
const closeModals = async (pg) => { for (let i = 0; i < 5; i++) { const b = await pg.$('.mask .btns button.pri'); if (!b) break; await b.click(); await pg.waitForTimeout(120); } };
const modalText = (pg) => pg.evaluate(() => [...document.querySelectorAll('.mask .msg')].map(e => e.textContent).join(' | '));
const overflow = (pg) => pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

(async () => {
  const br = await chromium.launch();
  const vids = { 29: makeVideo(29), 30: makeVideo(30), 31: makeVideo(31) }, photo = makePhoto();

  for (const w of [320, 390]) {
    const ctx = await br.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/sw\.js|service ?worker|404|Failed to load resource/i.test(m.text())) errs.push(m.text()); });

    // 카미노 자료를 먼저 같은 출처에 심는다 (localStorage + caminoMedia)
    await pg.goto(`${ORIGIN}/blank.html`);
    await pg.evaluate((ls) => new Promise((res) => {
      for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
      const q = indexedDB.open('caminoMedia', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('m');
      q.onsuccess = () => { const tx = q.result.transaction('m', 'readwrite');
        tx.objectStore('m').put(new Blob(['abc'], { type: 'image/jpeg' }), 'cm1');
        tx.objectStore('m').put('{"base":1}', 'b:data/p2/2026-10-31.json');
        tx.oncomplete = () => { q.result.close(); res(); }; };
    }), CAMINO_LS);
    const camLS0 = Object.fromEntries(Object.entries(await snapLS(pg)).filter(([k]) => k.startsWith('camino:')));
    const camDB0 = await idbDump(pg, 'caminoMedia');

    // 포르투판 첫 실행 → 「이 폰은 누구의 폰입니까?」 → Dominica
    await pg.goto(url); await pg.waitForTimeout(700);
    const askBtn = await pg.$('.mask button[data-i="1"]');
    ok(!!askBtn, `${w}px 첫 실행: 폰 주인 묻기 (카미노 camino:me를 쓰지 않음)`);
    if (askBtn) { await askBtn.click(); await pg.waitForTimeout(300); }
    await closeModals(pg);

    // 날짜 축
    const ax = await pg.evaluate(() => ({ d0: DAYS[0], n: DAYS.length, last: DAYS[DAYS.length - 1], today: IT[todayIdx()][0], me: lsGet('porto:me') }));
    const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    ok(ax.d0 === '2026-10-31', `${w}px 날짜 축 시작 10/31 (${ax.d0})`);
    ok(ax.today === todayStr, `${w}px 오늘(${todayStr})이 날짜 축에 있고 첫 화면이 오늘`);
    ok(ax.last >= todayStr, `${w}px 날짜 축이 오늘 이후까지 열림 (끝 ${ax.last}, ${ax.n}일)`);
    ok(ax.me === 'p2', `${w}px 폰 주인 저장 키 porto:me`);

    // 포르투 기록 심기 (모르는 칸 포함) + 먼 미래 날짜 → 다시 열면 날짜 축이 늘어나야 한다
    await pg.evaluate((d) => {
      localStorage.setItem('porto:d:p2:2026-11-01', JSON.stringify(d));
      localStorage.setItem('porto:d:p1:2026-11-02', JSON.stringify({ kind: 'trip', sched: '리스본', note: 'Damiano 기록', items: [{ c: '교통', a: '30', u: 'EUR', iid: 'iX' }], media: [] }));
      localStorage.setItem('porto:d:p2:2027-06-30', JSON.stringify({ note: '먼 날', zz: 1 }));
      localStorage.setItem('porto:cfg', JSON.stringify({ budget: '90', rate: '1600', fx: { NOK: '11.6' }, zzCfg: { keep: 1 } }));
      localStorage.setItem('porto:zzUnknownKey', 'must-survive');
    }, backup ? {} : PORTO_DAY);
    if (backup) await pg.evaluate((b) => { for (const o of Object.keys(b.owners || {})) for (const d of Object.keys(b.owners[o])) localStorage.setItem(`porto:d:${o}:${d}`, JSON.stringify(b.owners[o][d])); if (b.cfg) localStorage.setItem('porto:cfg', JSON.stringify(b.cfg)); }, backup);

    const before = await snapLS(pg);
    await pg.reload(); await pg.waitForTimeout(800); await closeModals(pg);
    ok(await pg.evaluate(() => DAYS.indexOf('2027-06-30') >= 0), `${w}px 저장된 먼 날짜(2027-06-30)까지 날짜 축이 늘어남`);

    for (const t of ['log', 'close', 'stat', 'plan', 'out']) {
      await pg.click(`.tabbar button[data-t="${t}"]`); await pg.waitForTimeout(250);
      ok((await overflow(pg)) <= 0, `${w}px 탭 ${t}: 가로 넘침 ${await overflow(pg)}px`);
    }
    // 긴 글·여러 통화가 든 날의 기록 화면
    await pg.click('.tabbar button[data-t="log"]');
    await pg.evaluate(() => show(DAYS.indexOf('2026-11-01'))); await pg.waitForTimeout(400);
    ok((await overflow(pg)) <= 0, `${w}px 11/1(긴 글·NOK·₩) 기록 화면 가로 넘침 ${await overflow(pg)}px`);
    await pg.screenshot({ path: path.join(__dirname, `shot-log-${w}.png`), fullPage: true });
    await pg.click('.tabbar button[data-t="close"]'); await pg.waitForTimeout(250);
    ok((await overflow(pg)) <= 0, `${w}px 11/1 정산 화면 가로 넘침`);
    await pg.click('.tabbar button[data-t="stat"]'); await pg.waitForTimeout(250);
    await pg.screenshot({ path: path.join(__dirname, `shot-stat-${w}.png`), fullPage: true });
    await pg.click('.tabbar button[data-t="out"]'); await pg.waitForTimeout(250);
    for (const f of ['post1', 'diary', 'brief', 'cost', 'sched', 'csv', 'json']) {
      await pg.click(`#fmt button[data-f="${f}"]`); await pg.waitForTimeout(80);
    }
    const shareTxt = await pg.evaluate(() => { var r = {}; ['post1', 'diary', 'brief'].forEach(f => { OUTR = 'all'; OUTSEL = null; r[f] = build(f) }); r.day = daySummary(DAYS.indexOf('2026-11-01'), cache['2026-11-01']); r.csv = build('csv'); return r; });
    ok(!/두통/.test(shareTxt.post1 + shareTxt.diary + shareTxt.brief + shareTxt.day), `${w}px 공유용 글(포스팅·일지·안부·하루 요약)에 건강 특이사항 없음`);
    ok(/두통/.test(shareTxt.csv), `${w}px CSV에는 건강 특이사항 있음`);
    const html = await pg.evaluate(() => { OUTSEL = null; return diaryHTML(false); });
    ok(!/두통/.test(html), `${w}px 일지 문서(HTML)에 건강 특이사항 없음`);
    await pg.click('.tabbar button[data-t="log"]'); await pg.waitForTimeout(200);

    const after = await snapLS(pg);
    const changed = Object.keys({ ...before, ...after }).filter(k => !['porto:lastbk', 'porto:ui'].includes(k) && before[k] !== after[k]);
    ok(changed.length === 0, `${w}px 열고 둘러보기만 했을 때 저장소 불변` + (changed.length ? ` — 바뀐 키: ${changed.join(', ')}` : ''));

    // ── 기기 경로: 저장 왕복 시 모르는 칸 보존 ──
    if (!backup) {
      await pg.fill('#note', PORTO_DAY.note + ' (덧붙임)');
      await pg.click('#kchips button[data-k="trip"]');
      await pg.click('#lwho button[data-w="b"]'); await pg.fill('#health', 'Dominica 감기');
      await pg.click('#doSave'); await pg.waitForTimeout(300); await closeModals(pg);
      const o = JSON.parse(await pg.evaluate(() => localStorage.getItem('porto:d:p2:2026-11-01')));
      ok(o.note.endsWith('(덧붙임)') && o.kind === 'trip' && o.hb === 'Dominica 감기', `${w}px 저장: 한 줄·구분·건강(Dominica) 반영`);
      ok(o.ha === '두통 조금', `${w}px 저장: 다른 사람 건강 칸 보존`);
      ok(o.zzFuture && o.zzFuture.keep === 'me' && o.km === '12.3' && o.a1 === '3' && o.st === 'more', `${w}px 저장: 모르는 칸(zzFuture·km·a1·st) 보존`);
      ok(o.items[0].zzItem === 'keep-item', `${w}px 저장: 지출 항목의 모르는 칸 보존`);
      ok(o.items[1].c === '주거비', `${w}px 저장: 목록에 없는 지출 유형 보존 (${o.items[1].c})`);
      ok(o.items[2].u === 'NOK' && o.items[3].u === 'KRW', `${w}px 저장: 통화 NOK·KRW 보존`);
      const tot = await pg.evaluate(() => eurOf(cache['2026-11-01']));
      ok(Math.abs(tot - (12.5 + 800 + 150 / 11.6 + 20000 / 1600)) < 1e-6, `${w}px € 환산 (NOK=11.6, ₩1600) = ${tot.toFixed(2)}`);
      // 구분 다시 누르면 지움 → 저장해도 옛 값이 되살아나지 않음
      await pg.click('#kchips button[data-k="trip"]'); await pg.click('#doSave'); await pg.waitForTimeout(200);
      ok(JSON.parse(await pg.evaluate(() => localStorage.getItem('porto:d:p2:2026-11-01'))).kind === '', `${w}px 구분 지우기가 저장됨`);
    }

    // ── 동기화 경로 ──
    const sy = await pg.evaluate(() => {
      const r = {};
      const p = 'data/p2/2026-11-01.json';
      r.dayGet = docGet(p) === localStorage.getItem('porto:d:p2:2026-11-01');
      const rem = JSON.parse(docGet(p)); rem.zzRemote = { from: 'other-phone' }; rem.items[0].zzRemoteItem = 1;
      docPut(p, JSON.stringify(rem));
      const back = JSON.parse(localStorage.getItem('porto:d:p2:2026-11-01'));
      r.dayPut = back.zzRemote && back.zzRemote.from === 'other-phone' && back.items[0].zzRemoteItem === 1;
      r.dayCache = !!(cache['2026-11-01'] && cache['2026-11-01'].zzRemote);
      // 3방향 병합: 이 기기에서 한 줄만 고침, 원격에서 모르는 칸 추가 → 둘 다 남는다
      const b = { note: 'a', kind: 'base' }, l = { note: 'b', kind: 'base' }, rr = { note: 'a', kind: 'base', zzNew: 5 };
      const m = merge3(b, l, rr, 'loc'); r.merge = m.note === 'b' && m.zzNew === 5;
      // plan.json: 설정(cfg)과 이 판이 모르는 최상위 칸
      docPut('plan.json', JSON.stringify({ cfg: Object.assign({}, CFG, { zzCfg2: 'k' }), stages: [{ sid: 's1', r: ['D1', '보행', 'x', 1, 'D', '', 0, '', '', '', '', '', 'zz13'] }], map: [0], zzTop: { a: 1 } }));
      const pj2 = JSON.parse(docGet('plan.json'));
      r.planTop = pj2.zzTop && pj2.zzTop.a === 1 && pj2.stages[0].r[12] === 'zz13' && pj2.map[0] === 0;
      r.planCfg = pj2.cfg.zzCfg2 === 'k';
      saveCfg(); savePlan();
      const pj3 = JSON.parse(docGet('plan.json'));
      r.planAfterSave = pj3.zzTop && pj3.stages[0].r[12] === 'zz13' && JSON.parse(localStorage.getItem('porto:cfg')).zzCfg2 === 'k';
      r.outbox = JSON.parse(localStorage.getItem('porto:out') || '[]');
      r.vidOff = ghCfg().vid !== true;
      return r;
    });
    ok(sy.dayGet, `${w}px 동기화: 올릴 하루 문서 = 기기 저장본 그대로`);
    ok(sy.dayPut && sy.dayCache, `${w}px 동기화: 받은 하루 문서의 모르는 칸 보존`);
    ok(sy.merge, `${w}px 동기화: 3방향 병합에서 원격의 모르는 칸 보존`);
    ok(sy.planTop, `${w}px 동기화: plan.json의 모르는 최상위 칸·구간 행 13번째 칸 보존 (카미노 slice(0,12) 문제 해소)`);
    ok(sy.planCfg && sy.planAfterSave, `${w}px 동기화: cfg 모르는 키, 저장 후에도 보존`);
    ok(sy.vidOff, `${w}px 동영상 자동 백업 기본값 끄기`);

    // ── 사진 크기 ──
    if (!backup) {
      const dims = async () => pg.evaluate(async () => { const m = draftMedia[draftMedia.length - 1]; const b = await mgetLocal(m.id); const bm = await createImageBitmap(b); return [bm.width, bm.height, b.type]; });
      await pg.setInputFiles('#fPhoto', photo); await pg.waitForTimeout(2500); await closeModals(pg);
      const d1 = await dims(); ok(d1[0] === 1280 && d1[1] === 960 && d1[2] === 'image/jpeg', `${w}px 사진 4000×3000 → ${d1[0]}×${d1[1]} (1280 기본)`);
      await pg.click('#doSave'); await pg.waitForTimeout(200); await closeModals(pg);
      await pg.click('.tabbar button[data-t="out"]'); await pg.click('#pxSel button[data-p="1600"]'); await pg.click('.tabbar button[data-t="log"]');
      await pg.setInputFiles('#fPhoto', photo); await pg.waitForTimeout(2500); await closeModals(pg);
      const d2 = await dims(); ok(d2[0] === 1600, `${w}px 설정 1600 → ${d2[0]}×${d2[1]}`);
      ok(/1600px/.test(await pg.textContent('#pxlbl')), `${w}px 사진 크기 안내 문구 갱신`);
      // ── 동영상 29·30·31초 ──
      const res = {};
      for (const s of [29, 30, 31]) {
        const n0 = await pg.evaluate(() => draftMedia.length);
        await pg.setInputFiles('#fVideo', vids[s]); await pg.waitForTimeout(3000);
        const n1 = await pg.evaluate(() => draftMedia.length);
        const t = await modalText(pg); await closeModals(pg);
        res[s] = { added: n1 > n0, msg: t, dur: n1 > n0 ? await pg.evaluate(() => draftMedia[draftMedia.length - 1].dur) : null };
      }
      ok(res[29].added, `${w}px 동영상 29초 들어감 (${res[29].dur && res[29].dur.toFixed(2)}초)`);
      ok(res[30].added, `${w}px 동영상 30초 들어감 (${res[30].dur && res[30].dur.toFixed(2)}초)`);
      ok(!res[31].added && /30초 넘음/.test(res[31].msg), `${w}px 동영상 31초 거부 — 「${res[31].msg.split('\n').slice(0, 3).join(' ')}」`);
      await pg.click('#doSave'); await pg.waitForTimeout(400); await closeModals(pg);
      const want = await pg.evaluate(() => mediaWanted().map(x => x.id));
      const vidIds = await pg.evaluate(() => cache['2026-11-01'].media.filter(m => m.t === 'video').map(m => m.id));
      ok(vidIds.length === 2 && vidIds.every(id => want.indexOf(id) < 0), `${w}px 동영상은 기본값에서 GitHub 올릴 목록에 없음`);
      const pDB = await idbDump(pg, 'portoMedia');
      ok(Object.keys(pDB).filter(k => !/^b:/.test(k)).length >= 4 + 2, `${w}px 사진·동영상은 portoMedia에 저장 (${Object.keys(pDB).length}개)`);
    }

    // ── 백업 경로: 빠른 백업 → 다른 폰(새 맥락)에서 복원 ──
    const qp = await pg.evaluate(() => JSON.stringify(quickPack()));
    const qpo = JSON.parse(qp);
    ok(qpo.app === 'porto' && qpo.owners.p2['2026-11-01'].zzRemote, `${w}px 빠른 백업에 포르투 표지·모르는 칸 포함`);
    fs.writeFileSync(path.join(tmp, 'quick.json'), qp);
    fs.writeFileSync(path.join(tmp, 'camino_quick.json'), JSON.stringify({ v: 4, kind: 'quick', app: '6.3.0', owners: { p2: { '2026-11-03': { note: 'CAMINO' } } }, cfg: { budget: '999' } }));

    // ── 저장소 이름 거부 ──
    await pg.click('.tabbar button[data-t="out"]');
    await pg.fill('#ghTok', 'github_pat_test'); await pg.fill('#ghRepo', 'vNext2026/Camino-data'); await pg.click('#ghSave'); await pg.waitForTimeout(200);
    const rj = await modalText(pg); await closeModals(pg);
    ok(/카미노 저장소/.test(rj) && !(await pg.evaluate(() => localStorage.getItem('porto:gh'))), `${w}px 데이터 저장소 Camino-data 거부, 설정 저장 안 함`);
    await pg.fill('#ghTok', ''); await pg.fill('#ghRepo', '');
    ok(await pg.evaluate(() => badRepo('vNext2026/Camino') && badRepo('vNext2026/camino26') && badRepo('vnext2026/Camino-src') && !badRepo('vNext2026/Porto-data')), `${w}px 카미노 앱·원본·camino26 저장소 이름 거부`);
    await pg.click('.tabbar button[data-t="log"]');

    // ── 카미노 저장소 불변 ──
    const camLS1 = Object.fromEntries(Object.entries(await snapLS(pg)).filter(([k]) => k.startsWith('camino:')));
    const camDB1 = await idbDump(pg, 'caminoMedia');
    const lsDiff = Object.keys({ ...camLS0, ...camLS1 }).filter(k => camLS0[k] !== camLS1[k]);
    ok(lsDiff.length === 0, `${w}px 카미노 localStorage(camino:*) 불변 — ${Object.keys(camLS0).length}개` + (lsDiff.length ? ' 바뀐 키: ' + lsDiff.join(', ') : ''));
    ok(JSON.stringify(camDB0) === JSON.stringify(camDB1), `${w}px 카미노 IndexedDB(caminoMedia) 불변 — ${Object.keys(camDB0).length}개`);
    const keys = Object.keys(await snapLS(pg));
    ok(keys.every(k => k.startsWith('camino:') || k.startsWith('porto:')), `${w}px 포르투판이 만든 키는 모두 porto:` + ' — ' + keys.filter(k => !/^(camino|porto):/.test(k)).join(','));
    ok(errs.length === 0, `${w}px JS 오류 없음` + (errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''));
    await ctx.close();

    // ── 새 폰에서 복원 ──
    const ctx2 = await br.newContext({ viewport: { width: w, height: 844 } });
    const p2 = await ctx2.newPage(); const errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
    await p2.goto(url); await p2.waitForTimeout(500);
    if (await p2.$('.mask button[data-i="1"]')) await p2.click('.mask button[data-i="1"]');
    await closeModals(p2);
    await p2.setInputFiles('#fRestore', [path.join(tmp, 'quick.json'), path.join(tmp, 'camino_quick.json')]); await p2.waitForTimeout(800);
    const rmsg = await modalText(p2); await closeModals(p2);
    const r2 = await p2.evaluate(() => ({ d: JSON.parse(localStorage.getItem('porto:d:p2:2026-11-01') || 'null'), cam: localStorage.getItem('porto:d:p2:2026-11-03'), cfg: JSON.parse(localStorage.getItem('porto:cfg') || '{}'), d1: localStorage.getItem('porto:d:p1:2026-11-02') }));
    ok(r2.d && JSON.stringify(r2.d) === JSON.stringify(qpo.owners.p2['2026-11-01']), `${w}px 복원: 기록이 백업과 한 글자도 다르지 않음 (모르는 칸 포함)`);
    ok(!!r2.d1, `${w}px 복원: 두 사람 기록 모두`);
    ok(!r2.cam && r2.cfg.budget !== '999' && /포르투판 백업이 아님/.test(rmsg), `${w}px 복원: 카미노 백업 파일은 거부`);
    ok(errs2.length === 0, `${w}px 복원 화면 JS 오류 없음` + (errs2.length ? ' — ' + errs2.join(' | ') : ''));
    await ctx2.close();
  }
  // 조회 전용 폰
  const ctx3 = await br.newContext({ viewport: { width: 320, height: 700 } });
  const p3 = await ctx3.newPage(); const e3 = []; p3.on('pageerror', e => e3.push(e.message));
  await p3.goto(`${ORIGIN}/blank.html`); await p3.evaluate((d) => { localStorage.setItem('porto:me', 'p1'); localStorage.setItem('porto:ro', '1'); localStorage.setItem('porto:d:p1:2026-11-01', JSON.stringify(d)); }, PORTO_DAY);
  await p3.goto(url); await p3.waitForTimeout(600);
  for (const t of ['log', 'close', 'stat', 'plan', 'out']) { await p3.click(`.tabbar button[data-t="${t}"]`); await p3.waitForTimeout(150); ok((await overflow(p3)) <= 0, `조회 전용 320px 탭 ${t} 넘침 없음`); }
  ok(await p3.evaluate(() => $('#note').disabled && $('#sched').disabled && $('#health').disabled), '조회 전용: 한 줄·일정·건강 칸 잠김');
  ok(e3.length === 0, '조회 전용 JS 오류 없음' + (e3.length ? ' — ' + e3.join(' | ') : ''));
  await ctx3.close();

  // ── v1.1 카미노 기록 가져오기 ──
  {
    const camRec = {
      '2026-10-30': { p2: { note: '10/30 — 가져오면 안 됨', items: [] } },
      '2026-10-31': { p2: { km: '0', note: '시험 이동일 [사진 1]', st: 'jump', a1: '3', b2: '4', zzCam: { keep: 1 },
        items: [{ c: '교통', a: '40', u: 'EUR', pm: '트래블카드', iid: 'i1', rcs: [{ id: 'r1', sz: 3 }] }, { c: '식비', a: '9000', u: 'KRW', iid: 'i2' }],
        media: [{ id: 'm1', t: 'image', sz: 3, cap: '사진' }, { id: 'm2', t: 'video', sz: 4, dur: 12, pid: 'm2_p' }], cash: { start: '120', actual: '80' } } },
      '2026-11-01': { p1: { note: 'Damiano 11/1', media: [{ id: 'mX', t: 'image', sz: 3 }], items: [] },
                      p2: { note: '카미노에 적은 11/1 (포르투에 이미 있음)', items: [] } },
    };
    const seedCam = async (pg, withDb) => pg.evaluate(([recs, withDb]) => new Promise((res) => {
      for (const d of Object.keys(recs)) for (const o of Object.keys(recs[d])) localStorage.setItem(`camino:d:${o}:${d}`, JSON.stringify(recs[d][o]));
      localStorage.setItem('camino:cfg', JSON.stringify({ rate: '1650', pm: ['현금', '트래블카드', '신용카드'] }));
      localStorage.setItem('porto:me', 'p2');
      localStorage.setItem('porto:d:p2:2026-11-01', JSON.stringify({ note: '포르투에서 먼저 쓴 11/1', kind: 'base' }));
      if (!withDb) return res();
      const q = indexedDB.open('caminoMedia', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('m');
      q.onsuccess = () => { const tx = q.result.transaction('m', 'readwrite'), st = tx.objectStore('m');
        st.put(new Blob(['img1'], { type: 'image/jpeg' }), 'm1'); st.put(new Blob(['vid22'], { type: 'video/mp4' }), 'm2');
        st.put(new Blob(['pst'], { type: 'image/jpeg' }), 'm2_p'); st.put(new Blob(['rc1'], { type: 'image/jpeg' }), 'r1');
        tx.oncomplete = () => { q.result.close(); res(); }; };
    }), [camRec, withDb]);

    const ctx4 = await br.newContext({ viewport: { width: 320, height: 800 } });
    const p4 = await ctx4.newPage(); const e4 = [];
    p4.on('pageerror', e => e4.push(e.message));
    await p4.goto(`${ORIGIN}/blank.html`); await seedCam(p4, true);
    const cLS0 = Object.fromEntries(Object.entries(await snapLS(p4)).filter(([k]) => k.startsWith('camino:')));
    const cDB0 = await idbDump(p4, 'caminoMedia');
    await p4.goto(url); await p4.waitForTimeout(700); await closeModals(p4);
    await p4.click('.tabbar button[data-t="out"]'); await p4.waitForTimeout(200);
    const st0 = await p4.textContent('#camSt');
    ok(/Damiano 1일 \(11\/01\)/.test(st0) && /Dominica 1일 \(10\/31\)/.test(st0) && /건너뛸 날: Dominica 1일 \(11\/01\)/.test(st0) && !/10\/30/.test(st0), `가져오기: 미리보기 — ${st0.replace(/\n/g, ' / ')}`);
    ok((await overflow(p4)) <= 0, '가져오기: 320px 내보내기 탭 넘침 없음');
    await p4.click('#camImp'); await p4.waitForTimeout(200);
    await p4.click('.mask [data-a=yes]'); await p4.waitForTimeout(1500);
    const msg = await modalText(p4); await closeModals(p4);
    ok(/기록 2일/.test(msg) && /4개 새로 복사/.test(msg) && /없는 사진·영수증 1개/.test(msg), `가져오기: 결과 안내 — ${msg.split('\n').filter(Boolean).slice(0, 3).join(' / ')}`);
    const r = await p4.evaluate(() => ({ a: localStorage.getItem('porto:d:p2:2026-10-31'), b: localStorage.getItem('porto:d:p1:2026-11-01'),
      keep: localStorage.getItem('porto:d:p2:2026-11-01'), no: localStorage.getItem('porto:d:p2:2026-10-30'), out: JSON.parse(localStorage.getItem('porto:out') || '[]'), cfg: JSON.parse(localStorage.getItem('porto:cfg') || '{}') }));
    const strip = (s) => { const o = JSON.parse(s); delete o.imp; return JSON.stringify(o); };
    ok(r.a && strip(r.a) === JSON.stringify(camRec['2026-10-31'].p2) && JSON.parse(r.a).imp.from === 'camino', '가져오기: 10/31 기록이 카미노와 한 글자도 다르지 않음 (km·컨디션·모르는 칸 포함) + imp 표시');
    ok(r.b && strip(r.b) === JSON.stringify(camRec['2026-11-01'].p1), '가져오기: Damiano 11/1 기록');
    ok(JSON.parse(r.keep).note === '포르투에서 먼저 쓴 11/1' && !JSON.parse(r.keep).imp, '가져오기: 포르투에 이미 있던 날은 덮어쓰지 않음');
    ok(r.no === null, '가져오기: 10/30 이전은 가져오지 않음');
    ok(r.out.indexOf('data/p2/2026-10-31.json') >= 0 && r.out.indexOf('data/p1/2026-11-01.json') >= 0, '가져오기: 가져온 날은 GitHub 올릴 목록에 들어감');
    ok(r.cfg.rate === '1650' && r.cfg.pm.length === 3, '가져오기: 비어 있던 환율·결제 수단을 카미노 값으로 채움');
    const pDB = await idbDump(p4, 'portoMedia');
    ok(['m1', 'm2', 'm2_p', 'r1'].every(k => pDB[k] && pDB[k] === cDB0[k]), '가져오기: 사진·동영상·표지·영수증이 portoMedia로 그대로 복사됨');
    const cLS1 = Object.fromEntries(Object.entries(await snapLS(p4)).filter(([k]) => k.startsWith('camino:')));
    const cDiff = Object.keys({ ...cLS0, ...cLS1 }).filter(k => cLS0[k] !== cLS1[k]);
    ok(cDiff.length === 0, `가져오기: 카미노 localStorage 불변 (${Object.keys(cLS0).length}개, 키별 비교)` + (cDiff.length ? ' 바뀐 키: ' + cDiff.join(', ') : ''));
    ok(JSON.stringify(cDB0) === JSON.stringify(await idbDump(p4, 'caminoMedia')), '가져오기: 카미노 caminoMedia 불변');
    // 화면: 10/31을 열면 글·지출·사진이 보이고, 저장해도 카미노 칸이 남는다
    await p4.click('.tabbar button[data-t="log"]');
    await p4.evaluate(() => show(DAYS.indexOf('2026-10-31'))); await p4.waitForTimeout(500);
    const vis = await p4.evaluate(() => ({ note: $('#note').value, items: $$('#items .item').length, media: $$('#media .mth img').length }));
    ok(vis.note === '시험 이동일 [사진 1]' && vis.items === 2 && vis.media === 2, `가져오기: 10/31 화면에 글·지출 ${vis.items}건·사진 ${vis.media}장`);
    await p4.click('#kchips button[data-k="trip"]'); await p4.click('#doSave'); await p4.waitForTimeout(300); await closeModals(p4);
    const sv = JSON.parse(await p4.evaluate(() => localStorage.getItem('porto:d:p2:2026-10-31')));
    ok(sv.kind === 'trip' && sv.km === '0' && sv.a1 === '3' && sv.b2 === '4' && sv.zzCam.keep === 1 && sv.imp && sv.items[0].rcs[0].id === 'r1', '가져오기: 가져온 날을 고쳐 저장해도 카미노 칸·영수증 보존');
    // 다시 눌러도 바뀌는 것 없음
    const before2 = await snapLS(p4);
    await p4.click('.tabbar button[data-t="out"]'); await p4.click('#camImp'); await p4.waitForTimeout(300);
    const m2 = await modalText(p4); await closeModals(p4);
    const after2 = await snapLS(p4);
    ok(/새로 가져올 기록이 없습니다/.test(m2) && Object.keys(before2).every(k => k === 'porto:ui' || before2[k] === after2[k]), '가져오기: 두 번째 누르면 아무것도 바꾸지 않음');
    ok(e4.length === 0, '가져오기: JS 오류 없음' + (e4.length ? ' — ' + e4.join(' | ') : ''));
    await ctx4.close();

    // 카미노 매체 DB가 없는 폰: DB를 새로 만들지 않아야 한다
    const ctx5 = await br.newContext({ viewport: { width: 390, height: 800 } });
    const p5 = await ctx5.newPage(); const e5 = []; p5.on('pageerror', e => e5.push(e.message));
    await p5.goto(`${ORIGIN}/blank.html`); await seedCam(p5, false);
    await p5.goto(url); await p5.waitForTimeout(700); await closeModals(p5);
    await p5.click('.tabbar button[data-t="out"]'); await p5.click('#camImp'); await p5.waitForTimeout(200);
    await p5.click('.mask [data-a=yes]'); await p5.waitForTimeout(1200);
    const m5 = await modalText(p5); await closeModals(p5);
    const dbs = await p5.evaluate(async () => (await indexedDB.databases()).map(d => d.name));
    ok(/기록 2일/.test(m5) && /없는 사진·영수증 5개/.test(m5), '가져오기(매체 DB 없음): 기록은 들어오고 빠진 사진 5개 안내');
    ok(dbs.indexOf('caminoMedia') < 0, `가져오기(매체 DB 없음): caminoMedia를 새로 만들지 않음 — DB 목록 ${dbs.join(',')}`);
    ok(e5.length === 0, '가져오기(매체 DB 없음): JS 오류 없음' + (e5.length ? ' — ' + e5.join(' | ') : ''));
    await ctx5.close();

    // 조회 전용 폰에는 가져오기 칸이 보이지 않는다
    const ctx6 = await br.newContext({ viewport: { width: 320, height: 700 } });
    const p6 = await ctx6.newPage();
    await p6.goto(`${ORIGIN}/blank.html`); await p6.evaluate(() => { localStorage.setItem('porto:me', 'p1'); localStorage.setItem('porto:ro', '1'); });
    await p6.goto(url); await p6.waitForTimeout(500); await p6.click('.tabbar button[data-t="out"]');
    ok(!(await p6.isVisible('#camImp')), '가져오기: 조회 전용 폰에는 보이지 않음');
    await ctx6.close();
  }

  // ── v1.2 카미노 앱 토큰 이어 쓰기 ──
  {
    const ctx7 = await br.newContext({ viewport: { width: 320, height: 800 } });
    const p7 = await ctx7.newPage(); const e7 = []; p7.on('pageerror', e => e7.push(e.message));
    const hits = [];
    await p7.route('https://api.github.com/**', (rt) => { const u = rt.request().url(), a = rt.request().headers()['authorization'];
      hits.push([u.replace('https://api.github.com', ''), a]);
      if (/\/repos\/vNext2026\/Porto-data$/.test(u)) return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ full_name: 'vNext2026/Porto-data', private: true, default_branch: 'main' }) });
      return rt.fulfill({ status: 404, contentType: 'application/json', body: '{}' }); });
    await p7.goto(`${ORIGIN}/blank.html`);
    await p7.evaluate(() => { localStorage.setItem('camino:gh', JSON.stringify({ token: 'github_pat_TESTCAMINO', repo: 'vNext2026/Camino-data', appRepo: 'vNext2026/Camino', vid: true })); localStorage.setItem('porto:me', 'p2'); });
    const g0 = await p7.evaluate(() => localStorage.getItem('camino:gh'));
    await p7.goto(url); await p7.waitForTimeout(600); await closeModals(p7);
    await p7.click('.tabbar button[data-t="out"]'); await p7.waitForTimeout(200);
    ok(await p7.isVisible('#camTok'), '토큰 이어 쓰기: 카미노 토큰이 있고 포르투 토큰이 없으면 단추가 보임');
    ok((await overflow(p7)) <= 0, '토큰 이어 쓰기: 320px 넘침 없음');
    await p7.click('#camTok'); await p7.waitForTimeout(200); await p7.click('.mask [data-a=yes]'); await p7.waitForTimeout(800);
    const msg = await modalText(p7); await closeModals(p7);
    const g = await p7.evaluate(() => ({ p: JSON.parse(localStorage.getItem('porto:gh') || '{}'), c: localStorage.getItem('camino:gh'), body: document.body.innerText, type: $('#ghTok').type }));
    ok(g.p.token === 'github_pat_TESTCAMINO' && g.p.repo === 'vNext2026/Porto-data' && g.p.appRepo === 'vNext2026/Porto', '토큰 이어 쓰기: 포르투 설정에 토큰·Porto-data·Porto 저장');
    ok(g.p.vid !== true, '토큰 이어 쓰기: 카미노의 동영상 자동 백업 켜짐을 따라오지 않음 (기본 끄기 유지)');
    ok(/연결했습니다/.test(msg) && /비공개/.test(msg), `토큰 이어 쓰기: 연결 시험 — ${msg.split('\n')[0]}`);
    ok(hits.length && hits.every(h => h[1] === 'Bearer github_pat_TESTCAMINO') && hits.every(h => !/Camino/i.test(h[0])), `토큰 이어 쓰기: 요청은 Porto 저장소로만 (${uniqPaths(hits)})`);
    ok(g.c === g0, '토큰 이어 쓰기: 카미노 설정(camino:gh) 불변');
    ok(g.body.indexOf('TESTCAMINO') < 0 && g.type === 'password', '토큰 이어 쓰기: 토큰이 화면 글자로 보이지 않음');
    ok(!(await p7.isVisible('#camTok')), '토큰 이어 쓰기: 연결 뒤에는 단추가 숨음');
    ok(e7.length === 0, '토큰 이어 쓰기: JS 오류 없음' + (e7.length ? ' — ' + e7.join(' | ') : ''));
    await ctx7.close();
    const ctx8 = await br.newContext({ viewport: { width: 390, height: 800 } }); const p8 = await ctx8.newPage();
    await p8.goto(`${ORIGIN}/blank.html`); await p8.evaluate(() => localStorage.setItem('porto:me', 'p2'));
    await p8.goto(url); await p8.waitForTimeout(500); await p8.click('.tabbar button[data-t="out"]');
    ok(!(await p8.isVisible('#camTok')), '토큰 이어 쓰기: 카미노 토큰이 없으면 단추 숨김');
    await ctx8.close();
  }

  await br.close(); srv.close();
  console.log(fails ? `\n실패 ${fails}건` : '\n모두 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
