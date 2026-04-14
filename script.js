const CONFIG = {
  leaderHP: 20,
  melee: { attack: 4, hp: 8 },
  ranged: { attack: 3, hp: 5 },
  sniper: { attack: 2, hp: 4 },
  hitEffectMs: 350,
  enemyDelayMs: 500,
};

const ASSETS = {
  leaderPlayer: 'assets/leader-player.svg',
  leaderEnemy: 'assets/leader-enemy.svg',
  melee: 'assets/melee.svg',
  ranged: 'assets/ranged.svg',
  sniper: 'assets/sniper.svg',
};

const assetState = {};

function loadAssets() {
  Object.entries(ASSETS).forEach(([key, src]) => {
    const img = new Image();
    assetState[key] = { loaded: false, failed: false, img };
    img.onload = () => {
      assetState[key].loaded = true;
    };
    img.onerror = () => {
      assetState[key].failed = true;
    };
    img.src = src;
  });
}

let idCounter = 1;
function createUnit(owner, name, row, attackProfile) {
  const base = CONFIG[attackProfile];
  return {
    id: `${owner}-${idCounter++}`,
    owner,
    name,
    row,
    attack: base.attack,
    hp: base.hp,
    attackProfile,
    hasActed: false,
  };
}

const initialHand = () => [
  createUnit('player', 'Swordsman', 'front', 'melee'),
  createUnit('player', 'Archer', 'back', 'ranged'),
  createUnit('player', 'Scout Sniper', 'back', 'sniper'),
];

const gameState = {
  phase: 'start',
  currentTurn: 'player',
  playerHP: CONFIG.leaderHP,
  enemyHP: CONFIG.leaderHP,
  playerFront: null,
  playerBack: null,
  enemyFront: null,
  enemyBack: null,
  hand: initialHand(),
  drag: {
    active: false,
    pointerId: null,
    sourceSlot: null,
    sourceUnitId: null,
    x: 0,
    y: 0,
    validTargets: [],
  },
  transientEffects: [],
  selectedHandIndex: null,
  message: 'カードを召喚し、ユニットをドラッグして攻撃！',
  playerSummonedThisTurn: false,
  enemyActionAt: null,
};

const ui = {
  battlefield: document.getElementById('battlefield'),
  hand: document.getElementById('hand'),
  turn: document.getElementById('turn-indicator'),
  message: document.getElementById('message'),
  endTurnBtn: document.getElementById('end-turn-btn'),
  restartBtn: document.getElementById('restart-btn'),
  aimLine: document.getElementById('aim-line'),
};

function getOpposingSide(owner) {
  return owner === 'player' ? 'enemy' : 'player';
}

function getSlotKey(owner, row) {
  return `${owner}${row[0].toUpperCase()}${row.slice(1)}`;
}

function canUnitAttackTarget(unit, targetKey) {
  const enemySide = getOpposingSide(unit.owner);
  const enemyFront = gameState[`${enemySide}Front`];
  const enemyBack = gameState[`${enemySide}Back`];
  if (unit.attackProfile === 'melee') {
    if (enemyFront) return targetKey === `${enemySide}Front`;
    return targetKey === `${enemySide}Leader`;
  }
  if (unit.attackProfile === 'ranged') {
    if (targetKey === `${enemySide}Front` && enemyFront) return true;
    return !enemyFront && targetKey === `${enemySide}Leader`;
  }
  if (unit.attackProfile === 'sniper') {
    if (targetKey === `${enemySide}Leader`) return true;
    if (targetKey === `${enemySide}Front`) return Boolean(enemyFront);
    if (targetKey === `${enemySide}Back`) return Boolean(enemyBack);
  }
  return false;
}

function getValidTargetsForUnit(unit) {
  const enemySide = getOpposingSide(unit.owner);
  return [`${enemySide}Front`, `${enemySide}Back`, `${enemySide}Leader`].filter((key) =>
    canUnitAttackTarget(unit, key)
  );
}

function autoAdvanceBackUnitToFront(side) {
  const frontKey = `${side}Front`;
  const backKey = `${side}Back`;
  if (!gameState[frontKey] && gameState[backKey]) {
    gameState[frontKey] = gameState[backKey];
    gameState[frontKey].row = 'front';
    gameState[backKey] = null;
    gameState.message = `${side === 'player' ? '味方' : '敵'}後衛が前衛へ移動`;
  }
}

