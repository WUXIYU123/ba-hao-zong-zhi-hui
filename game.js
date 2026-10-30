// 八号总指挥：公关大逃亡
// 三轨道选择型跑酷：玩家的回应会改变路线、状态，并在稍后变成回旋镖。

const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');
const system = wx.getSystemInfoSync();
const W = 750;
const H = 1334;
const GOAL_DISTANCE = 50000;
const dpr = system.pixelRatio || 1;
canvas.width = W * dpr;
canvas.height = H * dpr;
ctx.scale(dpr, dpr);

let state = 'title';
let last = Date.now();
let elapsed = 0;
let distance = 0;
let score = 0;
let trust = 68;
let heat = 25;
let sponsors = 4;
let shields = 0;
let playerLane = 1;
let targetLane = 1;
let playerX = 375;
let shake = 0;
let hitGrace = 0;
let overheatTimer = 0;
let particles = [];
let defenders = [];
let gates = [];
let boomerangs = [];
let rescueCards = [];
let commandCards = [];
let pendingQuotes = [];
let message = '';
let messageTimer = 0;
let gateCount = 0;
let boomerangHits = 0;
let best = wx.getStorageSync('bestScore') || 0;
let endingRunCount = wx.getStorageSync('endingRunCount') || 0;
let endingResult = null;
let nextGate = 420;
let nextRescue = 1280;
let nextCommand = GOAL_DISTANCE * .45;
let nextTrophy = GOAL_DISTANCE * .72;
let commandPower = 0;
let turtleTimer = 0;
let paceTimer = 0;
let paceModifier = 0;
let apologyStep = 0;
let trophy = null;
let trophySpawned = false;
let heatBand = 0;

const laneX = [170, 375, 580];
const laneNames = ['承担', '嘴硬', '甩锅'];
const laneColors = ['#46b985', '#ff9d42', '#e84855'];
const quoteLabels = ['先道歉', '绝非本意', '请看剪辑'];
const apologyLabels = ['承认', '道歉', '补救'];
const commandLabels = ['换后卫', '换队友', '全队听令'];
const colors = {
  ink: '#181622',
  muted: '#80788f',
  cream: '#fff7e8',
  orange: '#ff6b35',
  yellow: '#ffd166',
  mint: '#87e0c0',
  purple: '#6750d9',
  red: '#e84855',
  field: '#c9f0d5',
};

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function rand(a, b) { return a + Math.random() * (b - a); }
function mix(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }
function difficultyProfile(progress) {
  if (progress < .18) {
    const t = progress / .18;
    return {
      baseSpeed: mix(.72, .86, t), defenderRate: mix(.18, .38, t), maxDefenders: 1,
      doubleWaveChance: 0,
      minDistance: 1100, gateMin: 1150, gateMax: 1400, rescueMin: 980, rescueMax: 1240,
      heatRate: mix(.10, .15, t), phase: '熟悉节奏'
    };
  }
  if (progress < .45) {
    const t = (progress - .18) / .27;
    return {
      baseSpeed: mix(.86, 1.03, t), defenderRate: mix(.38, .68, t), maxDefenders: 2,
      doubleWaveChance: .08,
      minDistance: 700, gateMin: 950, gateMax: 1200, rescueMin: 1050, rescueMax: 1320,
      heatRate: mix(.15, .22, t), phase: '压力上升'
    };
  }
  if (progress < .72) {
    const t = (progress - .45) / .27;
    return {
      baseSpeed: mix(1.03, 1.34, t), defenderRate: mix(.68, 1.55, t), maxDefenders: 5,
      doubleWaveChance: mix(.18, .32, t),
      minDistance: 500, gateMin: 680, gateMax: 900, rescueMin: 1180, rescueMax: 1480,
      heatRate: mix(.22, .30, t), phase: '舆论加速'
    };
  }
  const t = (progress - .72) / .28;
  return {
    baseSpeed: mix(1.34, 1.78, t), defenderRate: mix(1.55, 2.4, t), maxDefenders: 7,
    doubleWaveChance: mix(.38, .7, t),
    minDistance: 300, gateMin: 500, gateMax: 700, rescueMin: 1280, rescueMax: 1600,
    heatRate: mix(.30, .40, t), phase: '终局冲刺'
  };
}
function phaseHint(phase, overheat) {
  if (overheat) return '热度爆表：8 秒内找补救卡或正确回应降温';
  if (phase === '熟悉节奏') return '左右滑动躲障碍 · 回应门按当前路线结算';
  if (phase === '压力上升') return '道歉门顺序：承认 → 道歉 → 补救；旧回应会返场';
  if (phase === '舆论加速') return '总指挥门：左调后卫 · 中加分 · 右升热度';
  return '双后卫封路更频繁 · 预判空道，及时换道';
}
function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fillRound(x, y, w, h, r, color) { ctx.fillStyle = color; roundRect(x, y, w, h, r); ctx.fill(); }
function strokeRound(x, y, w, h, r, color, line) { ctx.strokeStyle = color; ctx.lineWidth = line || 2; roundRect(x, y, w, h, r); ctx.stroke(); }
function text(str, x, y, size, color, align, weight) {
  ctx.font = (weight || '700') + ' ' + size + 'px Arial, sans-serif';
  ctx.fillStyle = color || colors.ink;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}
function wrap(str, x, y, maxWidth, lineHeight, size, color, weight) {
  ctx.font = (weight || '500') + ' ' + size + 'px Arial, sans-serif';
  ctx.fillStyle = color || colors.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let line = '';
  let yy = y;
  for (const ch of str) {
    const next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      yy += lineHeight;
      line = ch;
    } else line = next;
  }
  if (line) ctx.fillText(line, x, yy);
}
function addParticle(x, y, color, count) {
  for (let i = 0; i < (count || 8); i++) {
    particles.push({ x: x, y: y, vx: rand(-100, 100), vy: rand(-170, -30), life: rand(.35, .8), color: color, r: rand(3, 7) });
  }
}
function collide(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) * .42 && Math.abs(a.y - b.y) < (a.h + b.h) * .44;
}
function chooseLaneByX(x) {
  let bestLane = 0;
  let bestDist = Math.abs(x - laneX[0]);
  for (let i = 1; i < laneX.length; i++) {
    const d = Math.abs(x - laneX[i]);
    if (d < bestDist) { bestLane = i; bestDist = d; }
  }
  targetLane = bestLane;
}

