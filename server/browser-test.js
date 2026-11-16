const fs = require('fs');
const assert = require('assert');
const WS = require('ws');
let seq = 0, pending = new Map(), browser, sessions = [], contexts = [];
function command(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject });
    browser.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
async function evaluate(session, expression) {
  const data = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session);
  if (data.exceptionDetails) throw new Error(JSON.stringify(data.exceptionDetails));
  return data.result.value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(session, expression, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(session, expression)) return;
    await delay(150);
  }
  throw new Error('UI wait timeout: ' + expression);
}
async function page(width) {
  const context = await command('Target.createBrowserContext');
  contexts.push(context.browserContextId);
  const target = await command('Target.createTarget', { url: 'about:blank', browserContextId: context.browserContextId });
  const { sessionId } = await command('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  sessions.push(sessionId);
  await command('Page.enable', {}, sessionId);
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `(function() {
    var Native = window.WebSocket;
    window.WebSocket = function(url, protocols) {
      if (url === 'wss://chess-online-server-popz.onrender.com') url = 'ws://127.0.0.1:43879';
      return protocols === undefined ? new Native(url) : new Native(url, protocols);
    };
    window.WebSocket.prototype = Native.prototype;
    ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(function(key) { window.WebSocket[key] = Native[key]; });
  })();` }, sessionId);
  await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command('Page.navigate', { url: 'http://127.0.0.1:8765/' }, sessionId);
  await until(sessionId, "typeof social !== 'undefined'");
  await evaluate(sessionId, "SERVER='ws://127.0.0.1:43879'; liveAnalyzeEl.checked=false; liveAnalyzeOn=false");
  return sessionId;
}
async function run() {
  const info = await (await fetch('http://127.0.0.1:9226/json/version')).json();
  browser = new WS(info.webSocketDebuggerUrl);
  browser.on('message', raw => {
    const d = JSON.parse(raw); if (!d.id) return;
    const p = pending.get(d.id); if (!p) return; pending.delete(d.id);
    if (d.error) p.reject(new Error(JSON.stringify(d.error))); else p.resolve(d.result);
  });
  await new Promise(resolve => browser.once('open', resolve));
  const a = await page(1100), b = await page(390);
  await evaluate(a, "document.getElementById('btnCreate').click()");
  await until(a, '!!roomId');
  let room = await evaluate(a, 'roomId');
  await evaluate(b, `joinRoom(${JSON.stringify(room)})`);
  await until(a, 'playing'); await until(b, 'playing');
  await evaluate(a, `document.getElementById('chatInput').value='<b>love</b> fuck';document.getElementById('btnChatSend').click()`);
  await until(b, "document.getElementById('chatMessages').textContent.indexOf('<b>love</b> fuck')>=0");
  assert.strictEqual(await evaluate(b, "document.querySelector('#chatMessages b') === null"), true);
  assert.strictEqual(await evaluate(b, "document.getElementById('chatBadge').textContent"), '1');
  await evaluate(b, "document.getElementById('btnChatToggle').click(); document.querySelector('[data-phrase=\"好棋\"]').click()");
  await until(a, "document.getElementById('chatMessages').textContent.indexOf('好棋')>=0");
  assert.strictEqual(await evaluate(b, "document.getElementById('chatBadge').className"), '');
  for (const p of [a,b]) {
    assert.strictEqual(await evaluate(p, "document.getElementById('chatWidget').getBoundingClientRect().top >= document.getElementById('c').getBoundingClientRect().bottom"), true);
    assert.strictEqual(await evaluate(p, 'document.documentElement.scrollWidth <= innerWidth'), true);
  }
  await evaluate(a, "document.getElementById('voiceDetails').open=true; document.getElementById('btnVoice').click()");
  await until(b, "!document.getElementById('btnVoiceAccept').hidden");
  await evaluate(b, "document.getElementById('btnVoiceAccept').click()");
  await until(a, "document.getElementById('voiceHint').textContent === '语音已接通'", 25000);
  await until(b, "document.getElementById('voiceHint').textContent === '语音已接通'", 25000);
  await evaluate(a, "document.getElementById('btnVoiceMute').click()");
  assert.strictEqual(await evaluate(a, "document.getElementById('btnVoiceMute').textContent"), '取消静音');
  await evaluate(a, "document.getElementById('btnVoiceHangup').click()");
  await until(b, "document.getElementById('btnVoiceHangup').hidden");
  await evaluate(a, "document.getElementById('btnResign').click()");
  await until(a, "!document.getElementById('noteComposer').hidden");
  await evaluate(a, "document.getElementById('noteInput').value='next game secret';document.getElementById('btnSaveNote').click()");
  assert.strictEqual(await evaluate(a, "Object.keys(JSON.parse(localStorage.getItem('chess_whispers_pending'))).length"), 1);
  await evaluate(a, "document.getElementById('btnCreate').click()");
  await until(a, '!!roomId'); room = await evaluate(a, 'roomId');
  await evaluate(b, `joinRoom(${JSON.stringify(room)})`);
  await until(b, "document.getElementById('whisperInbox').textContent.indexOf('next game secret')>=0");
  await until(a, "Object.keys(JSON.parse(localStorage.getItem('chess_whispers_pending'))).length === 0");
  // Delivered notes survive reload and are acknowledged only after recipient storage succeeds.
  await evaluate(b, "localStorage.setItem('chess_daily_reminder', JSON.stringify({enabled:true,time:'00:00',last:''}))");
  await command('Page.reload', {}, b);
  await until(b, "typeof social !== 'undefined' && document.getElementById('whisperInbox').textContent.indexOf('next game secret')>=0");
  await until(b, "playing && document.getElementById('reminderHint').textContent.indexOf('今日一局：')>=0");
  await evaluate(a, "document.getElementById('btnReminder').click()");
  assert.strictEqual(await evaluate(a, "JSON.parse(localStorage.getItem('chess_daily_reminder')).enabled"), true);
  await evaluate(a, "document.getElementById('btnReminder').click()");
  // Capture the calendar Blob instead of triggering a download.
  await evaluate(a, "window.calendarText=''; URL.createObjectURL=function(blob){blob.text().then(function(t){window.calendarText=t});return 'blob:test'};document.getElementById('btnCalendar').click()");
  await until(a, "calendarText.indexOf('RRULE:FREQ=DAILY')>=0 && calendarText.indexOf('BEGIN:VALARM')>=0");
  const capture = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, a);
  fs.writeFileSync('/tmp/chess-social-desktop.png', Buffer.from(capture.data,'base64'));
  const mobile = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, b);
  fs.writeFileSync('/tmp/chess-social-mobile.png', Buffer.from(mobile.data,'base64'));
  for (const context of contexts) await command('Target.disposeBrowserContext', { browserContextId: context });
  console.log('Browser UI passed: desktop/mobile layout below board, safe uncensored chat, unread badge/quick replies, WebRTC connected/mute/hangup, next-game notes/persistence/ack, reminder settings/calendar');
}
run().then(() => { browser.close(); process.exit(0); }).catch(err => { console.error(err); if (browser) browser.close(); process.exit(1); });
setTimeout(() => {console.error('Browser test timed out');process.exit(1)},90000);
