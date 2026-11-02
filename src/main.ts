// DESIGN-ANCHOR: Rimba — Survival Town 2.5D Pastel Isometric Fantasy World Engine
// Coordinate Invariant:
// - Grid is 56 x 56 tiles (tx, ty in [0..55]). Central spawn is (28, 30).
// - World Coordinates (wx, wy): wx = (tx - ty) * 32, wy = (tx + ty) * 16.
// - `this.worldPos` is ALWAYS in World Pixel Coordinates (wx, wy). NEVER pass `this.worldPos` to `tileToWorld()`!

import Phaser from 'phaser';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { TEXT, getSavedLang, setSavedLang, type Lang } from './i18n';
import {
  CHARACTER_MODELS,
  GAME_CONFIG,
  OUTFIT_CATALOG,
  WORLD_FACILITIES,
  getCharacterModelSpec,
  getWibTimeInfo,
  isArenaTile,
  isCentralTile,
  isDecorativeTreeTile,
  isDungeon1Tile,
  isDungeon2Tile,
  isRoadTile,
  isStoneWorkAreaTile,
  isWalkableTile,
  isWaterTile,
  isWoodWorkAreaTile,
  localBackend,
  renderChibiCharacterSvg,
  sanitizePlayerLabelName,
  validateAndModerateCharacterName,
  type AfkActivityType,
  type Character,
  type FacilityLandmark,
  type LocalUser,
  type SimulatedAfkCitizen,
} from './localStore';
import { mountPhaseTwo } from './phase2';

type Avatar = {
  userId: string;
  clientId?: string;
  name: string;
  tx: number;
  ty: number;
  color: string;
  hatColor?: string;
  modelId?: string;
  isAfk?: boolean;
};

type DungeonMonsterConfig = {
  id: string;
  kind: 'slime' | 'goblin';
  homeTx: number;
  homeTy: number;
  patrolWaypoints: Array<{ x: number; y: number }>;
  maxHp: number;
};

// Section 10: Upper Dungeon (6..13, 7..14) spawns Slime ONLY. Lower Dungeon (44..51, 43..50) spawns Goblin ONLY.
const DUNGEON_MONSTER_SPAWNS: DungeonMonsterConfig[] = [
  // Upper Dungeon (Slime only)
  {
    id: 'slime-1',
    kind: 'slime',
    homeTx: 8,
    homeTy: 12,
    patrolWaypoints: [
      { x: 8, y: 12 },
      { x: 10, y: 12 },
      { x: 9, y: 10 },
    ],
    maxHp: 45,
  },
  {
    id: 'slime-2',
    kind: 'slime',
    homeTx: 11,
    homeTy: 11,
    patrolWaypoints: [
      { x: 11, y: 11 },
      { x: 12, y: 9 },
      { x: 10, y: 9 },
    ],
    maxHp: 45,
  },
  {
    id: 'slime-3',
    kind: 'slime',
    homeTx: 8,
    homeTy: 9,
    patrolWaypoints: [
      { x: 8, y: 9 },
      { x: 7, y: 11 },
      { x: 9, y: 8 },
    ],
    maxHp: 45,
  },
  // Lower Dungeon (Goblin only)
  {
    id: 'goblin-1',
    kind: 'goblin',
    homeTx: 46,
    homeTy: 47,
    patrolWaypoints: [
      { x: 46, y: 47 },
      { x: 48, y: 47 },
      { x: 47, y: 45 },
    ],
    maxHp: 75,
  },
  {
    id: 'goblin-2',
    kind: 'goblin',
    homeTx: 49,
    homeTy: 46,
    patrolWaypoints: [
      { x: 49, y: 46 },
      { x: 50, y: 48 },
      { x: 48, y: 49 },
    ],
    maxHp: 75,
  },
  {
    id: 'goblin-3',
    kind: 'goblin',
    homeTx: 46,
    homeTy: 49,
    patrolWaypoints: [
      { x: 46, y: 49 },
      { x: 45, y: 46 },
      { x: 48, y: 48 },
    ],
    maxHp: 75,
  },
];

const AFK_WAYPOINTS: Record<AfkActivityType, Array<{ x: number; y: number }>> = {
  stroll: [
    { x: 26, y: 29 },
    { x: 30, y: 29 },
    { x: 31, y: 26 },
    { x: 28, y: 25 },
    { x: 25, y: 27 },
    { x: 27, y: 31 },
  ],
  wood: [
    { x: 42, y: 28 },
    { x: 44, y: 26 },
    { x: 46, y: 29 },
    { x: 43, y: 30 },
  ],
  stone: [
    { x: 36, y: 44 },
    { x: 39, y: 45 },
    { x: 38, y: 46 },
    { x: 35, y: 43 },
  ],
  fish: [
    { x: 27, y: 15 },
    { x: 28, y: 15 },
    { x: 29, y: 15 },
  ],
  dungeon: [
    { x: 11, y: 12 },
    { x: 9, y: 12 },
    { x: 10, y: 10 },
    { x: 12, y: 11 },
  ],
};

function resolveSupabaseConfig(): { url?: string; key?: string } {
  const nextUrl =
    typeof process !== 'undefined'
      ? process.env?.NEXT_PUBLIC_SUPABASE_URL || process.env?.VITE_SUPABASE_URL
      : undefined;
  const nextKey =
    typeof process !== 'undefined'
      ? process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env?.VITE_SUPABASE_ANON_KEY
      : undefined;
  return { url: nextUrl, key: nextKey };
}

function makePoints(coords: Array<[number, number]>): Phaser.Math.Vector2[] {
  return coords.map(([x, y]) => new Phaser.Math.Vector2(x, y));
}

const supaCfg = resolveSupabaseConfig();
const supabase: SupabaseClient | null =
  supaCfg.url && supaCfg.key ? createClient(supaCfg.url, supaCfg.key) : null;

const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;

let currentLang: Lang = getSavedLang();
let currentUser: LocalUser | null = null;
let character: Character | null = null;
let channel: RealtimeChannel | null = null;
let localBroadcast: BroadcastChannel | null = null;
let world: WorldScene | null = null;
let ownTilePosition = { x: GAME_CONFIG.CENTRAL_SPAWN.x, y: GAME_CONFIG.CENTRAL_SPAWN.y };
let initialized = false;
const clientId =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `client-${Date.now()}`;
const latestMoves = new Map<string, Avatar>();

function t() {
  return TEXT[currentLang];
}

function isFormInputFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (active as HTMLElement).isContentEditable;
}

function getHatColor(hatId?: string): string | null {
  if (!hatId || hatId === 'none') return null;
  const found = OUTFIT_CATALOG.find(item => item.id === hatId && item.category === 'hat');
  return found && found.color !== 'transparent' ? found.color : null;
}

function hexToNum(hex: string, fallback = 0x5f9e6e): number {
  try {
    return Phaser.Display.Color.HexStringToColor(hex).color;
  } catch {
    return fallback;
  }
}

class WorldScene extends Phaser.Scene {
  private avatar!: Phaser.GameObjects.Container;
  private avatarShadow!: Phaser.GameObjects.Ellipse;
  private avatarBodyGroup!: Phaser.GameObjects.Container;
  private nameTag!: Phaser.GameObjects.Text;
  private targetRing!: Phaser.GameObjects.Ellipse;
  private attackSlashGraphic!: Phaser.GameObjects.Graphics;
  private others = new Map<
    string,
    {
      container: Phaser.GameObjects.Container;
      bodyGroup: Phaser.GameObjects.Container;
      target: Phaser.Math.Vector2;
      label: Phaser.GameObjects.Text;
      lastSeen: number;
      walkPhase: number;
    }
  >();
  private graphics!: Phaser.GameObjects.Graphics;
  private obstacles = new Set<string>();
  private path: Phaser.Math.Vector2[] = [];
  private pendingActionAfterWalk: (() => void) | null = null;
  private moving = new Phaser.Math.Vector2();
  private lastBroadcast = 0;
  // CRITICAL: worldPos is ALWAYS in WORLD pixel coordinates (wx, wy)!
  private worldPos = new Phaser.Math.Vector2(-64, 928);
  private lastSentWorld = new Phaser.Math.Vector2(-9999, -9999);
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private walkPhase = 0;
  private isDraggingCam = false;
  private isCameraFollowingAvatar = true;
  private dragStart = new Phaser.Math.Vector2();
  private facilityLabels: Array<{ textObj: Phaser.GameObjects.Text; name_id: string; name_en: string }> = [];
  private simAfkEntities: Array<{
    citizen: SimulatedAfkCitizen;
    container: Phaser.GameObjects.Container;
    shadow: Phaser.GameObjects.Ellipse;
    bodyGroup: Phaser.GameObjects.Container;
    label: Phaser.GameObjects.Text;
    worldPos: Phaser.Math.Vector2;
    waypointIdx: number;
    walkPhase: number;
  }> = [];
  private monsters: Array<{
    cfg: DungeonMonsterConfig;
    container: Phaser.GameObjects.Container;
    bodyGraphic: Phaser.GameObjects.Graphics;
    hpBarFill: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
    worldPos: Phaser.Math.Vector2;
    hp: number;
    maxHp: number;
    waypointIdx: number;
    bobPhase: number;
    lastCounterAttackAt: number;
    respawnAt: number | null;
  }> = [];

  // AFK state tracking
  private lastValidInputAt = Date.now();
  private isAfkBotActive = false;
  private lastAfkBatchTickAt = 0;
  private afkWaypointIdx = 0;
  private lastPlayerSpaceAttackAt = 0;

  constructor() {
    super('world');
  }

  create() {
    world = this;
    const spawn = this.tileToWorld(ownTilePosition.x, ownTilePosition.y);
    this.worldPos.set(spawn.x, spawn.y);

    this.graphics = this.add.graphics();
    this.attackSlashGraphic = this.add.graphics().setDepth(9999);
    this.cameras.main.setZoom(1.04);
    // 56x56 isometric diamond spans X: [-1792..+1792], Y: [0..1792]
    this.cameras.main.setBounds(-1950, -260, 3900, 2250);
    this.cameras.main.centerOn(spawn.x, spawn.y);

    // Disable browser right-click context menu on the game canvas so Right-Click Hold & Drag works smoothly
    this.input.mouse?.disableContextMenu();
    this.game.canvas?.addEventListener('contextmenu', e => e.preventDefault());

    if (this.input.keyboard) {
      this.input.keyboard.disableGlobalCapture();
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys('W,A,S,D', false) as Record<string, Phaser.Input.Keyboard.Key>;
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false);
    }

    this.targetRing = this.add
      .ellipse(spawn.x, spawn.y, 30, 15, 0xfde68a, 0.18)
      .setStrokeStyle(2.5, 0xfef08a, 0.95)
      .setVisible(false)
      .setDepth(5);

