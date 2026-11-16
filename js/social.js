/* Browser social controls; ES5 syntax, independent of the mini-game client. */
window.ChessSocial = function(options) {
  function el(id) { return document.getElementById(id); }
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function randomId() {
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += ('0' + bytes[i].toString(16)).slice(-2);
    return out;
  }
  var identity = read('chess_social_identity', '');
  if (!/^[a-f0-9]{32}$/.test(identity)) { identity = randomId(); write('chess_social_identity', identity); }
  var input = el('chatInput'), hint = el('chatHint');
  var bubbleTimers = { self: null, other: null };
  var peerId = '', lastPeerId = '', room = '', ended = false;
  var pending = read('chess_whispers_pending', {}), inbox = read('chess_whispers_inbox', []);
  var noteHint = el('noteHint');
  function state() { return options.state(); }
  function canChat() { return state().connected && !!state().roomId; }
  function clearBubbles() {
    clearTimeout(bubbleTimers.self); clearTimeout(bubbleTimers.other);
    el('selfBubbles').textContent = ''; el('opponentBubbles').textContent = '';
  }
  function addMessage(text, self, who) {
    var side = self ? 'self' : 'other';
    var lane = el(self ? 'selfBubbles' : 'opponentBubbles');
    var bubble = document.createElement('div');
    bubble.className = 'speech-bubble'; bubble.textContent = text;
    bubble.setAttribute('aria-label', who + ': ' + text);
    lane.textContent = ''; lane.appendChild(bubble);
    clearTimeout(bubbleTimers[side]);
    bubbleTimers[side] = setTimeout(function() {
      if (bubble.parentNode === lane) lane.removeChild(bubble);
    }, Math.max(12000, Math.min(30000, text.length * 150)));
  }
  function sendChat(text) {
    if (!canChat()) { hint.textContent = '\u8bf7\u5148\u521b\u5efa\u6216\u52a0\u5165\u623f\u95f4\uff0c\u8fde\u63a5\u6062\u590d\u540e\u518d\u53d1\u9001'; return; }
    text = text.replace(/^\s+|\s+$/g, '');
    if (!text) { hint.textContent = '\u8bf7\u8f93\u5165\u6d88\u606f'; return; }
    if (text.length > 200) { hint.textContent = '\u6d88\u606f\u6700\u591a 200 \u5b57'; return; }
    options.send({ type: 'chat', text: text });
    hint.textContent = '\u5df2\u53d1\u9001\uff0c\u7b49\u5f85\u670d\u52a1\u5668\u786e\u8ba4';
  }
  el('btnChatSend').onclick = function() { sendChat(input.value); };
  input.onkeydown = function(e) {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); sendChat(input.value); }
  };
  el('chatQuick').onclick = function(e) {
    var text = e.target.getAttribute('data-phrase');
    if (text) sendChat(text);
  };
  function renderInbox() {
    var list = el('whisperInbox'); list.textContent = '';
    inbox.slice(-20).forEach(function(note) {
      var row = document.createElement('p'); row.textContent = note.text; list.appendChild(row);
    });
  }
  renderInbox();
  el('btnSaveNote').onclick = function() {
    var text = el('noteInput').value.replace(/^\s+|\s+$/g, '');
    if (!ended || !lastPeerId) { noteHint.textContent = '\u7ed3\u675f\u4e00\u5c40\u540e\u53ef\u4ee5\u7ed9\u521a\u624d\u7684\u5bf9\u624b\u7559\u8a00'; return; }
    if (!text || text.length > 200) { noteHint.textContent = '\u8bf7\u8f93\u5165 1 \u81f3 200 \u5b57'; return; }
    var previous = pending[lastPeerId];
    pending[lastPeerId] = { id: randomId(), text: text };
    if (!write('chess_whispers_pending', pending)) {
      if (previous) pending[lastPeerId] = previous; else delete pending[lastPeerId];
      noteHint.textContent = '\u6d4f\u89c8\u5668\u65e0\u6cd5\u4fdd\u5b58\uff0c\u8bf7\u5141\u8bb8\u672c\u7ad9\u5b58\u50a8\u540e\u91cd\u8bd5'; return;
    }
    el('noteInput').value = '';
    noteHint.textContent = '\u5df2\u4fdd\u5b58\u5728\u6b64\u6d4f\u89c8\u5668\uff0c\u4e0b\u6b21\u4e0e\u8fd9\u4f4d\u5bf9\u624b\u5f00\u5c40\u65f6\u9001\u8fbe\uff08\u518d\u6b21\u4fdd\u5b58\u4f1a\u8986\u76d6\uff09';
  };
  el('btnDeleteNote').onclick = function() {
    if (!lastPeerId) return;
    var previous = pending[lastPeerId]; delete pending[lastPeerId];
    if (!write('chess_whispers_pending', pending)) { pending[lastPeerId] = previous; noteHint.textContent = '\u5220\u9664\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5'; return; }
    noteHint.textContent = '\u5df2\u53d6\u6d88\u5f85\u9001\u8fbe\u7559\u8a00';
  };

  var voice = ChessVoice({ send: options.send, state: state, randomId: randomId,
    peerReady: function() { return !!peerId; } });

  return {
    identity: identity,
    room: function(id) {
      if (room === id) return;
      room = id; peerId = ''; lastPeerId = ''; ended = false; clearBubbles();
      hint.textContent = '\u6d88\u606f\u4ec5\u5728\u672c\u6b21\u623f\u95f4\u5185\u663e\u793a\uff0c\u65ad\u7ebf\u671f\u95f4\u4e0d\u8865\u53d1';
      el('noteComposer').hidden = true; voice.end('\u8fdb\u5165\u5bf9\u5c40\u540e\u53ef\u53d1\u8d77\u8bed\u97f3', true);
    },
    end: function() {
      ended = true; peerId = ''; room = '';
      el('noteComposer').hidden = !lastPeerId;
      hint.textContent = '\u5bf9\u5c40\u5df2\u7ed3\u675f\uff0c\u521b\u5efa\u65b0\u623f\u95f4\u540e\u53ef\u4ee5\u7ee7\u7eed\u804a\u5929';
      voice.end('\u5bf9\u5c40\u7ed3\u675f\uff0c\u8bed\u97f3\u5df2\u5173\u95ed', true);
    },
    disconnect: function() { voice.end('\u7f51\u7edc\u65ad\u5f00\uff0c\u8bed\u97f3\u5df2\u5173\u95ed\uff1b\u91cd\u8fde\u540e\u53ef\u91cd\u65b0\u53d1\u8d77', false); },
    message: function(d) {
      if (d.type === 'game_start' || d.type === 'reconnected' || d.type === 'room_joined' || d.type === 'room_created') {
        setTimeout(function() {
          var black = state().myColor === 'b';
          el('selfAvatar').textContent = black ? '\u265f' : '\u2659';
          el('opponentAvatar').textContent = black ? '\u2659' : '\u265f';
        }, 0);
      }
      if (d.type === 'chat') {
        var self = d.from.charAt(0) === state().myColor;
        addMessage(d.text, self, self ? '\u6211' : '\u5bf9\u65b9');
        if (self) { if (input.value.trim() === d.text) input.value = ''; hint.textContent = '\u5df2\u9001\u8fbe\u623f\u95f4'; }
      } else if (d.type === 'chat_error') {
        hint.textContent = d.error === 'sending messages too quickly' ? '\u53d1\u9001\u592a\u5feb\uff0c5 \u79d2\u5185\u6700\u591a 5 \u6761\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5' : '\u53d1\u9001\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u6d88\u606f\u548c\u623f\u95f4\u8fde\u63a5';
      } else if (d.type === 'social_ready') {
        peerId = d.peerId; lastPeerId = peerId;
        var note = pending[peerId];
        if (note) options.send({ type: 'whisper', targetId: peerId, noteId: note.id, text: note.text });
      } else if (d.type === 'whisper') {
        if (d.peerId !== peerId) return;
        var known = inbox.some(function(n) { return n.id === d.noteId; });
        if (!known) {
          var updated = inbox.concat([{ id: d.noteId, text: d.text }]).slice(-100);
          if (!write('chess_whispers_inbox', updated)) { noteHint.textContent = '\u65e0\u6cd5\u4fdd\u5b58\u6536\u5230\u7684\u7559\u8a00\uff0c\u5df2\u4fdd\u7559\u5728\u5bf9\u65b9\u5f85\u9001\u8fbe\u5217\u8868'; return; }
          inbox = updated; renderInbox(); addMessage(d.text, false, '\u5bf9\u65b9\u4e0a\u5c40\u7684\u6084\u6084\u8bdd');
          el('whisperDetails').open = true;
        }
        options.send({ type: 'whisper_ack', targetId: peerId, noteId: d.noteId });
      } else if (d.type === 'whisper_ack') {
        if (pending[d.peerId] && pending[d.peerId].id === d.noteId) {
          delete pending[d.peerId]; write('chess_whispers_pending', pending); noteHint.textContent = '\u4e0a\u4e00\u5c40\u7684\u7559\u8a00\u5df2\u9001\u8fbe';
        }
      } else if (d.type === 'voice' || d.type === 'voice_audio' || d.type === 'voice_error') voice.message(d);
    }
  };
};
