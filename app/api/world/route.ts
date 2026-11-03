import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const REGION_CAPACITY = 25;
const STATE_FILE_PATH = path.join('/tmp', 'rimba_world_state_v4_clean.json');

export type ServerCharacterRecord = {
  user_id: string;
  citizen_number: number;
  display_name: string;
  age: number;
  bio: string;
  model_id: string;
  gender: 'male' | 'female';
  avatar_color: string;
  outfit_id: string;
  hat_id: string;
  residence_status: 'Warga' | 'Penduduk';
  home_region: string;
  starter_sword_id: string;
  hotbar_slot_1: string;
  sword_bound: boolean;
  created_at: string;
};

export type ServerPresenceAvatar = {
  userId: string;
  sessionId: string;
  citizenNumber: number;
  name: string;
  region: string;
  tx: number;
  ty: number;
  dir: string;
  color: string;
  hatColor?: string;
  modelId: string;
  isAfk: boolean;
  isOfflineAfk?: boolean;
  hp: number;
  maxHp: number;
  isDowned: boolean;
  lastSwingAt: number;
  swingDir: string;
  updatedAt: number;
};

export type ServerPvpHitEvent = {
  id: string;
  attackerId: string;
  attackerName: string;
  targetUserId: string;
  damage: number;
  region: string;
  createdAt: number;
};

type PersistedWorldState = {
  version: number;
  citizenSeq: number;
  usersByEmail: Record<string, { id: string; email: string; passwordHash: string }>;
  charactersByUserId: Record<string, ServerCharacterRecord>;
  positionsByUserId: Record<string, { tx: number; ty: number; dir: string; updatedAt: number }>;
  activeSessionByUserId: Record<string, { sessionId: string; updatedAt: number }>;
  presenceByUserId: Record<string, ServerPresenceAvatar>;
  pvpEvents: ServerPvpHitEvent[];
};

const globalForWorld = globalThis as unknown as {
  __rimbaWorldStateV4?: PersistedWorldState;
};

function createEmptyWorldState(): PersistedWorldState {
  return {
    version: 4,
    citizenSeq: 0,
    usersByEmail: {},
    charactersByUserId: {},
    positionsByUserId: {},
    activeSessionByUserId: {},
    presenceByUserId: {},
    pvpEvents: [],
  };
}

function getWorldState(): PersistedWorldState {
  if (globalForWorld.__rimbaWorldStateV4) {
    return globalForWorld.__rimbaWorldStateV4;
  }
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedWorldState;
      if (parsed && parsed.version === 4) {
        globalForWorld.__rimbaWorldStateV4 = parsed;
        return parsed;
      }
    }
  } catch {
    // Fallback to in-memory state if /tmp is read-only
  }
  const fresh = createEmptyWorldState();
  globalForWorld.__rimbaWorldStateV4 = fresh;
  persistWorldState(fresh);
  return fresh;
}

function persistWorldState(state: PersistedWorldState): void {
  try {
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state), 'utf-8');
  } catch {
    // Ignore file write errors in serverless read-only environments
  }
}

function pruneStalePresence(state: PersistedWorldState, now = Date.now()): void {
  for (const [uid, pres] of Object.entries(state.presenceByUserId)) {
    if (now - pres.updatedAt > 20_000) {
      state.positionsByUserId[uid] = {
        tx: pres.tx,
        ty: pres.ty,
        dir: pres.dir || 'S',
        updatedAt: now,
      };
      delete state.presenceByUserId[uid];
    }
  }
  state.pvpEvents = state.pvpEvents.filter(ev => now - ev.createdAt < 15_000);
}

function computeRegionByCapacity(state: PersistedWorldState, citizenNumber: number): string {
  // Primary deterministic rule: 1..25 -> Wilayah 1, 26..50 -> Wilayah 2, etc.
  const primaryIdx = Math.max(1, Math.ceil(citizenNumber / REGION_CAPACITY));
  const counts = new Map<number, number>();
  for (const c of Object.values(state.charactersByUserId)) {
    const m = /Wilayah\s+(\d+)/i.exec(c.home_region);
    const idx = m ? Number(m[1]) : 1;
    counts.set(idx, (counts.get(idx) ?? 0) + 1);
  }
  let regionIdx = primaryIdx;
  while ((counts.get(regionIdx) ?? 0) >= REGION_CAPACITY) {
    regionIdx++;
  }
  return `Wilayah ${regionIdx}`;
}

