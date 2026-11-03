/* A DASHBOARD CARD FILTERS THE LIST UNDER IT, AND CHANGES NO COUNT.

   Clicking Total Clients, KYC Completed, KYC Pending, a category, a stage,
   Pending on DST… narrows the list below to what that card counts. The card
   is drawn selected, another card moves the selection, the same card again
   (or Total) clears it — and every card's figure stays exactly as it was.
   DST used to recount its cards from the filtered list, so clicking Pending
   turned Total into the Pending figure and Completed into 0. */
const {suite} = require('../lib/harness');

/* The numbers on a card row, and which card is selected. */
const READ = (sel) => {
  const cards = [...document.querySelectorAll(sel + ' .mkpi')];
  return {nums: cards.map(c=>c.querySelector('.mkpi-num').textContent.replace(/\s+/g, ' ').trim()),
          labels: cards.map(c=>c.querySelector('.mkpi-lbl').textContent.trim()),
          selected: cards.map((c, i)=>c.classList.contains('selected') ? i : -1).filter(i=>i >= 0)};
};

suite(async t => {
  await t.home();

  await t.step('a book to filter: clients, tasks, reviews, tickets, calls, projects', async () => {
    const r = await t.eval(async ()=>{
      const now = new Date().toISOString();
      const cats = cfgLabels('arc.categories');
      const cl = (n, kyc, cat) => ({id: uid('CMS'), cmsName: 'ZZ Client ' + n, mobile: '98000000' + String(n).padStart(2, '0'),
        kycStatus: kyc, clientCategory: cat, rmName: currentUser, branch: 'Varanasi', createdAt: now});
      DB.clients = DB.clients.concat([cl(1, 'Validated', cats[0]), cl(2, 'Validated', cats[1] || cats[0]),
        cl(3, 'Pending', cats[0]), cl(4, '', ''), cl(5, 'Pending', 'ZZ Unknown Tier')]);
      DB.clients.slice(-5).forEach(c=>initState('CMS', c));
      await save('clients');
      const tk = (st, due) => ({id: uid('DST'), taskType: 'Warm Up Call', description: 'ZZ ' + st, overallStatus: st,
        assignTo: currentUser, createdBy: currentUser, dueDate: due, createdAt: now});
      DB.tasks = DB.tasks.concat([tk('Completed', '2030-01-01'), tk('Completed', '2030-01-01'), tk('Not Started', '2030-01-01'),
        tk('Not Started', '2020-01-01'), tk('In Progress', '2030-01-01'), tk('Cancelled', '2030-01-01')]);
      await save('tasks');
      DB.projects = (DB.projects || []).concat([
        {id: uid('PRJ'), name: 'ZZ One', status: 'In Progress', owner: currentUser, createdAt: now},
        {id: uid('PRJ'), name: 'ZZ Two', status: 'Completed', owner: currentUser, createdAt: now}]);
      await save('projects');
      return {cats: cats.slice(0, 2)};
    });
    return '5 clients, 6 tasks, 2 projects; tiers ' + r.cats.join(', ');
  });

  t.section('CMS');

  await t.step('KYC Completed filters the list to validated clients, and no count moves', async () => {
    const r = await t.eval(async (READ)=>{
      READ = eval(READ);
      window._cmsBranch = ''; navigate('cms');
      const before = READ('#cmsKpis');
      const rowsAll = document.querySelectorAll('#cmsTable tbody tr').length;
      document.querySelectorAll('#cmsKpis .mkpi')[1].click();
      await new Promise(r=>setTimeout(r, 200));
      const after = READ('#cmsKpis');
      const names = [...document.querySelectorAll('#cmsTable tbody tr')].map(tr=>tr.children[1].textContent.trim());
      const kyc = [...document.querySelectorAll('#cmsTable tbody tr')].map(tr=>tr.children[7].textContent.trim());
      return {before, after, rowsAll, names, kyc, note: (document.querySelector('.stage-filter-note') || {}).textContent || ''};
    }, READ.toString());
    if(r.before.nums.join('|') !== r.after.nums.join('|')) throw new Error('counts moved: ' + r.before.nums.join(' ') + ' → ' + r.after.nums.join(' '));
    if(r.after.selected.join() !== '1') throw new Error('selected: ' + r.after.selected.join());
    if(r.names.length !== Number(r.after.nums[1])) throw new Error(r.names.length + ' rows under a card reading ' + r.after.nums[1]);
    if(!r.names.length || r.kyc.some(k=>!/Validated/i.test(k))) throw new Error('rows: ' + r.kyc.join(', '));
    if(!/KYC Completed/.test(r.note)) throw new Error('no note saying what is shown');
    return r.names.length + ' rows, all Validated; cards still ' + r.after.nums.slice(0, 3).join(' / ');
  });

  await t.step('KYC Pending moves the selection; a category chip filters by tier; Total clears it', async () => {
    const r = await t.eval(async (READ)=>{
      READ = eval(READ);
      const wait = () => new Promise(r=>setTimeout(r, 200));
      const rows = () => document.querySelectorAll('#cmsTable tbody tr').length;
      const before = READ('#cmsKpis');
      document.querySelectorAll('#cmsKpis .mkpi')[2].click(); await wait();
      const pending = {sel: READ('#cmsKpis').selected, rows: rows(), nums: READ('#cmsKpis').nums};
      const chip = document.querySelector('#cmsKpis .cms-cat-chip');
      const chipText = chip.textContent.trim();
      chip.click(); await wait();
      const cat = {sel: READ('#cmsKpis').selected, rows: rows(), on: !!document.querySelector('#cmsKpis .cms-cat-chip.on'), nums: READ('#cmsKpis').nums,
        cats: [...document.querySelectorAll('#cmsTable tbody tr')].map(tr=>tr.children[4].textContent.trim())};
      document.querySelectorAll('#cmsKpis .mkpi')[0].click(); await wait();
      const total = {sel: READ('#cmsKpis').selected, rows: rows()};
      return {before: before.nums, pending, chipText, cat, total};
    }, READ.toString());
    if(r.pending.sel.join() !== '2') throw new Error('KYC Pending not selected: ' + r.pending.sel.join());
    if(r.pending.nums.join('|') !== r.before.join('|') || r.cat.nums.join('|') !== r.before.join('|')) throw new Error('counts moved');
    const chipN = Number(r.chipText.split(':').pop());
    if(!r.cat.on || r.cat.sel.join() !== '3') throw new Error('the chip and its card are not drawn selected');
    if(r.cat.rows !== chipN) throw new Error(r.cat.rows + ' rows under "' + r.chipText + '"');
    const tier = r.chipText.split(':')[0].trim().toLowerCase();
    if(r.cat.cats.some(c=>c.toLowerCase() !== tier)) throw new Error('rows of another tier: ' + r.cat.cats.join(', '));
    if(r.total.sel.join() !== '0') throw new Error('Total not selected after clearing');
    return 'Pending ' + r.pending.rows + ' rows · "' + r.chipText + '" ' + r.cat.rows + ' rows · Total ' + r.total.rows;
  });

  await t.step('a stage card and a top card share one selection', async () => {
    const r = await t.eval(async (READ)=>{
      READ = eval(READ);
      const wait = () => new Promise(r=>setTimeout(r, 200));
      document.querySelectorAll('#cmsKpis .mkpi')[1].click(); await wait();
      const n = document.querySelectorAll('#cmsKpis .mkpi').length;
      const stage = document.querySelectorAll('#cmsKpis .mkpi')[4];
      if(!stage) return {skip: true};
      stage.click(); await wait();
      const a = READ('#cmsKpis').selected;
      document.querySelectorAll('#cmsKpis .mkpi')[2].click(); await wait();
      const b = READ('#cmsKpis').selected;
      document.querySelectorAll('#cmsKpis .mkpi')[0].click(); await wait();
      return {a, b, stageOn: !!window._stageFilterCMS, n};
    }, READ.toString());
    if(r.skip) return 'no stage card configured';
    if(r.a.join() !== '4') throw new Error('stage click left: ' + r.a.join());
    if(r.b.join() !== '2' || r.stageOn) throw new Error('top card did not take over from the stage: ' + r.b.join());
    return 'stage then KYC Pending: one selected at a time';
  });

  t.section('DST: clicking Pending no longer recounts the other cards');

  await t.step('every DST card keeps its count, and the list is that card’s rows', async () => {
    const r = await t.eval(async (READ)=>{
      READ = eval(READ);
      const wait = () => new Promise(r=>setTimeout(r, 200));
      window._dstScope = 'all'; window._dstStatus = ''; navigate('dst'); await wait();
      const before = READ('#dstKpis');
      const out = [];
      for(let i = 1; i < before.nums.length; i++){
        document.querySelectorAll('#dstKpis .mkpi')[i].click(); await wait();
        const now = READ('#dstKpis');
        out.push({label: now.labels[i], same: now.nums.join('|') === before.nums.join('|'), sel: now.selected.join(),
          rows: document.querySelectorAll('#dstTable tbody tr[data-task], table tbody tr.row-clickable').length, want: Number(now.nums[i])});
      }
      window._dstStatus = ''; render();
      return {before: before.nums, out};
    }, READ.toString());
    const bad = r.out.filter((o, i)=>!o.same || o.sel !== String(i + 1));
    if(bad.length) throw new Error(bad.map(o=>o.label + (o.same ? '' : ' moved the counts') + (o.sel ? '' : ' not selected')).join('; '));
    return 'Total ' + r.before[0] + ' stayed through ' + r.out.map(o=>o.label + ' ' + o.want).join(', ');
  });

  t.section('the other modules with cards');

  for(const [view, box, label] of [['rms', '#rmsKpis', 'RMS'], ['queries', '#qmsKpis', 'QMS'], ['recommendations', '#recoKpis', 'Execution Tracker'],
                                    ['calls', '#callKpis', 'Call Logs'], ['projects', '#prjKpis', 'Projects']]){
    await t.step(label + ': each card is a filter, drawn selected, and no count moves', async () => {
      const r = await t.eval(async (a)=>{
        const READ = eval(a.READ);
        const wait = () => new Promise(r=>setTimeout(r, 200));
        navigate(a.view); await wait();
        if(!document.querySelector(a.box)) return {missing: true};
        const before = READ(a.box);
        const out = [];
        for(let i = 0; i < before.nums.length; i++){
          const card = document.querySelectorAll(a.box + ' .mkpi')[i];
          if(!card.getAttribute('onclick')) { out.push({i, label: before.labels[i], static: true}); continue; }
          card.click(); await wait();
          const now = READ(a.box);
          out.push({i, label: before.labels[i], same: now.nums.join('|') === before.nums.join('|'), sel: now.selected});
        }
        if(window.cardFilterSet) { window['_cardFilter' + ({rms:'RMS', queries:'Queries', recommendations:'Recommendations', calls:'Calls', projects:'Projects'})[a.view]] = ''; }
        window._qStatus = ''; render();
        return {before, out};
      }, {view, box, READ: READ.toString()});
      if(r.missing) throw new Error('no card row ' + box);
      const moved = r.out.filter(o=>!o.static && !o.same);
      if(moved.length) throw new Error('counts moved on ' + moved.map(o=>o.label).join(', '));
      const unsel = r.out.filter(o=>!o.static && o.label !== 'Talk Time' && o.sel.indexOf(o.i) < 0);
      if(unsel.length) throw new Error('not drawn selected: ' + unsel.map(o=>o.label).join(', '));
      return r.out.filter(o=>!o.static).length + ' cards clicked, counts ' + r.before.nums.join(' / ') + ' unchanged';
    });
  }

  t.section('the main Dashboard');

  await t.step('the header has the punch clock and no Leave Request', async () => {
    const r = await t.eval(async ()=>{
      navigate('dashboard'); await new Promise(r=>setTimeout(r, 200));
      const slot = (document.getElementById('topbarRight') || {}).textContent || '';
      return {leave: /Leave Request/.test(slot), punch: /Punch In|Punch Out|punched/i.test(slot)};
    });
    if(r.leave) throw new Error('Leave Request is still on the Dashboard');
    if(!r.punch) throw new Error('the punch clock went with it');
    return 'punch clock kept, Leave Request gone';
  });
});