function summonUnit(owner, row, handIndex = null) {
  const slotKey = getSlotKey(owner, row);
  if (gameState[slotKey]) return false;

  let unit;
  if (owner === 'player') {
    if (handIndex == null || !gameState.hand[handIndex] || gameState.playerSummonedThisTurn) return false;
    unit = gameState.hand.splice(handIndex, 1)[0];
    gameState.playerSummonedThisTurn = true;
  } else {
    const pool = [
      createUnit('enemy', 'Raider', 'front', 'melee'),
      createUnit('enemy', 'Bowman', 'back', 'ranged'),
      createUnit('enemy', 'Watcher', 'back', 'sniper'),
    ];
    unit = pool[Math.floor(Math.random() * pool.length)];
  }

  unit.row = row;
  unit.hasActed = false;
  gameState[slotKey] = unit;
  gameState.message = `${owner === 'player' ? '味方' : '敵'} ${unit.name} を${row === 'front' ? '前衛' : '後衛'}に召喚`;
  return true;
}

function resolveAttack(attacker, attackerSlotKey, targetKey) {
  if (!canUnitAttackTarget(attacker, targetKey)) return false;

  if (targetKey.endsWith('Leader')) {
    const side = targetKey.startsWith('player') ? 'player' : 'enemy';
    gameState[`${side}HP`] -= attacker.attack;
    gameState.transientEffects.push({ type: 'hit', targetKey, until: performance.now() + CONFIG.hitEffectMs });
  } else {
    const target = gameState[targetKey];
    if (!target) return false;
    target.hp -= attacker.attack;
    gameState.transientEffects.push({ type: 'hit', targetKey, until: performance.now() + CONFIG.hitEffectMs });
  }

  attacker.hasActed = true;
  removeDefeatedUnits();

  if (gameState.playerHP <= 0 || gameState.enemyHP <= 0) {
    gameState.phase = 'gameover';
    gameState.message = gameState.playerHP <= 0 ? '敗北…' : '勝利！';
  }

  return true;
}

function removeDefeatedUnits() {
  ['playerFront', 'playerBack', 'enemyFront', 'enemyBack'].forEach((key) => {
    if (gameState[key] && gameState[key].hp <= 0) gameState[key] = null;
  });
}

function endTurn() {
  if (gameState.phase === 'gameover') return;
  gameState.currentTurn = gameState.currentTurn === 'player' ? 'enemy' : 'player';
  autoAdvanceBackUnitToFront(gameState.currentTurn);
  ['Front', 'Back'].forEach((row) => {
    const key = `${gameState.currentTurn}${row}`;
    if (gameState[key]) gameState[key].hasActed = false;
  });
  gameState.selectedHandIndex = null;

  if (gameState.currentTurn === 'player') {
    gameState.playerSummonedThisTurn = false;
    gameState.message = 'あなたのターン';
  } else {
    gameState.enemyActionAt = performance.now() + CONFIG.enemyDelayMs;
    gameState.message = '敵のターン';
  }
}

function runEnemyAI() {
  if (gameState.currentTurn !== 'enemy' || gameState.phase === 'gameover') return;

  if (!gameState.enemyFront) summonUnit('enemy', 'front');
  else if (!gameState.enemyBack && Math.random() < 0.7) summonUnit('enemy', 'back');

  ['enemyFront', 'enemyBack'].forEach((slotKey) => {
    const unit = gameState[slotKey];
    if (!unit || unit.hasActed) return;
    const valid = getValidTargetsForUnit(unit);
    if (!valid.length) return;
    const target = valid.includes('playerFront') ? 'playerFront' : valid[0];
    resolveAttack(unit, slotKey, target);
  });

  if (gameState.phase !== 'gameover') endTurn();
}

function resetGame() {
  idCounter = 1;
  gameState.phase = 'playing';
  gameState.currentTurn = 'player';
  gameState.playerHP = CONFIG.leaderHP;
  gameState.enemyHP = CONFIG.leaderHP;
  gameState.playerFront = null;
  gameState.playerBack = null;
  gameState.enemyFront = null;
  gameState.enemyBack = null;
  gameState.hand = initialHand();
  gameState.drag = { active: false, pointerId: null, sourceSlot: null, sourceUnitId: null, x: 0, y: 0, validTargets: [] };
  gameState.transientEffects = [];
  gameState.selectedHandIndex = null;
  gameState.message = 'カードを召喚し、ユニットをドラッグして攻撃！';
  gameState.playerSummonedThisTurn = false;
  gameState.enemyActionAt = null;
}

