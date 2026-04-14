const CONFIG = {
  leaderHP: 24,
  turnStoneGain: 2,
  summonCost: 1,
  levelUpCost: 1,
  maxHand: 5,
  enemyDelayMs: 550,
  hitEffectMs: 300,
  unitTemplates: [
    { key: 'adjacent', name: 'Swordsman', attack: 3, hp: 6, maxLevel: 2 },
    { key: 'one_jump', name: 'Lancer', attack: 2, hp: 5, maxLevel: 2 },
    { key: 'anywhere', name: 'Sniper', attack: 2, hp: 4, maxLevel: 2 },
  ],
};

const ASSETS = {
  leaderPlayer: 'assets/leader-player.svg',
  leaderEnemy: 'assets/leader-enemy.svg',
  adjacent: 'assets/melee.svg',
  one_jump: 'assets/ranged.svg',
  anywhere: 'assets/sniper.svg',
};

const BOARD_ORDER = [
  'enemyBackLeft', 'blockedTopCenter', 'enemyBackRight',
  'enemyFrontLeft', 'enemyLeader', 'enemyFrontRight',
  'playerFrontLeft', 'playerLeader', 'playerFrontRight',
  'playerBackLeft', 'blockedBottomCenter', 'playerBackRight',
];

const SLOT_META = {
  enemyBackLeft: { side: 'enemy', row: 'back', playable: true, label: 'Enemy Back L' },
  blockedTopCenter: { side: 'none', row: 'blocked', playable: false, label: 'Blocked' },
  enemyBackRight: { side: 'enemy', row: 'back', playable: true, label: 'Enemy Back R' },
  enemyFrontLeft: { side: 'enemy', row: 'front', playable: true, label: 'Enemy Front L' },
  enemyLeader: { side: 'enemy', row: 'leader', playable: false, label: 'Enemy Leader' },
  enemyFrontRight: { side: 'enemy', row: 'front', playable: true, label: 'Enemy Front R' },
  playerFrontLeft: { side: 'player', row: 'front', playable: true, label: 'Player Front L' },
  playerLeader: { side: 'player', row: 'leader', playable: false, label: 'Player Leader' },
  playerFrontRight: { side: 'player', row: 'front', playable: true, label: 'Player Front R' },
  playerBackLeft: { side: 'player', row: 'back', playable: true, label: 'Player Back L' },
  blockedBottomCenter: { side: 'none', row: 'blocked', playable: false, label: 'Blocked' },
  playerBackRight: { side: 'player', row: 'back', playable: true, label: 'Player Back R' },
};

const PLAYABLE_SLOTS = BOARD_ORDER.filter((k) => SLOT_META[k].playable);
const PLAYER_SUMMON_SLOTS = ['playerFrontLeft', 'playerFrontRight', 'playerBackLeft', 'playerBackRight'];
const ENEMY_SUMMON_SLOTS = ['enemyFrontLeft', 'enemyFrontRight', 'enemyBackLeft', 'enemyBackRight'];

const RANGE_MAP = {
  adjacent: {
    playerFrontLeft: ['enemyFrontLeft', 'enemyLeader', 'enemyBackLeft', 'playerBackLeft'],
    playerFrontRight: ['enemyFrontRight', 'enemyLeader', 'enemyBackRight', 'playerBackRight'],
    playerBackLeft: ['playerFrontLeft'],
    playerBackRight: ['playerFrontRight'],
    enemyFrontLeft: ['playerFrontLeft', 'playerLeader', 'playerBackLeft', 'enemyBackLeft'],
    enemyFrontRight: ['playerFrontRight', 'playerLeader', 'playerBackRight', 'enemyBackRight'],
    enemyBackLeft: ['enemyFrontLeft'],
    enemyBackRight: ['enemyFrontRight'],
  },
  one_jump: {
    playerFrontLeft: ['enemyBackLeft', 'enemyFrontRight'],
    playerFrontRight: ['enemyBackRight', 'enemyFrontLeft'],
    playerBackLeft: ['enemyFrontLeft', 'enemyLeader'],
    playerBackRight: ['enemyFrontRight', 'enemyLeader'],
    enemyFrontLeft: ['playerBackLeft', 'playerFrontRight'],
    enemyFrontRight: ['playerBackRight', 'playerFrontLeft'],
    enemyBackLeft: ['playerFrontLeft', 'playerLeader'],
    enemyBackRight: ['playerFrontRight', 'playerLeader'],
  },
  anywhere: {},
};

