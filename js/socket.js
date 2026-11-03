function Socket() {
  this.ws = null;
  this.connected = false;
  this.connecting = false;
  this.handlers = {};
  this.url = 'ws://localhost:43879';
}

Socket.prototype.connect = function(onOk, onErr) {
  var self = this;
  if (this.connected && this.ws) {
    if (onOk) onOk();
    return;
  }
  if (this.ws) {
    try { this.ws.close({}); } catch (e) {}
    this.ws = null;
  }
  this.connecting = true;
  this.ws = wx.connectSocket({ url: this.url });
  var done = false;
  var timer = setTimeout(function() {
    if (!done) {
      done = true;
      self.connecting = false;
      if (onErr) onErr('timeout');
    }
  }, 10000);

  this.ws.onOpen(function() {
    clearTimeout(timer);
    self.connected = true;
    self.connecting = false;
    console.log('connected to server');
    if (!done) {
      done = true;
      if (onOk) onOk();
    }
  });

  this.ws.onMessage(function(msg) {
    var data;
    try { data = JSON.parse(msg.data); } catch (e) { return; }
    if (data.type === 'connected') self.playerId = data.playerId;
    self.emit(data.type, data);
  });

  this.ws.onClose(function() {
    clearTimeout(timer);
    self.connected = false;
    self.connecting = false;
    self.emit('disconnect', {});
  });

  this.ws.onError(function() {
    clearTimeout(timer);
    self.connecting = false;
    if (!done) {
      done = true;
      if (onErr) onErr('cannot connect');
    }
  });
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