    this.input.on('wheel', (_pointer: unknown, _go: unknown, _dx: number, dy: number) => {
      const nextZoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.62, 1.65);
      this.cameras.main.setZoom(nextZoom);
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (document.querySelector('#scrim') || document.querySelector('#phase2-scrim')) return;

      // Section 12: Right-Click Hold & Drag pans the camera at ANY time (alive, AFK, downed, waiting for revive, or spectator)
      if (p.rightButtonDown() || !character) {
        this.isDraggingCam = true;
        this.dragStart.set(p.x, p.y);
        if (this.isCameraFollowingAvatar) {
          this.cameras.main.stopFollow();
          this.isCameraFollowingAvatar = false;
        }
        return;
      }

      // Left-Click: Walk to clicked point / interact with building or resource node (NOT primary attack)
      if (!p.leftButtonDown()) return;

      // Check death or waiting-revive lock
      if (currentUser && localBackend.isDownedOrWaitingRevive(currentUser.id).locked) {
        return;
      }

      this.registerValidPlayerInput();
      this.resumeCameraFollow();

      const point = this.cameras.main.getWorldPoint(p.x, p.y);
      const clickedTile = this.worldToTile(point.x, point.y);
      const curTile = this.worldToTile(this.worldPos.x, this.worldPos.y);

      // 1. Check if player clicked on a Collectable Work Node (Wood, Stone, Fish)
      for (const node of localBackend.getWorkNodes()) {
        if (Math.hypot(clickedTile.x - node.tile_x, clickedTile.y - node.tile_y) <= 1.8) {
          const distToNode = Math.hypot(curTile.x - node.tile_x, curTile.y - node.tile_y);
          if (distToNode <= GAME_CONFIG.INTERACT_RANGE_TILES) {
            window.dispatchEvent(new Event('rimba-gather-node'));
          } else {
            this.walkToTileAndRun(curTile, node.tile_x, node.tile_y, () => {
              window.dispatchEvent(new Event('rimba-gather-node'));
            });
          }
          return;
        }
      }

      // 2. Check if player clicked on a Facility Building
      for (const fac of WORLD_FACILITIES) {
        if (fac.id === 'work_wood' || fac.id === 'work_stone' || fac.id === 'fishing_lake') continue;
        if (Math.hypot(clickedTile.x - fac.tx, clickedTile.y - fac.ty) <= 2.2) {
          const distToFac = Math.hypot(curTile.x - fac.tx, curTile.y - fac.ty);
          if (distToFac <= 4.4) {
            window.dispatchEvent(new CustomEvent('rimba-open-facility', { detail: { id: fac.id } }));
          } else {
            this.walkToTileAndRun(curTile, fac.tx, fac.ty, () => {
              window.dispatchEvent(new CustomEvent('rimba-open-facility', { detail: { id: fac.id } }));
            });
          }
          return;
        }
      }

      // 3. Otherwise walk to clicked ground/road tile
      this.walkToTileAndRun(curTile, clickedTile.x, clickedTile.y, null);
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.isDraggingCam && p.isDown) {
        const dx = (p.x - this.dragStart.x) / this.cameras.main.zoom;
        const dy = (p.y - this.dragStart.y) / this.cameras.main.zoom;
        this.cameras.main.scrollX -= dx;
        this.cameras.main.scrollY -= dy;
        this.dragStart.set(p.x, p.y);
      }
    });

    this.input.on('pointerup', () => {
      this.isDraggingCam = false;
    });

    this.drawPastelWorldMap();
    this.drawWorkNodesAndLandmarks();
    this.drawSimulatedAfkCitizens();
    this.drawDungeonMonsters();
    this.createAvatar();
    if (character) {
      this.resumeCameraFollow();
    }

    window.addEventListener('character-change', this.onCharacterChange);
    window.addEventListener('rimba-lang-change', this.refreshMapLanguage);
    window.addEventListener('rimba-player-valid-input', this.registerValidPlayerInput);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private resumeCameraFollow() {
    if (character && this.avatar && !this.isCameraFollowingAvatar) {
      this.cameras.main.startFollow(this.avatar, true, 0.12, 0.12);
      this.isCameraFollowingAvatar = true;
    }
  }

  /**
   * Builds a 2.5D Chibi Pixel-Art character sprite matching the reference art:
   * chunky dark outline (#231815), layered bangs/hair, ears, expressive dark eyes,
   * rosy cheek blush, collared shirt with optional crossbody strap, shorts, and brown shoes.
   */
  private buildChibiBodyGroup(
    modelId: string | undefined,
    overrideShirtHex?: string,
    hatColorHex?: string | null
  ): Phaser.GameObjects.Container {
    const spec = getCharacterModelSpec(modelId);
    const g = this.add.graphics();
    const outline = 0x231815;
    const hair = hexToNum(spec.hairColor, 0x4e3529);
    const hairHi = hexToNum(spec.hairHighlight, 0x6b4b3a);
    const skin = hexToNum(spec.skinColor, 0xf7cbb0);
    const shirt = hexToNum(overrideShirtHex || spec.shirtColor, 0xf2ece1);
    const collar = hexToNum(spec.collarColor, 0x64748b);
    const shorts = hexToNum(spec.shortsColor, 0x2f3542);
    const shoes = hexToNum(spec.shoeColor, 0x5c3a24);

    // 1. Feet / Shoes & Legs (y: -9 .. 0)
    g.fillStyle(outline, 1);
    g.fillRect(-7, -9, 6, 9);
    g.fillRect(1, -9, 6, 9);
    g.fillStyle(skin, 1);
    g.fillRect(-6, -9, 4, 4);
    g.fillRect(2, -9, 4, 4);
    g.fillStyle(shoes, 1);
    g.fillRect(-6, -5, 4, 4);
    g.fillRect(2, -5, 4, 4);

    // 2. Shorts (y: -15 .. -8)
    g.fillStyle(outline, 1);
    g.fillRect(-8, -15, 16, 7);
    g.fillStyle(shorts, 1);
    g.fillRect(-7, -14, 6, 5);
    g.fillRect(1, -14, 6, 5);

    // 3. Arms & Hands (y: -25 .. -13)
    g.fillStyle(outline, 1);
    g.fillRect(-12, -25, 4, 12);
    g.fillRect(8, -25, 4, 12);
    g.fillStyle(shirt, 1);
    g.fillRect(-11, -24, 3, 6);
    g.fillRect(8, -24, 3, 6);
    g.fillStyle(skin, 1);
    g.fillRect(-11, -18, 3, 4);
    g.fillRect(8, -18, 3, 4);

    // 4. Torso / Collared Tee (y: -27 .. -14)
    g.fillStyle(outline, 1);
    g.fillRect(-9, -27, 18, 13);
    g.fillStyle(shirt, 1);
    g.fillRect(-8, -26, 16, 11);
    g.fillStyle(collar, 1);
    g.fillRect(-4, -26, 8, 2);
    g.fillRect(-2, -24, 4, 1);

    if (spec.hasBagStrap) {
      g.fillStyle(0x7c5338, 1);
      g.fillRect(-6, -26, 3, 3);
      g.fillRect(-3, -23, 3, 3);
      g.fillRect(0, -20, 3, 3);
      g.fillRect(3, -17, 4, 3);
    }

    // 5. Female side hair locks behind head
    if (spec.gender === 'female') {
      g.fillStyle(outline, 1);
      g.fillRect(-14, -36, 4, 13);
      g.fillRect(10, -36, 4, 13);
      g.fillStyle(hair, 1);
      g.fillRect(-13, -35, 3, 11);
      g.fillRect(10, -35, 3, 11);
    }

    // 6. Chibi Big Head & Ears (y: -47 .. -26)
    g.fillStyle(outline, 1);
    g.fillRect(-14, -38, 3, 6);
    g.fillRect(11, -38, 3, 6);
    g.fillRect(-12, -47, 24, 21);

    g.fillStyle(skin, 1);
    g.fillRect(-13, -37, 2, 4);
    g.fillRect(11, -37, 2, 4);
    g.fillRect(-11, -45, 22, 18);

    // 7. Expressive Dark Pixel Eyes, Eyebrows, Rosy Blush Cheeks & Smile
    g.fillStyle(outline, 1);
    g.fillRect(-7, -38, 4, 1);
    g.fillRect(3, -38, 4, 1);
    g.fillRect(-6, -36, 3, 4);
    g.fillRect(3, -36, 3, 4);
    g.fillStyle(0xffffff, 1);
    g.fillRect(-6, -36, 1, 1);
    g.fillRect(3, -36, 1, 1);
    g.fillStyle(0xf4978e, 0.9);
    g.fillRect(-9, -32, 3, 2);
    g.fillRect(6, -32, 3, 2);
    g.fillStyle(0x7c4338, 1);
    g.fillRect(-1, -31, 2, 1);

    // 8. Voluminous Pixel Hair Cap & Parted Bangs (y: -50 .. -38)
    g.fillStyle(outline, 1);
    g.fillRect(-13, -50, 26, 11);
    g.fillStyle(hair, 1);
    g.fillRect(-12, -49, 24, 9);
    g.fillStyle(hairHi, 1);
    g.fillRect(-8, -48, 16, 3);
    g.fillStyle(hair, 1);
    g.fillRect(-11, -40, 6, 3);
    g.fillRect(-3, -40, 6, 2);
    g.fillRect(5, -40, 6, 3);

    // 9. Optional Equipped Hat on top of hair
    if (hatColorHex) {
      const hatNum = hexToNum(hatColorHex, 0xe6c875);
      g.fillStyle(outline, 1);
      g.fillRect(-14, -53, 28, 4);
      g.fillRect(-9, -57, 18, 5);
      g.fillStyle(hatNum, 1);
      g.fillRect(-13, -52, 26, 2);
      g.fillRect(-8, -56, 16, 4);
    }

    return this.add.container(0, 0, [g]);
  }

  private onVisibilityChange = () => {
    if (document.hidden && currentUser && character) {
      this.enterAfkBotMode();
    }
  };

  public registerValidPlayerInput = () => {
    this.lastValidInputAt = Date.now();
    if (!currentUser || !character) return;

    if (this.isAfkBotActive || localBackend.getInventory(currentUser.id).player_status === 'afk') {
      this.isAfkBotActive = false;
      this.path = [];
      this.pendingActionAfterWalk = null;
      this.targetRing?.setVisible(false);
      const report = localBackend.recordValidPlayerInput(currentUser.id);
      this.updateOwnNameTagText();
      if (report) {
        if (report.died_in_dungeon) {
          this.setPosition(34, 28);
        }
        window.dispatchEvent(new CustomEvent('rimba-afk-report', { detail: { report } }));
      }
      this.broadcastOwnStateNow();
    }
  };

  private enterAfkBotMode() {
    if (!currentUser || !character) return;
    if (localBackend.isDownedOrWaitingRevive(currentUser.id).locked) return;

    localBackend.enterAfkMode(currentUser.id);
    this.isAfkBotActive = true;
    this.lastAfkBatchTickAt = Date.now();
    this.updateOwnNameTagText();
    this.scheduleNextAfkWaypoint();
    this.broadcastOwnStateNow();
  }

  private scheduleNextAfkWaypoint() {
    if (!currentUser || !character || !this.isAfkBotActive) return;
    const inv = localBackend.getInventory(currentUser.id);
    const activePhaseActivity: AfkActivityType = inv.afk_phase === 'stroll' ? 'stroll' : inv.afk_activity;
    const waypoints = AFK_WAYPOINTS[activePhaseActivity] ?? AFK_WAYPOINTS.stroll;
    const target = waypoints[this.afkWaypointIdx % waypoints.length]!;
    this.afkWaypointIdx = (this.afkWaypointIdx + 1) % waypoints.length;

    const curTile = this.worldToTile(this.worldPos.x, this.worldPos.y);
    const goal = this.resolveNearestWalkableTile(target.x, target.y);
    if (!goal) return;
    const rawPath = this.findPath(curTile.x, curTile.y, goal.x, goal.y);
    if (rawPath.length) {
      this.path = this.smoothTilePath(curTile, rawPath).map(pt => new Phaser.Math.Vector2(pt.x, pt.y));
    }
  }

  // Section 3: Overhead name label shows `<Nama>` when active and `<Nama> (AFK)` when AFK
  private updateOwnNameTagText() {
    if (!this.nameTag) return;
    if (!character) {
      this.nameTag.setText(currentLang === 'en' ? 'Spectator' : 'Penonton');
      return;
    }
    const cleanPlayerName = sanitizePlayerLabelName(character.display_name, 'Warga');
    const isAfk =
      this.isAfkBotActive || (currentUser ? localBackend.getInventory(currentUser.id).player_status === 'afk' : false);
    this.nameTag.setText(isAfk ? `${cleanPlayerName} (AFK)` : cleanPlayerName);
    this.nameTag.setBackgroundColor(isAfk ? 'rgba(120, 53, 15, 0.88)' : 'rgba(15, 23, 42, 0.78)');
  }

  private onCharacterChange = () => {
    this.lastValidInputAt = Date.now();
    this.isAfkBotActive = false;
    this.createAvatar();
    this.broadcastOwnStateNow();
  };

  private walkToTileAndRun(
    curTile: { x: number; y: number },
    targetX: number,
    targetY: number,
    onArrive: (() => void) | null
  ) {
    const goal = this.resolveNearestWalkableTile(targetX, targetY);
    if (!goal) return;
    const rawPath = this.findPath(curTile.x, curTile.y, goal.x, goal.y);
    if (rawPath.length) {
      this.path = this.smoothTilePath(curTile, rawPath).map(pt => new Phaser.Math.Vector2(pt.x, pt.y));
      this.pendingActionAfterWalk = onArrive;
      const destWorld = this.tileToWorld(goal.x, goal.y);
      this.targetRing.setPosition(destWorld.x, destWorld.y).setVisible(true).setDepth(destWorld.y + 4);
    } else if (onArrive && Math.hypot(curTile.x - goal.x, curTile.y - goal.y) <= 2) {
      onArrive();
    }
  }

  private refreshMapLanguage = () => {
    for (const item of this.facilityLabels) {
      item.textObj.setText(currentLang === 'en' ? item.name_en : item.name_id);
    }
    for (const mob of this.monsters) {
      const name = mob.cfg.kind === 'slime' ? 'Slime' : 'Goblin';
      mob.label.setText(`${name} (${mob.hp}/${mob.maxHp})`);
    }
    this.createAvatar();
  };

  public centerCameraOnPlayer() {
    this.cameras.main.setZoom(1.04);
    if (character && this.avatar) {
      this.cameras.main.startFollow(this.avatar, true, 0.12, 0.12);
      this.isCameraFollowingAvatar = true;
    } else {
      this.cameras.main.pan(this.worldPos.x, this.worldPos.y, 280, 'Sine.easeOut');
    }
  }

  private tileToWorld(tx: number, ty: number) {
    return { x: (tx - ty) * 32, y: (tx + ty) * 16 };
  }

  private worldToTile(wx: number, wy: number) {
    return {
      x: Math.round((wx / 32 + wy / 16) / 2),
      y: Math.round((wy / 16 - wx / 32) / 2),
    };
  }

  private worldToTileFloat(wx: number, wy: number) {
    return {
      x: (wx / 32 + wy / 16) / 2,
      y: (wy / 16 - wx / 32) / 2,
    };
  }

  private key(x: number, y: number) {
    return `${x},${y}`;
  }

  private isBlockedTile(tx: number, ty: number): boolean {
    return !isWalkableTile(tx, ty) || this.obstacles.has(this.key(tx, ty));
  }

  private resolveNearestWalkableTile(tx: number, ty: number): { x: number; y: number } | null {
    const clampedX = Phaser.Math.Clamp(tx, 1, 54);
    const clampedY = Phaser.Math.Clamp(ty, 1, 54);
    if (!this.isBlockedTile(clampedX, clampedY)) {
      return { x: clampedX, y: clampedY };
    }
    for (let radius = 1; radius <= 5; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const nx = clampedX + dx;
          const ny = clampedY + dy;
          if (!this.isBlockedTile(nx, ny)) {
            return { x: nx, y: ny };
          }
        }
      }
    }
    return null;
  }

  private drawPastelWorldMap() {
    const g = this.graphics;
    const size = GAME_CONFIG.MAP_SIZE;

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        const p = this.tileToWorld(x, y);
        const water = isWaterTile(x, y);
        const central = isCentralTile(x, y);
        const road = isRoadTile(x, y);
        const d1 = isDungeon1Tile(x, y);
        const d2 = isDungeon2Tile(x, y);
        const arena = isArenaTile(x, y);
        const woodArea = isWoodWorkAreaTile(x, y);
        const stoneArea = isStoneWorkAreaTile(x, y);
        const variation = (x * 19 + y * 31) % 9;

        let fillColor = variation < 3 ? 0x7bc871 : variation < 6 ? 0x86d17b : 0x70be67;

        if (water) {
          fillColor = variation % 2 === 0 ? 0x56b4f5 : 0x67c1fa;
        } else if (central) {
          const isInnerRing = x >= 25 && x <= 31 && y >= 25 && y <= 31;
          fillColor = isInnerRing
            ? variation % 2 === 0
              ? 0xe4e3ed
              : 0xdad8e6
            : variation % 2 === 0
              ? 0xd2d0de
              : 0xc8c6d6;
        } else if (road) {
          fillColor = variation % 2 === 0 ? 0xb7b5c7 : 0xc2c0d1;
        } else if (d1) {
          fillColor = variation % 2 === 0 ? 0x74708a : 0x807c96;
        } else if (d2) {
          fillColor = variation % 2 === 0 ? 0x7d8578 : 0x899184;
        } else if (arena) {
          fillColor = variation % 2 === 0 ? 0xe8d0a7 : 0xdec497;
        } else if (woodArea) {
          fillColor = variation % 2 === 0 ? 0x9ed672 : 0x92cc66;
        } else if (stoneArea) {
          fillColor = variation % 2 === 0 ? 0xb8b2a6 : 0xc4beb2;
        }

        const diamond = makePoints([
          [p.x, p.y - 16],
          [p.x + 32, p.y],
          [p.x, p.y + 16],
          [p.x - 32, p.y],
        ]);
        g.fillStyle(fillColor, 1);
        g.fillPoints(diamond, true);

        g.lineStyle(1, water ? 0x8cd3ff : central ? 0xbdbbd0 : 0x95db8a, 0.16);
        g.strokePoints(diamond, true);

        if (water) {
          if (variation === 0) {
            g.lineStyle(1.5, 0xdff2ff, 0.55);
            g.strokeEllipse(p.x, p.y, 18, 7);
          }
          continue;
        }

        const nearWater =
          isWaterTile(x + 1, y) || isWaterTile(x - 1, y) || isWaterTile(x, y + 1) || isWaterTile(x, y - 1);
        if (nearWater && !road) {
          g.fillStyle(0xf6e3b4, 0.78);
          g.fillEllipse(p.x, p.y, 48, 22);
        }

        if (isDecorativeTreeTile(x, y)) {
          this.drawPastelTree(x, y, p.x, p.y, variation);
        }
      }
    }

    this.drawCentralFountain(28, 28);
    this.drawLighthouse(6, 37);
    this.drawFishingPier(28, 14);
  }

  private drawPastelTree(tx: number, ty: number, x: number, y: number, variant: number) {
    this.obstacles.add(this.key(tx, ty));
    const g = this.add.graphics();
    g.fillStyle(0x2d5432, 0.22);
    g.fillEllipse(x, y + 5, 36, 14);
    g.fillStyle(0x855c42, 1);
    g.fillRect(x - 3, y - 14, 6, 17);

    if (variant % 2 === 0) {
      g.fillStyle(0x3f8f54, 1);
      g.fillTriangle(x - 19, y - 8, x, y - 42, x + 19, y - 8);
      g.fillStyle(0x4ea662, 1);
      g.fillTriangle(x - 16, y - 18, x, y - 50, x + 16, y - 18);
      g.fillStyle(0x68bf76, 1);
      g.fillTriangle(x - 12, y - 28, x, y - 56, x + 12, y - 28);
    } else {
      g.fillStyle(0x499c5b, 1);
      g.fillCircle(x - 7, y - 24, 12);
      g.fillCircle(x + 7, y - 24, 12);
      g.fillStyle(0x62b870, 1);
      g.fillCircle(x, y - 32, 14);
      g.fillStyle(0x82d48b, 0.85);
      g.fillCircle(x - 3, y - 35, 9);
    }
    g.setDepth(y + 12);
  }

  private drawCentralFountain(tx: number, ty: number) {
    this.obstacles.add(this.key(tx, ty));
    const p = this.tileToWorld(tx, ty);
    const g = this.add.graphics();
    g.fillStyle(0x2a3b4c, 0.2);
    g.fillEllipse(p.x, p.y + 4, 86, 40);
    g.fillStyle(0xe2e8f0, 1);
    g.fillEllipse(p.x, p.y, 78, 36);
    g.fillStyle(0x38bdf8, 1);
    g.fillEllipse(p.x, p.y - 2, 64, 28);
    g.fillStyle(0xbae6fd, 0.7);
    g.fillEllipse(p.x, p.y - 2, 42, 18);
    g.fillStyle(0x0284c7, 1);
    g.fillTriangle(p.x - 9, p.y - 8, p.x, p.y - 48, p.x + 9, p.y - 8);
    g.fillStyle(0x7dd3fc, 0.9);
    g.fillTriangle(p.x - 4, p.y - 12, p.x, p.y - 44, p.x + 4, p.y - 12);
    g.setDepth(p.y + 18);
  }

  private drawLighthouse(tx: number, ty: number) {
    this.obstacles.add(this.key(tx, ty));
    const p = this.tileToWorld(tx, ty);
    const g = this.add.graphics();
    g.fillStyle(0x1e293b, 0.22);
    g.fillEllipse(p.x, p.y + 4, 48, 20);
    g.fillStyle(0xf8fafc, 1);
    g.fillRect(p.x - 10, p.y - 54, 20, 54);
    g.fillStyle(0xef4444, 1);
    g.fillRect(p.x - 10, p.y - 42, 20, 12);
    g.fillRect(p.x - 10, p.y - 20, 20, 12);
    g.fillStyle(0xfef08a, 1);
    g.fillRect(p.x - 8, p.y - 64, 16, 10);
    g.fillStyle(0xdc2626, 1);
    g.fillTriangle(p.x - 13, p.y - 64, p.x, p.y - 78, p.x + 13, p.y - 64);
    g.setDepth(p.y + 25);
  }

  private drawFishingPier(tx: number, ty: number) {
    const p = this.tileToWorld(tx, ty);
    const g = this.add.graphics();
    g.fillStyle(0x8c5a3c, 1);
    g.fillRect(p.x - 36, p.y - 12, 72, 22);
    g.lineStyle(2, 0x5c3824, 0.8);
    g.strokeRect(p.x - 36, p.y - 12, 72, 22);
    g.setDepth(p.y - 2);
  }

  private drawArchitecturalBuilding(
    fac: FacilityLandmark,
    roofColor: number,
    wallColor: number,
    accentType: 'clock' | 'cross' | 'spire' | 'awning' | 'dome' | 'inn' | 'portal' | 'arena' | 'bank'
  ) {
    const p = this.tileToWorld(fac.tx, fac.ty);
    this.obstacles.add(this.key(fac.tx, fac.ty));
    const g = this.add.graphics();

    g.fillStyle(0x1e293b, 0.22);
    g.fillEllipse(p.x, p.y + 7, 88, 34);

    if (accentType === 'portal') {
      g.fillStyle(0x64748b, 1);
      g.fillCircle(p.x - 20, p.y - 14, 18);
      g.fillCircle(p.x + 20, p.y - 14, 18);
      g.fillCircle(p.x, p.y - 28, 22);
      g.fillStyle(0x3b0764, 1);
      g.fillEllipse(p.x, p.y - 14, 24, 34);
      g.fillStyle(0xa855f7, 0.88);
      g.fillEllipse(p.x, p.y - 14, 16, 26);
    } else if (accentType === 'arena') {
      g.lineStyle(7, 0xd6d3d1, 1);
      g.strokeEllipse(p.x, p.y - 10, 84, 42);
      g.fillStyle(0xef4444, 1);
      g.fillRect(p.x - 38, p.y - 28, 6, 16);
      g.fillRect(p.x + 32, p.y - 28, 6, 16);
      g.fillRect(p.x - 3, p.y - 35, 6, 16);
    } else {
      g.fillStyle(wallColor, 1);
      g.fillPoints(
        makePoints([
          [p.x - 32, p.y - 8],
          [p.x, p.y + 10],
          [p.x, p.y - 22],
          [p.x - 32, p.y - 36],
        ]),
        true
      );
      g.fillStyle(Phaser.Display.Color.ValueToColor(wallColor).darken(8).color, 1);
      g.fillPoints(
        makePoints([
          [p.x, p.y + 10],
          [p.x + 32, p.y - 8],
          [p.x + 32, p.y - 36],
          [p.x, p.y - 22],
        ]),
        true
      );

      g.fillStyle(roofColor, 1);
      g.fillPoints(
        makePoints([
          [p.x - 36, p.y - 34],
          [p.x, p.y - 54],
          [p.x + 36, p.y - 34],
          [p.x, p.y - 18],
        ]),
        true
      );

      g.fillStyle(0x5c4033, 1);
      g.fillRect(p.x - 5, p.y - 8, 10, 14);

      if (accentType === 'clock') {
        g.fillStyle(wallColor, 1);
        g.fillRect(p.x - 10, p.y - 68, 20, 24);
        g.fillStyle(roofColor, 1);
        g.fillTriangle(p.x - 14, p.y - 68, p.x, p.y - 88, p.x + 14, p.y - 68);
        g.fillStyle(0xfef08a, 1);
        g.fillCircle(p.x, p.y - 56, 5);
      } else if (accentType === 'bank') {
        // Marble columns & gold coin crest for Bank Rimba
        g.fillStyle(0xfef3c7, 1);
        g.fillRect(p.x - 18, p.y - 24, 4, 22);
        g.fillRect(p.x + 14, p.y - 24, 4, 22);
        g.fillStyle(0xf59e0b, 1);
        g.fillCircle(p.x, p.y - 44, 7);
        g.fillStyle(0xfef08a, 1);
        g.fillCircle(p.x, p.y - 44, 4);
      } else if (accentType === 'cross') {
        g.fillStyle(0xef4444, 1);
        g.fillRect(p.x - 3, p.y - 43, 6, 16);
        g.fillRect(p.x - 8, p.y - 38, 16, 6);
      } else if (accentType === 'spire') {
        g.fillStyle(0x6d28d9, 1);
        g.fillTriangle(p.x - 12, p.y - 50, p.x, p.y - 86, p.x + 12, p.y - 50);
        g.fillStyle(0xfde047, 1);
        g.fillCircle(p.x, p.y - 88, 4);
      } else if (accentType === 'awning') {
        g.fillStyle(0xef4444, 1);
        g.fillRect(p.x - 24, p.y - 14, 16, 6);
        g.fillStyle(0x3b82f6, 1);
        g.fillRect(p.x + 8, p.y - 14, 16, 6);
      } else if (accentType === 'dome') {
        g.fillStyle(0x2dd4bf, 1);
        g.fillCircle(p.x, p.y - 54, 13);
      }
    }

    g.setDepth(p.y + 24);

    const textObj = this.add
      .text(p.x, p.y + 20, currentLang === 'en' ? fac.name_en : fac.name_id, {
        fontFamily: 'Plus Jakarta Sans, Arial',
        fontSize: '10px',
        fontStyle: 'bold',
        color: fac.comingSoon ? '#581c87' : '#1e293b',
        backgroundColor: fac.comingSoon ? '#f3e8ff' : '#fef9c3',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(p.y + 90);

    this.facilityLabels.push({ textObj, name_id: fac.name_id, name_en: fac.name_en });
  }

  private drawWorkNodesAndLandmarks() {
    for (const fac of WORLD_FACILITIES) {
      if (fac.id === 'balaikota') this.drawArchitecturalBuilding(fac, 0x3b6cb7, 0xf5ead4, 'clock');
      else if (fac.id === 'bank') this.drawArchitecturalBuilding(fac, 0xb45309, 0xfef3c7, 'bank');
      else if (fac.id === 'rumahsakit') this.drawArchitecturalBuilding(fac, 0x4b89c8, 0xf8fafc, 'cross');
      else if (fac.id === 'academy') this.drawArchitecturalBuilding(fac, 0x7e57c2, 0xede9fe, 'spire');
      else if (fac.id === 'pasar') this.drawArchitecturalBuilding(fac, 0xd97348, 0xfef3c7, 'awning');
      else if (fac.id === 'pakaian') this.drawArchitecturalBuilding(fac, 0xc4628a, 0xfce7f3, 'awning');
      else if (fac.id === 'ibadah') this.drawArchitecturalBuilding(fac, 0x389e98, 0xf0fdfa, 'dome');
      else if (fac.id === 'kuliner') this.drawArchitecturalBuilding(fac, 0xd48742, 0xffedd5, 'inn');
      else if (fac.id === 'penginapan') this.drawArchitecturalBuilding(fac, 0x9c5a3c, 0xfde68a, 'inn');
      else if (fac.id === 'dungeon1' || fac.id === 'dungeon2') this.drawArchitecturalBuilding(fac, 0x581c87, 0x475569, 'portal');
      else if (fac.id === 'arena') this.drawArchitecturalBuilding(fac, 0xb91c1c, 0xe7e5e4, 'arena');
      else {
        const p = this.tileToWorld(fac.tx, fac.ty);
        const txt = this.add
          .text(p.x, p.y - 45, currentLang === 'en' ? fac.name_en : fac.name_id, {
            fontFamily: 'Georgia',
            fontSize: '11px',
            fontStyle: 'bold',
            color: '#fef9c3',
            backgroundColor: '#1e3a2f',
            padding: { x: 7, y: 4 },
          })
          .setOrigin(0.5)
          .setDepth(p.y + 85);
        this.facilityLabels.push({ textObj: txt, name_id: fac.name_id, name_en: fac.name_en });
      }
    }

    for (const node of localBackend.getWorkNodes()) {
      const p = this.tileToWorld(node.tile_x, node.tile_y);
      const g = this.add.graphics();
      g.lineStyle(2.5, 0xfde047, 0.92);
      g.strokeEllipse(p.x, p.y + 2, 34, 16);

      if (node.node_type === 'wood') {
        g.fillStyle(0x784c32, 1);
        g.fillRect(p.x - 4, p.y - 16, 8, 18);
        g.fillStyle(0x22c55e, 1);
        g.fillCircle(p.x, p.y - 26, 15);
        g.fillStyle(0x86efac, 0.9);
        g.fillCircle(p.x - 3, p.y - 30, 9);
      } else if (node.node_type === 'stone') {
        g.fillStyle(0x64748b, 1);
        g.fillCircle(p.x - 5, p.y - 8, 11);
        g.fillCircle(p.x + 6, p.y - 6, 10);
        g.fillStyle(0x38bdf8, 0.9);
        g.fillTriangle(p.x - 3, p.y - 12, p.x, p.y - 24, p.x + 4, p.y - 12);
      } else {
        g.lineStyle(2, 0xe0f2fe, 0.85);
        g.strokeEllipse(p.x, p.y, 24, 11);
        g.fillStyle(0xf97316, 1);
        g.fillCircle(p.x, p.y - 4, 5);
      }
      g.setDepth(p.y + 15);

      const badge = node.node_type === 'wood' ? '🪵 [F]' : node.node_type === 'stone' ? '⛏️ [F]' : '🎣 [F]';
      this.add
        .text(p.x, p.y + 14, badge, {
          fontFamily: 'Plus Jakarta Sans, Arial',
          fontSize: '9px',
          fontStyle: 'bold',
          color: '#1e293b',
          backgroundColor: '#fde68a',
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(p.y + 80);
    }
  }

  // Section 10: Upper Dungeon spawns Slime ONLY; Lower Dungeon spawns Goblin ONLY
  private drawDungeonMonsters() {
    for (const m of this.monsters) {
      m.container.destroy();
    }
    this.monsters = [];

    for (let idx = 0; idx < DUNGEON_MONSTER_SPAWNS.length; idx++) {
      const cfg = DUNGEON_MONSTER_SPAWNS[idx]!;
      const p = this.tileToWorld(cfg.homeTx, cfg.homeTy);
      const shadow = this.add.ellipse(0, 2, 26, 11, 0x0f172a, 0.35);
      const bodyGraphic = this.add.graphics();

      if (cfg.kind === 'slime') {
        // Pastel Pixel-Art Slime (translucent emerald/cyan jelly with cute eyes)
        bodyGraphic.fillStyle(0x064e3b, 1);
        bodyGraphic.fillRoundedRect(-13, -22, 26, 21, 9);
        bodyGraphic.fillStyle(0x34d399, 1);
        bodyGraphic.fillRoundedRect(-11, -20, 22, 18, 8);
        bodyGraphic.fillStyle(0xa7f3d0, 0.9);
        bodyGraphic.fillRoundedRect(-7, -18, 9, 5, 3);
        bodyGraphic.fillStyle(0x0f172a, 1);
        bodyGraphic.fillRect(-5, -11, 3, 4);
        bodyGraphic.fillRect(2, -11, 3, 4);
      } else {
        // Pixel-Art Goblin Warrior (pointed ears, hood, club)
        bodyGraphic.fillStyle(0x1e293b, 1);
        bodyGraphic.fillRect(-9, -30, 18, 28);
        // Pointed goblin ears
        bodyGraphic.fillStyle(0x4d7c0f, 1);
        bodyGraphic.fillTriangle(-15, -24, -8, -26, -8, -20);
        bodyGraphic.fillTriangle(15, -24, 8, -26, 8, -20);
        // Head & body
        bodyGraphic.fillStyle(0x65a30d, 1);
        bodyGraphic.fillRect(-8, -28, 16, 13);
        bodyGraphic.fillStyle(0x78350f, 1);
        bodyGraphic.fillRect(-7, -15, 14, 12);
        // Glowing red eyes
        bodyGraphic.fillStyle(0xdc2626, 1);
        bodyGraphic.fillRect(-5, -23, 3, 3);
        bodyGraphic.fillRect(2, -23, 3, 3);
        // Wooden club
        bodyGraphic.fillStyle(0x92400e, 1);
        bodyGraphic.fillRect(9, -24, 4, 14);
      }

      const hpBarBg = this.add.rectangle(0, -37, 30, 5, 0x0f172a, 0.85);
      const hpBarFill = this.add.rectangle(-14, -37, 28, 3, 0x22c55e, 1).setOrigin(0, 0.5);
      const mobTitle = cfg.kind === 'slime' ? 'Slime' : 'Goblin';
      const label = this.add
        .text(0, -49, `${mobTitle} (${cfg.maxHp}/${cfg.maxHp})`, {
          fontFamily: 'Plus Jakarta Sans, Arial',
          fontSize: '9.5px',
          fontStyle: 'bold',
          color: '#fef2f2',
          backgroundColor: 'rgba(127, 29, 29, 0.86)',
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5);

      const container = this.add
        .container(p.x, p.y, [shadow, bodyGraphic, hpBarBg, hpBarFill, label])
        .setDepth(p.y + 82);

      this.monsters.push({
        cfg,
        container,
        bodyGraphic,
        hpBarFill,
        label,
        worldPos: new Phaser.Math.Vector2(p.x, p.y),
        hp: cfg.maxHp,
        maxHp: cfg.maxHp,
        waypointIdx: 0,
        bobPhase: idx * 1.4,
        lastCounterAttackAt: 0,
        respawnAt: null,
      });
    }
  }

  // Section 3 & 4: Simulated AFK player characters from registered KTP accounts (no NPCs)
  private drawSimulatedAfkCitizens() {
    for (const item of this.simAfkEntities) {
      item.container.destroy();
    }
    this.simAfkEntities = [];

    const citizens = localBackend.getSimulatedRegionAfkCitizens();
    for (let idx = 0; idx < citizens.length; idx++) {
      const cit = citizens[idx]!;
      const firstWp = cit.waypoints[0]!;
      const p = this.tileToWorld(firstWp.x, firstWp.y);
      const shadow = this.add.ellipse(0, 0, 22, 9, 0x1e293b, 0.28);
      const bodyGroup = this.buildChibiBodyGroup(cit.model_id, cit.avatar_color, cit.hat_color);
      const cleanName = sanitizePlayerLabelName(cit.display_name, 'Warga');

      const label = this.add
        .text(0, -58, `${cleanName} (AFK)`, {
          fontFamily: 'Plus Jakarta Sans, Arial',
          fontSize: '10.5px',
          fontStyle: 'bold',
          color: '#fef3c7',
          backgroundColor: 'rgba(120, 53, 15, 0.86)',
          stroke: '#0f172a',
          strokeThickness: 2.5,
          padding: { x: 6, y: 2 },
          shadow: { offsetX: 0, offsetY: 1, color: '#000000', blur: 2, fill: true },
        })
        .setOrigin(0.5);

      const container = this.add.container(p.x, p.y, [shadow, bodyGroup, label]).setDepth(p.y + 81);

      this.simAfkEntities.push({
        citizen: cit,
        container,
        shadow,
        bodyGroup,
        label,
        worldPos: new Phaser.Math.Vector2(p.x, p.y),
        waypointIdx: 1 % cit.waypoints.length,
        walkPhase: idx * 1.7,
      });
    }
  }

  private createAvatar = () => {
    if (this.avatar) this.avatar.destroy();

    this.avatarShadow = this.add.ellipse(0, 0, 22, 10, 0x1e293b, 0.32);
    const hatHex = getHatColor(character?.hat_id);
    this.avatarBodyGroup = this.buildChibiBodyGroup(
      character?.model_id,
      character?.avatar_color,
      hatHex
    );

    const cleanPlayerName = character
      ? sanitizePlayerLabelName(character.display_name, 'Warga')
      : currentLang === 'en'
        ? 'Spectator'
        : 'Penonton';
    this.nameTag = this.add
      .text(0, -58, cleanPlayerName, {
        fontFamily: 'Plus Jakarta Sans, Arial',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        stroke: '#0f172a',
        strokeThickness: 3,
        padding: { x: 6, y: 2 },
        shadow: { offsetX: 0, offsetY: 1, color: '#000000', blur: 2, fill: true },
      })
      .setOrigin(0.5);

    this.updateOwnNameTagText();

    this.avatar = this.add.container(this.worldPos.x, this.worldPos.y, [
      this.avatarShadow,
      this.avatarBodyGroup,
      this.nameTag,
    ]);
    this.avatar.setDepth(this.worldPos.y + 100);
    this.avatar.setAlpha(character ? 1 : 0.55);

    if (character) {
      this.cameras.main.startFollow(this.avatar, true, 0.12, 0.12);
      this.isCameraFollowingAvatar = true;
    } else {
      this.cameras.main.stopFollow();
      this.isCameraFollowingAvatar = false;
    }
  };

  private triggerSpacebarAttack() {
    if (!currentUser || !character) return;
    if (localBackend.isDownedOrWaitingRevive(currentUser.id).locked) return;
    const now = Date.now();
    if (now - this.lastPlayerSpaceAttackAt < 380) return;
    this.lastPlayerSpaceAttackAt = now;

    this.registerValidPlayerInput();
    const playerTile = this.worldToTileFloat(this.worldPos.x, this.worldPos.y);

    // Find nearest alive monster within PLAYER_ATTACK_RANGE_TILES (2.5 tiles)
    let nearestMob: (typeof this.monsters)[number] | null = null;
    let bestDist = Infinity;

    for (const mob of this.monsters) {
      if (mob.respawnAt !== null) continue;
      const mobTile = this.worldToTileFloat(mob.worldPos.x, mob.worldPos.y);
      const d = Math.hypot(mobTile.x - playerTile.x, mobTile.y - playerTile.y);
      if (d <= GAME_CONFIG.PLAYER_ATTACK_RANGE_TILES && d < bestDist) {
        bestDist = d;
        nearestMob = mob;
      }
    }

    // Draw visual swing arc around player
    this.attackSlashGraphic.clear();
    this.attackSlashGraphic.lineStyle(3, 0xfef08a, 0.95);
    this.attackSlashGraphic.strokeEllipse(this.worldPos.x, this.worldPos.y - 12, 54, 26);
    this.time.delayedCall(180, () => {
      this.attackSlashGraphic.clear();
    });

    if (!nearestMob) {
      window.dispatchEvent(
        new CustomEvent('rimba-toast', {
          detail: {
            message:
              currentLang === 'en'
                ? 'No monster in attack range! Walk closer to a Slime or Goblin and press [Space].'
                : 'Tidak ada monster dalam jangkauan! Dekati Slime atau Goblin lalu tekan [Spasi].',
          },
        })
      );
      return;
    }

    // Section 10: Pressing Spacebar damages the monster and NEVER reduces player HP
    nearestMob.hp = Math.max(0, nearestMob.hp - GAME_CONFIG.PLAYER_ATTACK_DAMAGE);
    const ratio = nearestMob.hp / nearestMob.maxHp;
    nearestMob.hpBarFill.width = Math.max(0, 28 * ratio);
    nearestMob.hpBarFill.fillColor = ratio > 0.45 ? 0x22c55e : 0xf59e0b;
    const mobTitle = nearestMob.cfg.kind === 'slime' ? 'Slime' : 'Goblin';
    nearestMob.label.setText(`${mobTitle} (${nearestMob.hp}/${nearestMob.maxHp})`);

    if (nearestMob.hp <= 0) {
      nearestMob.respawnAt = Date.now() + 5500;
      nearestMob.container.setVisible(false);
      const reward = localBackend.recordMonsterDefeatReward(currentUser.id, nearestMob.cfg.kind, currentLang);
      window.dispatchEvent(new CustomEvent('rimba-toast', { detail: { message: reward.message } }));
    }
  }

  private hasDirectWalkableLine(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(dist * 3));
    for (let i = 1; i <= steps; i++) {
      const ratio = i / steps;
      const rx = Math.round(Phaser.Math.Linear(a.x, b.x, ratio));
      const ry = Math.round(Phaser.Math.Linear(a.y, b.y, ratio));
      if (this.isBlockedTile(rx, ry)) return false;
    }
    return true;
  }

  private smoothTilePath(
    start: { x: number; y: number },
    rawPath: Array<{ x: number; y: number }>
  ): Array<{ x: number; y: number }> {
    if (rawPath.length <= 2) return rawPath;
    const all = [start, ...rawPath];
    const smoothed: Array<{ x: number; y: number }> = [];
    let currentIdx = 0;
    while (currentIdx < all.length - 1) {
      let nextIdx = currentIdx + 1;
      for (let probe = all.length - 1; probe > currentIdx + 1; probe--) {
        if (this.hasDirectWalkableLine(all[currentIdx]!, all[probe]!)) {
          nextIdx = probe;
          break;
        }
      }
      smoothed.push(all[nextIdx]!);
      currentIdx = nextIdx;
    }
    return smoothed;
  }

  private findPath(sx: number, sy: number, ex: number, ey: number): Array<{ x: number; y: number }> {
    if (sx === ex && sy === ey) return [];
    const size = GAME_CONFIG.MAP_SIZE;
    if (ex < 1 || ey < 1 || ex >= size - 1 || ey >= size - 1 || this.isBlockedTile(ex, ey)) return [];

    const start = this.key(sx, sy);
    const goal = this.key(ex, ey);
    const open = new Set([start]);
    const gScore = new Map([[start, 0]]);
    const came = new Map<string, string>();
    const coord = new Map([[start, { x: sx, y: sy }]]);
    const heuristic = (x: number, y: number) => Math.hypot(ex - x, ey - y);

    let iterations = 0;
    while (open.size && iterations < 3500) {
      iterations++;
      let best = '';
      let score = Infinity;
      for (const k of open) {
        const c = coord.get(k)!;
        const f = (gScore.get(k) ?? Infinity) + heuristic(c.x, c.y);
        if (f < score) {
          score = f;
          best = k;
        }
      }
      if (best === goal) {
        const out: Array<{ x: number; y: number }> = [];
        let k = goal;
        while (k !== start) {
          const c = coord.get(k)!;
          out.push(c);
          k = came.get(k)!;
        }
        return out.reverse();
      }
      open.delete(best);
      const c = coord.get(best)!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const x = c.x + dx!;
        const y = c.y + dy!;
        const nk = this.key(x, y);
        if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1 || this.isBlockedTile(x, y)) continue;
        if (dx !== 0 && dy !== 0) {
          if (this.isBlockedTile(c.x + dx!, c.y) && this.isBlockedTile(c.x, c.y + dy!)) continue;
        }
        const cost = (gScore.get(best) ?? 0) + (dx !== 0 && dy !== 0 ? 1.414 : 1);
        if (cost < (gScore.get(nk) ?? Infinity)) {
          came.set(nk, best);
          gScore.set(nk, cost);
          coord.set(nk, { x, y });
          open.add(nk);
        }
      }
    }
    return [];
  }

  update(_time: number, delta: number) {
    const dt = Math.min(delta, 40) / 1000;
    const isSpectator = !character;
    const deathState =
      currentUser && character
        ? localBackend.isDownedOrWaitingRevive(currentUser.id)
        : { locked: false, active: false, readyToRevive: false, remainingSec: 0, penalty: 0 };

    const inputBlocked =
      isSpectator ||
      isFormInputFocused() ||
      Boolean(document.querySelector('#scrim')) ||
      Boolean(document.querySelector('#phase2-scrim')) ||
      deathState.locked;

    if (!inputBlocked && this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.triggerSpacebarAttack();
    }

    let dx = 0;
    let dy = 0;
    if (!inputBlocked && this.keys && this.cursors) {
      dx =
        (this.keys.D?.isDown || this.cursors.right.isDown ? 1 : 0) -
        (this.keys.A?.isDown || this.cursors.left.isDown ? 1 : 0);
      dy =
        (this.keys.S?.isDown || this.cursors.down.isDown ? 1 : 0) -
        (this.keys.W?.isDown || this.cursors.up.isDown ? 1 : 0);
    }

    const keyboardActive = dx !== 0 || dy !== 0;
    if (keyboardActive) {
      this.registerValidPlayerInput();
      this.resumeCameraFollow();
    }

    // Check 30-second AFK idle threshold for Citizen characters
    if (
      !isSpectator &&
      currentUser &&
      !deathState.locked &&
      !this.isAfkBotActive &&
      Date.now() - this.lastValidInputAt >= GAME_CONFIG.AFK_IDLE_TIMEOUT_MS
    ) {
      this.enterAfkBotMode();
    }

    // Periodic batch tick while in AFK mode (3-minute stroll + 3-minute work cycle)
    if (this.isAfkBotActive && currentUser && character && !deathState.locked) {
      if (Date.now() - this.lastAfkBatchTickAt >= GAME_CONFIG.AFK_BATCH_TICK_MS) {
        this.lastAfkBatchTickAt = Date.now();
        const tickRes = localBackend.processAfkBatchTick(currentUser.id);
        if (tickRes.died) {
          this.isAfkBotActive = false;
          this.path = [];
          this.setPosition(34, 28);
          this.updateOwnNameTagText();
        } else if (this.path.length === 0) {
          this.scheduleNextAfkWaypoint();
        }
      } else if (this.path.length === 0) {
        this.scheduleNextAfkWaypoint();
      }
    }

    let isMovingNow = false;

    if (keyboardActive) {
      this.path = [];
      this.pendingActionAfterWalk = null;
      this.targetRing.setVisible(false);
      this.moving.set(dx, dy).normalize().scale(220 * dt);

      const candidateX = this.worldPos.x + this.moving.x;
      const candidateY = this.worldPos.y + this.moving.y;
      const nextTile = this.worldToTile(candidateX, candidateY);

      if (!this.isBlockedTile(nextTile.x, nextTile.y)) {
        this.worldPos.set(candidateX, candidateY);
        isMovingNow = true;
      } else {
        const slideXTile = this.worldToTile(this.worldPos.x + this.moving.x, this.worldPos.y);
        const slideYTile = this.worldToTile(this.worldPos.x, this.worldPos.y + this.moving.y);
        if (!this.isBlockedTile(slideXTile.x, slideXTile.y)) {
          this.worldPos.x += this.moving.x;
          isMovingNow = true;
        } else if (!this.isBlockedTile(slideYTile.x, slideYTile.y)) {
          this.worldPos.y += this.moving.y;
          isMovingNow = true;
        }
      }
    } else if ((!inputBlocked || this.isAfkBotActive) && this.path.length) {
      const targetTile = this.path[0]!;
      const targetWorld = this.tileToWorld(targetTile.x, targetTile.y);
      const d = Phaser.Math.Distance.Between(this.worldPos.x, this.worldPos.y, targetWorld.x, targetWorld.y);
      const speed = this.isAfkBotActive ? 92 : 220;

      if (d < 4) {
        this.worldPos.set(targetWorld.x, targetWorld.y);
        this.path.shift();
        if (this.path.length === 0) {
          this.targetRing.setVisible(false);
          if (this.pendingActionAfterWalk) {
            const fn = this.pendingActionAfterWalk;
            this.pendingActionAfterWalk = null;
            fn();
          }
        }
      } else {
        const step = Math.min(1, (speed * dt) / d);
        this.worldPos.x = Phaser.Math.Linear(this.worldPos.x, targetWorld.x, step);
        this.worldPos.y = Phaser.Math.Linear(this.worldPos.y, targetWorld.y, step);
        isMovingNow = true;
      }
    }

    if (isMovingNow) {
      this.walkPhase += dt * (this.isAfkBotActive ? 8 : 14);
      const bob = Math.abs(Math.sin(this.walkPhase)) * 3.0;
      this.avatarBodyGroup.y = -bob;
      this.avatarShadow.scaleX = 1 - bob * 0.04;
    } else {
      this.avatarBodyGroup.y = 0;
      this.avatarShadow.scaleX = 1;
    }

    // CRITICAL INVARIANT: worldPos is ALREADY in World Pixel Coordinates!
    this.avatar.setPosition(this.worldPos.x, this.worldPos.y);
    this.avatar.setDepth(this.worldPos.y + 100);

    const floatTile = this.worldToTileFloat(this.worldPos.x, this.worldPos.y);
    ownTilePosition = {
      x: Number(Phaser.Math.Clamp(floatTile.x, 1, 54).toFixed(2)),
      y: Number(Phaser.Math.Clamp(floatTile.y, 1, 54).toFixed(2)),
    };

    // Section 10: Update Slime (Upper Dungeon) and Goblin (Lower Dungeon) AI, chasing, and counterattacks
    const playerInD1 = isDungeon1Tile(Math.round(ownTilePosition.x), Math.round(ownTilePosition.y));
    const playerInD2 = isDungeon2Tile(Math.round(ownTilePosition.x), Math.round(ownTilePosition.y));
    const now = Date.now();

    for (const mob of this.monsters) {
      if (mob.respawnAt !== null) {
        if (now >= mob.respawnAt) {
          mob.respawnAt = null;
          mob.hp = mob.maxHp;
          mob.hpBarFill.width = 28;
          mob.hpBarFill.fillColor = 0x22c55e;
          const mobTitle = mob.cfg.kind === 'slime' ? 'Slime' : 'Goblin';
          mob.label.setText(`${mobTitle} (${mob.hp}/${mob.maxHp})`);
          const homeWorld = this.tileToWorld(mob.cfg.homeTx, mob.cfg.homeTy);
          mob.worldPos.set(homeWorld.x, homeWorld.y);
          mob.container.setPosition(homeWorld.x, homeWorld.y);
          mob.container.setVisible(true);
        }
        continue;
      }

      const mobTile = this.worldToTileFloat(mob.worldPos.x, mob.worldPos.y);
      const sameDungeonAsPlayer =
        !isSpectator &&
        !deathState.locked &&
        !this.isAfkBotActive &&
        ((mob.cfg.kind === 'slime' && playerInD1) || (mob.cfg.kind === 'goblin' && playerInD2));

      const distToPlayerTiles = Math.hypot(mobTile.x - ownTilePosition.x, mobTile.y - ownTilePosition.y);

      if (sameDungeonAsPlayer && distToPlayerTiles <= GAME_CONFIG.MONSTER_DETECT_RANGE_TILES) {
        // Chase player strictly within dungeon bounds
        const minX = mob.cfg.kind === 'slime' ? 6.5 : 44.5;
        const maxX = mob.cfg.kind === 'slime' ? 12.5 : 50.5;
        const minY = mob.cfg.kind === 'slime' ? 7.5 : 43.5;
        const maxY = mob.cfg.kind === 'slime' ? 13.5 : 49.5;
        const clampedTargetTx = Phaser.Math.Clamp(ownTilePosition.x, minX, maxX);
        const clampedTargetTy = Phaser.Math.Clamp(ownTilePosition.y, minY, maxY);
        const chaseWorld = this.tileToWorld(clampedTargetTx, clampedTargetTy);
        const dWorld = Phaser.Math.Distance.Between(mob.worldPos.x, mob.worldPos.y, chaseWorld.x, chaseWorld.y);
        if (dWorld > 18) {
          const step = Math.min(1, (86 * dt) / dWorld);
          mob.worldPos.x = Phaser.Math.Linear(mob.worldPos.x, chaseWorld.x, step);
          mob.worldPos.y = Phaser.Math.Linear(mob.worldPos.y, chaseWorld.y, step);
        }

        // Monster counterattack when player is within MONSTER_ATTACK_RANGE_TILES
        if (
          currentUser &&
          distToPlayerTiles <= GAME_CONFIG.MONSTER_ATTACK_RANGE_TILES &&
          now - mob.lastCounterAttackAt >= GAME_CONFIG.MONSTER_ATTACK_COOLDOWN_MS
        ) {
          mob.lastCounterAttackAt = now;
          const hit = localBackend.applyMonsterCounterAttack(currentUser.id, mob.cfg.kind, currentLang);
          if (hit.damage > 0) {
            window.dispatchEvent(new CustomEvent('rimba-toast', { detail: { message: hit.message } }));
          }
        }
      } else {
        // Patrol inside dungeon bounds
        const wp = mob.cfg.patrolWaypoints[mob.waypointIdx]!;
        const targetWorld = this.tileToWorld(wp.x, wp.y);
        const dWorld = Phaser.Math.Distance.Between(mob.worldPos.x, mob.worldPos.y, targetWorld.x, targetWorld.y);
        if (dWorld < 4) {
          mob.waypointIdx = (mob.waypointIdx + 1) % mob.cfg.patrolWaypoints.length;
        } else {
          const step = Math.min(1, (42 * dt) / dWorld);
          mob.worldPos.x = Phaser.Math.Linear(mob.worldPos.x, targetWorld.x, step);
          mob.worldPos.y = Phaser.Math.Linear(mob.worldPos.y, targetWorld.y, step);
        }
      }

      mob.bobPhase += dt * 7;
      mob.bodyGraphic.y = -Math.abs(Math.sin(mob.bobPhase)) * 2.5;
      mob.container.setPosition(mob.worldPos.x, mob.worldPos.y);
      mob.container.setDepth(mob.worldPos.y + 82);
    }

    const camView = this.cameras.main.worldView;
    const focusX = character ? this.worldPos.x : camView.centerX;
    const focusY = character ? this.worldPos.y : camView.centerY;

    const visibleLabels: Array<{
      label: Phaser.GameObjects.Text;
      worldX: number;
      worldY: number;
      baseY: number;
    }> = [
      {
        label: this.nameTag,
        worldX: this.worldPos.x,
        worldY: this.worldPos.y,
        baseY: -58,
      },
    ];
    this.nameTag.y = -58;

    // Update & cull remote multiplayer avatars + distance-scaled labels
    for (const [id, other] of this.others.entries()) {
      if (Date.now() - other.lastSeen > 30000) {
        other.container.destroy();
        this.others.delete(id);
        continue;
      }
      const dMove = Phaser.Math.Distance.Between(other.container.x, other.container.y, other.target.x, other.target.y);
      other.container.x = Phaser.Math.Linear(other.container.x, other.target.x, Math.min(1, dt * 9));
      other.container.y = Phaser.Math.Linear(other.container.y, other.target.y, Math.min(1, dt * 9));
      other.container.setDepth(other.container.y + 80);

      if (dMove > 1.5) {
        other.walkPhase += dt * 11;
        other.bodyGroup.y = -Math.abs(Math.sin(other.walkPhase)) * 2.5;
      } else {
        other.bodyGroup.y = 0;
      }

      const inViewport =
        other.container.x >= camView.left - 160 &&
        other.container.x <= camView.right + 160 &&
        other.container.y >= camView.top - 160 &&
        other.container.y <= camView.bottom + 160;
      const dist = Phaser.Math.Distance.Between(focusX, focusY, other.container.x, other.container.y);
      const showLabel = inViewport && dist <= 920;

      other.container.setVisible(inViewport);
      other.label.setVisible(showLabel);
      if (showLabel) {
        const scale = Phaser.Math.Clamp(1.04 - dist / 1800, 0.78, 1.0);
        const alpha = Phaser.Math.Clamp(1.15 - dist / 920, 0.45, 1.0);
        other.label.setScale(scale);
        other.label.setAlpha(alpha);
        other.label.y = -58;
        visibleLabels.push({
          label: other.label,
          worldX: other.container.x,
          worldY: other.container.y,
          baseY: -58,
        });
      }
    }

    // Update simulated regional AFK citizens (from registered KTP player accounts)
    for (const sim of this.simAfkEntities) {
      const wps = sim.citizen.waypoints;
      if (wps.length > 1) {
        const targetTile = wps[sim.waypointIdx]!;
        const targetWorld = this.tileToWorld(targetTile.x, targetTile.y);
        const d = Phaser.Math.Distance.Between(sim.worldPos.x, sim.worldPos.y, targetWorld.x, targetWorld.y);
        if (d < 3) {
          sim.waypointIdx = (sim.waypointIdx + 1) % wps.length;
        } else {
          const step = Math.min(1, (44 * dt) / d);
          sim.worldPos.x = Phaser.Math.Linear(sim.worldPos.x, targetWorld.x, step);
          sim.worldPos.y = Phaser.Math.Linear(sim.worldPos.y, targetWorld.y, step);
          sim.walkPhase += dt * 8.5;
          sim.bodyGroup.y = -Math.abs(Math.sin(sim.walkPhase)) * 2.2;
        }
        sim.container.setPosition(sim.worldPos.x, sim.worldPos.y);
        sim.container.setDepth(sim.worldPos.y + 81);
      }

      const inViewport =
        sim.worldPos.x >= camView.left - 160 &&
        sim.worldPos.x <= camView.right + 160 &&
        sim.worldPos.y >= camView.top - 160 &&
        sim.worldPos.y <= camView.bottom + 160;
      const dist = Phaser.Math.Distance.Between(focusX, focusY, sim.worldPos.x, sim.worldPos.y);
      const showLabel = inViewport && dist <= 780;

      sim.container.setVisible(inViewport);
      sim.label.setVisible(showLabel);
      if (showLabel) {
        const scale = Phaser.Math.Clamp(1.02 - dist / 1700, 0.76, 1.0);
        const alpha = Phaser.Math.Clamp(1.15 - dist / 780, 0.48, 1.0);
        sim.label.setScale(scale);
        sim.label.setAlpha(alpha);
        sim.label.y = -58;
        visibleLabels.push({
          label: sim.label,
          worldX: sim.worldPos.x,
          worldY: sim.worldPos.y,
          baseY: -58,
        });
      }
    }

    // Prevent label overlap when characters stand close to each other
    visibleLabels.sort((a, b) => a.worldY - b.worldY);
    for (let i = 0; i < visibleLabels.length; i++) {
      for (let j = i + 1; j < visibleLabels.length; j++) {
        const a = visibleLabels[i]!;
        const b = visibleLabels[j]!;
        const dxLabel = Math.abs(a.worldX - b.worldX);
        const dyLabel = Math.abs(a.worldY + a.label.y - (b.worldY + b.label.y));
        if (dxLabel < 76 && dyLabel < 15) {
          a.label.y -= 13;
        }
      }
    }

    if (Date.now() - this.lastBroadcast > 180) {
      this.lastBroadcast = Date.now();
      if (
        Phaser.Math.Distance.Between(this.worldPos.x, this.worldPos.y, this.lastSentWorld.x, this.lastSentWorld.y) > 3
      ) {
        this.broadcastOwnStateNow();
      }
    }

    updateCombinedWorldHeader(this.others.size + 1);
  }

  public broadcastOwnStateNow() {
    this.lastSentWorld.set(this.worldPos.x, this.worldPos.y);
    const safeName = character
      ? sanitizePlayerLabelName(character.display_name, 'Warga')
      : currentLang === 'en'
        ? 'Spectator'
        : 'Penonton';
    const payload: Avatar = {
      userId: currentUser?.id ?? clientId,
      clientId,
      name: safeName,
      tx: ownTilePosition.x,
      ty: ownTilePosition.y,
      color: character?.avatar_color ?? '#64748b',
      hatColor: getHatColor(character?.hat_id) ?? undefined,
      modelId: character?.model_id,
      isAfk: this.isAfkBotActive,
    };
    if (channel && currentUser) {
      void channel.send({ type: 'broadcast', event: 'move', payload });
      void channel.track(payload).catch(() => {});
    }
    localBroadcast?.postMessage({ type: 'move', payload });
  }

  setPosition(tileX: number, tileY: number) {
    const clampedX = Phaser.Math.Clamp(tileX, 1, 54);
    const clampedY = Phaser.Math.Clamp(tileY, 1, 54);
    ownTilePosition = { x: clampedX, y: clampedY };
    const p = this.tileToWorld(clampedX, clampedY);
    this.worldPos.set(p.x, p.y);
    this.avatar?.setPosition(p.x, p.y);
    this.cameras?.main?.centerOn(p.x, p.y);
  }

  getPosition() {
    return { x: ownTilePosition.x, y: ownTilePosition.y };
  }

  setOnline(avatars: Avatar[]) {
    const activeIds = new Set<string>();
    for (const a of avatars) {
      const id = a.clientId ?? a.userId;
      if (id === clientId) continue;
      activeIds.add(id);
      this.putOther(a);
    }
    for (const [id, item] of this.others.entries()) {
      if (!activeIds.has(id) && Date.now() - item.lastSeen > 5000) {
        item.container.destroy();
        this.others.delete(id);
      }
    }
  }

  public putOther(a: Avatar) {
    const id = a.clientId ?? a.userId;
    if (id === clientId) return;
    const safeName = sanitizePlayerLabelName(a.name, 'Warga');
    const displayLabel = a.isAfk ? `${safeName} (AFK)` : safeName;
    const p = this.tileToWorld(a.tx, a.ty);
    let item = this.others.get(id);
    if (!item) {
      const shadow = this.add.ellipse(0, 0, 21, 9, 0x1e293b, 0.28);
      const bodyGroup = this.buildChibiBodyGroup(a.modelId, a.color, a.hatColor);
      const label = this.add
        .text(0, -58, displayLabel, {
          fontFamily: 'Plus Jakarta Sans, Arial',
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#ffffff',
          backgroundColor: a.isAfk ? 'rgba(120, 53, 15, 0.86)' : 'rgba(15, 23, 42, 0.78)',
          stroke: '#0f172a',
          strokeThickness: 3,
          padding: { x: 6, y: 2 },
          shadow: { offsetX: 0, offsetY: 1, color: '#000000', blur: 2, fill: true },
        })
        .setOrigin(0.5);
      const container = this.add.container(p.x, p.y, [shadow, bodyGroup, label]).setDepth(p.y + 80);
      item = {
        container,
        bodyGroup,
        target: new Phaser.Math.Vector2(p.x, p.y),
        label,
        lastSeen: Date.now(),
        walkPhase: 0,
      };
      this.others.set(id, item);
    }
    item.target.set(p.x, p.y);
    item.label.setText(displayLabel);
    item.lastSeen = Date.now();
  }
}

// Section 4, 9 & 11: Update Region 1 population display (`18 / 25`), live WIB Clock, and PvP Status Pill
function updateCombinedWorldHeader(onlineCount = 1) {
  const el = document.querySelector<HTMLElement>('#combinedWorldTag');
  if (el) {
    const rawRegion = character?.home_region ?? 'Wilayah 1';
    const regionDisplay = currentLang === 'en' ? rawRegion.replace(/Wilayah/i, 'Region') : rawRegion;
    const stats = localBackend.getWorldRegionAndNewsStats();
    el.textContent = `${regionDisplay} • ${onlineCount} ${t().onlineSuffix} • ${stats.regionPopulationDisplay}`;
  }

  const wibEl = document.querySelector<HTMLElement>('#wibClockText');
  if (wibEl) {
    wibEl.textContent = `${getWibTimeInfo().wibTimeString} WIB`;
  }

  const pvpEl = document.querySelector<HTMLElement>('#pvpStatusPill');
  if (pvpEl) {
    const inArena = isArenaTile(Math.round(ownTilePosition.x), Math.round(ownTilePosition.y));
    pvpEl.className = `pvp-status-pill ${inArena ? 'on' : 'off'}`;
    pvpEl.textContent = inArena ? `⚔️ ${t().pvpStatusOn}` : `🛡️ ${t().pvpStatusOff}`;
  }
}

function shell() {
  const dict = t();
  $('#app').innerHTML = `
    <div class="game-shell">
      <div id="game"></div>
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark">R</span>
          <span><b>RIMBA</b><small id="brandSubText">${escapeHtml(dict.brandSub)}</small></span>
        </div>
        <button type="button" class="world-tag" id="worldHeaderBtn" style="cursor:pointer" title="Wilayah 1 • Kapasitas: 25 pemain • Visual AFK aktif: 5 dari 18 penduduk terdaftar">
          <i></i> <span id="combinedWorldTag">Wilayah 1 • 1 online • 18 / 25</span>
        </button>
        <div class="topbar-actions">
          <span class="pvp-status-pill off" id="pvpStatusPill">🛡️ ${escapeHtml(dict.pvpStatusOff)}</span>
          <span class="wib-clock-pill" id="wibClockPill" title="Waktu Indonesia Barat (Asia/Jakarta) — Reset Bunga Bank 12:00 WIB">
            🕒 <span id="wibClockText">--:--:-- WIB</span>
          </span>
          <div class="lang-switch" role="group" aria-label="Bahasa Indonesia / English">
            <button type="button" id="langIdBtn" class="${currentLang === 'id' ? 'active' : ''}">ID</button>
            <button type="button" id="langEnBtn" class="${currentLang === 'en' ? 'active' : ''}">EN</button>
          </div>
          <button id="centerCamBtn" class="camera-button" type="button">${escapeHtml(dict.centerCam)}</button>
          <button id="accountBtn" class="account-button" type="button">${escapeHtml(dict.loginRegister)}</button>
        </div>
      </header>
      <div class="controls-hint" id="controlsHintBox">
        <b id="ctrlTitle">${escapeHtml(dict.controlsTitle)}</b>
        <span id="ctrlMove">${escapeHtml(dict.controlsMove)}</span>
        <span id="ctrlAttack">${escapeHtml(dict.controlsAttack)}</span>
        <span id="ctrlInteract">${escapeHtml(dict.controlsInteract)}</span>
        <span id="ctrlInv">${escapeHtml(dict.controlsInventory)}</span>
        <span id="ctrlCam">${escapeHtml(dict.controlsCamera)}</span>
      </div>
      <div id="dialog-root"></div>
    </div>
  `;
}

function refreshStaticHudText() {
  const dict = t();
  const brandSub = document.querySelector('#brandSubText');
  if (brandSub) brandSub.textContent = dict.brandSub;
  const centerBtn = document.querySelector('#centerCamBtn');
  if (centerBtn) centerBtn.textContent = dict.centerCam;
  const ctrlTitle = document.querySelector('#ctrlTitle');
  if (ctrlTitle) ctrlTitle.textContent = dict.controlsTitle;
  const ctrlMove = document.querySelector('#ctrlMove');
  if (ctrlMove) ctrlMove.textContent = dict.controlsMove;
  const ctrlAttack = document.querySelector('#ctrlAttack');
  if (ctrlAttack) ctrlAttack.textContent = dict.controlsAttack;
  const ctrlInteract = document.querySelector('#ctrlInteract');
  if (ctrlInteract) ctrlInteract.textContent = dict.controlsInteract;
  const ctrlInv = document.querySelector('#ctrlInv');
  if (ctrlInv) ctrlInv.textContent = dict.controlsInventory;
  const ctrlCam = document.querySelector('#ctrlCam');
  if (ctrlCam) ctrlCam.textContent = dict.controlsCamera;
  syncAccountButtonLabel();
  updateCombinedWorldHeader();
}

function syncAccountButtonLabel() {
  const btn = document.querySelector<HTMLButtonElement>('#accountBtn');
  if (!btn) return;
  const dict = t();
  btn.textContent = currentUser?.is_anonymous
    ? dict.saveAccount
    : currentUser
      ? dict.logout
      : dict.loginRegister;
}

function escapeHtml(v: string) {
  return v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function modal(title: string, body: string) {
  $('#dialog-root').innerHTML = `
    <div class="scrim" id="scrim">
      <section class="dialog">
        <button class="close" id="closeDialog" type="button" aria-label="${escapeHtml(t().close)}">×</button>
        <div class="eyebrow">BALAI KOTA • RIMBA</div>
        <h2>${escapeHtml(title)}</h2>
        ${body}
      </section>
    </div>
  `;
  $('#closeDialog').onclick = () => {
    $('#dialog-root').innerHTML = '';
  };
  $('#scrim').addEventListener('click', e => {
    if (e.target === $('#scrim')) $('#dialog-root').innerHTML = '';
  });
}

function showMessage(text: string) {
  const el = document.querySelector<HTMLElement>('#formMessage');
  if (el) el.textContent = text;
}

async function activateGuestModeAndContinue() {
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (!error && data.user) {
        currentUser = {
          id: data.user.id,
          email: data.user.email,
          is_anonymous: Boolean(data.user.is_anonymous ?? true),
        };
      }
    } catch {
      // Fallback to localBackend
    }
  }
  if (!currentUser) {
    currentUser = localBackend.signInAnonymously();
  }
  syncAccountButtonLabel();
  await loadCharacter();
  void joinWorld();
  $('#dialog-root').innerHTML = '';
  if (!character) {
    openCharacterCreator();
  }
}

