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
async function click(session, id) {
  const rect = await evaluate(session, `(function(){var e=document.getElementById(${JSON.stringify(id)});e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, session);
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, session);
}
async function page(width, unsupportedWechat) {
  const context = await command('Target.createBrowserContext');
  contexts.push(context.browserContextId);
  const target = await command('Target.createTarget', { url: 'about:blank', browserContextId: context.browserContextId });
  const { sessionId } = await command('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  sessions.push(sessionId);
  await command('Page.enable', {}, sessionId);
  if (unsupportedWechat) await command('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(navigator,'mediaDevices',{value:undefined});Object.defineProperty(navigator,'userAgent',{value:'MicroMessenger test browser'});" }, sessionId);
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
  await until(b, "document.getElementById('opponentBubbles').textContent.indexOf('<b>love</b> fuck')>=0");
  assert.strictEqual(await evaluate(b, "document.querySelector('#opponentBubbles b') === null"), true);
  assert.strictEqual(await evaluate(b, "document.querySelector('#opponentBubbles .speech-bubble') !== null"), true);
  await evaluate(b, "document.querySelector('[data-phrase=\"好棋\"]').click()");
  await until(a, "document.getElementById('opponentBubbles').textContent.indexOf('好棋')>=0");
  for (const p of [a,b]) {
    assert.strictEqual(await evaluate(p, "document.getElementById('chatWidget').getBoundingClientRect().top >= document.getElementById('c').getBoundingClientRect().bottom"), true);
    assert.strictEqual(await evaluate(p, 'document.documentElement.scrollWidth <= innerWidth'), true);
  }
  for (const p of [a,b]) {
    await evaluate(p, `window.voiceContexts=[];window.voiceStreams=[];
      (function(){var Native=window.AudioContext;window.AudioContext=function(){var ctx=new Native();voiceContexts.push(ctx);return ctx};window.AudioContext.prototype=Native.prototype;
      var gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=function(c){return gum(c).then(function(s){voiceStreams.push(s);return s})};})();`);
  }
  await evaluate(a, "document.getElementById('voiceDetails').open=true");
  await click(a, 'btnVoice');
  await until(b, "!document.getElementById('btnVoiceAccept').hidden");
  await click(b, 'btnVoiceAccept');
  await until(a, "document.getElementById('voiceHint').textContent.indexOf('语音已接通') === 0", 25000);
  await until(b, "document.getElementById('voiceHint').textContent.indexOf('语音已接通') === 0", 25000);
  for (const p of [a,b]) {
    await until(p, "Number(document.getElementById('voiceIO').getAttribute('data-sent-frames')) > 5 && Number(document.getElementById('voiceIO').getAttribute('data-received-frames')) > 5");
    await until(p, "Number(document.getElementById('voiceIO').getAttribute('data-input-peak')) > .01 && Number(document.getElementById('voiceIO').getAttribute('data-output-peak')) > .01", 20000);
    assert.strictEqual(await evaluate(p, "Number(document.getElementById('voiceIO').getAttribute('data-played-frames')) > 0"), true);
  }
  await evaluate(b, "voiceContexts[0].suspend()");
  await until(b, "document.getElementById('speakerStatus').textContent.indexOf('暂停') >= 0");
  await click(b, 'btnVoicePlay');
  await until(b, "voiceContexts[0].state === 'running'");
  await evaluate(a, "document.getElementById('btnVoiceMute').click()");
  assert.strictEqual(await evaluate(a, "document.getElementById('btnVoiceMute').textContent"), '取消静音');
  await evaluate(a, "document.getElementById('btnVoiceHangup').click()");
  await until(b, "document.getElementById('btnVoiceHangup').hidden");
  for (const p of [a,b]) assert.strictEqual(await evaluate(p, "voiceStreams[0].getAudioTracks()[0].readyState"), 'ended');
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
  await command('Page.reload', {}, b);
  await until(b, "typeof social !== 'undefined' && document.getElementById('whisperInbox').textContent.indexOf('next game secret')>=0");
  await until(b, "playing");
  await evaluate(a, "document.getElementById('chatInput').value='这步下得真好，继续陪你下一局。';document.getElementById('btnChatSend').click()");
  await until(b, "document.getElementById('opponentBubbles').textContent.indexOf('继续陪你')>=0");
  await evaluate(b, "document.querySelector('[data-phrase=\"好棋\"]').click()");
  await until(a, "document.getElementById('opponentBubbles').textContent.indexOf('好棋')>=0");
  for (const p of [a,b]) {
    assert.strictEqual(await evaluate(p, "document.getElementById('opponentBubbles').getBoundingClientRect().bottom <= document.getElementById('c').getBoundingClientRect().top"), true);
    assert.strictEqual(await evaluate(p, "parseFloat(getComputedStyle(document.querySelector('.speech-bubble')).fontSize) >= 18"), true);
  }
  const capture = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, a);
  fs.writeFileSync('/tmp/chess-social-desktop.png', Buffer.from(capture.data,'base64'));
  const mobile = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, b);
  fs.writeFileSync('/tmp/chess-social-mobile.png', Buffer.from(mobile.data,'base64'));
  const c = await page(390, true);
  assert.strictEqual(await evaluate(c, "document.getElementById('voiceCompatibility').textContent.indexOf('当前微信浏览器不支持') >= 0"), true);
  for (const context of contexts) await command('Target.disposeBrowserContext', { browserContextId: context });
  console.log('Browser UI passed: desktop/mobile layout below board, safe uncensored chat, automatic large player bubbles/quick replies, bidirectional nonzero relay audio/playback/resume/mute/hangup, next-game notes/persistence/ack, unsupported WeChat detection without breaking chess');
}
run().then(() => { browser.close(); process.exit(0); }).catch(err => { console.error(err); if (browser) browser.close(); process.exit(1); });
setTimeout(() => {console.error('Browser test timed out');process.exit(1)},90000);
