const CONFIG = {
  leaderHP: 24,
  enemyDelayMs: 500,
  hitEffectMs: 320,
  unitTemplates: {
    melee: { attack: 4, hp: 8, range: 'frontline' },
    ranged: { attack: 3, hp: 5, range: 'line' },
    sniper: { attack: 2, hp: 4, range: 'any' },
  },
};

const ASSETS = {
  leaderPlayer: 'assets/leader-player.svg',
  leaderEnemy: 'assets/leader-enemy.svg',
  melee: 'assets/melee.svg',
  ranged: 'assets/ranged.svg',
  sniper: 'assets/sniper.svg',
};

const SLOT_META = {
  enemyBackLeft: { side: 'enemy', lane: 'left', row: 'back', playable: true, label: 'Enemy Back L' },
  blockedCenterTop: { side: 'none', lane: 'center', row: 'back', playable: false, label: 'Blocked' },
  enemyBackRight: { side: 'enemy', lane: 'right', row: 'back', playable: true, label: 'Enemy Back R' },
  enemyFrontLeft: { side: 'enemy', lane: 'left', row: 'front', playable: true, label: 'Enemy Front L' },
  enemyLeader: { side: 'enemy', lane: 'center', row: 'leader', playable: false, label: 'Enemy Leader' },
  enemyFrontRight: { side: 'enemy', lane: 'right', row: 'front', playable: true, label: 'Enemy Front R' },
  playerFrontLeft: { side: 'player', lane: 'left', row: 'front', playable: true, label: 'Player Front L' },
  playerLeader: { side: 'player', lane: 'center', row: 'leader', playable: false, label: 'Player Leader' },
  playerFrontRight: { side: 'player', lane: 'right', row: 'front', playable: true, label: 'Player Front R' },
  playerBackLeft: { side: 'player', lane: 'left', row: 'back', playable: true, label: 'Player Back L' },
  blockedCenterBottom: { side: 'none', lane: 'center', row: 'back', playable: false, label: 'Blocked' },
  playerBackRight: { side: 'player', lane: 'right', row: 'back', playable: true, label: 'Player Back R' },
};

const BOARD_ORDER = [
  'enemyBackLeft', 'blockedCenterTop', 'enemyBackRight',
  'enemyFrontLeft', 'enemyLeader', 'enemyFrontRight',
  'playerFrontLeft', 'playerLeader', 'playerFrontRight',
  'playerBackLeft', 'blockedCenterBottom', 'playerBackRight',
];

const PLAYER_SUMMON_SLOTS = ['playerFrontLeft', 'playerFrontRight', 'playerBackLeft', 'playerBackRight'];
const ENEMY_SUMMON_SLOTS = ['enemyFrontLeft', 'enemyFrontRight', 'enemyBackLeft', 'enemyBackRight'];
const ENEMY_TARGETS = ['enemyFrontLeft', 'enemyFrontRight', 'enemyBackLeft', 'enemyBackRight', 'enemyLeader'];

const ui = {
  battlefield: document.getElementById('battlefield'),
  hand: document.getElementById('hand'),
  turn: document.getElementById('turn-indicator'),
  status: document.getElementById('status'),
  endTurnBtn: document.getElementById('end-turn-btn'),
  restartBtn: document.getElementById('restart-btn'),
  dragGhost: document.getElementById('drag-ghost'),
  aimLine: document.getElementById('aim-line'),
};

const assets = {};
let unitId = 1;

const gameState = {
  phase: 'start',
  currentTurn: 'player',
  playerHP: CONFIG.leaderHP,
  enemyHP: CONFIG.leaderHP,
  leaders: {
    player: { key: 'playerLeader', name: 'Player Leader' },
    enemy: { key: 'enemyLeader', name: 'Enemy Leader' },
  },
  board: {
    enemyBackLeft: null,
    enemyFrontLeft: null,
    enemyLeader: { type: 'leader' },
    enemyFrontRight: null,
    enemyBackRight: null,
    playerFrontLeft: null,
    playerLeader: { type: 'leader' },
    playerFrontRight: null,
    playerBackLeft: null,
    playerBackRight: null,
  },
  hand: [],
  drag: {
    active: false,
    pointerId: null,
    kind: null,
    cardIndex: null,
    fromSlot: null,
    unitId: null,
    x: 0,
    y: 0,
    validTargets: [],
  },
  transientEffects: [],
  playerSummonedThisTurn: false,
  enemyActionAt: null,
  message: '',
  dirty: {
    board: true,
    hand: true,
    hud: true,
  },
};

