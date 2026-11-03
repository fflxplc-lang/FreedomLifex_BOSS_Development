/* THE "B2C CHANGES 28" REVIEW.

   The attendance dashboard's today counts open the people behind them.
   Leave: a second request over the same dates is refused (page and
   server), and approved leave can be cancelled whole or in part, with the
   remaining dates still approved and the cancelled ones no longer leave.
   DST: work goes only to your level or below, a reassigned task keeps who
   gave it and every hand-over and stays visible to them, completion is
   credited to whoever held it, and the Assigned Date cannot be in the past. */
const {suite} = require('../lib/harness');

const TEAM = `(() => {
  const mk = (id, name, parent, extra) => Object.assign({id, name, email: id.toLowerCase() + '@example.in', role: 'Executive',
    status: 'Active', branch: 'Varanasi', parentUserId: parent, scope: 'own', perms: fullPerms(true), adminFlags: fullAdminFlags(false),
    documents: [], notes: []}, extra || {});
  DB.team = DB.team.filter(t => !/^ZT/.test(t.id)).concat([
    mk('ZT0', 'ZZ Boss', null, {role: ADMIN_ROLE, adminFlags: fullAdminFlags(true), scope: 'all'}),
    mk('ZT1', 'ZZ Manager', 'ZT0'), mk('ZT2', 'ZZ Exec', 'ZT1'), mk('ZT2b', 'ZZ Peer', 'ZT1'), mk('ZT3', 'ZZ Junior', 'ZT2')]);
})()`;