function getRegionSummary(state: PersistedWorldState, regionName: string) {
  const allChars = Object.values(state.charactersByUserId);
  const regionChars = allChars.filter(c => c.home_region === regionName);
  const regionOnline = Object.values(state.presenceByUserId).filter(p => p.region === regionName);
  const afkCount = regionOnline.filter(p => p.isAfk).length;
  const offlineRegistered = Math.max(0, regionChars.length - regionOnline.length);

  return {
    regionName,
    regionCapacity: REGION_CAPACITY,
    registeredInRegion: regionChars.length,
    permanentInRegion: regionChars.filter(c => c.residence_status === 'Penduduk').length,
    totalRegisteredAllRegions: allChars.length,
    onlineInRegion: regionOnline.length,
    afkInRegion: afkCount + offlineRegistered,
  };
}

function getRegionPlayers(
  state: PersistedWorldState,
  effectiveRegion: string,
  excludeUserId: string,
  now: number
): ServerPresenceAvatar[] {
  const allCharsInRegion = Object.values(state.charactersByUserId).filter(
    c => c.home_region === effectiveRegion
  );

  const players: ServerPresenceAvatar[] = [];
  const processedUserIds = new Set<string>();

  for (const c of allCharsInRegion) {
    if (c.user_id === excludeUserId) continue;
    processedUserIds.add(c.user_id);

    const pres = state.presenceByUserId[c.user_id];
    const isLiveOnline = Boolean(pres && now - pres.updatedAt < 20_000);

    if (isLiveOnline && pres) {
      players.push({
        ...pres,
        isAfk: pres.isAfk,
        isOfflineAfk: false,
        hp: pres.hp ?? 100,
        maxHp: pres.maxHp ?? 100,
      });
    } else {
      // Offline registered character -> PERSIST ON MAP IN AFK MODE!
      const pos = state.positionsByUserId[c.user_id] ?? { tx: 28, ty: 30, dir: 'S', updatedAt: now };
      players.push({
        userId: c.user_id,
        sessionId: '',
        citizenNumber: c.citizen_number,
        name: c.display_name,
        region: c.home_region,
        tx: pos.tx,
        ty: pos.ty,
        dir: pos.dir || 'S',
        color: c.avatar_color,
        hatColor: c.hat_id !== 'none' ? c.hat_id : undefined,
        modelId: c.model_id,
        isAfk: true,
        isOfflineAfk: true,
        hp: 100,
        maxHp: 100,
        isDowned: false,
        lastSwingAt: 0,
        swingDir: pos.dir || 'S',
        updatedAt: pos.updatedAt || now,
      });
    }
  }

  // Also include online spectators or guests exploring without character yet
  for (const pres of Object.values(state.presenceByUserId)) {
    if (pres.region === effectiveRegion && pres.userId !== excludeUserId && !processedUserIds.has(pres.userId)) {
      if (now - pres.updatedAt < 20_000) {
        players.push(pres);
      }
    }
  }

  return players;
}

export async function GET(req: NextRequest) {
  const state = getWorldState();
  const now = Date.now();
  pruneStalePresence(state, now);

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || '';
  const sessionId = searchParams.get('sessionId') || '';
  const requestedRegion = searchParams.get('region') || 'Wilayah 1';

  const char = userId ? state.charactersByUserId[userId] ?? null : null;
  const effectiveRegion = char?.home_region || requestedRegion || 'Wilayah 1';
  const savedPos = userId ? state.positionsByUserId[userId] ?? null : null;

  const activeSession = userId ? state.activeSessionByUserId[userId] : undefined;
  const sessionConflict = Boolean(
    userId &&
      sessionId &&
      activeSession &&
      activeSession.sessionId !== sessionId &&
      now - activeSession.updatedAt < 25_000
  );

  const regionPlayers = getRegionPlayers(state, effectiveRegion, userId, now);

  const pendingPvpHits = userId
    ? state.pvpEvents.filter(ev => ev.targetUserId === userId)
    : [];
  if (pendingPvpHits.length > 0 && userId) {
    state.pvpEvents = state.pvpEvents.filter(ev => ev.targetUserId !== userId);
  }

  return NextResponse.json({
    ok: true,
    character: char,
    position: savedPos,
    sessionConflict,
    regionSummary: getRegionSummary(state, effectiveRegion),
    players: regionPlayers,
    pendingPvpHits,
    serverTime: now,
  });
}