const ui = {
  battlefield: document.getElementById('battlefield'),
  hand: document.getElementById('hand'),
  turnIndicator: document.getElementById('turn-indicator'),
  phaseIndicator: document.getElementById('phase-indicator'),
  playerResource: document.getElementById('player-resource'),
  enemyResource: document.getElementById('enemy-resource'),
  status: document.getElementById('status'),
  endTurnBtn: document.getElementById('end-turn-btn'),
  restartBtn: document.getElementById('restart-btn'),
  dragGhost: document.getElementById('drag-ghost'),
  aimLine: document.getElementById('aim-line'),
  levelupOverlay: document.getElementById('levelup-overlay'),
  levelupText: document.getElementById('levelup-text'),
  levelupYes: document.getElementById('levelup-yes'),
  levelupSkip: document.getElementById('levelup-skip'),
};

const assetStore = {};
let unitCounter = 1;

const gameState = {
  phase: 'start',
  currentTurn: 'player',
  playerHP: CONFIG.leaderHP,
  enemyHP: CONFIG.leaderHP,
  playerStone: 0,
  enemyStone: 0,
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
    handIndex: null,
    fromSlot: null,
    unitId: null,
    x: 0,
    y: 0,
    validTargets: [],
  },
  pendingLevelUp: {
    active: false,
    slotKey: null,
    owner: null,
  },
  transientEffects: [],
  enemyActionAt: null,
  message: '',
  dirty: {
    board: true,
    hand: true,
    hud: true,
    overlay: true,
  },
};

function markDirty(...parts) {
  parts.forEach((p) => {
    gameState.dirty[p] = true;
  });
}

function cloneTemplateForOwner(owner) {
  const template = CONFIG.unitTemplates[Math.floor(Math.random() * CONFIG.unitTemplates.length)];
  return {
    id: `${owner}-${unitCounter++}`,
    owner,
    name: template.name,
    attack: template.attack,
    hp: template.hp,
    maxHP: template.hp,
    level: 0,
    maxLevel: template.maxLevel,
    attackProfile: template.key,
    investedStone: CONFIG.summonCost,
    hasActed: false,
  };
}

function drawCardForPlayer() {
  if (gameState.hand.length >= CONFIG.maxHand) return;
  gameState.hand.push(cloneTemplateForOwner('player'));
  markDirty('hand');
}

function loadAssetWithFallback(key, src) {
  assetStore[key] = { src, loaded: false, failed: false };
  const img = new Image();
  img.onload = () => {
    assetStore[key].loaded = true;
  };
  img.onerror = () => {
    assetStore[key].failed = true;
  };
  img.src = src;
}

function initAssets() {
  Object.entries(ASSETS).forEach(([key, src]) => loadAssetWithFallback(key, src));
}

function resetGame() {
  unitCounter = 1;
  gameState.phase = 'playing';
  gameState.currentTurn = 'player';
  gameState.playerHP = CONFIG.leaderHP;
  gameState.enemyHP = CONFIG.leaderHP;
  gameState.playerStone = 0;
  gameState.enemyStone = 0;
  PLAYABLE_SLOTS.forEach((slot) => {
    if (!slot.endsWith('Leader')) gameState.board[slot] = null;
  });
  gameState.hand = [];
  drawCardForPlayer();
  drawCardForPlayer();
  drawCardForPlayer();
  clearDrag();
  gameState.pendingLevelUp = { active: false, slotKey: null, owner: null };
  gameState.transientEffects = [];
  gameState.enemyActionAt = null;
  gameState.message = 'カードをドラッグして召喚、ユニットをドラッグして攻撃。';
  startTurn('player');
  markDirty('board', 'hand', 'hud', 'overlay');
}

function startTurn(side) {
  if (side === 'player') {
    gameState.playerStone += CONFIG.turnStoneGain;
    Object.entries(gameState.board).forEach(([slot, unit]) => {
      if (unit && unit.owner === 'player') unit.hasActed = false;
    });
    drawCardForPlayer();
    gameState.message = 'あなたのターン: 召喚と攻撃を実行してください。';
  } else {
    gameState.enemyStone += CONFIG.turnStoneGain;
    Object.entries(gameState.board).forEach(([slot, unit]) => {
      if (unit && unit.owner === 'enemy') unit.hasActed = false;
    });
    gameState.enemyActionAt = performance.now() + CONFIG.enemyDelayMs;
    gameState.message = '敵のターン';
  }
  gameState.currentTurn = side;
  markDirty('board', 'hand', 'hud');
}