function resetGame() {
  state = 'playing';
  last = Date.now();
  elapsed = 0; distance = 0; score = 0; trust = 80; heat = 14; sponsors = 5; shields = 1;
  playerLane = 1; targetLane = 1; playerX = laneX[1]; shake = 0;
  hitGrace = 0; overheatTimer = 0;
  particles = []; defenders = []; gates = []; boomerangs = []; rescueCards = []; commandCards = []; pendingQuotes = [];
  commandPower = 0; turtleTimer = 0; paceTimer = 0; paceModifier = 0; apologyStep = 0; trophy = null; trophySpawned = false; heatBand = 0;
  endingResult = null;
  message = '左右滑动换道；穿过回应门时选路线。';
  messageTimer = 4.2; gateCount = 0; boomerangHits = 0; nextGate = 900; nextRescue = 760; nextCommand = GOAL_DISTANCE * .45; nextTrophy = GOAL_DISTANCE * .72;
}

function spawnDefender(profile) {
  const firstLane = Math.floor(Math.random() * 3);
  const lanes = [firstLane];
  if (profile.doubleWaveChance > 0 && Math.random() < profile.doubleWaveChance) {
    const openLanes = [0, 1, 2].filter(lane => lane !== firstLane);
    lanes.push(openLanes[Math.floor(Math.random() * openLanes.length)]);
  }
  for (const lane of lanes) {
    if (defenders.length >= profile.maxDefenders) break;
    defenders.push({
      lane: lane, x: laneX[lane], y: -90,
      w: 68 + mix(0, 16, distance / GOAL_DISTANCE),
      h: 92 + mix(0, 14, distance / GOAL_DISTANCE),
      speed: rand(245, 330) + mix(0, 190, distance / GOAL_DISTANCE),
      hue: Math.random() > .5 ? colors.purple : colors.red
    });
  }
}
function spawnGate(profile) {
  const progress = clamp(distance / GOAL_DISTANCE, 0, 1);
  const type = progress < .18 ? 'interview' : progress < .45 ? 'apology' : 'command';
  gates.push({ y: -120, w: 178, h: 92, speed: 230 + mix(0, 220, distance / GOAL_DISTANCE), id: gateCount++, type: type });
}
function spawnBoomerang(item) {
  boomerangs.push({
    lane: item.lane,
    x: laneX[item.lane],
    y: -75,
    w: 170,
    h: 58,
    speed: rand(270, 340) + mix(0, 180, distance / GOAL_DISTANCE),
    phase: rand(0, Math.PI * 2),
    label: item.label,
    risk: item.risk,
  });
}
function spawnRescue() {
  const lane = Math.floor(Math.random() * 3);
  const kind = Math.random() < .34 ? 'turtle' : 'rescue';
  rescueCards.push({ lane: lane, x: laneX[lane], y: -55, w: 105, h: 52, speed: rand(205, 245), spin: rand(0, Math.PI * 2), kind: kind });
}
function spawnCommand() {
  const lane = Math.floor(Math.random() * 3);
  commandCards.push({ lane: lane, x: laneX[lane], y: -55, w: 116, h: 52, speed: rand(215, 255), spin: rand(0, Math.PI * 2) });
}
function spawnTrophy() {
  trophy = { lane: 1, x: laneX[1], y: -80, w: 92, h: 74, speed: 250, phase: rand(0, Math.PI * 2) };
}
function applyChoice(lane, type) {
  const labels = type === 'apology' ? apologyLabels : type === 'command' ? commandLabels : quoteLabels;
  if (type === 'apology') {
    const right = lane === apologyStep;
    if (right) {
      trust = clamp(trust + 10, 0, 100); heat = clamp(heat - 12, 0, 100); score += 150; apologyStep = (apologyStep + 1) % 3;
      message = '道歉三连：' + labels[lane] + ' ✓';
    } else {
      trust = Math.max(0, trust - 6); heat = clamp(heat + 14, 0, 100); score = Math.max(0, score - 80);
      message = '顺序错了：先别急着说“绝非本意”，现在需要“' + labels[apologyStep] + '”。';
    }
    messageTimer = 2.1;
    addParticle(laneX[lane], 1010, laneColors[lane], 12);
    return;
  }
  if (type === 'command') {
    if (lane === 0) { commandPower = Math.min(3, commandPower + 1); heat = clamp(heat + 7, 0, 100); message = '总指挥牌：后卫换道权限 +1。'; }
    if (lane === 1) { commandPower = Math.min(3, commandPower + 1); score += 180; message = '总指挥牌：全队听令，分数 +180。'; }
    if (lane === 2) { commandPower = Math.min(3, commandPower + 2); heat = clamp(heat + 16, 0, 100); message = '总指挥牌：命令很响，热度也涨了。'; }
    pendingQuotes.push({ spawnAt: distance + (lane === 2 ? 330 : 500), lane: lane, label: labels[lane], risk: lane === 2 ? 1.45 : .85 });
    messageTimer = 2.1; addParticle(laneX[lane], 1010, laneColors[lane], 12); return;
  }
  const effects = [
    { trust: 12, heat: -10, sponsor: 0, boost: -.08, risk: .3, delay: 780 },
    { trust: -2, heat: 5, sponsor: 0, boost: .1, risk: .55, delay: 760 },
    { trust: -3, heat: 8, sponsor: 0, boost: .06, risk: .82, delay: 680 },
  ];
  const e = effects[lane];
  trust = clamp(trust + e.trust, 0, 100);
  heat = clamp(heat + e.heat, 0, 100);
  sponsors = clamp(sponsors + e.sponsor, 0, 5);
  paceModifier = e.boost;
  paceTimer = 2.6;
  score += lane === 1 ? 100 : lane === 0 ? 80 : 130;
  pendingQuotes.push({ spawnAt: distance + e.delay, lane: lane, label: labels[lane], risk: e.risk });
  message = labels[lane] + '：' + (e.boost > 0 ? '赛道提速' : '赛道放缓') + '，回旋镖 ' + Math.round(e.delay) + ' 米后回来。';
  messageTimer = 2.1;
  addParticle(laneX[lane], 1010, laneColors[lane], 12);
}