function getElCenter(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function startDrag(slotKey, event) {
  const unit = gameState[slotKey];
  if (!unit || unit.owner !== 'player' || gameState.currentTurn !== 'player' || unit.hasActed || gameState.phase === 'gameover') return;
  gameState.drag.active = true;
  gameState.drag.pointerId = event.pointerId ?? null;
  gameState.drag.sourceSlot = slotKey;
  gameState.drag.sourceUnitId = unit.id;
  gameState.drag.x = event.clientX ?? 0;
  gameState.drag.y = event.clientY ?? 0;
  gameState.drag.validTargets = getValidTargetsForUnit(unit);
}

function cancelDrag() {
  gameState.drag.active = false;
  gameState.drag.pointerId = null;
  gameState.drag.sourceSlot = null;
  gameState.drag.sourceUnitId = null;
  gameState.drag.validTargets = [];
  ui.aimLine.classList.add('hidden');
}

function updateAimLine() {
  if (!gameState.drag.active) return;
  const fromEl = document.querySelector(`[data-key='${gameState.drag.sourceSlot}'] .unit`);
  if (!fromEl) return;
  const center = getElCenter(fromEl);
  const dx = gameState.drag.x - center.x;
  const dy = gameState.drag.y - center.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  ui.aimLine.classList.remove('hidden');
  ui.aimLine.style.left = `${center.x}px`;
  ui.aimLine.style.top = `${center.y}px`;
  ui.aimLine.style.width = `${length}px`;
  ui.aimLine.style.transform = `rotate(${angle}deg)`;
}

function createAssetVisual(assetKey, fallbackText) {
  const wrapper = document.createElement('div');
  const asset = assetState[assetKey];
  if (asset && asset.loaded && !asset.failed) {
    const img = document.createElement('img');
    img.className = 'asset';
    img.src = ASSETS[assetKey];
    img.alt = fallbackText;
    wrapper.appendChild(img);
  } else {
    const fall = document.createElement('div');
    fall.className = 'asset-fallback';
    fall.textContent = fallbackText;
    wrapper.appendChild(fall);
  }
  return wrapper;
}

function renderUnit(unit) {
  const el = document.createElement('div');
  el.className = `unit ${unit.attackProfile} ${unit.hasActed ? 'acted' : ''}`;
  el.dataset.unitId = unit.id;
  el.appendChild(createAssetVisual(unit.attackProfile, `${unit.attackProfile.toUpperCase()} UNIT`));

  const name = document.createElement('div');
  name.className = 'unit-name';
  name.textContent = unit.name;

  const stats = document.createElement('div');
  stats.className = 'stats';
  stats.textContent = `ATK ${unit.attack} / HP ${unit.hp}`;

  el.append(name, stats);
  return el;
}

function renderSlot(label, key) {
  const el = document.createElement('div');
  el.className = 'slot';
  el.dataset.key = key;
  el.dataset.label = label;
  const unit = gameState[key];
  if (!unit) el.classList.add('empty');
  else el.appendChild(renderUnit(unit));
  return el;
}

function renderLeader(side) {
  const el = document.createElement('div');
  el.className = 'leader';
  el.dataset.key = `${side}Leader`;
  el.appendChild(createAssetVisual(side === 'player' ? 'leaderPlayer' : 'leaderEnemy', side.toUpperCase()));
  const title = document.createElement('div');
  title.textContent = `${side === 'player' ? 'Player' : 'Enemy'} Leader`;
  const hp = document.createElement('div');
  hp.textContent = `HP: ${gameState[`${side}HP`]}`;
  el.append(title, hp);
  return el;
}

function applyTargetHighlights(root) {
  if (!gameState.drag.active) return;
  const allTargets = ['enemyFront', 'enemyBack', 'enemyLeader'];
  allTargets.forEach((key) => {
    const target = root.querySelector(`[data-key='${key}']`);
    if (!target) return;
    if (gameState.drag.validTargets.includes(key)) target.classList.add('target-valid');
    else target.classList.add('target-invalid');
  });
}

function applyEffects(root, now) {
  gameState.transientEffects.forEach((e) => {
    const target = root.querySelector(`[data-key='${e.targetKey}']`);
    if (target) target.classList.add('hit-flash');
  });
  gameState.transientEffects = gameState.transientEffects.filter((e) => e.until > now);
}

function renderHand() {
  ui.hand.textContent = '';
  gameState.hand.forEach((card, idx) => {
    const c = document.createElement('div');
    c.className = `hand-card ${gameState.selectedHandIndex === idx ? 'selected' : ''}`;
    c.dataset.handIndex = String(idx);
    c.textContent = `${card.name} (${card.attackProfile}) ATK${card.attack}/HP${card.hp}`;
    ui.hand.appendChild(c);
  });
}

function render(now) {
  ui.turn.textContent = `Turn: ${gameState.currentTurn}`;
  ui.message.textContent = gameState.message;
  ui.restartBtn.classList.toggle('hidden', gameState.phase !== 'gameover');

  const bf = document.createElement('div');

  const enemyRow = document.createElement('section');
  enemyRow.className = 'side';
  enemyRow.append(renderLeader('enemy'), renderSlot('Enemy Front', 'enemyFront'), renderSlot('Enemy Back', 'enemyBack'));

  const playerRow = document.createElement('section');
  playerRow.className = 'side';
  playerRow.append(renderLeader('player'), renderSlot('Player Front', 'playerFront'), renderSlot('Player Back', 'playerBack'));

  bf.append(enemyRow, playerRow);
  ui.battlefield.replaceChildren(bf);

  applyTargetHighlights(ui.battlefield);
  applyEffects(ui.battlefield, now);
  renderHand();
  updateAimLine();
}

function update(now) {
  if (gameState.currentTurn === 'enemy' && gameState.enemyActionAt && now >= gameState.enemyActionAt) {
    gameState.enemyActionAt = null;
    runEnemyAI();
  }
}

function pickTargetFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  const target = el && el.closest('[data-key]');
  return target ? target.dataset.key : null;
}