function endTurn() {
  if (gameState.phase !== 'playing' || gameState.pendingLevelUp.active) return;
  const next = gameState.currentTurn === 'player' ? 'enemy' : 'player';
  startTurn(next);
}

function getOwnerStone(owner) {
  return owner === 'player' ? gameState.playerStone : gameState.enemyStone;
}

function setOwnerStone(owner, value) {
  if (owner === 'player') gameState.playerStone = value;
  else gameState.enemyStone = value;
}

function getAdjacentTargets(slotKey) {
  return RANGE_MAP.adjacent[slotKey] ?? [];
}

function getReachableTargets(unit, sourceSlotKey) {
  if (unit.attackProfile === 'anywhere') {
    return Object.keys(gameState.board).filter((k) => {
      if (k.endsWith('Leader')) return true;
      return SLOT_META[k] && SLOT_META[k].playable;
    });
  }
  const map = RANGE_MAP[unit.attackProfile] || {};
  return map[sourceSlotKey] || [];
}

function canUnitAttackTarget(unit, sourceSlotKey, targetKey) {
  if (!unit || unit.hasActed || !targetKey || sourceSlotKey === targetKey) return false;
  const meta = SLOT_META[targetKey];
  if (!meta) return false;

  const reachable = getReachableTargets(unit, sourceSlotKey);
  if (!reachable.includes(targetKey)) return false;

  if (targetKey.endsWith('Leader')) {
    const targetOwner = targetKey.startsWith('enemy') ? 'enemy' : 'player';
    return targetOwner !== unit.owner;
  }

  const targetUnit = gameState.board[targetKey];
  return Boolean(targetUnit && targetUnit.owner !== unit.owner);
}

function getValidAttackTargets(fromSlotKey, unit) {
  const reachable = getReachableTargets(unit, fromSlotKey);
  return reachable.filter((targetKey) => canUnitAttackTarget(unit, fromSlotKey, targetKey));
}

function getValidSummonTargets(owner) {
  const slots = owner === 'player' ? PLAYER_SUMMON_SLOTS : ENEMY_SUMMON_SLOTS;
  return slots.filter((slot) => !gameState.board[slot]);
}

function summonUnit(owner, handIndex, slotKey) {
  if (owner !== 'player') return false;
  if (!getValidSummonTargets(owner).includes(slotKey)) return false;
  if (getOwnerStone(owner) < CONFIG.summonCost) {
    gameState.message = 'ストーン不足で召喚できません。';
    markDirty('hud');
    return false;
  }
  const card = gameState.hand[handIndex];
  if (!card) return false;
  gameState.hand.splice(handIndex, 1);
  card.hasActed = true;
  gameState.board[slotKey] = card;
  setOwnerStone(owner, getOwnerStone(owner) - CONFIG.summonCost);
  gameState.message = `${card.name} を ${slotKey} に召喚。`;
  markDirty('board', 'hand', 'hud');
  return true;
}

function refundInvestedStones(unit) {
  if (!unit) return;
  setOwnerStone(unit.owner, getOwnerStone(unit.owner) + unit.investedStone);
}

function removeDefeatedUnits() {
  PLAYABLE_SLOTS.forEach((slot) => {
    const unit = gameState.board[slot];
    if (!unit || unit.type === 'leader') return;
    if (unit.hp <= 0) {
      refundInvestedStones(unit);
      gameState.board[slot] = null;
    }
  });
}

function applyLeaderDamage(side, damage) {
  if (side === 'player') gameState.playerHP -= damage;
  else gameState.enemyHP -= damage;
}

function checkGameOver() {
  if (gameState.playerHP <= 0 || gameState.enemyHP <= 0) {
    gameState.phase = 'gameover';
    gameState.message = gameState.playerHP <= 0 ? '敗北しました。' : '勝利しました！';
    markDirty('hud');
  }
}