function update(dt) {
  // 结束界面仍继续消化震动计时，避免最后一次碰撞震动卡住。
  if (shake > 0) shake = Math.max(0, shake - dt);
  if (state !== 'playing') return;
  elapsed += dt;
  const progress = clamp(distance / GOAL_DISTANCE, 0, 1);
  const profile = difficultyProfile(progress);
  if (paceTimer > 0) paceTimer = Math.max(0, paceTimer - dt);
  if (hitGrace > 0) hitGrace = Math.max(0, hitGrace - dt);
  const baseSpeed = profile.baseSpeed * (paceTimer > 0 ? 1 + paceModifier : 1);
  const player = { x: playerX, y: 1040, w: 54, h: 84 };
  if (turtleTimer > 0) turtleTimer = Math.max(0, turtleTimer - dt);
  playerX += (laneX[targetLane] - playerX) * Math.min(1, dt * (turtleTimer > 0 ? 6.5 : 12));
  if (Math.abs(playerX - laneX[targetLane]) < 4) playerLane = targetLane;

  if (distance > profile.minDistance && defenders.length < profile.maxDefenders && Math.random() < dt * profile.defenderRate) spawnDefender(profile);
  if (distance >= nextGate) { spawnGate(profile); nextGate += rand(profile.gateMin, profile.gateMax); }
  if (distance >= nextRescue) { spawnRescue(); nextRescue += rand(profile.rescueMin, profile.rescueMax); }
  if (distance >= nextCommand) { spawnCommand(); nextCommand += 2650 + rand(550, 950); }
  if (distance >= nextTrophy && !trophy && !trophySpawned) {
    spawnTrophy();
    trophySpawned = true;
  }
  for (let i = pendingQuotes.length - 1; i >= 0; i--) {
    if (distance >= pendingQuotes[i].spawnAt) {
      spawnBoomerang(pendingQuotes[i]);
      pendingQuotes.splice(i, 1);
    }
  }

  defenders.forEach(d => { d.y += d.speed * baseSpeed * dt; });
  gates.forEach(g => { g.y += g.speed * baseSpeed * dt; });
  boomerangs.forEach(b => {
    b.y += b.speed * baseSpeed * dt;
    b.x = laneX[b.lane] + Math.sin(elapsed * 6 + b.phase) * 10;
  });
  rescueCards.forEach(r => { r.y += r.speed * baseSpeed * dt; r.spin += dt * 5; });
  commandCards.forEach(c => { c.y += c.speed * baseSpeed * dt; c.spin += dt * 5; });
  if (trophy) {
    trophy.y += trophy.speed * baseSpeed * dt;
    trophy.x = laneX[trophy.lane] + Math.sin(elapsed * 4 + trophy.phase) * 55;
  }
  defenders = defenders.filter(d => d.y < H + 120);
  gates = gates.filter(g => g.y < H + 120);
  boomerangs = boomerangs.filter(b => b.y < H + 120);
  rescueCards = rescueCards.filter(r => r.y < H + 120);
  commandCards = commandCards.filter(c => c.y < H + 120);
  if (trophy && trophy.y > H + 120) trophy = null;

  for (const g of gates) {
    if (g.y > 945 && g.y < 1095 && !g.used) {
      g.used = true;
      applyChoice(targetLane, g.type);
    }
  }
  for (const d of defenders) {
    if (collide(player, { x: d.x, y: d.y, w: d.w, h: d.h }) && d.y > 950) {
      d.y = H + 200;
      if (hitGrace > 0) continue;
      hitGrace = .85;
      if (commandPower > 0) {
        commandPower -= 1; score += 70;
        message = '总指挥牌生效：后卫被调走。'; messageTimer = 1.5;
        addParticle(playerX, 1030, colors.yellow, 12);
        continue;
      }
      const lateImpact = progress >= .72;
      score = Math.max(0, score - 90); trust = Math.max(0, trust - (lateImpact ? 3 : 2)); heat = clamp(heat + (lateImpact ? 9 : 7), 0, 100);
      addParticle(playerX, 1030, colors.red, 12); shake = .24;
      message = '后卫拦截：路线判断失误。'; messageTimer = 1.5;
    }
  }
  for (const b of boomerangs) {
    if (collide(player, { x: b.x, y: b.y, w: b.w, h: b.h }) && b.y > 950) {
      b.y = H + 200;
      if (hitGrace > 0) continue;
      hitGrace = .7; boomerangHits += 1; shake = .32;
      if (shields > 0) {
        shields -= 1; score += 80; addParticle(playerX, 1030, colors.mint, 14);
        message = '补救护盾挡住了“' + b.label + '”。'; messageTimer = 1.6;
      } else {
        trust = Math.max(0, trust - Math.round(6 * b.risk)); heat = clamp(heat + 6, 0, 100);
        sponsors = Math.max(0, sponsors - (b.risk > 1.18 ? 1 : 0)); score = Math.max(0, score - 120);
        addParticle(playerX, 1030, colors.orange, 14);
        message = '“' + b.label + '”回来了！'; messageTimer = 1.8;
      }
    }
  }
  for (const r of rescueCards) {
    if (collide(player, { x: r.x, y: r.y, w: r.w, h: r.h }) && r.y > 950) {
      r.y = H + 200;
      if (r.kind === 'turtle') {
        turtleTimer = 3.2; shields = Math.min(3, shields + 1); score += 120;
        addParticle(r.x, r.y, colors.yellow, 12); message = '龟壳模式：缩壳避镜头，护盾 +1，但转向变慢。';
      } else {
        trust = clamp(trust + 7, 0, 100); heat = clamp(heat - 9, 0, 100); shields = Math.min(3, shields + 1); score += 180;
        addParticle(r.x, r.y, colors.mint, 12); message = '补救卡：护盾 +1，热度下降。';
      }
      messageTimer = 1.7;
    }
  }
  for (const c of commandCards) {
    if (collide(player, { x: c.x, y: c.y, w: c.w, h: c.h }) && c.y > 950) {
      c.y = H + 200; commandPower = Math.min(3, commandPower + 1); score += 140; heat = clamp(heat + 4, 0, 100);
      addParticle(c.x, c.y, colors.yellow, 12); message = '总指挥牌：可以调走一名后卫。'; messageTimer = 1.7;
    }
  }
  if (trophy && collide(player, { x: trophy.x, y: trophy.y, w: trophy.w, h: trophy.h }) && trophy.y > 930) {
    trophy = null; score += 650; trust = clamp(trust + 8, 0, 100); heat = clamp(heat - 15, 0, 100);
    addParticle(playerX, 1030, colors.yellow, 18); message = '奖杯抓到了：热度下降，分数暴涨！'; messageTimer = 2;
  }

  distance += dt * 190 * baseSpeed * (heat > 84 ? .76 : heat > 68 ? .9 : 1);
  score += dt * (15 + baseSpeed * 9);
  heat = clamp(heat + dt * profile.heatRate, 0, 100);
  const newBand = heat >= 88 ? 3 : heat >= 72 ? 2 : heat >= 52 ? 1 : 0;
  while (heatBand < newBand) {
    heatBand += 1;
    sponsors = Math.max(0, sponsors - 1);
    message = heatBand === 1 ? '品牌开始撤退：第一张赞助贴纸掉了。' : heatBand === 2 ? '品牌切割加速：又一张贴纸被撕掉。' : '公关红灯：赞助只剩最后一张，失误可能直接出局。';
    messageTimer = 2;
  }
  if (heat >= 100) {
    if (overheatTimer === 0) { message = '热度爆表：8 秒内收集补救卡或正确回应来降温！'; messageTimer = 3; }
    overheatTimer += dt;
  } else overheatTimer = 0;
  if (distance >= GOAL_DISTANCE || trust <= 0 || sponsors <= 0 || overheatTimer >= 8) finishGame();
  if (messageTimer > 0) messageTimer -= dt;
  particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 360 * dt; p.life -= dt; });
  particles = particles.filter(p => p.life > 0);
}