function openAuthWithGuest() {
  const dict = t();
  openAuth();
  const form = $('#authForm');
  const guestButton = document.createElement('button');
  guestButton.type = 'button';
  guestButton.className = 'primary full guest-continue';
  guestButton.textContent = dict.guestBtn;
  form.before(guestButton);

  const note = document.createElement('p');
  note.className = 'guest-note';
  note.textContent = dict.guestNote;
  guestButton.after(note);

  guestButton.onclick = async () => {
    guestButton.disabled = true;
    await activateGuestModeAndContinue();
  };
}

function openSaveAccount() {
  if (!currentUser) return;
  const dict = t();
  modal(
    dict.saveAccountTitle,
    `
    <p class="dialog-copy">${escapeHtml(dict.saveAccountCopy)}</p>
    <form id="saveAccountForm" class="stack">
      <label>${escapeHtml(dict.emailLabel)}
        <input name="email" type="email" required autocomplete="email" placeholder="nama@email.com">
      </label>
      <label>${escapeHtml(dict.passwordLabel)}
        <input name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="${escapeHtml(dict.passwordPlaceholder)}">
      </label>
      <button class="primary full" type="submit">${escapeHtml(dict.linkEmailBtn)}</button>
      <button class="secondary full" type="button" id="logoutGuestBtn">${escapeHtml(dict.logoutGuestBtn)}</button>
      <p class="form-message" id="formMessage"></p>
    </form>
  `
  );

  $('#logoutGuestBtn').onclick = async () => {
    if (supabase) await supabase.auth.signOut().catch(() => {});
    localBackend.signOut();
    currentUser = null;
    character = null;
    syncAccountButtonLabel();
    window.dispatchEvent(new Event('character-change'));
    $('#dialog-root').innerHTML = '';
  };

  $('#saveAccountForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const email = String(values.get('email'));
    const password = String(values.get('password'));
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.disabled = true;
    try {
      if (supabase) {
        const { error } = await supabase.auth.updateUser({ email, password });
        if (!error) {
          showMessage(
            currentLang === 'en'
              ? 'Account link requested. Check your email if verification is enabled.'
              : 'Permintaan disimpan. Periksa email bila verifikasi aktif.'
          );
          button.disabled = false;
          return;
        }
      }
      currentUser = localBackend.linkGuestToEmail(currentUser!.id, email, password, currentLang);
      syncAccountButtonLabel();
      showMessage(currentLang === 'en' ? 'Guest progress linked to your email!' : 'Progres tamu berhasil ditautkan ke email!');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : String(err));
    } finally {
      button.disabled = false;
    }
  });
}