function tryLevelUp(attackerSlotKey, attackerOwner) {
  const attacker = gameState.board[attackerSlotKey];
  if (!attacker) return;
  if (attacker.level >= attacker.maxLevel) return;

  gameState.pendingLevelUp = {
    active: true,
    slotKey: attackerSlotKey,
    owner: attackerOwner,
  };
  markDirty('overlay', 'hud');
}

function applyLevelUpChoice(doLevelUp) {
  if (!gameState.pendingLevelUp.active) return;
  const { slotKey, owner } = gameState.pendingLevelUp;
  const unit = gameState.board[slotKey];
  if (unit && doLevelUp && getOwnerStone(owner) >= CONFIG.levelUpCost && unit.level < unit.maxLevel) {
    setOwnerStone(owner, getOwnerStone(owner) - CONFIG.levelUpCost);
    unit.level += 1;
    unit.maxHP += 1;
    unit.hp = unit.maxHP;
    unit.attack += 1;
    unit.investedStone += 1;
    gameState.message = `${unit.name} がレベル ${unit.level} に強化。`;
  } else if (doLevelUp) {
    gameState.message = 'ストーン不足または上限でレベルアップ不可。';
  } else {
    gameState.message = 'レベルアップを見送りました。';
  }
  gameState.pendingLevelUp = { active: false, slotKey: null, owner: null };
  markDirty('board', 'hud', 'overlay');
}

function resolveAttack(sourceSlotKey, targetKey) {
  const attacker = gameState.board[sourceSlotKey];
  if (!attacker) return false;
  if (!canUnitAttackTarget(attacker, sourceSlotKey, targetKey)) return false;

  let defeatedUnit = null;
  if (targetKey.endsWith('Leader')) {
    const targetSide = targetKey.startsWith('player') ? 'player' : 'enemy';
    applyLeaderDamage(targetSide, attacker.attack);
    gameState.message = `${attacker.name} がリーダーに ${attacker.attack} ダメージ。`;
  } else {
    const defender = gameState.board[targetKey];
    defender.hp -= attacker.attack;
    gameState.message = `${attacker.name} -> ${defender.name} (${attacker.attack}ダメージ)`;
    if (defender.hp <= 0) {
      defeatedUnit = defender;
    }
  }

  attacker.hasActed = true;
  gameState.transientEffects.push({ targetKey, until: performance.now() + CONFIG.hitEffectMs });

  removeDefeatedUnits();
  checkGameOver();

  if (defeatedUnit && gameState.phase === 'playing') {
    tryLevelUp(sourceSlotKey, attacker.owner);
  }

  markDirty('board', 'hud', 'overlay');
  return true;
}

function findCellAtPoint(x, y) {
  const element = document.elementFromPoint(x, y);
  const cell = element ? element.closest('[data-key]') : null;
  return cell ? cell.dataset.key : null;
}

function clearDrag() {
  gameState.drag = {
    active: false,
    pointerId: null,
    kind: null,
    handIndex: null,
    fromSlot: null,
    unitId: null,
    x: 0,
    y: 0,
    validTargets: [],
  };
  ui.dragGhost.classList.add('hidden');
  ui.aimLine.classList.add('hidden');
}

function beginCardDrag(handIndex, e) {
  if (gameState.phase !== 'playing' || gameState.currentTurn !== 'player') return;
  if (gameState.pendingLevelUp.active) return;
  if (!gameState.hand[handIndex]) return;

  gameState.drag.active = true;
  gameState.drag.pointerId = e.pointerId;
  gameState.drag.kind = 'summon';
  gameState.drag.handIndex = handIndex;
  gameState.drag.x = e.clientX;
  gameState.drag.y = e.clientY;
  gameState.drag.validTargets = getOwnerStone('player') >= CONFIG.summonCost ? getValidSummonTargets('player') : [];
  gameState.message = gameState.drag.validTargets.length ? '有効スロットにドロップで召喚。' : '召喚できる枠またはストーンがありません。';
  markDirty('hud');
}

