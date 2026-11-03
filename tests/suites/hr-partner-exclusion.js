/* PARTNERS ARE NOT ON THE PAYROLL, ON THE NEW HR SCREENS AND IN THE MAIL.

   A partner signs in to BOSS as a team member (partnerPobId). HR's own
   lists already left them out (hrPeople). The attendance month board,
   leave balances and the server's attendance and DJT mails arrived later
   and read the team directly; they keep the same rule:
     09:15 not punched in    -> the employee is mailed, the partner is not
     19:00 still punched in  -> the employee is mailed, the partner is not
     the month board and leave balances list the employee, not the partner */
const {suite} = require('../lib/harness');

suite({mail: true}, async t => {
  const today = await t.eval(() => hrToday());
  const at = hhmm => today + 'T' + hhmm + ':00Z';
  const run = hhmm => t.eval(async (when) => {
    const r = await fetch('/api/reminders/run', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({at: when})});
    return (await r.json()).log;
  }, at(hhmm));

  t.section('one employee, one partner');
  const ids = await t.eval(async () => {
    const mk = (name, email, extra) => Object.assign({id: uid('USR'), name, email, role: 'Relationship Manager',
      status: 'Active', perms: fullPerms(true), adminFlags: fullAdminFlags(true), documents: [], notes: [],
      createdAt: new Date().toISOString()}, extra || {});
    const emp = mk('ZZ Employee', 'zz.employee@example.com');
    const empOpen = mk('ZZ Employee Open', 'zz.empopen@example.com');
    const partner = mk('ZZ Partner', 'zz.partner@example.com', {partnerPobId: 'POB-ZZ1'});
    const partnerOpen = mk('ZZ Partner Open', 'zz.partneropen@example.com', {partnerPobId: 'POB-ZZ2'});
    DB.team = DB.team.filter(x => !/^ZZ /.test(x.name || '')).concat([emp, empOpen, partner, partnerOpen]);
    await save('team');
    DB.hrConfig = Object.assign({}, DB.hrConfig, {location: {required: false, note: ''},
      reminders: {enabled: true, inEmailAt: '09:15', outNotifyAt: '18:00', outEmailAt: '19:00'},
      weeklyOff: [], holidays: [],
      day: Object.assign({}, (DB.hrConfig || {}).day, {punchInFrom: '00:00', punchOutUntil: '23:59'})});
    await save('hrConfig');
    const inAt = new Date(Date.now() - 3 * 3600000).toISOString();
    DB.hrAttendance = [empOpen, partnerOpen].map(u => ({id: uid('HRA'), userId: u.id, date: hrToday(),
      sessions: [{in: inAt, out: null, inBy: u.id}], createdAt: inAt, createdBy: u.id}));
    await save('hrAttendance');
    return {emp: emp.id, empOpen: empOpen.id, partner: partner.id, partnerOpen: partnerOpen.id};
  });

  await t.step('09:15 — the employee who has not punched in is mailed; the partner is not', async () => {
    t.mail.clear();
    const log = await run('09:20');
    await t.wait(300);
    const to = t.mail.received.map(m => m.to.join(','));
    if(!to.some(x => /zz\.employee@/.test(x))) throw new Error('the employee was not mailed: ' + to.join(' ; '));
    if(to.some(x => /zz\.partner/.test(x))) throw new Error('a partner was mailed: ' + to.join(' ; '));
    if(log.some(e => e.userId === ids.partner || e.userId === ids.partnerOpen))
      throw new Error('a partner is in the reminder log');
    return 'employee mailed, partner left alone';
  });

  await t.step('19:00 — still punched in: the employee is mailed, the partner is not', async () => {
    t.mail.clear();
    await run('19:01');
    await t.wait(300);
    const to = t.mail.received.map(m => m.to.join(','));
    if(!to.some(x => /zz\.empopen@/.test(x))) throw new Error('the employee still punched in was not mailed: ' + to.join(' ; '));
    if(to.some(x => /zz\.partner/.test(x))) throw new Error('a partner was mailed: ' + to.join(' ; '));
    return to.join(' ; ');
  });

  await t.step('the month board and leave balances list employees only', async () => {
    const r = await t.eval((ids) => {
      const board = hrMbData().rows.map(x => x.p.id);
      const balances = hrLbRows().map(x => x.t.id);
      return {board, balances};
    }, ids);
    if(r.board.indexOf(ids.emp) < 0) throw new Error('the employee is missing from the month board');
    if(r.board.indexOf(ids.partner) >= 0 || r.board.indexOf(ids.partnerOpen) >= 0) throw new Error('a partner is on the month board');
    if(r.balances.indexOf(ids.emp) < 0) throw new Error('the employee is missing from leave balances');
    if(r.balances.indexOf(ids.partner) >= 0) throw new Error('a partner is in leave balances');
    return r.board.length + ' on the board, ' + r.balances.length + ' in balances';
  });
});