function loadAssets() {
  Object.entries(ASSETS).forEach(([key, src]) => {
    const img = new Image();
    assets[key] = { loaded: false, failed: false, src };
    img.onload = () => {
      assets[key].loaded = true;
    };
    img.onerror = () => {
      assets[key].failed = true;
    };
    img.src = src;
  });
}

function createUnit(owner, profile, nameOverride = null) {
  const tpl = CONFIG.unitTemplates[profile];
  return {
    id: `${owner}-${unitId++}`,
    owner,
    attackProfile: profile,
    attack: tpl.attack,
    hp: tpl.hp,
    range: tpl.range,
    hasActed: false,
    name: nameOverride ?? `${owner}-${profile}`,
  };
}

function createStartingHand() {
  return [
    createUnit('player', 'melee', 'Swordsman'),
    createUnit('player', 'ranged', 'Archer'),
    createUnit('player', 'sniper', 'Scout Sniper'),
  ];
}

function resetGame() {
  unitId = 1;
  gameState.phase = 'playing';
  gameState.currentTurn = 'player';
  gameState.playerHP = CONFIG.leaderHP;
  gameState.enemyHP = CONFIG.leaderHP;
  gameState.board.enemyBackLeft = null;
  gameState.board.enemyFrontLeft = null;
  gameState.board.enemyFrontRight = null;
  gameState.board.enemyBackRight = null;
  gameState.board.playerFrontLeft = null;
  gameState.board.playerFrontRight = null;
  gameState.board.playerBackLeft = null;
  gameState.board.playerBackRight = null;
  gameState.hand = createStartingHand();
  gameState.drag = { active: false, pointerId: null, kind: null, cardIndex: null, fromSlot: null, unitId: null, x: 0, y: 0, validTargets: [] };
  gameState.transientEffects = [];
  gameState.playerSummonedThisTurn = false;
  gameState.enemyActionAt = null;
  gameState.message = 'カードをドラッグして配置、ユニットをドラッグして攻撃。';
  markDirty('board', 'hand', 'hud');
}

function markDirty(...parts) {
  parts.forEach((part) => {
    gameState.dirty[part] = true;
  });
}

function getAssetNode(key, fallbackText) {
  const wrapper = document.createElement('div');
  const info = assets[key];
  if (info && info.loaded && !info.failed) {
    const img = document.createElement('img');
    img.className = 'asset';
    img.src = info.src;
    img.alt = fallbackText;
    wrapper.appendChild(img);
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'asset-fallback';
    fallback.textContent = fallbackText;
    wrapper.appendChild(fallback);
  }
  return wrapper;
}

function createUnitNode(unit) {
  const node = document.createElement('div');
  node.className = `unit ${unit.attackProfile}${unit.hasActed ? ' acted' : ''}`;
  node.dataset.unitId = unit.id;
  node.appendChild(getAssetNode(unit.attackProfile, unit.attackProfile.toUpperCase()));

  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = unit.name;

  const stats = document.createElement('div');
  stats.className = 'stats';
  stats.textContent = `ATK ${unit.attack} / HP ${unit.hp}`;

  node.append(name, stats);
  return node;
}

function createLeaderNode(side) {
  const card = document.createElement('div');
  card.className = 'leader-card';
  card.appendChild(getAssetNode(side === 'player' ? 'leaderPlayer' : 'leaderEnemy', side.toUpperCase()));

  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = side === 'player' ? 'Player Leader' : 'Enemy Leader';

  const hp = document.createElement('div');
  hp.className = 'stats';
  hp.textContent = `HP ${side === 'player' ? gameState.playerHP : gameState.enemyHP}`;

  card.append(name, hp);
  return card;
}

function createCell(slotKey) {
  const meta = SLOT_META[slotKey];
  const cell = document.createElement('div');
  cell.dataset.key = slotKey;
  cell.classList.add('cell');

  if (!meta.playable && meta.row === 'back') {
    cell.classList.add('blocked');
    return cell;
  }

  if (meta.row === 'leader') {
    cell.classList.add('leader');
    cell.appendChild(createLeaderNode(meta.side));
    return cell;
  }

  cell.classList.add('slot', meta.row);
  const unit = gameState.board[slotKey];
  if (!unit) {
    cell.classList.add('empty-slot');
    cell.dataset.label = meta.label;
  } else {
    cell.appendChild(createUnitNode(unit));
  }
  return cell;
}