function beginUnitDrag(slotKey, e) {
  if (gameState.phase !== 'playing' || gameState.currentTurn !== 'player') return;
  if (gameState.pendingLevelUp.active) return;
  const unit = gameState.board[slotKey];
  if (!unit || unit.owner !== 'player' || unit.hasActed) return;

  gameState.drag.active = true;
  gameState.drag.pointerId = e.pointerId;
  gameState.drag.kind = 'attack';
  gameState.drag.fromSlot = slotKey;
  gameState.drag.unitId = unit.id;
  gameState.drag.x = e.clientX;
  gameState.drag.y = e.clientY;
  gameState.drag.validTargets = getValidAttackTargets(slotKey, unit);
  gameState.message = gameState.drag.validTargets.length ? '有効ターゲットへドロップで即攻撃。' : 'このユニットは攻撃可能対象がありません。';
  markDirty('hud');
}

function setDropHighlights() {
  document.querySelectorAll('.drop-valid, .drop-invalid').forEach((el) => {
    el.classList.remove('drop-valid', 'drop-invalid');
  });
  if (!gameState.drag.active) return;

  const candidates = gameState.drag.kind === 'summon'
    ? PLAYER_SUMMON_SLOTS
    : BOARD_ORDER.filter((k) => k !== gameState.drag.fromSlot);

  candidates.forEach((key) => {
    const cell = ui.battlefield.querySelector(`[data-key='${key}']`);
    if (!cell) return;
    if (gameState.drag.validTargets.includes(key)) cell.classList.add('drop-valid');
    else cell.classList.add('drop-invalid');
  });
}

function updateDragOverlay() {
  if (!gameState.drag.active) return;

  if (gameState.drag.kind === 'summon') {
    const card = gameState.hand[gameState.drag.handIndex];
    if (!card) return;
    ui.dragGhost.classList.remove('hidden');
    ui.dragGhost.style.left = `${gameState.drag.x}px`;
    ui.dragGhost.style.top = `${gameState.drag.y}px`;
    ui.dragGhost.textContent = `${card.name} L${card.level} ATK${card.attack} HP${card.hp}`;
    ui.aimLine.classList.add('hidden');
    return;
  }

  ui.dragGhost.classList.add('hidden');
  const sourceUnitEl = ui.battlefield.querySelector(`[data-key='${gameState.drag.fromSlot}'] .unit`);
  if (!sourceUnitEl) return;
  const rect = sourceUnitEl.getBoundingClientRect();
  const x0 = rect.left + rect.width / 2;
  const y0 = rect.top + rect.height / 2;
  const dx = gameState.drag.x - x0;
  const dy = gameState.drag.y - y0;
  const len = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  ui.aimLine.classList.remove('hidden');
  ui.aimLine.style.left = `${x0}px`;
  ui.aimLine.style.top = `${y0}px`;
  ui.aimLine.style.width = `${len}px`;
  ui.aimLine.style.transform = `rotate(${angle}deg)`;
}