function openAuth() {
  const dict = t();
  modal(
    dict.welcomeTitle,
    `
    <p class="dialog-copy">${escapeHtml(dict.welcomeCopy)}</p>
    <form id="authForm" class="stack">
      <label>${escapeHtml(dict.emailLabel)}
        <input name="email" type="email" required autocomplete="email" placeholder="nama@email.com">
      </label>
      <label>${escapeHtml(dict.passwordLabel)}
        <input name="password" type="password" required minlength="8" autocomplete="current-password" placeholder="${escapeHtml(dict.passwordPlaceholder)}">
      </label>
      <div class="form-actions">
        <button class="primary" type="submit" name="intent" value="login">${escapeHtml(dict.loginAction)}</button>
        <button class="secondary" type="submit" name="intent" value="signup">${escapeHtml(dict.signupAction)}</button>
      </div>
      <p class="form-message" id="formMessage"></p>
    </form>
  `
  );

  $('#authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    const fd = new FormData(f);
    const intent = (e.submitter as HTMLButtonElement)?.value || 'login';
    const email = String(fd.get('email'));
    const password = String(fd.get('password'));

    if (supabase) {
      const result =
        intent === 'signup'
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });
      if (!result.error && result.data.user) {
        currentUser = { id: result.data.user.id, email: result.data.user.email, is_anonymous: false };
        syncAccountButtonLabel();
        await loadCharacter();
        void joinWorld();
        $('#dialog-root').innerHTML = '';
        if (!character) openCharacterCreator();
        return;
      }
    }

    try {
      currentUser =
        intent === 'signup'
          ? localBackend.signUpWithEmail(email, password, currentLang)
          : localBackend.signInWithEmail(email, password, currentLang);
      syncAccountButtonLabel();
      await loadCharacter();
      void joinWorld();
      $('#dialog-root').innerHTML = '';
      if (!character) openCharacterCreator();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : String(err));
    }
  });
}

