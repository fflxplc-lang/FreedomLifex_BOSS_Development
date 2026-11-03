/* ANNUAL LEAVE: PAID, UNPAID AND COMP-OFF.

   Paid comes out of one yearly entitlement (12 unless HR says otherwise),
   a full day 1 and a half day ½; Comp-Off is earned by working a Sunday,
   weekly off or holiday and credited only once verified; Unpaid touches
   neither and is not a working day. Only approval moves a balance. The
   worked examples are the firm's own: 12 − 4 full − 2 half = 7, and comp-off
   1 + ½ + 1 = 2½ earned, 1½ used, 1 left.

   Every date is worked out from today, so the suite does not go stale. */
const {suite} = require('../lib/harness');

suite(async t => {
  await t.home();
  let ids = null;

  await t.step('an employee, with the admin as their reporting manager', async () => {
    ids = await t.eval(async ()=>{
      const admin = (DB.team.find(x=>isAdmin(x)) || DB.team[0]).id;
      const roles = roleList();
      const m = {id: uid('TM'), name: 'ZZ Leave Person', role: roles[roles.length - 1] || 'Executive', email: 'zz.leave@zz.in',
        status: 'Active', scope: 'own', branch: 'Varanasi', parentUserId: admin, employeeId: 'EMP-ZZ7',
        department: 'ZZ Operations', adminFlags: fullAdminFlags(false), perms: fullPerms(false, {view: 1}),
        createdAt: new Date().toISOString()};
      DB.team.push(m); await save('team');
      const key = d => hrDateKey(d);
      const at = (base, n) => { const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + n); return key(d); };
      const today = hrToday();
      // the Monday at least a week ahead, all inside this year where possible
      let mon = at(today, 7); while(new Date(mon + 'T00:00:00').getDay() !== 1) mon = at(mon, 1);
      let sun = at(today, -1); while(new Date(sun + 'T00:00:00').getDay() !== 0) sun = at(sun, -1);
      let pastMon = at(today, -1); while(new Date(pastMon + 'T00:00:00').getDay() !== 1) pastMon = at(pastMon, -1);
      /* Apply as the person, the way the form is filled in. */
      window.zzApply = async (o) => {
        const was = currentUser; currentUser = o.who;
        try {
          hrOpenLeaveRequest(o.lock);
          const set = (id, v) => { const el = document.getElementById(id); el.value = v; };
          set('f_hrReqType', 'Casual Leave');
          if(!o.lock){ set('f_hrReqFrom', o.from); set('f_hrReqTo', o.to || o.from); }
          set('f_hrReqDuration', o.dur || 'Full Day');
          hrLeaveBalanceNote();
          const sel = document.getElementById('f_hrReqCategory');
          const offered = [...sel.options].map(x=>x.value).filter(Boolean);
          sel.value = o.cat;
          if(sel.value !== o.cat){ closeModal(); return {offered, id: null}; }
          set('f_hrReqDelegated', 'No');
          const n = (DB.hrLeave || []).length;
          await hrSubmitLeaveRequest();
          closeModal();
          const row = (DB.hrLeave || []).length > n ? DB.hrLeave[DB.hrLeave.length - 1] : null;
          return {offered, id: row ? row.id : null};
        } finally { currentUser = was; }
      };
      window.zzDecide = async (id, yes, note) => {
        hrOpenLeaveDecision(id, yes);
        if(note) document.getElementById('f_hrDecideNote').value = note;
        await hrDecideLeave(id, yes);
        closeModal();
        return (DB.hrLeave.find(l=>l.id === id) || {}).status;
      };
      return {admin, me: m.id, mon, sun, pastMon, at: null, year: today.slice(0, 4), today};
    });
    return ids.me + ', reports to the admin; next Monday ' + ids.mon;
  });
  const plus = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

  t.section('configuration');

  await t.step('12 paid days a year, comp-off at 9 h and 4.5 h, unless HR says otherwise', async () => {
    const a = await t.eval(()=>hrAlCfg());
    if(a.paidPerYear !== 12 || a.compOffFullHours !== 9 || a.compOffHalfHours !== 4.5 || !a.compOffEnabled)
      throw new Error(JSON.stringify(a));
    return '12 · 9 h · 4.5 h · comp-off on';
  });

  await t.step('the Annual Leave Configuration card is in HR Settings and saves', async () => {
    const r = await t.eval(async ()=>{
      document.body.insertAdjacentHTML('beforeend', '<div id="zzSetup">' + renderSettingsHr() + '</div>');
      const box = document.getElementById('hrAnnualLeaveSetup');
      const ok = !!box && /Annual Paid Leave Entitlement/.test(box.textContent);
      document.getElementById('f_alPaid').value = '14';
      await hrSaveAnnualLeave();
      const after = hrAlCfg().paidPerYear;
      document.getElementById('f_alPaid').value = '12';
      await hrSaveAnnualLeave();
      document.getElementById('zzSetup').remove();
      return {ok, after, back: hrAlCfg().paidPerYear};
    });
    if(!r.ok) throw new Error('no Annual Leave Configuration card');
    if(r.after !== 14 || r.back !== 12) throw new Error('saved ' + r.after + ', back to ' + r.back);
    return 'set to 14, read back, and back to 12';
  });

  t.section('the form');

  await t.step('Leave Category sits above "Delegate your pending task", and offers only what the person has', async () => {
    const r = await t.eval((me)=>{
      const was = currentUser; currentUser = me;
      hrOpenLeaveRequest();
      const cat = document.getElementById('hrCatField');
      const del = document.getElementById('f_hrReqDelegated').closest('.field');
      const before = !!(cat && del && (cat.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING));
      const opts = [...document.getElementById('f_hrReqCategory').options].map(o=>o.value).filter(Boolean);
      const label = cat ? cat.querySelector('label').textContent : '';
      closeModal(); currentUser = was;
      return {before, opts, label};
    }, ids.me);
    if(!r.before) throw new Error('the category field is not above the delegate question');
    if(!/Paid \/ Unpaid \/ Comp-Off/.test(r.label)) throw new Error('label: ' + r.label);
    if(r.opts.join() !== 'Paid,Unpaid') throw new Error('offered ' + r.opts.join());
    return 'Paid and Unpaid offered; no Comp-Off with nothing earned';
  });

  t.section('paid leave: 12 − 4 full − 2 half = 7');

  await t.step('four full days and two half days, approved, leave 7', async () => {
    const r = await t.eval(async (o)=>{
      const a = await zzApply({who: o.me, from: o.mon, to: o.thu, cat: 'Paid'});
      const pendingBal = hrLeaveBalances(o.me, o.mon.slice(0, 4)).paidLeft;
      const h1 = await zzApply({who: o.me, from: o.mon2, cat: 'Paid', dur: 'Half Day (First Half)'});
      const h2 = await zzApply({who: o.me, from: o.tue2, cat: 'Paid', dur: 'Half Day (Second Half)'});
      for(const x of [a, h1, h2]) await zzDecide(x.id, true);
      const b = hrLeaveBalances(o.me, o.mon.slice(0, 4));
      return {ids: [a.id, h1.id, h2.id], pendingBal, used: b.paidUsed, left: b.paidLeft};
    }, Object.assign({}, ids, {thu: plus(ids.mon, 3), mon2: plus(ids.mon, 7), tue2: plus(ids.mon, 8)}));
    if(r.ids.some(x=>!x)) throw new Error('a request was not written');
    if(r.pendingBal !== 12) throw new Error('a pending request already moved the balance to ' + r.pendingBal);
    if(r.used !== 5 || r.left !== 7) throw new Error('used ' + r.used + ', left ' + r.left);
    return 'pending: still 12 · approved: 5 used (4 + ½ + ½), 7 left';
  });

  await t.step('a span across a Sunday charges only the working days, and a declined one charges nothing', async () => {
    const r = await t.eval(async (o)=>{
      const x = await zzApply({who: o.me, from: o.fri, to: o.mon, cat: 'Paid'});   // Fri, Sat, Sun, Mon
      const row = DB.hrLeave.find(l=>l.id === x.id);
      const charge = hrLeaveChargeDays(row);
      const st = await zzDecide(x.id, false, 'ZZ busy week');
      return {charge, st, left: hrLeaveBalances(o.me, o.fri.slice(0, 4)).paidLeft};
    }, Object.assign({}, ids, {fri: plus(ids.mon, 18), mon: plus(ids.mon, 21)}));
    if(r.charge !== 3) throw new Error('charged ' + r.charge + ' for Fri–Mon');
    if(r.st !== 'Declined' || r.left !== 7) throw new Error(r.st + ', left ' + r.left);
    return 'Fri to Mon charges 3, declined, still 7 left';
  });

  await t.step('asking for more paid days than are free is refused, and says Unpaid is the way', async () => {
    const r = await t.eval(async (o)=>{
      const before = DB.hrLeave.length;
      const x = await zzApply({who: o.me, from: o.from, to: o.to, cat: 'Paid'});   // 9 working days
      return {wrote: DB.hrLeave.length - before, id: x.id};
    }, Object.assign({}, ids, {from: plus(ids.mon, 28), to: plus(ids.mon, 38)}));
    const said = t.dialogs.filter(d=>/Paid Leave for/.test(d)).pop() || '';
    if(r.wrote || r.id) throw new Error('it was filed');
    if(!/Unpaid/.test(said)) throw new Error('no refusal naming Unpaid: ' + said);
    return said.split('\n')[0];
  });

  t.section('unpaid leave');

  await t.step('Unpaid Leave is approved, touches neither balance, and is not a working day', async () => {
    const r = await t.eval(async (o)=>{
      const x = await zzApply({who: o.me, lock: o.pastMon, cat: 'Unpaid'});
      await zzDecide(x.id, true);
      const b = hrLeaveBalances(o.me, o.pastMon.slice(0, 4));
      const c = hrDayCredit(o.me, o.pastMon);
      const ah = hrAhDay(o.me, o.pastMon);
      return {id: x.id, paidLeft: b.paidLeft, compLeft: b.compLeft, unpaid: b.unpaid, credit: c.credit, chip: ah.chip,
        month: hrMonthDays(o.me, o.pastMon.slice(0, 7)).unpaid};
    }, ids);
    if(!r.id) throw new Error('not written');
    if(r.paidLeft !== 7 || r.compLeft !== 0 || r.unpaid !== 1) throw new Error(JSON.stringify(r));
    if(r.credit !== 0) throw new Error('the unpaid day still earns ' + r.credit + ' of a working day');
    if(!/Unpaid/.test(r.chip)) throw new Error('the history reads ' + r.chip);
    return 'paid 7 · comp-off 0 · unpaid 1 · that day earns 0 — "' + r.chip + '"';
  });

  await t.step('with the paid balance gone, Paid is not offered and Unpaid still is', async () => {
    const r = await t.eval(async (o)=>{
      const c = hrCfg(); c.annualLeave = Object.assign({}, c.annualLeave, {paidPerYear: 5}); await hrCfgSave(c);
      const was = currentUser; currentUser = o.me;
      hrOpenLeaveRequest(); hrLeaveBalanceNote();
      const opts = [...document.getElementById('f_hrReqCategory').options].map(x=>x.value).filter(Boolean);
      closeModal(); currentUser = was;
      c.annualLeave.paidPerYear = 12; await hrCfgSave(c);
      return opts;
    }, ids);
    if(r.indexOf('Paid') >= 0 || r.indexOf('Unpaid') < 0) throw new Error('offered ' + r.join());
    return 'offered: ' + r.join(', ');
  });

  t.section('comp-off: 1 + ½ + 1 earned, 1½ used, 1 left');

  await t.step('three extra days worked make three eligibility records, and nothing is credited yet', async () => {
    const r = await t.eval(async (o)=>{
      // a Sunday, the Sunday before, and a weekday made a holiday
      const sun2 = (()=>{ const d = new Date(o.sun + 'T00:00:00'); d.setDate(d.getDate() - 7); return hrDateKey(d); })();
      const sun3 = (()=>{ const d = new Date(o.sun + 'T00:00:00'); d.setDate(d.getDate() - 14); return hrDateKey(d); })();
      const hol = (()=>{ const d = new Date(o.sun + 'T00:00:00'); d.setDate(d.getDate() - 3); return hrDateKey(d); })();  // a Thursday
      const c = hrCfg(); c.holidays = c.holidays.concat([{date: hol, name: 'ZZ Festival'}]); await hrCfgSave(c);
      const day = (date, hours) => ({id: uid('HRA'), userId: o.me, date, createdAt: new Date().toISOString(), createdBy: o.me,
        sessions: [{in: date + 'T09:00:00', out: new Date(new Date(date + 'T09:00:00').getTime() + hours * 3600000).toISOString(), inBy: o.me}]});
      const sun4 = (()=>{ const d = new Date(o.sun + 'T00:00:00'); d.setDate(d.getDate() - 21); return hrDateKey(d); })();
      DB.hrAttendance = hrAttendanceAll().concat([day(o.sun, 9), day(sun2, 5), day(hol, 9.25), day(sun4, 4)]);
      await save('hrAttendance');
      const was = currentUser; currentUser = o.me;
      for(const d of [o.sun, sun2, hol, sun4]) await hrCompOffSync(o.me, d, true);
      currentUser = was;
      const rows = hrCompOffOf(o.me);
      return {rows: rows.map(x=>x.date + ':' + x.credit + ':' + x.status + ':' + (x.kind || '')),
        earned: hrLeaveBalances(o.me, o.sun.slice(0, 4)).compEarned, hol, sun4,
        approver: rows[0] && rows[0].approverId};
    }, ids);
    if(r.rows.length !== 3) throw new Error(r.rows.length + ' records: ' + r.rows.join(' | '));
    if(r.rows.some(x=>x.split(':')[2] !== 'Pending')) throw new Error(r.rows.join(' | '));
    if(r.rows.some(x=>x.indexOf(r.sun4) === 0)) throw new Error('4 hours earned a comp-off');
    if(r.earned !== 0) throw new Error('credited before approval: ' + r.earned);
    if(r.approver !== ids.admin) throw new Error('with ' + r.approver);
    return r.rows.map(x=>x.split(':').slice(0, 2).join(' → ')).join(' · ') + ' — 4 h earned none';
  });

  await t.step('the same day cannot be recorded twice — the server refuses it', async () => {
    t.expectConsole(/422|already recorded|storage set failed|Not saved/i);
    const r = await t.eval(async (o)=>{
      const first = hrCompOffOf(o.me)[0];
      const res = await fetch('/api/storage/hrCompOff', {method: 'PUT',
        headers: Object.assign({'Content-Type': 'application/json'}, apiHeaders()),
        body: JSON.stringify({value: JSON.stringify(hrCompOffAll().concat([Object.assign({}, first, {id: uid('HRC')})]))})});
      const again = await hrCompOffSync(o.me, first.date, true);
      return {status: res.status, body: (await res.json()).error, count: hrCompOffOf(o.me).length, same: again && again.id === first.id};
    }, ids);
    if(r.status !== 422) throw new Error('server answered ' + r.status);
    if(r.count !== 3 || !r.same) throw new Error('now ' + r.count + ' records');
    return r.body;
  });

  await t.step('the approver verifies them; 2½ days are credited, and Comp-Off is offered', async () => {
    const r = await t.eval(async (o)=>{
      const pend = hrCompOffPendingForMe().filter(c=>c.userId === o.me);
      for(const c of pend){ hrOpenCompOffDecision(c.id, true); await hrDecideCompOff(c.id, true); }
      const b = hrLeaveBalances(o.me, o.sun.slice(0, 4));
      const was = currentUser; currentUser = o.me;
      hrOpenLeaveRequest(); hrLeaveBalanceNote();
      const opts = [...document.getElementById('f_hrReqCategory').options].map(x=>x.value).filter(Boolean);
      closeModal(); currentUser = was;
      return {n: pend.length, earned: b.compEarned, left: b.compLeft, opts};
    }, ids);
    if(r.n !== 3 || r.earned !== 2.5 || r.left !== 2.5) throw new Error(JSON.stringify(r));
    if(r.opts.indexOf('Comp-Off') < 0) throw new Error('offered ' + r.opts.join());
    return 'earned 2.5 · offered ' + r.opts.join(', ');
  });

  await t.step('a decided comp-off cannot be changed afterwards', async () => {
    t.expectConsole(/422|cannot be changed|storage set failed|Not saved/i);
    const r = await t.eval(async (o)=>{
      const first = hrCompOffOf(o.me)[0];
      const res = await fetch('/api/storage/hrCompOff', {method: 'PUT',
        headers: Object.assign({'Content-Type': 'application/json'}, apiHeaders()),
        body: JSON.stringify({value: JSON.stringify(hrCompOffAll().map(c=>c.id === first.id ? Object.assign({}, c, {credit: 5}) : c))})});
      return res.status;
    }, ids);
    if(r !== 422) throw new Error('server answered ' + r);
    return 'refused';
  });

  await t.step('1½ days of comp-off taken leave 1, and the paid balance is untouched', async () => {
    const r = await t.eval(async (o)=>{
      const a = await zzApply({who: o.me, from: o.d1, cat: 'Comp-Off'});
      const h = await zzApply({who: o.me, from: o.d2, cat: 'Comp-Off', dur: 'Half Day (First Half)'});
      const mid = hrLeaveBalances(o.me, o.d1.slice(0, 4)).compLeft;
      await zzDecide(a.id, true); await zzDecide(h.id, true);
      const b = hrLeaveBalances(o.me, o.d1.slice(0, 4));
      return {mid, used: b.compUsed, left: b.compLeft, earned: b.compEarned, paid: b.paidLeft};
    }, Object.assign({}, ids, {d1: plus(ids.mon, 9), d2: plus(ids.mon, 10)}));
    if(r.mid !== 2.5) throw new Error('pending comp-off already deducted: ' + r.mid);
    if(r.earned !== 2.5 || r.used !== 1.5 || r.left !== 1 || r.paid !== 7) throw new Error(JSON.stringify(r));
    return 'earned 2.5 · used 1.5 · left 1 · paid still 7';
  });

  t.section('attendance');

  await t.step('the punch clock opens on a Sunday with comp-off on, and stays shut with it off', async () => {
    const r = await t.eval(async (o)=>{
      const sunday = new Date(o.sun + 'T10:00:00');
      const on = hrPunchRules(null, sunday);
      const c = hrCfg(); c.annualLeave = Object.assign({}, c.annualLeave, {compOffEnabled: false}); await hrCfgSave(c);
      const off = hrPunchRules(null, sunday);
      c.annualLeave.compOffEnabled = true; await hrCfgSave(c);
      return {on: on.inOk, off: off.inOk, why: off.inWhy};
    }, ids);
    if(!r.on || r.off) throw new Error(JSON.stringify(r));
    return 'on: open · off: "' + r.why + '"';
  });

  await t.step('the month board counts the unpaid day apart and keeps it out of days worked', async () => {
    const r = await t.eval((o)=>{
      const p = DB.team.find(x=>x.id === o.me);
      const row = hrMbPerson(p, hrMbDates(o.pastMon.slice(0, 7)));
      const i = hrMbDates(o.pastMon.slice(0, 7)).indexOf(o.pastMon);
      return {unpaid: row.unpaid, code: row.codes[i].c, extra: row.extraMins};
    }, ids);
    if(r.unpaid !== 1 || r.code !== 'U') throw new Error(JSON.stringify(r));
    return 'unpaid 1, shown as U';
  });

  t.section('HR dashboard: Remaining Leave Balance');

  await t.step('the card is on the HR Dashboard, and opens every employee’s balance', async () => {
    await t.eval(()=>navigate('hrdashboard'));
    await t.wait(300);
    const card = await t.page.$('#hrLeaveBalanceCard');
    if(!card) throw new Error('no Remaining Leave Balance card');
    await card.click();
    await t.wait(200);
    const r = await t.eval((me)=>{
      const tr = document.querySelector('#hrLbTable tr[data-lb="' + me + '"]');
      const heads = [...document.querySelectorAll('#hrLbTable thead th')].map(x=>x.textContent.trim()).filter(Boolean);
      const cell = k => tr ? tr.querySelector('td[data-k="' + k + '"]').textContent.trim() : null;
      return {heads, row: tr ? [...tr.children].slice(0, 3).map(x=>x.textContent.trim()) : null,
        v: {entitled: cell('entitled'), paidUsed: cell('paidUsed'), paidLeft: cell('paidLeft'), compEarned: cell('compEarned'),
            compUsed: cell('compUsed'), compLeft: cell('compLeft'), unpaid: cell('unpaid')}};
    }, ids.me);
    const want = ['Employee Name', 'Employee ID', 'Department', 'Annual Paid Leave', 'Paid Leave Used', 'Remaining Paid Leave',
      'Total Comp-Off Earned', 'Comp-Off Used', 'Remaining Comp-Off', 'Total Unpaid Leave Taken'];
    if(want.some(h=>r.heads.indexOf(h) < 0)) throw new Error('columns: ' + r.heads.join(' | '));
    if(!r.row) throw new Error('the employee is not listed');
    if(r.row[1] !== 'EMP-ZZ7' || r.row[2] !== 'ZZ Operations') throw new Error('row: ' + r.row.join(' | '));
    const v = r.v;
    if(v.entitled !== '12' || v.paidUsed !== '5' || v.paidLeft !== '7' || v.compEarned !== '2.5' || v.compUsed !== '1.5'
       || v.compLeft !== '1' || v.unpaid !== '1') throw new Error(JSON.stringify(v));
    return '12 · 5 used · 7 left · 2.5 earned · 1.5 used · 1 left · 1 unpaid';
  });

  await t.step('the filters: name or ID, department, year and leave category', async () => {
    const r = await t.eval((o)=>{
      const n = () => document.querySelectorAll('#hrLbTable tbody tr[data-lb]').length;
      const has = () => !!document.querySelector('#hrLbTable tr[data-lb="' + o.me + '"]');
      const out = {all: n()};
      hrLbSet('q', 'emp-zz7'); out.byId = n() === 1 && has();
      hrLbSet('q', ''); hrLbSet('dept', 'ZZ Operations'); out.byDept = n() === 1 && has();
      hrLbSet('dept', ''); hrLbSet('cat', 'Unpaid');
      out.catCols = [...document.querySelectorAll('#hrLbTable thead th')].map(x=>x.textContent.trim()).filter(Boolean).slice(3).join('|');
      out.byCat = has();
      hrLbSet('cat', ''); hrLbSet('year', String(Number(o.year) - 1));
      const tr = document.querySelector('#hrLbTable tr[data-lb="' + o.me + '"]');
      out.lastYear = tr ? tr.querySelector('td[data-k="paidUsed"]').textContent.trim() + '/' + tr.querySelector('td[data-k="compEarned"]').textContent.trim() : null;
      hrLbSet('year', o.year);
      return out;
    }, ids);
    if(!r.byId || !r.byDept || !r.byCat) throw new Error(JSON.stringify(r));
    if(r.catCols !== 'Total Unpaid Leave Taken') throw new Error('Unpaid shows ' + r.catCols);
    if(r.lastYear !== '0/0') throw new Error('last year reads ' + r.lastYear);
    return 'ID, department and category each narrow it; last year reads 0 / 0';
  });

  await t.step('one click shows the person’s history: allocation, credits and deductions, with running balances', async () => {
    const r = await t.eval((me)=>{
      hrOpenLeaveLedger(me);
      const rows = [...document.querySelectorAll('#hrLedger tbody tr')].map(tr=>[...tr.children].map(x=>x.textContent.trim()));
      const last = rows[rows.length - 1];
      return {n: rows.length, first: rows[0] && rows[0][1], statuses: rows.map(x=>x[3]), paid: last && last[5], comp: last && last[6]};
    }, ids.me);
    if(!/allocated/i.test(r.first)) throw new Error('starts with ' + r.first);
    if(r.statuses.indexOf('Declined') < 0) throw new Error('the declined request is not in the history');
    if(r.paid !== '7' || r.comp !== '1') throw new Error('ends at ' + r.paid + ' / ' + r.comp);
    await t.eval(()=>closeModal());
    return r.n + ' lines, ending at paid 7, comp-off 1';
  });

  await t.step('the employee sees their own balances and comp-off on Attendance', async () => {
    const r = await t.eval((me)=>{
      const was = currentUser; currentUser = me;
      const html = viewHrAttendance();
      currentUser = was;
      const d = document.createElement('div'); d.innerHTML = html;
      return {strip: d.querySelector('#hrBalStrip') ? d.querySelector('#hrBalStrip').textContent.replace(/\s+/g, ' ').trim() : '',
        co: d.querySelectorAll('#hrMyCompOff tbody tr').length};
    }, ids.me);
    if(!/7\s*Paid Leave left of 12/.test(r.strip)) throw new Error('strip: ' + r.strip);
    if(r.co !== 3) throw new Error(r.co + ' comp-off rows');
    return r.strip;
  });
});
