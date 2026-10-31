function Socket() {
  this.ws = null;
  this.connected = false;
  this.handlers = {};
  this.url = 'ws://localhost:43879';
}

Socket.prototype.connect = function(onOk, onErr) {
  var self = this;
  this.ws = wx.connectSocket({ url: this.url });
  var done = false;

  this.ws.onOpen(function() {
    self.connected = true;
    console.log('connected to server');
    if (!done) { done = true; onOk(); }
  });

  this.ws.onMessage(function(msg) {
    var data = JSON.parse(msg.data);
    if (data.type === 'connected') self.playerId = data.playerId;
    self.emit(data.type, data);
  });

  this.ws.onClose(function() {
    self.connected = false;
    self.emit('disconnect', {});
  });

  this.ws.onError(function() {
    if (!done) { done = true; onErr('cannot connect'); }
  });

  setTimeout(function() {
    if (!done) { done = true; onErr('timeout'); }
  }, 5000);
};

Socket.prototype.send = function(msg) {
  if (this.ws && this.connected) {
    this.ws.send({ data: JSON.stringify(msg) });
  }
};

Socket.prototype.emit = function(evt, data) {
  var list = this.handlers[evt];
  if (list) {
    for (var i = 0; i < list.length; i++) list[i](data);
  }
};

Socket.prototype.on = function(evt, fn) {
  if (!this.handlers[evt]) this.handlers[evt] = [];
  this.handlers[evt].push(fn);
};

module.exports = Socket;