function openCharacterCreator() {
  if (!currentUser) {
    currentUser = localBackend.signInAnonymously();
    syncAccountButtonLabel();
  }
  const existing = localBackend.getCharacter(currentUser.id);
  if (existing) {
    character = existing;
    window.dispatchEvent(new Event('character-change'));
    openKtp();
    return;
  }

  const dict = t();
  const modelCards = CHARACTER_MODELS.map((m, i) => {
    const label = currentLang === 'en' ? m.label_en : m.label_id;
    return `
      <label class="model-card">
        <input type="radio" name="model" value="${escapeHtml(m.id)}" ${i === 0 ? 'checked' : ''}>
        <span class="model-art">${renderChibiCharacterSvg(m.id)}</span>
        <small>${escapeHtml(label)}</small>
      </label>
    `;
  }).join('');

  modal(
    dict.createCharTitle,
    `
    <p class="dialog-copy">${escapeHtml(dict.createCharCopy)}</p>
    <form id="characterForm" class="stack">
      <div class="model-grid">${modelCards}</div>
      <div class="two-col">
        <label>${escapeHtml(dict.charNameLabel)}
          <input name="name" required minlength="2" maxlength="20" placeholder="${escapeHtml(dict.charNamePlaceholder)}">
        </label>
        <label>${escapeHtml(dict.charAgeLabel)}
          <input name="age" required type="number" min="18" max="99" value="21">
        </label>
      </div>
      <label>${escapeHtml(dict.charBioLabel)} <span class="optional">${escapeHtml(dict.optional)}</span>
        <input name="bio" maxlength="120" placeholder="${escapeHtml(dict.charBioPlaceholder)}">
      </label>
      <button class="primary full" type="submit">${escapeHtml(dict.issueKtpBtn)}</button>
      <p id="formMessage" class="form-message"></p>
    </form>
  `
  );

  $('#characterForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    const fd = new FormData(f);

    try {
      const cleanName = validateAndModerateCharacterName(String(fd.get('name')), currentLang);
      const payload = {
        p_display_name: cleanName,
        p_age: Number(fd.get('age')),
        p_bio: String(fd.get('bio') || ''),
        p_model_id: String(fd.get('model')),
      };
      let created: Character | null = null;
      if (supabase && currentUser) {
        const { data, error } = await supabase.rpc('create_character', payload);
        if (!error && data) {
          const cloudChar = data as Character;
          created = {
            ...cloudChar,
            outfit_id: 'tunika-rimba',
            hat_id: 'none',
            residence_status: 'Warga',
          };
        }
      }
      if (!created && currentUser) {
        created = localBackend.createCharacter(currentUser.id, payload, currentLang);
      }
      character = created;
      ownTilePosition = { x: GAME_CONFIG.CENTRAL_SPAWN.x, y: GAME_CONFIG.CENTRAL_SPAWN.y };
      world?.setPosition(ownTilePosition.x, ownTilePosition.y);
      $('#dialog-root').innerHTML = '';
      window.dispatchEvent(new Event('character-change'));
      await joinWorld();
      openKtp();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : String(err));
    }
  });
}

