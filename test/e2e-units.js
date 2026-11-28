// Browser checks for the Units mode (called from e2e.js with a page on the built PWA).
module.exports = async function (p, ok) {
  await p.click('#modeTabs button[data-mode="units"]');
  ok(await p.isVisible('#mode-units'), 'Units tab opens');
  await p.click('#uTabs button[data-tab="convert"]');
  await p.click('#uQs button[data-q="torque"]');
  await p.selectOption('#uUnit', 'N·m'); await p.fill('#uVal', '100');
  ok((await p.textContent('#uBestVal')).replace(/\s+/g, ' ') === '73.7562 lbf·ft', '100 N·m → best fit 73.7562 lbf·ft: ' + await p.textContent('#uBestVal'));
  ok(await p.locator('#uList .u-row').count() === 8, 'all 8 torque units listed');
  await p.click('#uSys button[data-v="imperial"]');
  ok(await p.locator('#uList .u-row').count() === 4, 'Imperial filter shows 4 rows');
  await p.click('#uSys button[data-v="both"]');
  // tap a row → it becomes the input
  await p.click('#uList .u-row:has(.u-sym:text-is("lbf·in"))');
  ok(await p.inputValue('#uVal') === '885.0745791' && await p.inputValue('#uUnit') === 'lbf·in', 'row tap makes it the input: ' + await p.inputValue('#uVal'));
  // prefixes
  await p.fill('#uSearch', 'force'); await p.click('#uQs button[data-q="force"]'); await p.fill('#uSearch', '');
  await p.selectOption('#uUnit', 'N'); await p.fill('#uVal', '4.7k');
  ok((await p.textContent('#uList .u-row:has(.u-sym:text-is("lbf")) .u-val')) === '1056.6', '4.7k N → 1056.6 lbf: ' + await p.textContent('#uList .u-row:has(.u-sym:text-is("lbf")) .u-val'));
  await p.selectOption('#uUnit', 'lbf'); await p.fill('#uVal', '4.7k');
  ok((await p.textContent('#uStatus')) === 'Prefix not allowed for this unit', 'prefix on lbf rejected inline');
  // search by unit symbol jumps to it
  await p.fill('#uSearch', 'psi');
  ok(await p.inputValue('#uUnit') === 'psi' && await p.getAttribute('#uQs button[data-q="pressure"]', 'aria-pressed') === 'true', 'search "psi" selects Pressure / psi');
  await p.fill('#uSearch', '');
  // temperature
  await p.click('#uQs button[data-q="temperature"]'); await p.selectOption('#uUnit', '°C'); await p.fill('#uVal', '100');
  ok((await p.textContent('#uBestVal')).replace(/\s+/g, ' ') === '212 °F', '100 °C → 212 °F');
  await p.fill('#uVal', '-300'); ok(await p.textContent('#uStatus') === 'Below absolute zero', 'below absolute zero message');
  // length fractions
  await p.click('#uQs button[data-q="length"]'); await p.selectOption('#uUnit', 'm'); await p.selectOption('#uPfx', '-3'); await p.fill('#uVal', '100');
  await p.click('#uDen button[data-v="16"]');
  ok((await p.textContent('#uBestNote')).startsWith('3 15/16"'), '100 mm → 3 15/16": ' + await p.textContent('#uBestNote'));
  // star
  await p.click('#uStar'); ok(await p.locator('#uFavs button').count() === 1, 'pair starred');
  await p.click('#uStar'); ok(await p.locator('#uFavs button').count() === 0, 'star removed');
  // decibels
  await p.click('#uTabs button[data-tab="db"]'); await p.click('#uDbModes button[data-m="level"]');
  await p.fill('#db-dbm', '0');
  ok(await p.inputValue('#db-vrms') === '223.61m', '0 dBm @ 50 Ω = 223.61m V: ' + await p.inputValue('#db-vrms'));
  await p.fill('#db-r', '600'); ok(await p.inputValue('#db-dbu') === '0', '0 dBm @ 600 Ω = 0 dBu: ' + await p.inputValue('#db-dbu'));
  await p.fill('#db-w', '1'); ok(await p.inputValue('#db-dbm') === '30', '1 W = 30 dBm');
  await p.click('#uDbModes button[data-m="ratio"]'); await p.fill('#db-db', '20');
  ok(await p.inputValue('#db-vr') === '10', '20 dB = voltage ratio 10');
  // wire & trace
  await p.click('#uTabs button[data-tab="wire"]'); await p.click('#uWireModes button[data-m="trace"]');
  await p.fill('#wire-i', '1');
  ok(await p.inputValue('#wire-w') === '0.3004', '1 A external 1 oz → 0.3004 mm: ' + await p.inputValue('#wire-w'));
  await p.fill('#wire-i', '40'); ok((await p.textContent('#uWireOut')).includes('Outside IPC-2221'), '40 A shows range warning');
  await p.click('#uWireModes button[data-m="awg"]'); await p.selectOption('#wire-g', '10');
  ok(await p.inputValue('#wire-a') === '5.261', 'AWG 10 = 5.261 mm²: ' + await p.inputValue('#wire-a'));
  await p.fill('#wire-a', '0.2'); ok(await p.inputValue('#wire-g') === '24', '0.2 mm² → AWG 24');
  ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'Units: no horizontal overflow');
  await p.click('#uTabs button[data-tab="convert"]');
};