export async function POST(req: NextRequest) {
  const state = getWorldState();
  const now = Date.now();
  pruneStalePresence(state, now);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 });
  }

  const action = String(body.action || '');

  // 1. Auth Sign Up / Sign In / Link Email (cross-device account persistence)
  if (action === 'auth_signup' || action === 'auth_signin' || action === 'auth_link') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const sessionId = String(body.sessionId || '');
    if (!email || password.length < 8) {
      return NextResponse.json(
        { ok: false, error: 'Masukkan email valid dan kata sandi minimal 8 karakter.' },
        { status: 400 }
      );
    }

    if (action === 'auth_signup') {
      if (state.usersByEmail[email]) {
        return NextResponse.json(
          { ok: false, error: 'Email sudah terdaftar. Silakan gunakan tombol Masuk.' },
          { status: 409 }
        );
      }
      const userId = String(body.userId || `user-${crypto.randomUUID()}`);
      state.usersByEmail[email] = { id: userId, email, passwordHash: password };
      if (sessionId) {
        state.activeSessionByUserId[userId] = { sessionId, updatedAt: now };
      }
      persistWorldState(state);
      return NextResponse.json({
        ok: true,
        user: { id: userId, email, is_anonymous: false },
        character: state.charactersByUserId[userId] ?? null,
        position: state.positionsByUserId[userId] ?? null,
      });
    }

    if (action === 'auth_signin') {
      const found = state.usersByEmail[email];
      if (!found || found.passwordHash !== password) {
        return NextResponse.json(
          { ok: false, error: 'Email atau kata sandi tidak cocok.' },
          { status: 401 }
        );
      }
      if (sessionId) {
        state.activeSessionByUserId[found.id] = { sessionId, updatedAt: now };
      }
      persistWorldState(state);
      return NextResponse.json({
        ok: true,
        user: { id: found.id, email: found.email, is_anonymous: false },
        character: state.charactersByUserId[found.id] ?? null,
        position: state.positionsByUserId[found.id] ?? null,
      });
    }

    if (action === 'auth_link') {
      const userId = String(body.userId || '');
      if (!userId) {
        return NextResponse.json({ ok: false, error: 'User ID required' }, { status: 400 });
      }
      const existing = state.usersByEmail[email];
      if (existing && existing.id !== userId) {
        return NextResponse.json(
          { ok: false, error: 'Email tersebut sudah dipakai akun lain.' },
          { status: 409 }
        );
      }
      state.usersByEmail[email] = { id: userId, email, passwordHash: password };
      if (sessionId) {
        state.activeSessionByUserId[userId] = { sessionId, updatedAt: now };
      }
      persistWorldState(state);
      return NextResponse.json({
        ok: true,
        user: { id: userId, email, is_anonymous: false },
        character: state.charactersByUserId[userId] ?? null,
      });
    }
  }

  // 2. Atomic Character Creation + Citizen #001 Sequence + 25-Capacity Region + Starter Sword
  if (action === 'create_character') {
    const userId = String(body.userId || '').trim();
    const sessionId = String(body.sessionId || '').trim();
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'User ID required' }, { status: 400 });
    }

    // Idempotent: if character already exists for this user, return existing character without creating a duplicate sword
    const existing = state.charactersByUserId[userId];
    if (existing) {
      if (sessionId) {
        state.activeSessionByUserId[userId] = { sessionId, updatedAt: now };
      }
      return NextResponse.json({
        ok: true,
        character: existing,
        position: state.positionsByUserId[userId] ?? { tx: 28, ty: 30, dir: 'S', updatedAt: now },
        regionSummary: getRegionSummary(state, existing.home_region),
      });
    }

    const displayName = String(body.displayName || '').replace(/\s+/g, ' ').trim();
    const age = Number(body.age || 21);
    const bio = String(body.bio || '').trim().slice(0, 120);
    const modelId = String(body.modelId || 'male-01');
    const avatarColor = String(body.avatarColor || '#5f9e6e');

    if (displayName.length < 2 || displayName.length > 20) {
      return NextResponse.json(
        { ok: false, error: 'Nama karakter harus antara 2 sampai 20 karakter.' },
        { status: 400 }
      );
    }
    if (Number.isNaN(age) || age < 18 || age > 99) {
      return NextResponse.json(
        { ok: false, error: 'Umur karakter harus antara 18 dan 99 tahun.' },
        { status: 400 }
      );
    }
    if (!/^(female|male)-(0[1-9]|10)$/.test(modelId)) {
      return NextResponse.json(
        { ok: false, error: 'Model karakter tidak valid.' },
        { status: 400 }
      );
    }

    // Atomic transaction in server memory: increment citizenSeq (starts at 1 -> #001), assign region (25 cap), grant starter sword
    const nextCitizenNumber = state.citizenSeq + 1;
    const assignedRegion = computeRegionByCapacity(state, nextCitizenNumber);

    const created: ServerCharacterRecord = {
      user_id: userId,
      citizen_number: nextCitizenNumber,
      display_name: displayName,
      age,
      bio,
      model_id: modelId,
      gender: modelId.startsWith('female-') ? 'female' : 'male',
      avatar_color: avatarColor,
      outfit_id: 'tunika-rimba',
      hat_id: 'none',
      residence_status: 'Warga',
      home_region: assignedRegion,
      starter_sword_id: 'sword_beginner_rimba',
      hotbar_slot_1: 'sword_beginner_rimba',
      sword_bound: true,
      created_at: new Date(now).toISOString(),
    };

    state.citizenSeq = nextCitizenNumber;
    state.charactersByUserId[userId] = created;
    state.positionsByUserId[userId] = { tx: 28, ty: 30, dir: 'S', updatedAt: now };
    if (sessionId) {
      state.activeSessionByUserId[userId] = { sessionId, updatedAt: now };
    }
    persistWorldState(state);

    return NextResponse.json({
      ok: true,
      character: created,
      position: state.positionsByUserId[userId],
      regionSummary: getRegionSummary(state, assignedRegion),
    });
  }

  // 3. Update Character Identity / Outfit / Residency Status
  if (action === 'update_character') {
    const userId = String(body.userId || '').trim();
    const existing = state.charactersByUserId[userId];
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Character not found' }, { status: 404 });
    }
    if (typeof body.display_name === 'string' && body.display_name.trim().length >= 2) {
      existing.display_name = body.display_name.trim().slice(0, 20);
    }
    if (typeof body.age === 'number' && body.age >= 18 && body.age <= 99) {
      existing.age = body.age;
    }
    if (typeof body.bio === 'string') {
      existing.bio = body.bio.trim().slice(0, 120);
    }
    if (typeof body.outfit_id === 'string') {
      existing.outfit_id = body.outfit_id;
    }
    if (typeof body.hat_id === 'string') {
      existing.hat_id = body.hat_id;
    }
    if (typeof body.avatar_color === 'string') {
      existing.avatar_color = body.avatar_color;
    }
    if (body.residence_status === 'Warga' || body.residence_status === 'Penduduk') {
      existing.residence_status = body.residence_status;
    }
    state.charactersByUserId[userId] = existing;
    persistWorldState(state);
    return NextResponse.json({ ok: true, character: existing });
  }

  // 4. Claim Active Session (when switching control from laptop to phone or vice versa on the same account)
  if (action === 'claim_session') {
    const userId = String(body.userId || '').trim();
    const sessionId = String(body.sessionId || '').trim();
    if (userId && sessionId) {
      state.activeSessionByUserId[userId] = { sessionId, updatedAt: now };
      persistWorldState(state);
    }
    return NextResponse.json({ ok: true, sessionConflict: false });
  }

  // 5. Heartbeat / Sync Player Position, Facing Direction, AFK Status & Sword Swing
  if (action === 'sync_presence') {
    const userId = String(body.userId || '').trim();
    const sessionId = String(body.sessionId || '').trim();
    if (!userId || !sessionId) {
      return NextResponse.json({ ok: false, error: 'Missing userId or sessionId' }, { status: 400 });
    }

    const activeSession = state.activeSessionByUserId[userId];
    if (!activeSession || now - activeSession.updatedAt >= 25_000) {
      state.activeSessionByUserId[userId] = { sessionId, updatedAt: now };
    } else if (activeSession.sessionId !== sessionId) {
      // Another device currently holds the active session for this account
      const char = state.charactersByUserId[userId] ?? null;
      const effectiveRegion = char?.home_region || String(body.region || 'Wilayah 1');
      return NextResponse.json({
        ok: true,
        sessionConflict: true,
        position: state.positionsByUserId[userId] ?? null,
        regionSummary: getRegionSummary(state, effectiveRegion),
        players: Object.values(state.presenceByUserId).filter(
          p => p.region === effectiveRegion && p.userId !== userId
        ),
        pendingPvpHits: [],
      });
    } else {
      activeSession.updatedAt = now;
    }

    let char = state.charactersByUserId[userId] ?? null;
    // If client already has a character created before server restart, register it cleanly
    if (!char && body.characterSnapshot && typeof body.characterSnapshot === 'object') {
      const snap = body.characterSnapshot as Partial<ServerCharacterRecord>;
      if (snap.display_name && snap.model_id) {
        const cNum =
          typeof snap.citizen_number === 'number' && snap.citizen_number > 0
            ? snap.citizen_number
            : state.citizenSeq + 1;
        if (cNum > state.citizenSeq) state.citizenSeq = cNum;
        const reg = snap.home_region || computeRegionByCapacity(state, cNum);
        char = {
          user_id: userId,
          citizen_number: cNum,
          display_name: String(snap.display_name).slice(0, 20),
          age: Number(snap.age || 21),
          bio: String(snap.bio || '').slice(0, 120),
          model_id: String(snap.model_id),
          gender: String(snap.model_id).startsWith('female-') ? 'female' : 'male',
          avatar_color: String(snap.avatar_color || '#5f9e6e'),
          outfit_id: String(snap.outfit_id || 'tunika-rimba'),
          hat_id: String(snap.hat_id || 'none'),
          residence_status: snap.residence_status === 'Penduduk' ? 'Penduduk' : 'Warga',
          home_region: reg,
          starter_sword_id: 'sword_beginner_rimba',
          hotbar_slot_1: 'sword_beginner_rimba',
          sword_bound: true,
          created_at: snap.created_at || new Date(now).toISOString(),
        };
        state.charactersByUserId[userId] = char;
      }
    }

    const effectiveRegion = char?.home_region || String(body.region || 'Wilayah 1');
    const tx = Math.max(1, Math.min(54, Number(body.tx ?? 28)));
    const ty = Math.max(1, Math.min(54, Number(body.ty ?? 30)));
    const dir = String(body.dir || 'S');

    state.positionsByUserId[userId] = { tx, ty, dir, updatedAt: now };

    if (char) {
      const prev = state.presenceByUserId[userId];
      const swingTriggered = Boolean(body.swing);
      state.presenceByUserId[userId] = {
        userId,
        sessionId,
        citizenNumber: char.citizen_number,
        name: char.display_name,
        region: effectiveRegion,
        tx,
        ty,
        dir,
        color: String(body.color || char.avatar_color || '#5f9e6e'),
        hatColor: body.hatColor ? String(body.hatColor) : undefined,
        modelId: char.model_id,
        isAfk: Boolean(body.isAfk),
        hp: Number(body.hp ?? 100),
        maxHp: Number(body.maxHp ?? 100),
        isDowned: Boolean(body.isDowned),
        lastSwingAt: swingTriggered ? now : prev?.lastSwingAt ?? 0,
        swingDir: swingTriggered ? dir : prev?.swingDir ?? dir,
        updatedAt: now,
      };
    }

    const pendingPvpHits = state.pvpEvents.filter(ev => ev.targetUserId === userId);
    if (pendingPvpHits.length > 0) {
      state.pvpEvents = state.pvpEvents.filter(ev => ev.targetUserId !== userId);
    }

    const regionPlayers = getRegionPlayers(state, effectiveRegion, userId, now);

    return NextResponse.json({
      ok: true,
      sessionConflict: false,
      character: char,
      regionSummary: getRegionSummary(state, effectiveRegion),
      players: regionPlayers,
      pendingPvpHits,
      serverTime: now,
    });
  }

  // 6. Authoritative Arena PvP Sword Attack Validation
  if (action === 'pvp_attack') {
    const attackerId = String(body.attackerId || '').trim();
    const targetUserId = String(body.targetUserId || '').trim();
    const attackerChar = state.charactersByUserId[attackerId];
    const attackerPres = state.presenceByUserId[attackerId];
    const targetPres = state.presenceByUserId[targetUserId];

    if (!attackerChar || !attackerPres || !targetPres) {
      return NextResponse.json({ ok: false, error: 'Target not in active world' }, { status: 400 });
    }
    if (attackerPres.region !== targetPres.region) {
      return NextResponse.json({ ok: false, error: 'Different region' }, { status: 400 });
    }

    // Both players must be inside Arena circle (center 45, 11, radius 4.8) and within sword range (2.6 tiles)
    const attackerInArena = Math.hypot(attackerPres.tx - 45, attackerPres.ty - 11) <= 4.8;
    const targetInArena = Math.hypot(targetPres.tx - 45, targetPres.ty - 11) <= 4.8;
    const dist = Math.hypot(attackerPres.tx - targetPres.tx, attackerPres.ty - targetPres.ty);

    if (!attackerInArena || !targetInArena || dist > 2.8) {
      return NextResponse.json({ ok: false, error: 'Out of Arena PvP range' }, { status: 400 });
    }

    const damage = 18;
    state.pvpEvents.push({
      id: `pvp-${now}-${Math.random().toString(36).slice(2, 7)}`,
      attackerId,
      attackerName: attackerChar.display_name,
      targetUserId,
      damage,
      region: attackerPres.region,
      createdAt: now,
    });

    return NextResponse.json({
      ok: true,
      damage,
      targetName: targetPres.name,
    });
  }

  // 7. Explicit Leave / Sign Out / Page Close
  if (action === 'leave' || action === 'leave_world') {
    const userId = String(body.userId || '').trim();
    if (userId) {
      const pres = state.presenceByUserId[userId];
      if (pres) {
        state.positionsByUserId[userId] = {
          tx: pres.tx,
          ty: pres.ty,
          dir: pres.dir || 'S',
          updatedAt: now,
        };
      }
      delete state.presenceByUserId[userId];
      delete state.activeSessionByUserId[userId];
      persistWorldState(state);
    }
    return NextResponse.json({ ok: true });
  }

  // 8. Safe Development Test Data Reset (Citizen #001 Reset)
  if (action === 'reset_test_data') {
    const confirmToken = String(body.confirm || '');
    if (confirmToken !== 'development_reset_to_001') {
      return NextResponse.json({ ok: false, error: 'Confirmation token required' }, { status: 400 });
    }
    const ownerUserId = String(body.preserveUserId || '').trim();
    const preservedUserEntry = Object.entries(state.usersByEmail).find(([, u]) => u.id === ownerUserId);

    const fresh = createEmptyWorldState();
    if (preservedUserEntry) {
      fresh.usersByEmail[preservedUserEntry[0]] = preservedUserEntry[1];
    }
    globalForWorld.__rimbaWorldStateV4 = fresh;
    persistWorldState(fresh);
    return NextResponse.json({
      ok: true,
      nextCitizenNumber: '001',
      regionCapacity: REGION_CAPACITY,
    });
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
}