suite(async t => {
  await t.step('the three today counts on the attendance dashboard open their lists', async () => {
    const r = await t.eval(async () => {
      const today = hrToday();
      window._hmb = {month: today.slice(0, 7), branch: '', q: '', view: 'summary', sort: 'name', dir: 1};
      navigate('hrdashboard');
      await new Promise(r => setTimeout(r, 120));
      const cards = [...document.querySelectorAll('[data-hmb-today]')].map(x => x.getAttribute('data-hmb-today'));
      if(!cards.length) return {closed: !!hrMbClosed(today), cards};
      const out = {cards};
      for(const k of cards){
        document.querySelector('[data-hmb-today="' + k + '"]').click();
        await new Promise(r => setTimeout(r, 60));
        out[k] = (document.querySelector('#modalBody .modal-head h3') || {}).textContent || '';
        closeModal();
      }
      return out;
    });
    if(r.closed) return 'today is a closed day, so the counts are not clickable (as designed)';
    if(r.cards.join(',') !== 'present,leave,none') throw new Error(JSON.stringify(r));
    if(!/Present today/.test(r.present) || !/On leave today/.test(r.leave) || !/Not punched in today/.test(r.none)) throw new Error(JSON.stringify(r));
    return r.none;
  });

  await t.step('a second leave request over the same dates is refused, here and by the server', async () => {
    t.expectConsole(/422/);
    const r = await t.eval(async (TEAM) => {
      eval(TEAM);
      const u = me();
      u.parentUserId = 'ZT0';
      const d = new Date(); d.setDate(d.getDate() + 10);
      const a = hrDateKey(d); d.setDate(d.getDate() + 3); const b = hrDateKey(d);
      DB.hrLeave = (DB.hrLeave || []).filter(l => l.userId !== u.id).concat([
        {id: 'HRL-ZZA', userId: u.id, from: a, to: b, type: 'Casual Leave', unit: 'full', status: 'Approved', reason: 'ZZ first', approverId: 'ZT0', decidedBy: 'ZT0'}]);
      await save('hrLeave');
      const clash = hrLeaveClash(u.id, b, b);
      const said = []; const al = window.alert; window.alert = m => said.push(String(m));
      hrOpenLeaveRequest();
      const g = id => document.getElementById(id);
      g('f_hrReqType').value = 'Sick Leave'; g('f_hrReqFrom').value = b; g('f_hrReqTo').value = b;
      g('f_hrReqDuration').value = 'Full Day'; g('f_hrReqDelegated').value = 'No'; g('f_hrReqReason').value = 'ZZ second';
      await hrSubmitLeaveRequest();
      closeModal();
      window.alert = al;
      const pageRefused = !(DB.hrLeave || []).some(l => l.reason === 'ZZ second');
      // Straight to the server, as a second tab would.
      const res = await fetch('/api/storage/hrLeave', {method: 'PUT', headers: Object.assign({'Content-Type': 'application/json'}, apiHeaders()),
        body: JSON.stringify({value: JSON.stringify(DB.hrLeave.concat([{id: 'HRL-ZZB', userId: u.id, from: a, to: a, type: 'Sick Leave', status: 'Pending'}]))})});
      const body = await res.json().catch(() => ({}));
      return {clash: !!clash, pageRefused, said: said.join(' | '), status: res.status, error: body.error || ''};
    }, TEAM);
    if(!r.clash || !r.pageRefused || !/overlaps/.test(r.said)) throw new Error(JSON.stringify(r));
    if(r.status !== 422 || !/overlaps/.test(r.error)) throw new Error('server: ' + JSON.stringify(r));
    return 'page and server both refuse; ' + r.error.slice(0, 60) + '…';
  });

  await t.step('cancelling some dates keeps the rest approved, and the cancelled ones stop being leave', async () => {
    const r = await t.eval(async () => {
      const u = me();
      const l = DB.hrLeave.find(x => x.id === 'HRL-ZZA');
      const dates = hrLeaveDatesOf(l);
      const cut = [dates[1], dates[2]];
      hrOpenLeaveCancel('HRL-ZZA');
      document.querySelector('input[name="hrCxMode"][value="some"]').checked = true; hrLeaveCancelMode();
      document.querySelectorAll('.hrCxDate').forEach(x => { x.checked = cut.indexOf(x.value) >= 0; });
      document.getElementById('f_hrCxReason').value = 'ZZ plans changed';
      const al = window.alert; window.alert = () => {};
      await hrCancelLeave('HRL-ZZA');
      window.alert = al;
      const stored = (await sget('hrLeave')) || [];
      const orig = stored.find(x => x.id === 'HRL-ZZA') || {};
      const rest = stored.filter(x => x.remainderOf === 'HRL-ZZA');
      return {orig: {status: orig.status, from: orig.from, to: orig.to, dates: (orig.cancellation || {}).dates},
        rest: rest.map(x => x.status + ':' + x.from + '>' + x.to),
        onCut: !!hrLeaveOn(u.id, cut[0]), onKept: !!hrLeaveOn(u.id, dates[0]) && !!hrLeaveOn(u.id, dates[3]), dates};
    });
    if(r.orig.status !== 'Partially Cancelled' || r.orig.dates.length !== 2) throw new Error(JSON.stringify(r));
    if(r.rest.length !== 2 || r.rest.some(x => !/^Approved/.test(x))) throw new Error('remaining: ' + r.rest.join(', '));
    if(r.onCut || !r.onKept) throw new Error('leave on dates is wrong: ' + JSON.stringify(r));
    return 'original kept as Partially Cancelled (' + r.orig.from + '→' + r.orig.to + '); still approved: ' + r.rest.join(', ');
  });

  await t.step('and cancelling the whole of one leaves nothing approved on those dates', async () => {
    const r = await t.eval(async () => {
      const u = me();
      const l = DB.hrLeave.find(x => x.remainderOf === 'HRL-ZZA' && x.status === 'Approved');
      hrOpenLeaveCancel(l.id);
      document.getElementById('f_hrCxReason').value = 'ZZ not needed';
      const al = window.alert; window.alert = () => {};
      await hrCancelLeave(l.id);
      window.alert = al;
      const after = DB.hrLeave.find(x => x.id === l.id);
      return {status: after.status, still: !!hrLeaveOn(u.id, l.from), refill: !hrLeaveClash(u.id, l.from, l.from)};
    });
    if(r.status !== 'Cancelled' || r.still || !r.refill) throw new Error(JSON.stringify(r));
    return 'Cancelled, the date is free to request again';
  });

  await t.step('the server refuses a cancellation that does not add up', async () => {
    t.expectConsole(/422/);
    const r = await t.eval(async () => {
      const u = me();
      const put = async list => {
        const res = await fetch('/api/storage/hrLeave', {method: 'PUT', headers: Object.assign({'Content-Type': 'application/json'}, apiHeaders()),
          body: JSON.stringify({value: JSON.stringify(list)})});
        return res.status + ' ' + ((await res.json().catch(() => ({}))).error || '');
      };
      const base = DB.hrLeave.concat([{id: 'HRL-ZZC', userId: u.id, from: '2026-12-01', to: '2026-12-03', type: 'Sick Leave', status: 'Approved'}]);
      const seeded = await put(base);
      const swap = (row, extra) => base.map(x => x.id === row ? Object.assign({}, x, extra) : x);
      return {
        seeded,
        noDates: await put(swap('HRL-ZZC', {status: 'Cancelled'})),
        outside: await put(swap('HRL-ZZC', {status: 'Partially Cancelled', cancellation: {dates: ['2026-12-09']}})),
        wrongKind: await put(swap('HRL-ZZC', {status: 'Cancelled', cancellation: {dates: ['2026-12-02']}})),
        badRest: await put(swap('HRL-ZZC', {status: 'Partially Cancelled', cancellation: {dates: ['2026-12-02']}})
          .concat([{id: 'HRL-ZZD', userId: u.id, from: '2026-12-02', to: '2026-12-03', status: 'Approved', remainderOf: 'HRL-ZZC'}])),
        good: await put(swap('HRL-ZZC', {status: 'Partially Cancelled', cancellation: {dates: ['2026-12-02']}})
          .concat([{id: 'HRL-ZZE', userId: u.id, from: '2026-12-01', to: '2026-12-01', status: 'Approved', remainderOf: 'HRL-ZZC'},
                   {id: 'HRL-ZZF', userId: u.id, from: '2026-12-03', to: '2026-12-03', status: 'Approved', remainderOf: 'HRL-ZZC'}]))};
    });
    if(!/^200/.test(r.seeded) || !/^200/.test(r.good)) throw new Error(JSON.stringify(r));
    for(const k of ['noDates', 'outside', 'wrongKind', 'badRest']) if(!/^422/.test(r[k])) throw new Error(k + ': ' + r[k]);
    return 'no dates, outside dates, wrong status and kept-on-a-cancelled-date all 422; a proper part-cancel 200';
  });

  await t.step('DST: only your level and below are offered, and the server refuses upwards', async () => {
    t.expectConsole(/422/);
    const r = await t.eval(async (a) => {
      eval(a.TEAM);
      const wasUser = currentUser;
      currentUser = 'ZT2';
      const offered = {up: dstMayAssignTo('ZT1'), boss: dstMayAssignTo('ZT0'), peer: dstMayAssignTo('ZT2b'), down: dstMayAssignTo('ZT3'), self: dstMayAssignTo('ZT2')};
      currentUser = wasUser;
      // The signed-in account becomes ZZ Exec for the server's check.
      const ex = DB.team.find(t => t.id === 'ZT2'); ex.email = a.email;
      const mine = DB.team.find(t => t.email === a.email && t.id !== 'ZT2'); if(mine) mine.email = 'moved@example.in';
      await save('team');
      const put = list => fetch('/api/storage/tasks', {method: 'PUT', headers: Object.assign({'Content-Type': 'application/json'}, apiHeaders()),
        body: JSON.stringify({value: JSON.stringify(list)})});
      const today = hrDateKey(new Date());
      const up = await put((DB.tasks || []).concat([{id: 'DST-ZZUP', taskType: 'ZZ', assignTo: 'ZT1', createdBy: 'ZT2', assignedDate: today, dueDate: today, overallStatus: 'Not Started'}]));
      const upBody = await up.json().catch(() => ({}));
      const down = await put((DB.tasks || []).concat([{id: 'DST-ZZDN', taskType: 'ZZ', assignTo: 'ZT3', createdBy: 'ZT2', assignedDate: today, dueDate: today, overallStatus: 'Not Started'}]));
      ex.email = 'zt2@example.in'; if(mine) mine.email = a.email;
      await save('team');
      return {offered, up: up.status, upErr: upBody.error || '', down: down.status};
    }, {TEAM, email: require('../lib/signin').EMAIL});
    const o = r.offered;
    if(o.up || o.boss || !o.peer || !o.down || !o.self) throw new Error('offered: ' + JSON.stringify(o));
    if(r.up !== 422 || !/level/.test(r.upErr) || r.down !== 200) throw new Error(JSON.stringify(r));
    return 'manager and boss refused; peer, junior and self allowed; server 422 upwards, 200 downwards';
  });

  await t.step('a reassigned task keeps who gave it, every hand-over, and the completer', async () => {
    const r = await t.eval(async () => {
      const today = hrDateKey(new Date());
      DB.tasks = (DB.tasks || []).filter(x => !/^DST-ZZ/.test(x.id)).concat([{id: 'DST-ZZH', taskType: 'ZZ History', assignTo: 'ZT2', createdBy: 'ZT1',
        createdAt: new Date().toISOString(), assignedDate: today, dueDate: today, overallStatus: 'Not Started'}]);
      await save('tasks');
      const task = DB.tasks.find(x => x.id === 'DST-ZZH');
      const was = currentUser;
      currentUser = 'ZT2'; task.assignTo = 'ZT3'; await save('tasks');
      currentUser = 'ZT3'; task.overallStatus = 'Completed'; await save('tasks');
      // ZZ Manager gave it away; it must still be in their list.
      currentUser = 'ZT1';
      const visible = dstVisible(DB.tasks.filter(x => !x.parentTaskId)).some(x => x.id === 'DST-ZZH');
      currentUser = was;
      const stored = ((await sget('tasks')) || []).find(x => x.id === 'DST-ZZH') || {};
      navigate('dst', 'DST-ZZH');
      await new Promise(r => setTimeout(r, 120));
      const page = (document.getElementById('dstAssignHistory') || {}).textContent || '';
      return {by: stored.assignedBy, first: stored.originalAssignee, now: stored.assignTo, done: stored.completedBy,
        hist: (stored.assignHistory || []).map(h => (h.from || '-') + '>' + h.to + '@' + h.by), visible, page: /ZZ Junior/.test(page) && /ZZ Exec/.test(page)};
    });
    if(r.by !== 'ZT1' || r.first !== 'ZT2' || r.now !== 'ZT3' || r.done !== 'ZT3') throw new Error(JSON.stringify(r));
    if(r.hist.join(',') !== '->ZT2@ZT1,ZT2>ZT3@ZT2') throw new Error('history: ' + r.hist.join(', '));
    if(!r.visible) throw new Error('the original assigner lost the task');
    if(!r.page) throw new Error('the task page has no assignment history');
    return 'assigned by ZT1 to ZT2, reassigned to ZT3, completed by ZT3; ZT1 still sees it';
  });

  await t.step('the Assigned Date cannot be in the past, in the form or at the server', async () => {
    t.expectConsole(/422/);
    const r = await t.eval(async () => {
      openDSTCreateForm();
      /* Earlier steps' saves can still redraw the page; let them land
         before typing, as a person would. */
      await new Promise(r => setTimeout(r, 600));
      const a = document.getElementById('f_assignedDate');
      a.dispatchEvent(new Event('change', {bubbles: true}));
      await new Promise(r => setTimeout(r, 20));
      const min = a.min, today = dstToday();
      const d = new Date(); d.setDate(d.getDate() - 2); const past = hrDateKey(d);
      a.value = past; a.dispatchEvent(new Event('change', {bubbles: true}));
      let note = '';
      for(let i = 0; i < 25 && !note; i++){
        await new Promise(r => setTimeout(r, 20));
        note = ((a.closest('.field') || document).querySelector('.field-error') || {}).textContent || '';
      }
      ssetFormHeader = 'dst';
      const res = await fetch('/api/storage/tasks', {method: 'PUT', headers: Object.assign({'Content-Type': 'application/json', 'X-CRM-Form': 'dst'}, apiHeaders()),
        body: JSON.stringify({value: JSON.stringify((DB.tasks || []).concat([{id: 'DST-ZZPAST', taskType: 'ZZ', assignedDate: past, dueDate: past, overallStatus: 'Not Started'}]))})});
      ssetFormHeader = '';
      const body = await res.json().catch(() => ({}));
      return {min, today, note, status: res.status, error: body.error || '', problem: dstAssignedDateProblem(past, '')};
    });
    if(r.min !== r.today) throw new Error('calendar starts at ' + r.min);
    if(!/cannot be in the past/.test(r.note) || !/cannot be in the past/.test(r.problem)) throw new Error(JSON.stringify(r));
    if(r.status !== 422 || !/past/.test(r.error)) throw new Error('server: ' + JSON.stringify(r));
    return 'calendar from today; past date flagged and refused (422)';
  });

  /* Not ported into this repo yet (it is the Blueprint / Business / MIS
     work, outside Client Journey, Operations and HR): plan re-approval, consent resubmission and the approved-page report. */

  t.section('CMS');

  await t.step('a client on the Insurance stage can go back and change the product category', async () => {
    const r = await t.eval(async () => {
      const c = {id:'CMS-ZINS', cmsName:'ZZ Insured', firstName:'ZZ', lastName:'Insured', email:'zzins@example.com',
        mobile:'9800111222', createdAt:new Date().toISOString(), assignedTo: me().id, pan:'ABCDE1234F'};
      initState('CMS', c); DB.clients = DB.clients.filter(x=>x.id!==c.id).concat([c]); await save('clients');
      await doTransition('CMS', c.id, 'toInsurance');
      const rec = () => DB.clients.find(x=>x.id==='CMS-ZINS');
      const at = stateOf('CMS', rec());
      navigate('cms', c.id); await new Promise(r=>setTimeout(r,200));
      const btn = [...document.querySelectorAll('button')].find(b=>/Change Product Category/.test(b.textContent));
      const offered = !!btn;
      await doTransition('CMS', c.id, 'insuranceBackT');
      const back = stateOf('CMS', rec());
      const choices = getBlueprint('CMS').transitions.filter(t=>t.from===back && t.kind==='forward').map(t=>t.label);
      await doTransition('CMS', c.id, 'toInvestment');
      return {at, offered, back, choices, then: stateOf('CMS', rec()), cat: rec().productCategory, pan: rec().pan,
        hist: (rec().productCategoryHistory||[]).map(h=>h.from)};
    });
    if(r.at !== 'insurancePending' || !r.offered) throw new Error(JSON.stringify(r));
    if(r.back !== 'clientCreated' || r.choices.join(',') !== 'Investment,Both,Insurance') throw new Error(JSON.stringify(r));
    if(r.then !== 'cifStage' || r.cat !== 'Investment' || r.pan !== 'ABCDE1234F' || r.hist.join() !== 'Insurance') throw new Error(JSON.stringify(r));
    return 'Insurance → Back → Investment → CIF Stage; client details kept, the earlier choice recorded';
  });
});