function finishGame() {
  state = 'result';
  score = Math.round(score);
  if (score > best) { best = score; wx.setStorageSync('bestScore', best); }
  endingRunCount += 1;
  wx.setStorageSync('endingRunCount', endingRunCount);
  endingResult = getEnding();
}

function drawShadow(x, y, w, h, color) {
  ctx.save(); ctx.fillStyle = color || 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function drawStamp(label, x, y, color, angle, size) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle || -.08);
  strokeRound(-(size || 74), -20, (size || 74) * 2, 40, 8, color, 4);
  text(label, 0, 1, 17, color, 'center', '900'); ctx.restore();
}
function drawStarburst(x, y, r, color, rays) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color;
  ctx.beginPath();
  const count = rays || 12;
  for (let i = 0; i < count * 2; i++) {
    const a = i * Math.PI / count; const rr = i % 2 ? r * .62 : r;
    const px = Math.cos(a) * rr; const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawArrow(x1, y1, x2, y2, color, width) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width || 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 18 * Math.cos(a - .45), y2 - 18 * Math.sin(a - .45)); ctx.lineTo(x2 - 18 * Math.cos(a + .45), y2 - 18 * Math.sin(a + .45)); ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawRibbon(label, x, y, w, color, angle) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle || 0);
  fillRound(-w / 2, -22, w, 44, 7, color); text(label, 0, 1, 18, '#111021', 'center', '900'); ctx.restore();
}
function drawBackground() {
  ctx.fillStyle = '#111021'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1b1732'; ctx.fillRect(0, 230, W, H - 230);
  // 霓虹球场与热搜流水线
  ctx.fillStyle = 'rgba(122,92,255,.18)'; ctx.beginPath(); ctx.arc(640, 330, 230, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,94,87,.15)'; ctx.beginPath(); ctx.arc(80, 1060, 250, 0, Math.PI * 2); ctx.fill();
  const stripe = (distance * .42) % 170;
  for (let y = 230 - stripe; y < H; y += 170) {
    ctx.fillStyle = y % 340 < 170 ? '#1f1a3b' : '#191630'; ctx.fillRect(0, y, W, 85);
  }
  ctx.strokeStyle = 'rgba(97,215,255,.55)'; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(66, 230); ctx.lineTo(66, H); ctx.moveTo(284, 230); ctx.lineTo(284, H);
  ctx.moveTo(466, 230); ctx.lineTo(466, H); ctx.moveTo(W - 66, 230); ctx.lineTo(W - 66, H); ctx.stroke();
  ctx.strokeStyle = 'rgba(199,243,107,.45)'; ctx.lineWidth = 3; ctx.setLineDash([18, 22]);
  ctx.beginPath(); ctx.moveTo(170, 230); ctx.lineTo(170, H); ctx.moveTo(375, 230); ctx.lineTo(375, H); ctx.moveTo(580, 230); ctx.lineTo(580, H); ctx.stroke(); ctx.setLineDash([]);
  for (let i = 0; i < 8; i++) {
    const yy = 300 + ((i * 180 + distance * .6) % 900);
    drawRibbon(i % 2 ? '声明' : '热搜', i % 2 ? 48 : 702, yy, 92, i % 2 ? '#C7F36B' : '#61D7FF', i % 2 ? -.08 : .08);
  }
}