function bindEvents() {
  ui.endTurnBtn.addEventListener('click', () => {
    if (gameState.currentTurn === 'player') endTurn();
  });

  ui.restartBtn.addEventListener('click', resetGame);

  ui.hand.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.hand-card');
    if (!card) return;
    if (gameState.currentTurn !== 'player' || gameState.playerSummonedThisTurn || gameState.phase === 'gameover') return;
    gameState.selectedHandIndex = Number(card.dataset.handIndex);
    gameState.message = '前衛か後衛の空きスロットをクリックして召喚';
  });

  ui.battlefield.addEventListener('pointerdown', (e) => {
    const unitEl = e.target.closest('.unit');
    if (!unitEl) return;
    const slot = unitEl.closest('[data-key]');
    if (!slot) return;
    e.preventDefault();
    startDrag(slot.dataset.key, e);
  });

  ui.battlefield.addEventListener('pointerdown', (e) => {
    if (gameState.selectedHandIndex == null || gameState.currentTurn !== 'player' || gameState.phase === 'gameover') return;
    if (e.target.closest('.unit')) return;
    const slot = e.target.closest('.slot');
    if (!slot) return;
    if (!slot.dataset.key.startsWith('player')) return;
    const row = slot.dataset.key.endsWith('Front') ? 'front' : 'back';
    const done = summonUnit('player', row, gameState.selectedHandIndex);
    if (done) gameState.selectedHandIndex = null;
  });

  document.addEventListener('pointermove', (e) => {
    if (!gameState.drag.active) return;
    if (gameState.drag.pointerId !== null && e.pointerId !== gameState.drag.pointerId) return;
    gameState.drag.x = e.clientX;
    gameState.drag.y = e.clientY;
  });

  document.addEventListener('pointerup', (e) => {
    if (!gameState.drag.active) return;
    if (gameState.drag.pointerId !== null && e.pointerId !== gameState.drag.pointerId) return;
    const sourceUnit = gameState[gameState.drag.sourceSlot];
    const targetKey = pickTargetFromPoint(e.clientX, e.clientY);
    if (sourceUnit && targetKey && gameState.drag.validTargets.includes(targetKey)) {
      resolveAttack(sourceUnit, gameState.drag.sourceSlot, targetKey);
    }
    cancelDrag();
  });

  document.addEventListener('pointercancel', () => {
    if (gameState.drag.active) cancelDrag();
  });
}

function loop(now) {
  update(now);
  render(now);
  requestAnimationFrame(loop);
}

loadAssets();
bindEvents();
resetGame();
requestAnimationFrame(loop);
