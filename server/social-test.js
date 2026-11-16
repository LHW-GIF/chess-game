// Independent protocol regression; uses an isolated ephemeral server port.
var assert = require('assert');
var WebSocket = require('ws');
var chess = require('./server');
var sockets = [];
function client(url) {
  return new Promise(function(resolve, reject) {
    var ws = new WebSocket(url), queue = [], waiters = [];
    sockets.push(ws);
    ws.on('error', reject);
    ws.on('message', function(raw) {
      var msg = JSON.parse(raw);
      var index = waiters.findIndex(function(w) { return w.type === msg.type && (!w.action || w.action === msg.action); });
      if (index < 0) queue.push(msg);
      else { var w = waiters.splice(index, 1)[0]; clearTimeout(w.timer); w.resolve(msg); }
    });
    ws.next = function(type, action) {
      var index = queue.findIndex(function(m) { return m.type === type && (!action || m.action === action); });
      if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise(function(yes, no) {
        var w = { type: type, action: action, resolve: yes };
        w.timer = setTimeout(function() { no(new Error('Timeout: ' + type + ' ' + action)); }, 2000);
        waiters.push(w);
      });
    };
    ws.msg = function(data) { ws.send(JSON.stringify(data)); };
    ws.once('open', function() { resolve(ws); });
  });
}
async function run() {
  await new Promise(function(resolve) { chess.server.listen(0, '127.0.0.1', resolve); });
  var url = 'ws://127.0.0.1:' + chess.server.address().port;
  var a = await client(url), b = await client(url), outsider = await client(url);
  var aid = 'a'.repeat(32), bid = 'b'.repeat(32), call = 'c'.repeat(32), note = 'd'.repeat(32);
  outsider.msg({ type: 'chat', text: 'outside' });
  assert.strictEqual((await outsider.next('chat_error')).error, 'not in a room');
  a.msg({ type: 'create_room', clientId: aid });
  var created = await a.next('room_created');
  b.msg({ type: 'join_room', roomId: created.roomId, clientId: bid });
  await a.next('game_start'); await b.next('game_start');
  assert.strictEqual((await a.next('social_ready')).peerId, bid);
  assert.strictEqual((await b.next('social_ready')).peerId, aid);
  a.msg({ type: 'chat', text: '<img src=x onerror=alert(1)> fuck \u50bb\u903c \ud83d\udc95' });
  var text = (await b.next('chat')).text;
  assert.strictEqual(text, '<img src=x onerror=alert(1)> fuck \u50bb\u903c \ud83d\udc95', 'no content censorship');
  assert.strictEqual((await a.next('chat')).text, text);
  a.msg({ type: 'chat', text: '  \n  ' });
  assert.strictEqual((await a.next('chat_error')).error, 'empty message');
  a.msg({ type: 'chat', text: 'x'.repeat(250) });
  assert.strictEqual((await b.next('chat')).text.length, 200);
  for (var i = 0; i < 4; i++) a.msg({ type: 'chat', text: 'rate ' + i });
  assert.strictEqual((await a.next('chat_error')).error, 'sending messages too quickly');
  a.msg({ type: 'voice', action: 'request', callId: call });
  assert.strictEqual((await b.next('voice', 'request')).callId, call);
  b.msg({ type: 'voice', action: 'request', callId: 'e'.repeat(32) });
  assert.strictEqual((await b.next('voice', 'reject')).reason, 'busy');
  b.msg({ type: 'voice', action: 'accept', callId: call }); await a.next('voice', 'accept');
  a.msg({ type: 'voice', action: 'offer', callId: call, sdp: 'test offer' });
  assert.strictEqual((await b.next('voice', 'offer')).sdp, 'test offer');
  b.msg({ type: 'voice', action: 'answer', callId: call, sdp: 'test answer' }); await a.next('voice', 'answer');
  b.msg({ type: 'voice', action: 'ice', callId: call, candidate: { candidate: 'candidate:test', sdpMid: '0' } });
  assert.strictEqual((await a.next('voice', 'ice')).candidate.candidate, 'candidate:test');
  // A guessed call id outside the room cannot inject signaling into the call.
  outsider.msg({ type: 'voice', action: 'hangup', callId: call });
  await new Promise(function(resolve) { setTimeout(resolve, 30); });
  assert.strictEqual(chess.rooms[created.roomId].voiceCall.id, call);
  a.msg({ type: 'resign' });
  await a.next('game_over'); await b.next('game_over');
  await a.next('voice', 'hangup');
  assert.strictEqual(chess.rooms[created.roomId].voiceCall, null);
  a.msg({ type: 'leave_room' }); b.msg({ type: 'leave_room' });
  a.msg({ type: 'create_room', clientId: aid }); created = await a.next('room_created');
  b.msg({ type: 'join_room', roomId: created.roomId, clientId: bid });
  await a.next('game_start'); await b.next('game_start');
  assert.strictEqual((await a.next('social_ready')).peerId, bid);
  assert.strictEqual((await b.next('social_ready')).peerId, aid);
  a.msg({ type: 'whisper', targetId: bid, noteId: note, text: 'a note for our next game' });
  var delivered = await b.next('whisper');
  assert.strictEqual(delivered.peerId, aid);
  assert.strictEqual(delivered.text, 'a note for our next game');
  b.msg({ type: 'whisper_ack', targetId: aid, noteId: note });
  assert.strictEqual((await a.next('whisper_ack')).noteId, note);
  console.log('Social protocol passed: uncensored text, length/rate limits, room isolation, voice handshake/ICE/cleanup, next-game notes and acknowledgements');
}
var timeout = setTimeout(function() { console.error('Social test timed out'); process.exit(1); }, 15000);
run().then(function() { finish(0); }, function(err) { console.error(err); finish(1); });
function finish(code) {
  clearTimeout(timeout);
  sockets.forEach(function(ws) { ws.terminate(); });
  chess.wss.close(); chess.server.close();
  process.exit(code);
}