function drawBar(label, value, x, y, w, color) {
  text(label, x, y, 16, '#FFF4D6', 'left', '800');
  fillRound(x + 46, y - 10, w, 18, 9, 'rgba(255,244,214,.16)');
  fillRound(x + 46, y - 10, w * clamp(value / 100, 0, 1), 18, 9, color);
  strokeRound(x + 46, y - 10, w, 18, 9, 'rgba(255,244,214,.35)', 2);
}
function drawHeader() {
  ctx.fillStyle = 'rgba(17,16,33,.94)'; ctx.fillRect(0, 0, W, 230);
  ctx.fillStyle = '#C7F36B'; ctx.fillRect(0, 0, 12, 230);
  text('M8 / PR · 高压舆论', 38, 38, 16, '#61D7FF', 'left', '900');
  text('八号总指挥：公关大逃亡', 38, 67, 25, '#FFF4D6', 'left', '900');
  const progress = clamp(distance / GOAL_DISTANCE, 0, 1);
  const phase = difficultyProfile(progress);
  const phaseStamp = heat >= 88 ? '全员撤退' : heat >= 72 ? '战术转移' : heat >= 52 ? '品牌观察' : phase.phase;
  drawStamp(phaseStamp, 645, 48, heat >= 72 ? '#FF5E57' : progress >= .45 ? '#C7F36B' : '#FF5E57', .06, 62);
  text('距离 ' + Math.round(distance) + 'm / ' + GOAL_DISTANCE + 'm', 38, 103, 17, '#A9A2C4', 'left', '700');
  text('分数 ' + Math.round(score), W - 38, 103, 17, '#FFF4D6', 'right', '900');
  drawBar('口碑', trust, 38, 145, 205, trust > 45 ? '#C7F36B' : '#FF5E57');
  drawBar('热度', heat, 386, 145, 205, heat < 55 ? '#61D7FF' : '#FF5E57');
  text('赞助', 38, 191, 15, '#A9A2C4', 'left', '800');
  for (let i = 0; i < 5; i++) {
    fillRound(90 + i * 31, 178, 24, 23, 6, i < sponsors ? '#FFB84D' : 'rgba(255,244,214,.12)');
    text('★', 102 + i * 31, 190, 14, i < sponsors ? '#111021' : '#6f6887', 'center', '900');
  }
  fillRound(386, 176, 108, 28, 10, 'rgba(122,92,255,.35)'); text('命令 ×' + commandPower, 440, 190, 15, '#FFF4D6', 'center', '800');
  const status = overheatTimer > 0 ? '冷却 ' + Math.max(0, 8 - overheatTimer).toFixed(1) : turtleTimer > 0 ? '龟壳 ' + turtleTimer.toFixed(1) : paceTimer > 0 ? '节奏 ' + paceTimer.toFixed(1) : '护盾 ×' + shields;
  const statusColor = overheatTimer > 0 ? '#FF5E57' : turtleTimer > 0 ? '#C7F36B' : paceTimer > 0 ? '#FFB84D' : '#FFF4D6';
  fillRound(505, 176, 102, 28, 10, overheatTimer > 0 ? 'rgba(255,94,87,.3)' : paceTimer > 0 ? 'rgba(255,184,77,.28)' : turtleTimer > 0 ? 'rgba(199,243,107,.35)' : 'rgba(255,244,214,.1)'); text(status, 556, 190, 15, statusColor, 'center', '800');
  text(phaseHint(phase.phase, overheatTimer > 0), W / 2, 218, 13, overheatTimer > 0 ? '#FFB84D' : '#A9A2C4', 'center', '700');
}
function drawPlayer() {
  const y = 1040;
  drawShadow(playerX + 5, y + 61, 57, 14, 'rgba(0,0,0,.38)');
  // 速度纸带
  const statusLabel = turtleTimer > 0 ? '龟壳防御中' : paceTimer > 0 ? paceModifier > 0 ? '舆论节奏加快' : '舆论节奏放缓' : '声明正在生成…';
  drawRibbon(statusLabel, playerX - 4, y + 88, statusLabel.length > 8 ? 195 : 150, turtleTimer > 0 ? '#C7F36B' : paceTimer > 0 ? '#FFB84D' : '#61D7FF', -.08);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // A compact, forward-leaning striker silhouette keeps the character readable at lane scale.
  ctx.strokeStyle = '#111021'; ctx.lineWidth = 22;
  ctx.beginPath(); ctx.moveTo(playerX - 22, y - 28); ctx.lineTo(playerX - 39, y - 14); ctx.lineTo(playerX - 52, y - 20); ctx.stroke();
  ctx.strokeStyle = '#FFB98C'; ctx.lineWidth = 13;
  ctx.beginPath(); ctx.moveTo(playerX - 22, y - 28); ctx.lineTo(playerX - 39, y - 14); ctx.lineTo(playerX - 52, y - 20); ctx.stroke();
  ctx.strokeStyle = '#111021'; ctx.lineWidth = 22;
  ctx.beginPath(); ctx.moveTo(playerX + 21, y - 31); ctx.lineTo(playerX + 34, y - 20); ctx.lineTo(playerX + 43, y - 37); ctx.stroke();
  ctx.strokeStyle = '#FFB98C'; ctx.lineWidth = 13;
  ctx.beginPath(); ctx.moveTo(playerX + 21, y - 31); ctx.lineTo(playerX + 34, y - 20); ctx.lineTo(playerX + 43, y - 37); ctx.stroke();

  // Split stride: one leg plants while the other kicks back.
  ctx.strokeStyle = '#111021'; ctx.lineWidth = 27;
  ctx.beginPath(); ctx.moveTo(playerX - 10, y + 20); ctx.lineTo(playerX - 22, y + 51); ctx.lineTo(playerX - 49, y + 66); ctx.stroke();
  ctx.strokeStyle = '#FFF4D6'; ctx.lineWidth = 17;
  ctx.beginPath(); ctx.moveTo(playerX - 10, y + 20); ctx.lineTo(playerX - 22, y + 51); ctx.lineTo(playerX - 49, y + 66); ctx.stroke();
  ctx.strokeStyle = '#111021'; ctx.lineWidth = 26;
  ctx.beginPath(); ctx.moveTo(playerX + 10, y + 20); ctx.lineTo(playerX + 28, y + 46); ctx.lineTo(playerX + 46, y + 61); ctx.stroke();
  ctx.strokeStyle = '#FFF4D6'; ctx.lineWidth = 16;
  ctx.beginPath(); ctx.moveTo(playerX + 10, y + 20); ctx.lineTo(playerX + 28, y + 46); ctx.lineTo(playerX + 46, y + 61); ctx.stroke();

  // Angular jersey, tipped forward like a runner breaking out of the frame.
  ctx.fillStyle = '#111021'; ctx.beginPath();
  ctx.moveTo(playerX - 29, y - 47); ctx.lineTo(playerX + 25, y - 55); ctx.lineTo(playerX + 38, y + 17);
  ctx.lineTo(playerX + 4, y + 31); ctx.lineTo(playerX - 34, y + 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#FF6338'; ctx.beginPath();
  ctx.moveTo(playerX - 24, y - 43); ctx.lineTo(playerX + 21, y - 50); ctx.lineTo(playerX + 31, y + 13);
  ctx.lineTo(playerX + 3, y + 24); ctx.lineTo(playerX - 27, y + 7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#61D7FF'; ctx.fillRect(playerX - 16, y - 37, 7, 44);
  ctx.fillStyle = '#FFF4D6'; ctx.fillRect(playerX - 5, y - 39, 7, 44);
  ctx.fillStyle = '#FF5E57'; ctx.fillRect(playerX + 6, y - 41, 7, 44);
  text('8', playerX + 6, y - 7, 27, '#FFF4D6', 'center', '900');

  // Abstract face and sharp close-cropped hair; no portrait-specific facial details.
  ctx.fillStyle = '#111021'; ctx.beginPath();
  ctx.moveTo(playerX - 28, y - 75); ctx.lineTo(playerX - 21, y - 102); ctx.lineTo(playerX - 7, y - 94);
  ctx.lineTo(playerX + 3, y - 104); ctx.lineTo(playerX + 14, y - 92); ctx.lineTo(playerX + 27, y - 96);
  ctx.lineTo(playerX + 33, y - 75); ctx.lineTo(playerX + 25, y - 49); ctx.lineTo(playerX + 4, y - 38);
  ctx.lineTo(playerX - 18, y - 47); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#FFB98C'; ctx.beginPath();
  ctx.moveTo(playerX - 21, y - 76); ctx.lineTo(playerX - 12, y - 92); ctx.lineTo(playerX - 3, y - 85);
  ctx.lineTo(playerX + 7, y - 95); ctx.lineTo(playerX + 17, y - 82); ctx.lineTo(playerX + 25, y - 85);
  ctx.lineTo(playerX + 26, y - 69); ctx.lineTo(playerX + 19, y - 50); ctx.lineTo(playerX + 3, y - 43);
  ctx.lineTo(playerX - 13, y - 50); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#111021'; ctx.beginPath();
  ctx.moveTo(playerX - 16, y - 76); ctx.lineTo(playerX - 4, y - 78); ctx.lineTo(playerX - 10, y - 72); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#111021'; ctx.beginPath();
  ctx.moveTo(playerX + 3, y - 78); ctx.lineTo(playerX + 17, y - 75); ctx.lineTo(playerX + 8, y - 71); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#111021'; ctx.beginPath();
  ctx.moveTo(playerX + 4, y - 61); ctx.lineTo(playerX + 21, y - 57); ctx.lineTo(playerX + 12, y - 52); ctx.closePath(); ctx.fill();

  // A press mic and oversized boots tie the silhouette back to the game's gag.
  ctx.strokeStyle = '#61D7FF'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(playerX - 25, y - 65, 16, 2.2, 4.7); ctx.stroke();
  ctx.save(); ctx.translate(playerX + 47, y - 43); ctx.rotate(.25);
  fillRound(-7, -21, 14, 29, 6, '#7A5CFF'); strokeRound(-7, -21, 14, 29, 6, '#111021', 3);
  ctx.fillStyle = '#FFF4D6'; ctx.beginPath(); ctx.arc(0, -25, 9, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#111021'; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.translate(playerX + 58, y + 67); ctx.rotate(.22);
  fillRound(-20, -11, 42, 22, 10, '#FFF4D6'); strokeRound(-20, -11, 42, 22, 10, '#111021', 4);
  ctx.fillStyle = '#C7F36B'; ctx.fillRect(-10, -9, 5, 18); ctx.fillRect(0, -9, 5, 18);
  ctx.restore();
  ctx.save(); ctx.translate(playerX - 61, y + 70); ctx.rotate(-.34);
  fillRound(-18, -9, 36, 18, 9, '#FFF4D6'); strokeRound(-18, -9, 36, 18, 9, '#111021', 4);
  ctx.fillStyle = '#61D7FF'; ctx.fillRect(-9, -7, 5, 14); ctx.fillRect(1, -7, 5, 14);
  ctx.restore();
  if (turtleTimer > 0) {
    ctx.strokeStyle = '#C7F36B'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(playerX, y - 67, 49, 0, Math.PI * 2); ctx.stroke();
    text('龟', playerX + 4, y - 7, 18, '#111021', 'center', '900');
  }
}
function drawDefender(d) {
  drawShadow(d.x, d.y + 48, 38, 10, 'rgba(0,0,0,.3)');
  fillRound(d.x - d.w / 2, d.y - d.h / 2, d.w, d.h, 12, '#2D2050');
  strokeRound(d.x - d.w / 2, d.y - d.h / 2, d.w, d.h, 12, '#111021', 5);
  ctx.fillStyle = '#111021'; ctx.beginPath(); ctx.arc(d.x, d.y - 42, 25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FF5E57'; ctx.beginPath(); ctx.arc(d.x - 8, d.y - 45, 4, 0, Math.PI * 2); ctx.arc(d.x + 9, d.y - 45, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#7A5CFF'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(d.x - 18, d.y + 28); ctx.lineTo(d.x - 34, d.y + 52); ctx.moveTo(d.x + 18, d.y + 28); ctx.lineTo(d.x + 34, d.y + 52); ctx.stroke();
  drawStamp('拦', d.x, d.y - 83, '#FF5E57', -.1, 26);
}
function drawGate(g) {
  const labels = g.type === 'apology' ? apologyLabels : g.type === 'command' ? commandLabels : quoteLabels;
  const active = g.type === 'apology' ? apologyStep : -1;
  for (let i = 0; i < 3; i++) {
    const x = laneX[i] - g.w / 2;
    const fill = g.type === 'command' ? (i === 0 ? colors.purple : i === 1 ? colors.orange : colors.red) : laneColors[i];
    ctx.save(); ctx.translate(x + g.w / 2, g.y); ctx.rotate((i - 1) * .035);
    fillRound(-g.w / 2, -g.h / 2, g.w, g.h, 10, fill);
    strokeRound(-g.w / 2, -g.h / 2, g.w, g.h, 10, i === active ? '#C7F36B' : '#FFF4D6', i === active ? 7 : 3);
    ctx.fillStyle = 'rgba(17,16,33,.22)'; ctx.fillRect(-g.w / 2 + 14, -g.h / 2 + 8, 5, g.h - 16);
    text(labels[i], 0, -10, 22, '#fff', 'center', '800');
    const sub = g.type === 'apology' ? (i === active ? '当前需要' : '顺序错了会升温') : g.type === 'command' ? (i === 0 ? '调走后卫' : i === 1 ? '积分↑' : '热度↑') : (i === 0 ? '口碑↑' : i === 1 ? '速度↑' : '热度↑');
    text(sub, 0, 22, 14, '#fff', 'center', '600');
    if (i === active) { drawStarburst(0, -g.h / 2 - 22, 18 + Math.sin(elapsed * 8) * 3, '#C7F36B', 10); text('✓', 0, -g.h / 2 - 22, 18, '#111021', 'center', '900'); }
    ctx.restore();
  }
  text(g.type === 'apology' ? '道歉三连 ' + (apologyStep + 1) + '/3' : g.type === 'command' ? '总指挥模式' : '采访回应门', W / 2, g.y - 67, 16, '#FFF4D6', 'center', '900');
}
function drawBoomerang(b) {
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.sin(elapsed * 7 + b.phase) * .12);
  const color = b.risk < .5 ? colors.mint : b.risk > 1 ? colors.red : '#ffcfbd';
  drawShadow(0, 31, 72, 7, 'rgba(0,0,0,.24)');
  fillRound(-b.w / 2, -b.h / 2, b.w, b.h, 12, color);
  strokeRound(-b.w / 2, -b.h / 2, b.w, b.h, 12, '#111021', 4);
  ctx.fillStyle = 'rgba(17,16,33,.16)'; ctx.beginPath(); ctx.moveTo(-b.w / 2, -b.h / 2); ctx.lineTo(-b.w / 2 + 22, -b.h / 2); ctx.lineTo(-b.w / 2, -b.h / 2 + 20); ctx.closePath(); ctx.fill();
  drawArrow(-b.w / 2 - 42, 0, -b.w / 2 - 7, 0, '#FF5E57', 5);
  text('回来了', -b.w / 2 + 15, -13, 14, '#111021', 'left', '900');
  text('“' + b.label + '”', 0, 12, 18, '#111021', 'center', '900');
  ctx.restore();
}
function drawRescueCard(r) {
  ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(Math.sin(r.spin) * .12);
  fillRound(-r.w / 2, -r.h / 2, r.w, r.h, 14, r.kind === 'turtle' ? colors.yellow : colors.mint);
  strokeRound(-r.w / 2, -r.h / 2, r.w, r.h, 14, '#111021', 4);
  if (r.kind === 'turtle') { ctx.strokeStyle = '#111021'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke(); }
  text(r.kind === 'turtle' ? '龟壳' : '补救卡', 0, 0, 19, '#111021', 'center', '900');
  ctx.restore();
}
function drawCommandCard(c) {
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(Math.sin(c.spin) * .12);
  drawStarburst(0, 0, 58, '#7A5CFF', 12);
  fillRound(-c.w / 2, -c.h / 2, c.w, c.h, 12, '#7A5CFF');
  strokeRound(-c.w / 2, -c.h / 2, c.w, c.h, 12, '#C7F36B', 4);
  text('总指挥牌', 0, 0, 18, '#FFF4D6', 'center', '900');
  ctx.restore();
}
function drawTrophy(t) {
  ctx.save(); ctx.translate(t.x, t.y);
  drawStarburst(0, 0, 60, 'rgba(255,184,77,.34)', 14);
  fillRound(-t.w / 2, -t.h / 2, t.w, t.h, 18, '#FFB84D');
  strokeRound(-t.w / 2, -t.h / 2, t.w, t.h, 18, '#111021', 4);
  text('奖杯', 0, -6, 22, '#111021', 'center', '900');
  text('追它！', 0, 25, 13, '#111021', 'center', '900');
  drawArrow(-62, 37, -28, 37, '#FF5E57', 4);
  ctx.restore();
}
function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  });
}
function drawPlaying() {
  drawBackground(); drawHeader();
  defenders.forEach(drawDefender); gates.forEach(drawGate); boomerangs.forEach(drawBoomerang); rescueCards.forEach(drawRescueCard); commandCards.forEach(drawCommandCard); if (trophy) drawTrophy(trophy);
  drawPlayer(); drawParticles();
  if (messageTimer > 0) {
    drawRibbon(message, W / 2, 246, 565, '#FFF4D6', Math.sin(elapsed * 3) * .015);
  }
  fillRound(94, H - 66, 562, 34, 16, 'rgba(17,16,33,.74)');
  text('滑动：躲障碍', 190, H - 49, 16, '#C7F36B', 'center', '900');
  text('回应门：当前路线', 375, H - 49, 16, '#61D7FF', 'center', '900');
  text('补救卡：降热+护盾', 560, H - 49, 16, '#FFB84D', 'center', '900');
}
function drawTitle() {
  ctx.fillStyle = '#111021'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(122,92,255,.35)'; ctx.beginPath(); ctx.arc(630, 180, 265, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,94,87,.35)'; ctx.beginPath(); ctx.arc(55, 1180, 230, 0, Math.PI * 2); ctx.fill();
  drawStamp('LIVE', 106, 112, '#FF5E57', -.12, 40);
  drawStamp('热搜', 646, 338, '#C7F36B', .12, 42);
  text('8', 51, 204, 128, '#C7F36B', 'left', '900');
  text('总指挥', 164, 230, 58, '#FFF4D6', 'left', '900');
  text('公关大逃亡', 56, 319, 52, '#FF6338', 'left', '900');
  wrap('梗图一秒出圈，解释分工全队加班。龟壳护盾、道歉三连和赞助撤退都在这场公关跑酷里。', 58, 385, 590, 35, 22, '#FFF4D6', '700');
  fillRound(56, 545, 638, 400, 24, '#FFF4D6');
  strokeRound(56, 545, 638, 400, 24, '#C7F36B', 5);
  text('操作与规则', W / 2, 579, 21, '#111021', 'center', '900');
  for (let i = 0; i < 3; i++) {
    fillRound(80 + i * 205, 620, 180, 88, 16, laneColors[i]);
    strokeRound(80 + i * 205, 620, 180, 88, 16, '#111021', 4);
    text(laneNames[i], 170 + i * 205, 652, 24, '#FFF4D6', 'center', '900');
    text(i === 0 ? '稳口碑·降热' : i === 1 ? '加速·留回旋镖' : '高分·升热度', 170 + i * 205, 686, 15, '#111021', 'center', '900');
  }
  text('左右滑动换道；回应门经过角色时，结算当前所在路线', W / 2, 741, 15, '#111021', 'center', '800');
  text('回应会变成回旋镖；躲后卫和回旋镖，捡补救卡得盾降热', W / 2, 774, 15, '#3A3356', 'center', '800');
  text('采访 0–18%  →  道歉三连 18–45%  →  总指挥 45%+', W / 2, 807, 15, '#3A3356', 'center', '800');
  text('目标：跑完 50,000 米', W / 2, 866, 18, '#111021', 'center', '900');
  text('口碑或赞助归零即结束；热度满格后有 8 秒处理时间', W / 2, 896, 15, '#3A3356', 'center', '800');
  text('补救卡：护盾 + 降热   ·   龟壳：护盾 + 转向变慢', W / 2, 926, 15, '#3A3356', 'center', '700');
  fillRound(56, 967, 638, 94, 22, '#FF6338'); strokeRound(56, 967, 638, 94, 22, '#111021', 5); text('开始舆论攻防', W / 2, 1014, 30, '#FFF4D6', 'center', '900');
  text('最高分 ' + best, W / 2, 1120, 20, '#A9A2C4', 'center', '800');
  text('原创抽象角色 · 软胶贴纸美术 · 无真人素材', W / 2, 1255, 16, '#A9A2C4', 'center', '600');
}
function getEnding() {
  const pick = (lines, salt) => lines[(endingRunCount + salt) % lines.length];
  if (heat >= 100) return {
    stamp: '公关总撤退', color: '#FF5E57', title: '现场清空，责任还在。',
    line: pick([
      '自己抛梗三秒，公关组补锅到天亮。',
      '笑点刚出圈，团队已经开始写道歉。',
      '本人负责发笑，全队负责收拾现场。',
    ], boomerangHits),
    tags: ['热度：过载', '撤退：迅速', '责任：留守']
  };
  if (sponsors <= 0) return {
    stamp: '赞助撤离', color: '#FFB84D', title: '贴纸比公关稿先跑路。',
    line: pick([
      '一句“绝非本意”，赞助商按下“到此为止”。',
      '梗图主角是你，合同主角变成删除键。',
      '代言照还没撤完，声明已说合作愉快。',
    ], Math.floor(distance / 1000)),
    tags: ['赞助：已撤', '声明：在路上', '公关：失联中']
  };
  if (trust <= 0) return {
    stamp: '甩锅失败', color: '#FF5E57', title: '锅甩出去了，截图追上了。',
    line: pick([
      '你说不是本意，截图说我记得很清楚。',
      '解释写得很诚恳，记录保存得更认真。',
      '该认的时候打太极，品牌替你画句号。',
    ], gateCount),
    tags: ['口碑：清零', '队友：挡枪', '截图：常驻']
  };
  if (distance >= GOAL_DISTANCE && trust >= 78 && heat < 45) return {
    stamp: '公关满分', color: '#C7F36B', title: '你真的把道歉跑完了。',
    line: pick([
      '这次没让俱乐部替你补作业，算有进步。',
      '终于自己接住了梗，也接住了责任。',
      '没推队友挡镜头，基础修复勉强及格。',
    ], gateCount + boomerangHits),
    tags: ['口碑：稳住', '热度：冷却', '赞助：保住']
  };
  if (boomerangHits >= 8) return {
    stamp: '回旋镖追责', color: '#61D7FF', title: '每次改口，都有续集。',
    line: pick([
      '自己的梗玩成连续剧，赞助商只看了首集。',
      '回旋镖全回来了，“绝非本意”还在循环。',
      '每次改口贡献一集，公关组追更到疲劳。',
    ], boomerangHits),
    tags: ['改口：连载', '回旋镖：返场', '道歉：待发']
  };
  if (commandPower >= 3) return {
    stamp: '指挥部空城', color: '#7A5CFF', title: '队友都走了，锅还在。',
    line: pick([
      '本人负责玩梗，俱乐部负责道歉，分工真细。',
      '一句话个人表达，整支团队集体写检讨。',
      '你把责任调走了，俱乐部却被安排加班。',
    ], commandPower + gateCount),
    tags: ['命令：满格', '队友：撤离', '责任：待认领']
  };
  if (score >= 6500) return {
    stamp: '冲刺撤场', color: '#FFB84D', title: '你先离场，声明后到。',
    line: pick([
      '采访里抛梗很快，声明赶上了末班车。',
      '你冲刺离场，俱乐部留下解释迷因。',
      '抢着当梗图主角，没抢着写道歉草稿。',
    ], Math.floor(score / 1000)),
    tags: ['速度：拉满', '撤场：熟练', '通稿：润色中']
  };
  return {
    stamp: '紧急撤场', color: '#61D7FF', title: '危机没散，公关先散会。',
    line: pick([
      '梗图全网都看懂了，本意还在等翻译。',
      '你说只是个梗，赞助商说合作到此。',
      '采访结束了，善后工作才刚开场。',
    ], gateCount + Math.floor(distance / 1000)),
    tags: ['危机：未解', '公关：散会', '出口：畅通']
  };
}
function drawResult() {
  const ending = endingResult || getEnding();
  ctx.fillStyle = '#111021'; ctx.fillRect(0, 0, W, H);
  drawStamp(ending.stamp, W / 2, 140, ending.color, -.05, 108);
  text(ending.title, W / 2, 245, 45, '#FFF4D6', 'center', '900');
  text('回旋镖 ' + boomerangHits + '  ·  命令牌 ' + commandPower, W / 2, 315, 23, '#FFB84D', 'center', '900');
  fillRound(58, 405, 634, 375, 22, '#FFF4D6'); strokeRound(58, 405, 634, 375, 22, '#C7F36B', 5);
  text(String(Math.round(score)), W / 2, 535, 104, '#7A5CFF', 'center', '900');
  drawStamp('FINAL SCORE', W / 2, 640, '#7A5CFF', .03, 80);
  text('距离 ' + Math.round(distance) + 'm', 120, 715, 19, '#111021', 'left', '900');
  text('口碑 ' + Math.round(trust) + '%', 375, 715, 19, '#111021', 'center', '900');
  text('热度 ' + Math.round(heat) + '%', 630, 715, 19, '#111021', 'right', '900');
  wrap(ending.line, 92, 840, 566, 35, 24, '#FFF4D6', '700');
  ending.tags.forEach((tag, i) => {
    const x = 112 + i * 180;
    fillRound(x, 918, 160, 34, 10, i === 1 ? '#7A5CFF' : '#2D2050');
    text(tag, x + 80, 935, 14, '#FFF4D6', 'center', '800');
  });
  fillRound(58, 1000, 634, 92, 22, '#FF6338'); strokeRound(58, 1000, 634, 92, 22, '#FFF4D6', 4); text('再来一局', W / 2, 1046, 30, '#FFF4D6', 'center', '900');
  text('最高分 ' + best, W / 2, 1160, 20, '#A9A2C4', 'center', '800');
}
function draw() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-8, 8), rand(-5, 5));
  if (state === 'title') drawTitle(); else if (state === 'playing') drawPlaying(); else drawResult();
  ctx.restore();
}
function loop() {
  const now = Date.now();
  const dt = Math.min(.04, (now - last) / 1000);
  last = now;
  update(dt); draw(); requestAnimationFrame(loop);
}
function hit(x, y, rx, ry, rw, rh) { return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh; }
function screenX(t) { return (t.clientX || t.pageX || 0) * W / (system.windowWidth || W); }
function screenY(t) { return (t.clientY || t.pageY || 0) * H / (system.windowHeight || H); }

wx.onTouchStart(e => {
  const t = e.touches[0]; if (!t) return;
  const sx = screenX(t); const sy = screenY(t);
  chooseLaneByX(sx);
  if (state === 'title' && hit(sx, sy, 56, 930, 638, 140)) resetGame();
  else if (state === 'result' && hit(sx, sy, 56, 980, 638, 140)) resetGame();
});
wx.onTouchMove(e => {
  if (state !== 'playing') return;
  const t = e.touches[0]; if (!t) return;
  chooseLaneByX(screenX(t));
});
if (wx.onTouchEnd) wx.onTouchEnd(() => {});

loop();