function getAssetNode(assetKey, fallbackText) {
  const wrapper = document.createElement('div');
  const state = assetStore[assetKey];
  if (state && state.loaded && !state.failed) {
    const img = document.createElement('img');
    img.className = 'asset';
    img.src = state.src;
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
  stats.textContent = `L${unit.level} ATK ${unit.attack} HP ${unit.hp}/${unit.maxHP} Stone ${unit.investedStone}`;

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
  cell.classList.add('cell');
  cell.dataset.key = slotKey;

  if (!meta.playable) {
    cell.classList.add('blocked');
    return cell;
  }

  if (meta.row === 'leader') {
    cell.classList.add('leader-slot');
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
  const fragment = document.createDocumentFragment();
  BOARD_ORDER.forEach((slotKey) => {
    fragment.appendChild(createCell(slotKey));
  });
  ui.battlefield.replaceChildren(fragment);
  gameState.dirty.board = false;
}

function renderHand() {
  if (!gameState.dirty.hand) return;
  const fragment = document.createDocumentFragment();
  gameState.hand.forEach((card, index) => {
    const el = document.createElement('div');
    el.className = 'hand-card';
    el.dataset.handIndex = String(index);
    el.appendChild(getAssetNode(card.attackProfile, card.attackProfile.toUpperCase()));

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = `${card.name} (L${card.level})`;

    const stats = document.createElement('div');
    stats.className = 'stats';
    stats.textContent = `ATK ${card.attack} HP ${card.hp}/${card.maxHP}`;

    el.append(name, stats);
    fragment.appendChild(el);
  });
  ui.hand.replaceChildren(fragment);
  gameState.dirty.hand = false;
}

function renderHud() {
  if (!gameState.dirty.hud) return;
  ui.turnIndicator.textContent = `Turn: ${gameState.currentTurn}`;
  ui.phaseIndicator.textContent = `Phase: ${gameState.phase}`;
  ui.playerResource.textContent = `Player HP ${gameState.playerHP} / Stone ${gameState.playerStone}`;
  ui.enemyResource.textContent = `Enemy HP ${gameState.enemyHP} / Stone ${gameState.enemyStone}`;
  ui.status.textContent = gameState.message;
  ui.restartBtn.classList.toggle('hidden', gameState.phase !== 'gameover');
  ui.endTurnBtn.disabled = gameState.currentTurn !== 'player' || gameState.pendingLevelUp.active || gameState.phase !== 'playing';
  gameState.dirty.hud = false;
}

function renderLevelUpOverlay() {
  if (!gameState.dirty.overlay) return;
  const pending = gameState.pendingLevelUp;
  ui.levelupOverlay.classList.toggle('hidden', !pending.active);
  if (pending.active) {
    const unit = gameState.board[pending.slotKey];
    const canPay = getOwnerStone(pending.owner) >= CONFIG.levelUpCost;
    ui.levelupText.textContent = `${unit?.name ?? 'Unit'} を強化しますか？ 消費: ${CONFIG.levelUpCost} stone`;
    ui.levelupYes.disabled = !canPay || !unit || unit.level >= unit.maxLevel;
  }
  gameState.dirty.overlay = false;
}

function applyTransientEffects(now) {
  gameState.transientEffects = gameState.transientEffects.filter((effect) => effect.until > now);
  gameState.transientEffects.forEach((effect) => {
    const cell = ui.battlefield.querySelector(`[data-key='${effect.targetKey}']`);
    if (cell) cell.classList.add('hit-flash');
  });
}

function runEnemyAI() {
  if (gameState.phase !== 'playing' || gameState.currentTurn !== 'enemy' || gameState.pendingLevelUp.active) return;

  while (gameState.enemyStone >= CONFIG.summonCost) {
    const openSlots = getValidSummonTargets('enemy');
    if (!openSlots.length) break;
    const slot = openSlots[Math.floor(Math.random() * openSlots.length)];
    const unit = cloneTemplateForOwner('enemy');
    unit.hasActed = true;
    gameState.board[slot] = unit;
    gameState.enemyStone -= CONFIG.summonCost;
  }

  for (const slot of ENEMY_SUMMON_SLOTS) {
    const unit = gameState.board[slot];
    if (!unit || unit.owner !== 'enemy' || unit.hasActed) continue;
    const targets = getValidAttackTargets(slot, unit);
    if (!targets.length) continue;
    const target = targets.includes('playerLeader') ? 'playerLeader' : targets[0];
    resolveAttack(slot, target);
    if (gameState.pendingLevelUp.active) {
      applyLevelUpChoice(getOwnerStone('enemy') >= CONFIG.levelUpCost);
    }
    if (gameState.phase !== 'playing') break;
  }

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
  renderLevelUpOverlay();
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

  const targetKey = findCellAtPoint(e.clientX, e.clientY);
  if (targetKey && gameState.drag.validTargets.includes(targetKey)) {
    if (gameState.drag.kind === 'summon') {
      summonUnit('player', gameState.drag.handIndex, targetKey);
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
    e.preventDefault();
    beginCardDrag(Number(card.dataset.handIndex), e);
  });

  ui.battlefield.addEventListener('pointerdown', (e) => {
    const unitEl = e.target.closest('.unit');
    if (!unitEl) return;
    const cell = unitEl.closest('[data-key]');
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
    resetGame();
  });

  ui.levelupYes.addEventListener('click', () => applyLevelUpChoice(true));
  ui.levelupSkip.addEventListener('click', () => applyLevelUpChoice(false));
}

function gameLoop(now) {
  update(now);
  render(now);
  requestAnimationFrame(gameLoop);
}

initAssets();
bindEvents();
resetGame();
requestAnimationFrame(gameLoop);

// Expose helpers for debugging/tests.
window.__game = {
  gameState,
  getAdjacentTargets,
  getReachableTargets,
  canUnitAttackTarget,
  resolveAttack,
  tryLevelUp,
  refundInvestedStones,
  startTurn,
  endTurn,
  summonUnit,
  removeDefeatedUnits,
};
