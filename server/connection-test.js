// Exercise the actual browser connection functions with delayed socket events.
var fs = require('fs');
var vm = require('vm');
var assert = require('assert');
var html = fs.readFileSync(require('path').join(__dirname, '../index.html'), 'utf8');
var start = html.indexOf('function clearWakeTimer()');
var end = html.indexOf('function handle(d)', start);
var sockets = [], timers = [], statuses = [], disconnected = 0, handled = 0, reconnected = 0;
function FakeSocket() { this.readyState = 0; this.sent = []; sockets.push(this); }
FakeSocket.OPEN = 1;
FakeSocket.prototype.close = function() { this.readyState = 3; };
FakeSocket.prototype.send = function(text) {
  assert.strictEqual(this.readyState, 1, 'must never send to a closed/connecting socket');
  this.sent.push(text);
};
var context = {
  WebSocket: FakeSocket, SERVER: 'wss://test.invalid', ws: null, connected: false,
  retryBtn: { style: {} }, wakeTimer: null, over: false, roomId: '', reconnectToken: '', myColor: null,
  status: function(s) { statuses.push(s); },
  social: { disconnect: function() { disconnected++; } },
  resetSession: function() {},
  handle: function() { handled++; },
  setTimeout: function(fn) { timers.push(fn); return timers.length; }, clearTimeout: function() {},
  JSON: JSON
};
vm.createContext(context); vm.runInContext(html.slice(start, end), context);
var opened = 0;
context.connect(function() { opened++; });
var old = sockets[0], lateClose = old.onclose, lateError = old.onerror, lateMessage = old.onmessage, lateOpen = old.onopen;
context.connect(function() { opened++; });
var current = sockets[1]; current.readyState = 1; current.onopen();
var statusCount = statuses.length;
lateClose(); lateError(); lateMessage({ data: '{"type":"error"}' }); lateOpen();
assert.strictEqual(context.connected, true, 'old events must not disconnect the replacement');
assert.strictEqual(statuses.length, statusCount, 'old error events must not overwrite the current status');
assert.strictEqual(disconnected, 0);
assert.strictEqual(handled, 0);
assert.strictEqual(opened, 1);
context.send({ type: 'chat', text: 'hello' });
assert.strictEqual(current.sent.length, 1);
current.readyState = 3;
context.send({ type: 'chat', text: 'closed' });
assert.strictEqual(current.sent.length, 1);
context.connect(function() { opened++; });
assert.strictEqual(sockets.length, 3, 'a closed socket must not be reused even with a stale connected flag');
assert.strictEqual(context.connected, false);
var third = sockets[2]; third.readyState = 1; third.onopen();
context.roomId = 'ABCDEF'; context.reconnectToken = 'test';
third.onclose();
var staleRetry = timers[timers.length - 1];
context.connect(function() {});
var fourth = sockets[3]; fourth.readyState = 1; fourth.onopen();
context.connected = false;
context.attemptReconnect = function() { reconnected++; };
staleRetry();
assert.strictEqual(reconnected, 0, 'old retry timers must not replace a newer socket');
console.log('Connection regression passed: stale open/close/error/message events, readyState checks, old reconnect timers');
