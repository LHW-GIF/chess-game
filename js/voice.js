/* ES5 browser audio relay. Audio is forwarded live; no recording or server storage. */
window.ChessVoice = function(options) {
  function el(id) { return document.getElementById(id); }
  var callId = '', incoming = false, active = false, epoch = 0, timer = null;
  var context = null, stream = null, source = null, capture = null, silentGain = null;
  var playbackNodes = [], nextPlayback = 0, lastReceived = 0, sentFrames = 0, receivedFrames = 0;
  var captureLevel = 0, receivedLevel = 0, inputPeak = 0, outputPeak = 0, playedFrames = 0, meterTimer = null;
  var lastCaptured = 0;
  var phase = 0, filtered = 0, frame = new Int16Array(1024), frameIndex = 0;
  var voiceHint = el('voiceHint'), io = el('voiceIO');
  var micStatus = el('micStatus'), speakerStatus = el('speakerStatus');
  var inWechat = /MicroMessenger/i.test(navigator.userAgent);
  function signal(action) { options.send({ type: 'voice', action: action, callId: callId, mode: 'relay' }); }
  function buttons() {
    el('btnVoice').disabled = !!callId;
    el('btnVoiceAccept').hidden = !incoming;
    el('btnVoiceReject').hidden = !incoming;
    el('btnVoiceHangup').hidden = !callId;
    el('btnVoiceMute').disabled = !stream;
    el('btnVoicePlay').hidden = !callId;
    io.hidden = !callId;
  }
  function updateMeters() {
    var track = stream && stream.getAudioTracks()[0];
    el('micLevel').value = captureLevel;
    el('speakerLevel').value = receivedLevel;
    if (!track) micStatus.textContent = '\u9ea6\u514b\u98ce\u672a\u5f00\u542f';
    else if (track.readyState === 'ended') micStatus.textContent = '\u9ea6\u514b\u98ce\u5df2\u88ab\u7cfb\u7edf\u5173\u95ed';
    else if (!track.enabled) micStatus.textContent = '\u9ea6\u514b\u98ce\u5df2\u9759\u97f3';
    else if (track.muted) micStatus.textContent = '\u9ea6\u514b\u98ce\u88ab\u7cfb\u7edf\u6682\u505c';
    else if (Date.now() - lastCaptured > 3000) micStatus.textContent = '\u672a\u6536\u5230\u5f55\u97f3\u6570\u636e\uff0c\u8bf7\u5c1d\u8bd5\u6062\u590d\u58f0\u97f3';
    else micStatus.textContent = captureLevel > 0.015 ? '\u9ea6\u514b\u98ce\u6709\u58f0\u97f3' : '\u9ea6\u514b\u98ce\u5df2\u5f00\u542f';
    if (context && context.state !== 'running') {
      speakerStatus.textContent = '\u58f0\u97f3\u88ab\u6682\u505c\uff0c\u8bf7\u70b9\u201c\u6062\u590d\u58f0\u97f3\u201d';
    } else if (lastReceived && Date.now() - lastReceived < 2000) {
      speakerStatus.textContent = receivedLevel > 0.01 ? '\u6b63\u5728\u64ad\u653e\u5bf9\u65b9\u58f0\u97f3' : '\u5df2\u6536\u5230\u97f3\u9891\uff0c\u5bf9\u65b9\u6682\u672a\u8bf4\u8bdd';
    } else speakerStatus.textContent = active ? '\u7b49\u5f85\u5bf9\u65b9\u97f3\u9891' : '\u7b49\u5f85\u63a5\u542c';
    io.setAttribute('data-input-peak', String(inputPeak));
    io.setAttribute('data-output-peak', String(outputPeak));
    io.setAttribute('data-played-frames', String(playedFrames));
    io.setAttribute('data-sent-frames', String(sentFrames));
    io.setAttribute('data-received-frames', String(receivedFrames));
    captureLevel *= 0.65; receivedLevel *= 0.65;
  }
  function end(text, notify) {
    if (notify && callId) signal('hangup');
    epoch++; clearTimeout(timer); clearInterval(meterTimer); timer = meterTimer = null;
    active = false; callId = ''; incoming = false;
    if (capture) { capture.onaudioprocess = null; capture.disconnect(); capture = null; }
    if (source) { source.disconnect(); source = null; }
    if (silentGain) { silentGain.disconnect(); silentGain = null; }
    playbackNodes.forEach(function(node) { try { node.stop(); node.disconnect(); } catch (e) {} });
    playbackNodes = [];
    if (stream) { stream.getTracks().forEach(function(track) { track.stop(); }); stream = null; }
    if (context) { context.onstatechange = null; context.close().catch(function() {}); context = null; }
    frameIndex = 0; phase = 0; filtered = 0; nextPlayback = 0;
    sentFrames = receivedFrames = lastReceived = captureLevel = receivedLevel = inputPeak = outputPeak = playedFrames = 0;
    el('btnVoiceMute').textContent = '\u9759\u97f3';
    el('micLevel').value = el('speakerLevel').value = 0;
    micStatus.textContent = '\u9ea6\u514b\u98ce\u672a\u5f00\u542f'; speakerStatus.textContent = '\u5c1a\u672a\u6536\u5230\u58f0\u97f3';
    voiceHint.textContent = text || '\u8bed\u97f3\u5df2\u7ed3\u675f'; buttons();
  }
  function fail(err) {
    var name = err && err.name;
    var text;
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') text = '\u9ea6\u514b\u98ce\u672a\u83b7\u6388\u6743\uff0c\u8bf7\u5728\u6d4f\u89c8\u5668\u53ca\u7cfb\u7edf\u6743\u9650\u4e2d\u5141\u8bb8';
    else if (name === 'NotFoundError') text = '\u6ca1\u6709\u627e\u5230\u53ef\u7528\u9ea6\u514b\u98ce\uff0c\u8bf7\u68c0\u67e5\u8bbe\u5907';
    else if (name === 'NotReadableError') text = '\u9ea6\u514b\u98ce\u88ab\u5176\u4ed6\u5e94\u7528\u5360\u7528\uff0c\u8bf7\u7ed3\u675f\u5176\u4ed6\u901a\u8bdd\u540e\u91cd\u8bd5';
    else text = '\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u80fd\u6b63\u5e38\u5f55\u97f3\u6216\u64ad\u653e\uff0c\u8bf7\u7528 Safari \u6216 Chrome \u6253\u5f00\u518d\u8bd5';
    if (inWechat) text += '\uff1b\u5fae\u4fe1\u4e2d\u53ef\u70b9\u53f3\u4e0a\u89d2\u83dc\u5355\uff0c\u5728\u7cfb\u7edf\u6d4f\u89c8\u5668\u6253\u5f00';
    end(text, true);
  }
  // Called directly from the call/answer button to unlock mobile audio playback.
  function unlock() {
    var Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('audio unsupported');
    if (!context) context = new Audio();
    context.resume().catch(function() {});
    var silent = context.createBufferSource();
    silent.buffer = context.createBuffer(1, 1, context.sampleRate);
    silent.connect(context.destination); silent.start();
    silent.onended = function() { silent.disconnect(); };
  }
  function encodeFrame() {
    var data = new DataView(new ArrayBuffer(frame.length * 2));
    for (var i = 0; i < frame.length; i++) data.setInt16(i * 2, frame[i], true);
    var bytes = new Uint8Array(data.buffer), binary = '';
    for (var j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
    return btoa(binary);
  }
  function attachCapture(stamp) {
    lastCaptured = Date.now();
    source = context.createMediaStreamSource(stream);
    // ES5-compatible capture for embedded browsers without AudioWorklet support.
    capture = context.createScriptProcessor(2048, 1, 1);
    silentGain = context.createGain(); silentGain.gain.value = 0;
    source.connect(capture); capture.connect(silentGain); silentGain.connect(context.destination);
    var rate = context.sampleRate;
    var alpha = 1 - Math.exp(-2 * Math.PI * 6000 / rate);
    capture.onaudioprocess = function(event) {
      if (stamp !== epoch || !context || !stream) return;
      lastCaptured = Date.now();
      var samples = event.inputBuffer.getChannelData(0), energy = 0;
      var track = stream.getAudioTracks()[0];
      for (var i = 0; i < samples.length; i++) {
        var sample = track.enabled && !track.muted ? samples[i] : 0;
        energy += sample * sample;
        filtered += alpha * (sample - filtered);
        phase += 16000;
        if (phase < rate) continue;
        phase -= rate;
        if (!active) continue;
        frame[frameIndex++] = Math.max(-32768, Math.min(32767, Math.round(filtered * 32767)));
        if (frameIndex === frame.length) {
          if (options.send({ type: 'voice_audio', callId: callId, audio: encodeFrame() }) !== false) sentFrames++;
          frameIndex = 0;
        }
      }
      captureLevel = Math.max(captureLevel, Math.min(1, Math.sqrt(energy / samples.length) * 4));
      inputPeak = Math.max(inputPeak, captureLevel);
    };
    context.onstatechange = updateMeters;
    meterTimer = setInterval(updateMeters, 250);
    buttons(); updateMeters();
  }
  function prepare() {
    var stamp = epoch;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('microphone unsupported');
      unlock();
    } catch (err) { return Promise.reject(err); }
    voiceHint.textContent = '\u6b63\u5728\u8bf7\u6c42\u9ea6\u514b\u98ce\u6743\u9650...';
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }).then(function(media) {
      if (stamp !== epoch || !callId) { media.getTracks().forEach(function(t) { t.stop(); }); return false; }
      stream = media;
      if (!stream.getAudioTracks().length) throw new Error('no audio track');
      stream.getAudioTracks()[0].onended = function() {
        if (stamp === epoch) end('\u9ea6\u514b\u98ce\u88ab\u7cfb\u7edf\u5173\u95ed\uff0c\u8bf7\u91cd\u65b0\u53d1\u8d77\u8bed\u97f3', true);
      };
      attachCapture(stamp); return true;
    }).catch(function(err) { if (stamp === epoch) throw err; return false; });
  }
  function playFrame(data) {
    if (!active || !context || typeof data !== 'string' || data.length !== 2732) return;
    var raw;
    try { raw = atob(data); } catch (e) { return; }
    if (raw.length !== 2048) return;
    receivedFrames++; lastReceived = Date.now();
    if (context.state !== 'running') { updateMeters(); return; }
    var buffer = context.createBuffer(1, 1024, 16000), samples = buffer.getChannelData(0), energy = 0;
    for (var i = 0; i < samples.length; i++) {
      var n = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
      if (n >= 32768) n -= 65536;
      samples[i] = n / 32768; energy += samples[i] * samples[i];
    }
    receivedLevel = Math.max(receivedLevel, Math.min(1, Math.sqrt(energy / samples.length) * 4));
    outputPeak = Math.max(outputPeak, receivedLevel);
    var now = context.currentTime;
    if (nextPlayback > now + 0.6 || playbackNodes.length > 12) {
      // Drop stale speech instead of allowing seconds of queued latency.
      playbackNodes.forEach(function(node) { try { node.stop(); } catch (e) {} });
      playbackNodes = []; nextPlayback = 0;
    }
    var player = context.createBufferSource(); player.buffer = buffer; player.connect(context.destination);
    playbackNodes.push(player);
    player.onended = function() {
      player.disconnect(); var index = playbackNodes.indexOf(player); if (index >= 0) playbackNodes.splice(index, 1);
    };
    var at = Math.max(now + 0.04, nextPlayback);
    player.start(at); playedFrames++; nextPlayback = at + buffer.duration;
    voiceHint.textContent = '\u8bed\u97f3\u5df2\u63a5\u901a\uff08\u7a33\u5b9a\u6a21\u5f0f\uff09';
  }
  function startTimer() {
    timer = setTimeout(function() { end('\u5bf9\u65b9\u672a\u63a5\u542c\u6216\u8fde\u63a5\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5', true); }, 45000);
  }
  el('btnVoice').onclick = function() {
    if (callId) return;
    var s = options.state();
    if (!s.connected || !s.playing || !options.peerReady()) { voiceHint.textContent = '\u53cc\u65b9\u8fdb\u5165\u5bf9\u5c40\u540e\u624d\u80fd\u53d1\u8d77\u8bed\u97f3'; return; }
    callId = options.randomId(); incoming = false; buttons(); startTimer();
    prepare().then(function(ready) {
      if (ready) { signal('request'); voiceHint.textContent = '\u7b49\u5f85\u5bf9\u65b9\u63a5\u542c...'; }
    }).catch(fail);
  };
  el('btnVoiceAccept').onclick = function() {
    if (!incoming) return;
    incoming = false; buttons();
    prepare().then(function(ready) {
      if (ready) { signal('accept'); voiceHint.textContent = '\u6b63\u5728\u8fde\u63a5\u58f0\u97f3...'; }
    }).catch(fail);
  };
  el('btnVoiceReject').onclick = function() { signal('reject'); end('\u5df2\u62d2\u7edd\u8bed\u97f3', false); };
  el('btnVoiceHangup').onclick = function() { end('\u5df2\u6302\u65ad', true); };
  el('btnVoiceMute').onclick = function() {
    if (!stream) return;
    var track = stream.getAudioTracks()[0]; track.enabled = !track.enabled;
    this.textContent = track.enabled ? '\u9759\u97f3' : '\u53d6\u6d88\u9759\u97f3'; updateMeters();
  };
  el('btnVoicePlay').onclick = function() {
    if (!callId) return;
    try { unlock(); nextPlayback = 0; updateMeters(); } catch (err) { fail(err); }
  };
  window.addEventListener('pagehide', function() { end('', true); });
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden && callId) {
      if (context && context.state !== 'running') voiceHint.textContent = '\u56de\u5230\u9875\u9762\u540e\u8bf7\u70b9\u201c\u6062\u590d\u58f0\u97f3\u201d\u7ee7\u7eed\u901a\u8bdd';
      updateMeters();
    }
  });
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !(window.AudioContext || window.webkitAudioContext)) {
    el('voiceCompatibility').textContent = inWechat ? '\u5f53\u524d\u5fae\u4fe1\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u7f51\u9875\u5b9e\u65f6\u8bed\u97f3\uff0c\u8bf7\u70b9\u53f3\u4e0a\u89d2\u83dc\u5355\uff0c\u5728 Safari \u6216 Chrome \u6253\u5f00' : '\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u5b9e\u65f6\u5f55\u97f3\uff0c\u8bf7\u4f7f\u7528\u65b0\u7248 Safari \u6216 Chrome';
  }
  buttons();
  return {
    end: end,
    message: function(d) {
      if (d.type === 'voice_error') { end('\u5bf9\u65b9\u4e0d\u5728\u7ebf\uff0c\u8bf7\u91cd\u8fde\u540e\u91cd\u65b0\u53d1\u8d77', false); return; }
      if (d.type === 'voice_audio') { if (d.callId === callId) playFrame(d.audio); return; }
      if (d.action === 'request') {
        if (callId || !options.state().playing || d.mode !== 'relay') {
          options.send({ type: 'voice', action: 'reject', callId: d.callId });
          if (d.mode !== 'relay') voiceHint.textContent = '\u5bf9\u65b9\u4f7f\u7528\u65e7\u7248\u8bed\u97f3\uff0c\u8bf7\u53cc\u65b9\u5237\u65b0\u9875\u9762\u540e\u518d\u8bd5';
          return;
        }
        callId = d.callId; incoming = true; el('voiceDetails').open = true;
        voiceHint.textContent = '\u5bf9\u65b9\u9080\u8bf7\u8bed\u97f3\uff0c\u63a5\u542c\u540e\u4f7f\u7528\u9ea6\u514b\u98ce'; buttons(); startTimer(); return;
      }
      if (!callId || d.callId !== callId) return;
      if (d.action === 'hangup' || d.action === 'reject') { end('\u5bf9\u65b9\u5df2\u7ed3\u675f\u6216\u672a\u63a5\u542c\u8bed\u97f3', false); return; }
      if (d.action === 'relay') {
        if (!stream) return;
        clearTimeout(timer); active = true; frameIndex = 0;
        voiceHint.textContent = '\u8bed\u97f3\u901a\u9053\u5c31\u7eea\uff0c\u7b49\u5f85\u53cc\u65b9\u58f0\u97f3'; updateMeters();
      }
    }
  };
};
