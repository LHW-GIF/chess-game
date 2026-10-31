var WebSocket = require('ws');

var url = 'ws://localhost:43879';

console.log('=== 国际象棋本地测试 ===\n');

var p1 = new WebSocket(url);
var p2 = new WebSocket(url);
var room = '';

p1.on('open', function() {
  console.log('[玩家1] 已连接服务器');
});

p2.on('open', function() {
  console.log('[玩家2] 已连接服务器');
});

p1.on('message', function(data) {
  var msg = JSON.parse(data);
  console.log('[玩家1] 收到:', msg.type, JSON.stringify(msg).substr(0, 100));

  if (msg.type === 'connected') {
    p1.send(JSON.stringify({ type: 'create_room', name: '白方玩家' }));
  }

  if (msg.type === 'game_start') {
    setTimeout(function() {
      console.log('[玩家1] 走棋: e2 -> e4 (白兵前进)');
      p1.send(JSON.stringify({ type: 'move', fr: 6, fc: 4, tr: 4, tc: 4 }));
    }, 300);
  }

  if (msg.type === 'room_created') {
    room = msg.roomId;
    console.log('\n>>> 房间已创建: ' + room);
    console.log('>>> 玩家2正在加入...\n');
    p2.send(JSON.stringify({ type: 'join_room', roomId: room, name: '黑方玩家' }));
  }

  if (msg.type === 'move_made') {
    console.log('\n--- 走棋结果 ---');
    console.log('当前回合:', msg.currentTurn);
    console.log('被将军:', msg.inCheck);
    if (msg.gameOver) {
      console.log('游戏结束:', msg.result);
      console.log('赢家:', msg.winner);
    }
    console.log('---------------\n');

    if (!msg.gameOver && msg.currentTurn === 'black') {
      setTimeout(function() {
        console.log('[玩家2] 走棋: e7 -> e5 (黑兵前进)');
        p2.send(JSON.stringify({ type: 'move', fr: 1, fc: 4, tr: 3, tc: 4 }));
      }, 500);
    }
  }

  if (msg.type === 'game_over') {
    console.log('\n=== 游戏结束 ===');
    console.log('原因:', msg.reason);
    console.log('赢家:', msg.winner);
    console.log('================\n');
    p1.close();
    p2.close();
    process.exit(0);
  }
});

p2.on('message', function(data) {
  var msg = JSON.parse(data);
  console.log('[玩家2] 收到:', msg.type, JSON.stringify(msg).substr(0, 100));

  if (msg.type === 'game_start') {
    console.log('\n>>> 游戏开始!');
    console.log('>>> 我的颜色:', '黑方');
    console.log('>>> 等待白方走第一步...\n');
  }

  if (msg.type === 'move_made') {
    if (msg.move && msg.move.piece && msg.move.piece.color === 'black') {
      console.log('\n=== 测试通过：双方完成走棋 ===\n');
      p1.close();
      p2.close();
      process.exit(0);
    }
  }
});

p1.on('error', function(err) {
  console.log('[玩家1] 错误:', err.message);
});

p2.on('error', function(err) {
  console.log('[玩家2] 错误:', err.message);
});

setTimeout(function() {
  console.log('\n>>> 测试超时，强制退出');
  p1.close();
  p2.close();
  process.exit(1);
}, 10000);