function openKtp() {
  if (!character) return;
  const dict = t();
  const createdDate = new Date(character.created_at).toLocaleDateString(currentLang === 'en' ? 'en-US' : 'id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  modal(
    dict.ktpModalTitle,
    `
    <div class="ktp-card">
      <div class="ktp-head">
        <b>RIMBA</b>
        <span>${escapeHtml(dict.ktpHeaderSub)}</span>
      </div>
      <div class="ktp-person">
        <span class="ktp-avatar">${renderChibiCharacterSvg(character.model_id, character.avatar_color, getHatColor(character.hat_id))}</span>
        <div>
          <small>${escapeHtml(dict.ktpName)}</small>
          <b>${escapeHtml(character.display_name)}</b>
          <small>${escapeHtml(dict.ktpRegionStatus)}</small>
          <b>${escapeHtml(character.home_region)} · ${escapeHtml(character.residence_status)}</b>
          ${character.bio ? `<small>${escapeHtml(dict.ktpBio)}</small><span style="font-size:11px;color:#334155">${escapeHtml(character.bio)}</span>` : ''}
        </div>
      </div>
      <div class="ktp-data">
        <span>${escapeHtml(dict.ktpNumber)}<strong>#${String(character.citizen_number).padStart(5, '0')}</strong></span>
        <span>${escapeHtml(dict.ktpAge)}<strong>${character.age} ${escapeHtml(dict.ktpYearsOld)}</strong></span>
        <span>${escapeHtml(dict.ktpGender)}<strong>${character.gender === 'female' ? escapeHtml(dict.female) : escapeHtml(dict.male)}</strong></span>
        <span>${escapeHtml(dict.ktpIssued)}<strong>${escapeHtml(createdDate)}</strong></span>
      </div>
      <p>${escapeHtml(dict.ktpDisclaimer)}</p>
    </div>
  `
  );
}