function renderBoard() {
  if (!gameState.dirty.board) return;
  const frag = document.createDocumentFragment();
  BOARD_ORDER.forEach((slotKey) => {
    frag.appendChild(createCell(slotKey));
  });
  ui.battlefield.replaceChildren(frag);
  gameState.dirty.board = false;
}

function renderHand() {
  if (!gameState.dirty.hand) return;
  const frag = document.createDocumentFragment();
  gameState.hand.forEach((card, index) => {
    const el = document.createElement('div');
    el.className = 'hand-card';
    el.dataset.handIndex = String(index);
    el.appendChild(getAssetNode(card.attackProfile, card.attackProfile.toUpperCase()));

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = card.name;

    const stats = document.createElement('div');
    stats.className = 'stats';
    stats.textContent = `ATK ${card.attack} / HP ${card.hp}`;

    el.append(name, stats);
    frag.appendChild(el);
  });
  ui.hand.replaceChildren(frag);
  gameState.dirty.hand = false;
}

function renderHud() {
  if (!gameState.dirty.hud) return;
  ui.turn.textContent = `Turn: ${gameState.currentTurn}`;
  ui.status.textContent = gameState.message;
  ui.restartBtn.classList.toggle('hidden', gameState.phase !== 'gameover');
  gameState.dirty.hud = false;
}

function rowHasFrontBlock(side, lane) {
  const key = `${side}Front${lane}`;
  return Boolean(gameState.board[key]);
}

function canAttack(attacker, targetKey) {
  if (targetKey === `${attacker.owner}Leader`) return false;
  if (!targetKey.startsWith(attacker.owner === 'player' ? 'enemy' : 'player')) return false;

  const targetUnit = gameState.board[targetKey];
  if (targetKey.endsWith('Leader')) {
    const leftBlock = rowHasFrontBlock(attacker.owner === 'player' ? 'enemy' : 'player', 'Left');
    const rightBlock = rowHasFrontBlock(attacker.owner === 'player' ? 'enemy' : 'player', 'Right');
    if (attacker.range === 'frontline') return !leftBlock && !rightBlock;
    if (attacker.range === 'line') return !leftBlock && !rightBlock;
    return true;
  }

  if (!targetUnit) return false;
  if (attacker.range === 'any') return true;

  const targetMeta = SLOT_META[targetKey];
  if (attacker.range === 'frontline') return targetMeta.row === 'front';

  if (attacker.range === 'line') {
    if (targetMeta.row === 'front') return true;
    return !rowHasFrontBlock(targetMeta.side, targetMeta.lane);
  }

  return false;
}

function getValidAttackTargets(unit) {
  const side = unit.owner === 'player' ? 'enemy' : 'player';
  const targets = [
    `${side}FrontLeft`,
    `${side}FrontRight`,
    `${side}BackLeft`,
    `${side}BackRight`,
    `${side}Leader`,
  ];
  return targets.filter((key) => canAttack(unit, key));
}

function getValidSummonTargets() {
  return PLAYER_SUMMON_SLOTS.filter((slot) => !gameState.board[slot]);
}

function beginCardDrag(handIndex, e) {
  if (gameState.phase !== 'playing' || gameState.currentTurn !== 'player' || gameState.playerSummonedThisTurn) return;
  if (!gameState.hand[handIndex]) return;

  gameState.drag.active = true;
  gameState.drag.pointerId = e.pointerId;
  gameState.drag.kind = 'summon';
  gameState.drag.cardIndex = handIndex;
  gameState.drag.fromSlot = null;
  gameState.drag.unitId = null;
  gameState.drag.x = e.clientX;
  gameState.drag.y = e.clientY;
  gameState.drag.validTargets = getValidSummonTargets();
  gameState.message = '有効なプレイヤースロットにドロップで召喚';
  markDirty('hud');
}

function beginUnitDrag(slotKey, e) {
  const unit = gameState.board[slotKey];
  if (!unit) return;
  if (gameState.phase !== 'playing' || gameState.currentTurn !== 'player') return;
  if (unit.owner !== 'player' || unit.hasActed) return;

  gameState.drag.active = true;
  gameState.drag.pointerId = e.pointerId;
  gameState.drag.kind = 'attack';
  gameState.drag.cardIndex = null;
  gameState.drag.fromSlot = slotKey;
  gameState.drag.unitId = unit.id;
  gameState.drag.x = e.clientX;
  gameState.drag.y = e.clientY;
  gameState.drag.validTargets = getValidAttackTargets(unit);
  gameState.message = '有効なターゲットにドロップで即攻撃';
  markDirty('hud');
}