async function loadCharacter() {
  character = null;
  if (currentUser) {
    const localChar = localBackend.getCharacter(currentUser.id);
    if (localChar) {
      character = localChar;
    } else if (supabase) {
      try {
        const { data } = await supabase.from('characters').select('*').eq('user_id', currentUser.id).maybeSingle();
        if (data) {
          const cloudChar = data as Character;
          character = {
            ...cloudChar,
            outfit_id: cloudChar.outfit_id ?? 'tunika-rimba',
            hat_id: cloudChar.hat_id ?? 'none',
            residence_status: cloudChar.residence_status ?? 'Warga',
          };
        }
      } catch {
        // Fallback already checked
      }
    }
  }
  window.dispatchEvent(new Event('character-change'));
}

async function joinWorld() {
  if (!localBroadcast && typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    localBroadcast = new BroadcastChannel('rimba-world-1');
    localBroadcast.onmessage = ev => {
      const msg = ev.data as { type: string; payload?: unknown };
      if (msg?.type === 'move' && msg.payload) {
        const avatar = msg.payload as Avatar;
        if (avatar.clientId !== clientId) {
          latestMoves.set(avatar.clientId ?? avatar.userId, avatar);
          world?.putOther(avatar);
        }
      }
    };
  }

  if (!supabase || !currentUser) return;
  if (channel) await supabase.removeChannel(channel);
  latestMoves.clear();

  channel = supabase.channel('world:1', {
    config: { private: true, presence: { key: clientId }, broadcast: { ack: false, self: false } },
  });
  channel.on('presence', { event: 'sync' }, () => {
    world?.setOnline(mergedAvatars());
  });
  channel.on('broadcast', { event: 'move' }, ({ payload }) => {
    if (payload && payload.clientId !== clientId) {
      const raw = payload as Record<string, unknown>;
      const avatar: Avatar = {
        userId: String(raw.userId ?? ''),
        clientId: String(raw.clientId ?? raw.userId ?? ''),
        name: String(raw.name ?? 'Penonton'),
        tx: Number(raw.tx ?? raw.x ?? GAME_CONFIG.CENTRAL_SPAWN.x),
        ty: Number(raw.ty ?? raw.y ?? GAME_CONFIG.CENTRAL_SPAWN.y),
        color: String(raw.color ?? '#5f9e6e'),
        modelId: raw.modelId ? String(raw.modelId) : undefined,
        isAfk: Boolean(raw.isAfk),
      };
      latestMoves.set(avatar.clientId!, avatar);
      world?.setOnline(mergedAvatars());
    }
  });
  await channel.subscribe(async status => {
    if (status === 'SUBSCRIBED') {
      await channel!.track({
        userId: currentUser!.id,
        clientId,
        name: character?.display_name ?? 'Penonton',
        tx: ownTilePosition.x,
        ty: ownTilePosition.y,
        color: character?.avatar_color ?? '#5f9e6e',
        modelId: character?.model_id,
      });
    }
  });
}