function clearDrag() {
  gameState.drag = {
    active: false,
    pointerId: null,
    kind: null,
    cardIndex: null,
    fromSlot: null,
    unitId: null,
    x: 0,
    y: 0,
    validTargets: [],
  };
  ui.dragGhost.classList.add('hidden');
  ui.aimLine.classList.add('hidden');
}

function summonFromHand(handIndex, slotKey) {
  if (!PLAYER_SUMMON_SLOTS.includes(slotKey) || gameState.board[slotKey]) return false;
  const card = gameState.hand[handIndex];
  if (!card) return false;
  gameState.hand.splice(handIndex, 1);
  card.hasActed = true;
  gameState.board[slotKey] = card;
  gameState.playerSummonedThisTurn = true;
  gameState.message = `${card.name} を配置`;
  markDirty('board', 'hand', 'hud');
  return true;
}

function applyDamageToLeader(side, amount) {
  if (side === 'player') gameState.playerHP -= amount;
  else gameState.enemyHP -= amount;
}

function removeDeadUnits() {
  const boardKeys = ['enemyBackLeft', 'enemyFrontLeft', 'enemyFrontRight', 'enemyBackRight', 'playerFrontLeft', 'playerFrontRight', 'playerBackLeft', 'playerBackRight'];
  boardKeys.forEach((key) => {
    const unit = gameState.board[key];
    if (unit && unit.hp <= 0) gameState.board[key] = null;
  });
}

function resolveAttack(attackerSlot, targetKey) {
  const attacker = gameState.board[attackerSlot];
  if (!attacker || attacker.hasActed || !canAttack(attacker, targetKey)) return false;

  if (targetKey.endsWith('Leader')) {
    applyDamageToLeader(targetKey.startsWith('player') ? 'player' : 'enemy', attacker.attack);
  } else {
    gameState.board[targetKey].hp -= attacker.attack;
  }

  attacker.hasActed = true;
  gameState.transientEffects.push({ targetKey, until: performance.now() + CONFIG.hitEffectMs });
  removeDeadUnits();

  if (gameState.playerHP <= 0 || gameState.enemyHP <= 0) {
    gameState.phase = 'gameover';
    gameState.message = gameState.playerHP <= 0 ? '敗北…' : '勝利！';
  }

  markDirty('board', 'hud');
  return true;
}

function setDropHighlights() {
  document.querySelectorAll('.drop-valid, .drop-invalid').forEach((el) => {
    el.classList.remove('drop-valid', 'drop-invalid');
  });

  if (!gameState.drag.active) return;

  const candidates = gameState.drag.kind === 'summon' ? PLAYER_SUMMON_SLOTS : ENEMY_TARGETS;
  candidates.forEach((key) => {
    const cell = ui.battlefield.querySelector(`[data-key='${key}']`);
    if (!cell) return;
    if (gameState.drag.validTargets.includes(key)) cell.classList.add('drop-valid');
    else cell.classList.add('drop-invalid');
  });
}

function getCellKeyAtPoint(x, y) {
  const found = document.elementFromPoint(x, y);
  const cell = found && found.closest('[data-key]');
  return cell ? cell.dataset.key : null;
}

function updateDragOverlay() {
  if (!gameState.drag.active) return;

  if (gameState.drag.kind === 'summon') {
    const card = gameState.hand[gameState.drag.cardIndex];
    if (!card) return;
    ui.dragGhost.classList.remove('hidden');
    ui.dragGhost.style.left = `${gameState.drag.x}px`;
    ui.dragGhost.style.top = `${gameState.drag.y}px`;
    ui.dragGhost.textContent = `${card.name} ATK${card.attack} HP${card.hp}`;
    ui.aimLine.classList.add('hidden');
    return;
  }

  ui.dragGhost.classList.add('hidden');
  const source = ui.battlefield.querySelector(`[data-key='${gameState.drag.fromSlot}'] .unit`);
  if (!source) return;
  const rect = source.getBoundingClientRect();
  const x0 = rect.left + rect.width / 2;
  const y0 = rect.top + rect.height / 2;
  const dx = gameState.drag.x - x0;
  const dy = gameState.drag.y - y0;
  const len = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  ui.aimLine.classList.remove('hidden');
  ui.aimLine.style.left = `${x0}px`;
  ui.aimLine.style.top = `${y0}px`;
  ui.aimLine.style.width = `${len}px`;
  ui.aimLine.style.transform = `rotate(${angle}deg)`;
}