function getPresenceAvatars(): Avatar[] {
  if (!channel) return [];
  const out: Avatar[] = [];
  for (const rows of Object.values(channel.presenceState())) {
    for (const row of rows as Record<string, unknown>[]) {
      if (typeof row.userId === 'string') {
        out.push({
          userId: row.userId,
          clientId: String(row.clientId ?? row.userId),
          name: String(row.name ?? 'Penonton'),
          tx: Number(row.tx ?? row.x ?? GAME_CONFIG.CENTRAL_SPAWN.x),
          ty: Number(row.ty ?? row.y ?? GAME_CONFIG.CENTRAL_SPAWN.y),
          color: String(row.color ?? '#5f9e6e'),
          modelId: row.modelId ? String(row.modelId) : undefined,
          isAfk: Boolean(row.isAfk),
        });
      }
    }
  }
  return out;
}

function mergedAvatars(): Avatar[] {
  const combined = new Map(
    getPresenceAvatars().map(a => [a.clientId ?? a.userId, latestMoves.get(a.clientId ?? a.userId) ?? a])
  );
  for (const [id, a] of latestMoves) {
    if (!combined.has(id)) combined.set(id, a);
  }
  return [...combined.values()];
}

export function bootRimbaGame() {
  if (initialized || typeof window !== 'undefined' === false) return;
  initialized = true;

  shell();
  mountPhaseTwo({
    client: supabase,
    getLang: () => currentLang,
    getUserId: () => currentUser?.id ?? null,
    getCharacter: () => character,
    onCharacterUpdated: updated => {
      character = updated;
      window.dispatchEvent(new Event('character-change'));
    },
    openCharacterCreator,
    openKtpModal: openKtp,
    hasCharacter: () => Boolean(currentUser && character),
    getPosition: () => world?.getPosition() ?? ownTilePosition,
    setPosition: (x, y) => {
      ownTilePosition = { x, y };
      world?.setPosition(x, y);
    },
  });

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#76bf6d',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [WorldScene],
    render: { antialias: true, roundPixels: false },
  });

  const resizeGame = () => game.scale.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resizeGame);
  game.events.once(Phaser.Core.Events.READY, resizeGame);
  requestAnimationFrame(resizeGame);

  const switchLanguage = (lang: Lang) => {
    currentLang = lang;
    setSavedLang(lang);
    document.querySelector('#langIdBtn')?.classList.toggle('active', lang === 'id');
    document.querySelector('#langEnBtn')?.classList.toggle('active', lang === 'en');
    refreshStaticHudText();
    window.dispatchEvent(new Event('rimba-lang-change'));
  };

  $('#langIdBtn').onclick = () => switchLanguage('id');
  $('#langEnBtn').onclick = () => switchLanguage('en');

  $('#worldHeaderBtn').onclick = () => {
    window.dispatchEvent(new CustomEvent('rimba-open-world-info', { detail: { tab: 'region' } }));
  };

  $('#centerCamBtn').onclick = () => {
    world?.centerCameraOnPlayer();
  };

  $('#accountBtn').onclick = () => {
    if (!currentUser) {
      openAuthWithGuest();
    } else if (currentUser.is_anonymous) {
      openSaveAccount();
    } else {
      if (supabase) void supabase.auth.signOut().catch(() => {});
      localBackend.signOut();
      currentUser = null;
      character = null;
      syncAccountButtonLabel();
      window.dispatchEvent(new Event('character-change'));
    }
  };

  const savedLocalUser = localBackend.getSessionUser();
  if (savedLocalUser) {
    currentUser = savedLocalUser;
    syncAccountButtonLabel();
    void loadCharacter().then(() => joinWorld());
  } else {
    void joinWorld();
  }
}

if (
  typeof window !== 'undefined' &&
  document.querySelector('#app') &&
  !document.querySelector('#app')?.hasAttribute('data-nextjs')
) {
  bootRimbaGame();
}