function applyTransientEffects(now) {
  gameState.transientEffects = gameState.transientEffects.filter((effect) => effect.until > now);
  gameState.transientEffects.forEach((effect) => {
    const cell = ui.battlefield.querySelector(`[data-key='${effect.targetKey}']`);
    if (cell) cell.classList.add('hit-flash');
  });
}

function endTurn() {
  if (gameState.phase !== 'playing') return;
  gameState.currentTurn = gameState.currentTurn === 'player' ? 'enemy' : 'player';

  const boardKeys = Object.keys(gameState.board);
  boardKeys.forEach((key) => {
    const unit = gameState.board[key];
    if (unit && unit.owner === gameState.currentTurn) unit.hasActed = false;
  });

  if (gameState.currentTurn === 'player') {
    gameState.playerSummonedThisTurn = false;
    gameState.message = 'あなたのターン';
  } else {
    gameState.enemyActionAt = performance.now() + CONFIG.enemyDelayMs;
    gameState.message = '敵のターン';
  }

  markDirty('board', 'hud');
}

function chooseEnemySummonSlot() {
  const openFront = ['enemyFrontLeft', 'enemyFrontRight'].filter((key) => !gameState.board[key]);
  if (openFront.length) return openFront[Math.floor(Math.random() * openFront.length)];
  const openBack = ['enemyBackLeft', 'enemyBackRight'].filter((key) => !gameState.board[key]);
  if (openBack.length) return openBack[Math.floor(Math.random() * openBack.length)];
  return null;
}

function runEnemyAI() {
  if (gameState.currentTurn !== 'enemy' || gameState.phase !== 'playing') return;

  if (Math.random() < 0.85) {
    const slot = chooseEnemySummonSlot();
    if (slot) {
      const pool = [
        createUnit('enemy', 'melee', 'Raider'),
        createUnit('enemy', 'ranged', 'Bowman'),
        createUnit('enemy', 'sniper', 'Watcher'),
      ];
      gameState.board[slot] = pool[Math.floor(Math.random() * pool.length)];
      markDirty('board');
    }
  }

  ['enemyFrontLeft', 'enemyFrontRight', 'enemyBackLeft', 'enemyBackRight'].forEach((slot) => {
    const unit = gameState.board[slot];
    if (!unit || unit.hasActed) return;
    const targets = getValidAttackTargets(unit);
    if (!targets.length) return;
    const priority = targets.find((key) => key.includes('Front')) || targets[0];
    resolveAttack(slot, priority);
  });

  if (gameState.phase === 'playing') endTurn();
}

function update(now) {
  if (gameState.currentTurn === 'enemy' && gameState.enemyActionAt && now >= gameState.enemyActionAt) {
    gameState.enemyActionAt = null;
    runEnemyAI();
  }
}

function render(now) {
  renderBoard();
  renderHand();
  renderHud();
  setDropHighlights();
  updateDragOverlay();
  applyTransientEffects(now);
}

function onPointerMove(e) {
  if (!gameState.drag.active || e.pointerId !== gameState.drag.pointerId) return;
  gameState.drag.x = e.clientX;
  gameState.drag.y = e.clientY;
}

function onPointerUp(e) {
  if (!gameState.drag.active || e.pointerId !== gameState.drag.pointerId) return;

  const targetKey = getCellKeyAtPoint(e.clientX, e.clientY);
  if (targetKey && gameState.drag.validTargets.includes(targetKey)) {
    if (gameState.drag.kind === 'summon') {
      summonFromHand(gameState.drag.cardIndex, targetKey);
    } else if (gameState.drag.kind === 'attack') {
      resolveAttack(gameState.drag.fromSlot, targetKey);
    }
  }

  clearDrag();
}

function bindEvents() {
  ui.hand.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.hand-card');
    if (!card) return;
    const handIndex = Number(card.dataset.handIndex);
    e.preventDefault();
    beginCardDrag(handIndex, e);
  });

  ui.battlefield.addEventListener('pointerdown', (e) => {
    const unit = e.target.closest('.unit');
    if (!unit) return;
    const cell = unit.closest('[data-key]');
    if (!cell) return;
    e.preventDefault();
    beginUnitDrag(cell.dataset.key, e);
  });

  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', clearDrag);

  ui.endTurnBtn.addEventListener('click', () => {
    if (gameState.currentTurn === 'player') endTurn();
  });

  ui.restartBtn.addEventListener('click', () => {
    clearDrag();
    resetGame();
  });
}

function gameLoop(now) {
  update(now);
  render(now);
  requestAnimationFrame(gameLoop);
}

loadAssets();
bindEvents();
resetGame();
requestAnimationFrame(gameLoop);
