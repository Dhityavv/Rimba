// DESIGN-ANCHOR: Authoritative Store & Multi-Tab Sync Engine for Rimba — Survival Town 2.5D
// Map Grid: 56 x 56 tiles (0..55). Central Safe Zone is (21..35, 21..35), spawn is (28, 30).
// Enforces:
// - 1 character/account, atomic citizen_number, 20 Chibi Pixel-Art models (10 male + 10 female)
// - ZERO NPCs in the world (only real KTP player characters & simulated AFK player accounts)
// - 3-minute AFK cycle (3m stroll + 3m work rotation with 5% dungeon visit & 5% dungeon death chance)
// - AFK Holding Vault (Hasil AFK) at 60% efficiency requiring manual Claim
// - Bank Rimba at (25, 22) with 3% daily interest reset at 12:00 WIB (Asia/Jakarta) & death-penalty protection
// - Simplified Monsters (Upper Dungeon: Slime, Lower Dungeon: Goblin, no boss; Spacebar attack does NOT hurt player; monsters chase & counterattack)
// - Physical PvP Arena zone & explicit Bangkit / Revive button after 10-minute death cooldown.

import type { Lang } from './i18n';

export type Character = {
  user_id: string;
  citizen_number: number;
  display_name: string;
  age: number;
  bio: string;
  model_id: string;
  gender: string;
  avatar_color: string;
  outfit_id: string;
  hat_id: string;
  residence_status: 'Warga' | 'Penduduk';
  home_region: string;
  created_at: string;
};

export type RoomRental = {
  tier_id: 'basic' | 'comfort' | 'suite';
  tier_name_id: string;
  tier_name_en: string;
  duration_hours: number;
  rented_at: string;
  expires_at: string;
  room_number: string;
};

export type AfkActivityType = 'stroll' | 'wood' | 'stone' | 'fish' | 'dungeon';
export type PlayerPresenceStatus = 'active' | 'afk' | 'offline_sim' | 'dead' | 'recovering' | 'waiting_revive';

export type AfkVaultHistoryEntry = {
  id: string;
  timestamp: string;
  wib_time: string;
  type: 'earned' | 'claimed' | 'dungeon_death';
  summary_id: string;
  summary_en: string;
};

export type AfkVault = {
  wood: number;
  stone: number;
  fish: number;
  coins: number;
  bait_used: number;
  duration_minutes: number;
  died_in_dungeon: boolean;
  death_coin_penalty: number;
  efficiency_percent: number;
  last_updated_at: string;
  history: AfkVaultHistoryEntry[];
};

export type AfkSessionReport = AfkVault;

export type BankTransactionLog = {
  id: string;
  type: 'deposit' | 'withdraw' | 'interest';
  amount: number;
  balance_after: number;
  wib_time: string;
  created_at: string;
  note: string;
  note_id: string;
  note_en: string;
};

export type SimulatedAfkCitizen = {
  id: string;
  display_name: string;
  model_id: string;
  avatar_color?: string;
  hat_color?: string;
  activity: AfkActivityType;
  waypoints: Array<{ x: number; y: number }>;
  phaseOffset: number;
};

export type CharacterModelSpec = {
  id: string;
  gender: 'male' | 'female';
  index: number;
  name_id: string;
  name_en: string;
  label_id: string;
  label_en: string;
  hairColor: string;
  hairShade: string;
  hairHighlight: string;
  hairStyle:
    | 'fluffy_part'
    | 'side_swept'
    | 'tousled_bangs'
    | 'short_crop'
    | 'parted_fringe'
    | 'bob_cut'
    | 'long_wavy'
    | 'twin_bun'
    | 'ponytail'
    | 'shoulder_bangs';
  skinColor: string;
  shirtColor: string;
  collarColor: string;
  pantsColor: string;
  shortsColor: string;
  shoeColor: string;
  hasStrap: boolean;
  hasBagStrap: boolean;
};

const RAW_CHARACTER_MODELS: Array<{
  id: string;
  gender: 'male' | 'female';
  index: number;
  name_id: string;
  name_en: string;
  hairColor: string;
  hairShade: string;
  hairStyle: CharacterModelSpec['hairStyle'];
  skinColor: string;
  shirtColor: string;
  collarColor: string;
  pantsColor: string;
  shoeColor: string;
  hasStrap: boolean;
}> = [
  // 10 MALE CHIBI MODELS (male-01 .. male-10)
  { id: 'male-01', gender: 'male', index: 1, name_id: 'Cowo 01 • Klasik Kastanye', name_en: 'Male 01 • Chestnut Classic', hairColor: '#5c3c28', hairShade: '#3d2618', hairStyle: 'fluffy_part', skinColor: '#fbd3b4', shirtColor: '#f3efe6', collarColor: '#475569', pantsColor: '#2d3748', shoeColor: '#4a3222', hasStrap: false },
  { id: 'male-02', gender: 'male', index: 2, name_id: 'Cowo 02 • Petualang Tas', name_en: 'Male 02 • Satchel Explorer', hairColor: '#463224', hairShade: '#2c1e15', hairStyle: 'side_swept', skinColor: '#f9cca8', shirtColor: '#ede8dc', collarColor: '#78553a', pantsColor: '#1e293b', shoeColor: '#3e2723', hasStrap: true },
  { id: 'male-03', gender: 'male', index: 3, name_id: 'Cowo 03 • Hitam Legam', name_en: 'Male 03 • Raven Tousled', hairColor: '#27242a', hairShade: '#141217', hairStyle: 'tousled_bangs', skinColor: '#fcd7ba', shirtColor: '#f5f2eb', collarColor: '#334155', pantsColor: '#27272a', shoeColor: '#452c1e', hasStrap: true },
  { id: 'male-04', gender: 'male', index: 4, name_id: 'Cowo 04 • Rimba Hijau', name_en: 'Male 04 • Forest Ranger', hairColor: '#6b442a', hairShade: '#4a2e1b', hairStyle: 'short_crop', skinColor: '#f4c29f', shirtColor: '#dcfce7', collarColor: '#15803d', pantsColor: '#374151', shoeColor: '#4a3222', hasStrap: true },
  { id: 'male-05', gender: 'male', index: 5, name_id: 'Cowo 05 • Samudra Biru', name_en: 'Male 05 • Ocean Breeze', hairColor: '#312e43', hairShade: '#1e1b2e', hairStyle: 'parted_fringe', skinColor: '#fbd3b4', shirtColor: '#dbeafe', collarColor: '#1d4ed8', pantsColor: '#1e293b', shoeColor: '#332218', hasStrap: false },
  { id: 'male-06', gender: 'male', index: 6, name_id: 'Cowo 06 • Karamel Hangat', name_en: 'Male 06 • Warm Caramel', hairColor: '#8c5332', hairShade: '#62381f', hairStyle: 'fluffy_part', skinColor: '#f7c8a4', shirtColor: '#ffedd5', collarColor: '#c2410c', pantsColor: '#3f3a36', shoeColor: '#4a3222', hasStrap: true },
  { id: 'male-07', gender: 'male', index: 7, name_id: 'Cowo 07 • Abu Senja', name_en: 'Male 07 • Ash Twilight', hairColor: '#4b5563', hairShade: '#374151', hairStyle: 'side_swept', skinColor: '#fde0c6', shirtColor: '#e2e8f0', collarColor: '#334155', pantsColor: '#1f2937', shoeColor: '#2d241e', hasStrap: false },
  { id: 'male-08', gender: 'male', index: 8, name_id: 'Cowo 08 • Surya Emas', name_en: 'Male 08 • Golden Sun', hairColor: '#a16207', hairShade: '#713f12', hairStyle: 'tousled_bangs', skinColor: '#fbd3b4', shirtColor: '#fef3c7', collarColor: '#b45309', pantsColor: '#374151', shoeColor: '#4a3222', hasStrap: true },
  { id: 'male-09', gender: 'male', index: 9, name_id: 'Cowo 09 • Ksatria Ungu', name_en: 'Male 09 • Mystic Violet', hairColor: '#3b2848', hairShade: '#24162e', hairStyle: 'parted_fringe', skinColor: '#f9cca8', shirtColor: '#ede9fe', collarColor: '#6d28d9', pantsColor: '#1e1b4b', shoeColor: '#3b2518', hasStrap: false },
  { id: 'male-10', gender: 'male', index: 10, name_id: 'Cowo 10 • Terakota Bara', name_en: 'Male 10 • Ember Terracotta', hairColor: '#7c2d12', hairShade: '#541c09', hairStyle: 'short_crop', skinColor: '#f2bc94', shirtColor: '#fee2e2', collarColor: '#b91c1c', pantsColor: '#292524', shoeColor: '#452c1e', hasStrap: true },

  // 10 FEMALE CHIBI MODELS (female-01 .. female-10)
  { id: 'female-01', gender: 'female', index: 1, name_id: 'Cewe 01 • Bob Hitam Manis', name_en: 'Female 01 • Sweet Raven Bob', hairColor: '#2b262c', hairShade: '#171418', hairStyle: 'shoulder_bangs', skinColor: '#fcd7ba', shirtColor: '#f5efe4', collarColor: '#64748b', pantsColor: '#334155', shoeColor: '#4a3222', hasStrap: true },
  { id: 'female-02', gender: 'female', index: 2, name_id: 'Cewe 02 • Coklat Kastanye', name_en: 'Female 02 • Chestnut Bob', hairColor: '#5e3d28', hairShade: '#412819', hairStyle: 'bob_cut', skinColor: '#fbd3b4', shirtColor: '#fce7f3', collarColor: '#db2777', pantsColor: '#374151', shoeColor: '#4a3222', hasStrap: false },
  { id: 'female-03', gender: 'female', index: 3, name_id: 'Cewe 03 • Pita Kembar', name_en: 'Female 03 • Honey Twin-Bun', hairColor: '#854d27', hairShade: '#5e3418', hairStyle: 'twin_bun', skinColor: '#fde0c6', shirtColor: '#fef9c3', collarColor: '#ca8a04', pantsColor: '#3f3a36', shoeColor: '#4a3222', hasStrap: true },
  { id: 'female-04', gender: 'female', index: 4, name_id: 'Cewe 04 • Embun Daun', name_en: 'Female 04 • Meadow Mint', hairColor: '#473325', hairShade: '#2c1f16', hairStyle: 'long_wavy', skinColor: '#fbd3b4', shirtColor: '#dcfce7', collarColor: '#059669', pantsColor: '#2d3748', shoeColor: '#3e2723', hasStrap: true },
  { id: 'female-05', gender: 'female', index: 5, name_id: 'Cewe 05 • Langit Biru', name_en: 'Female 05 • Sky Ponytail', hairColor: '#283044', hairShade: '#171c29', hairStyle: 'ponytail', skinColor: '#f9cca8', shirtColor: '#e0f2fe', collarColor: '#0284c7', pantsColor: '#1e293b', shoeColor: '#332218', hasStrap: false },
  { id: 'female-06', gender: 'female', index: 6, name_id: 'Cewe 06 • Lavender Senja', name_en: 'Female 06 • Lavender Bob', hairColor: '#4a3252', hairShade: '#2f1e36', hairStyle: 'shoulder_bangs', skinColor: '#fcd7ba', shirtColor: '#f3e8ff', collarColor: '#7c3aed', pantsColor: '#312e81', shoeColor: '#4a3222', hasStrap: true },
  { id: 'female-07', gender: 'female', index: 7, name_id: 'Cewe 07 • Koral Musim Panas', name_en: 'Female 07 • Summer Coral', hairColor: '#783f27', hairShade: '#522918', hairStyle: 'bob_cut', skinColor: '#f7c8a4', shirtColor: '#ffedd5', collarColor: '#ea580c', pantsColor: '#3f3a36', shoeColor: '#4a3222', hasStrap: false },
  { id: 'female-08', gender: 'female', index: 8, name_id: 'Cewe 08 • Mawar Merah Muda', name_en: 'Female 08 • Rose Blossom', hairColor: '#6d3b47', hairShade: '#4a252e', hairStyle: 'twin_bun', skinColor: '#fde0c6', shirtColor: '#ffe4e6', collarColor: '#e11d48', pantsColor: '#334155', shoeColor: '#452c1e', hasStrap: true },
  { id: 'female-09', gender: 'female', index: 9, name_id: 'Cewe 09 • Perak Kristal', name_en: 'Female 09 • Crystal Silver', hairColor: '#525b6c', hairShade: '#363d4a', hairStyle: 'long_wavy', skinColor: '#fcd7ba', shirtColor: '#f1f5f9', collarColor: '#475569', pantsColor: '#1e293b', shoeColor: '#2d241e', hasStrap: false },
  { id: 'female-10', gender: 'female', index: 10, name_id: 'Cewe 10 • Mahoni Rimba', name_en: 'Female 10 • Mahogany Breeze', hairColor: '#653226', hairShade: '#431f17', hairStyle: 'ponytail', skinColor: '#f4c29f', shirtColor: '#fef3c7', collarColor: '#d97706', pantsColor: '#292524', shoeColor: '#4a3222', hasStrap: true },
];

export const CHARACTER_MODELS: CharacterModelSpec[] = RAW_CHARACTER_MODELS.map(m => ({
  ...m,
  label_id: m.name_id,
  label_en: m.name_en,
  hairHighlight: m.hairShade,
  shortsColor: m.pantsColor,
  hasBagStrap: m.hasStrap,
}));

export function getCharacterModelSpec(modelId?: string): CharacterModelSpec {
  if (!modelId) return CHARACTER_MODELS[0]!;
  const exact = CHARACTER_MODELS.find(m => m.id === modelId);
  if (exact) return exact;
  const isFemale = modelId.startsWith('female');
  const num = Number(modelId.split('-')[1] ?? 1);
  const idx = ((Math.max(1, num) - 1) % 10) + (isFemale ? 10 : 0);
  return CHARACTER_MODELS[idx] ?? CHARACTER_MODELS[0]!;
}

/**
 * Renders a full, unclipped Pixel-Chibi SVG with generous viewBox padding ("0 -2 32 40")
 * and preserveAspectRatio="xMidYMid meet" so the head, hair/hat, and shoes never get cut off
 * in the main KTP HUD button, KTP detail card, or character creator on desktop or mobile.
 */
export function renderChibiCharacterSvg(
  modelId?: string,
  overrideShirtColor?: string,
  hatColor?: string | null
): string {
  const spec = getCharacterModelSpec(modelId);
  const shirt = overrideShirtColor && overrideShirtColor !== 'transparent' ? overrideShirtColor : spec.shirtColor;
  const isLongHair =
    spec.hairStyle === 'shoulder_bangs' ||
    spec.hairStyle === 'long_wavy' ||
    spec.hairStyle === 'bob_cut';
  const isTwinBun = spec.hairStyle === 'twin_bun';
  const isPonytail = spec.hairStyle === 'ponytail';

  return `<svg class="chibi-svg-avatar" xmlns="http://www.w3.org/2000/svg" viewBox="0 -2 32 40" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges">
    <!-- Ground shadow -->
    <rect x="7" y="33" width="18" height="2" fill="rgba(15,23,42,0.24)"/>
    <!-- Side/Back Hair for Female styles -->
    ${isLongHair ? `<rect x="5" y="12" width="22" height="10" fill="#231815"/><rect x="6" y="13" width="20" height="8" fill="${spec.hairShade}"/>` : ''}
    ${isTwinBun ? `<rect x="3" y="6" width="5" height="5" fill="#231815"/><rect x="4" y="7" width="3" height="3" fill="${spec.hairColor}"/><rect x="24" y="6" width="5" height="5" fill="#231815"/><rect x="25" y="7" width="3" height="3" fill="${spec.hairColor}"/>` : ''}
    ${isPonytail ? `<rect x="23" y="11" width="5" height="7" fill="#231815"/><rect x="24" y="12" width="3" height="5" fill="${spec.hairColor}"/>` : ''}
    <!-- Feet / Shoes -->
    <rect x="9" y="30" width="5" height="4" fill="#231815"/>
    <rect x="18" y="30" width="5" height="4" fill="#231815"/>
    <rect x="10" y="31" width="3" height="2" fill="${spec.shoeColor}"/>
    <rect x="19" y="31" width="3" height="2" fill="${spec.shoeColor}"/>
    <!-- Legs -->
    <rect x="10" y="28" width="3" height="3" fill="${spec.skinColor}"/>
    <rect x="19" y="28" width="3" height="3" fill="${spec.skinColor}"/>
    <!-- Shorts / Pants -->
    <rect x="8" y="24" width="16" height="5" fill="#231815"/>
    <rect x="9" y="25" width="6" height="3" fill="${spec.pantsColor}"/>
    <rect x="17" y="25" width="6" height="3" fill="${spec.pantsColor}"/>
    <!-- Torso & Arms -->
    <rect x="6" y="18" width="20" height="7" fill="#231815"/>
    <rect x="7" y="19" width="2" height="4" fill="${shirt}"/>
    <rect x="23" y="19" width="2" height="4" fill="${shirt}"/>
    <rect x="7" y="23" width="2" height="2" fill="${spec.skinColor}"/>
    <rect x="23" y="23" width="2" height="2" fill="${spec.skinColor}"/>
    <rect x="9" y="18" width="14" height="7" fill="${shirt}"/>
    <!-- Collar & Optional Crossbody Strap -->
    <rect x="13" y="18" width="6" height="2" fill="${spec.collarColor}"/>
    ${spec.hasStrap ? `<rect x="11" y="19" width="2" height="2" fill="${spec.collarColor}"/><rect x="13" y="21" width="2" height="2" fill="${spec.collarColor}"/><rect x="15" y="23" width="3" height="2" fill="${spec.collarColor}"/>` : ''}
    <!-- Chibi Head Outline & Ears -->
    <rect x="5" y="8" width="22" height="11" fill="#231815"/>
    <rect x="6" y="6" width="20" height="13" fill="#231815"/>
    <rect x="4" y="12" width="2" height="4" fill="#231815"/>
    <rect x="26" y="12" width="2" height="4" fill="#231815"/>
    <rect x="5" y="13" width="2" height="2" fill="${spec.skinColor}"/>
    <rect x="25" y="13" width="2" height="2" fill="${spec.skinColor}"/>
    <!-- Chibi Face Skin -->
    <rect x="7" y="9" width="18" height="9" fill="${spec.skinColor}"/>
    <!-- Rosy Pixel Blush Cheeks -->
    <rect x="8" y="15" width="2" height="1" fill="#f4978e"/>
    <rect x="22" y="15" width="2" height="1" fill="#f4978e"/>
    <!-- Expressive Dark Pixel Eyes & Tiny Smile -->
    <rect x="10" y="12" width="2" height="3" fill="#231815"/>
    <rect x="20" y="12" width="2" height="3" fill="#231815"/>
    <rect x="10" y="12" width="1" height="1" fill="#ffffff"/>
    <rect x="20" y="12" width="1" height="1" fill="#ffffff"/>
    <rect x="15" y="15" width="2" height="1" fill="#9c6644"/>
    <!-- Layered Pixel Hair Canopy & Bangs -->
    <rect x="6" y="4" width="20" height="6" fill="#231815"/>
    <rect x="7" y="5" width="18" height="5" fill="${spec.hairColor}"/>
    <rect x="8" y="4" width="16" height="2" fill="${spec.hairColor}"/>
    <rect x="7" y="9" width="4" height="3" fill="${spec.hairColor}"/>
    <rect x="12" y="9" width="4" height="2" fill="${spec.hairShade}"/>
    <rect x="17" y="9" width="3" height="3" fill="${spec.hairColor}"/>
    <rect x="21" y="9" width="4" height="3" fill="${spec.hairShade}"/>
    ${hatColor && hatColor !== 'transparent' ? `<rect x="5" y="1" width="22" height="3" fill="#231815"/><rect x="6" y="1" width="20" height="2" fill="${hatColor}"/>` : ''}
  </svg>`;
}

/**
 * Authoritative WIB (Asia/Jakarta, UTC+7) clock & 12:00 WIB daily reset calculator.
 * Uses UTC math +7 hours so client timezone settings cannot manipulate interest resets.
 */
export function getWibTimeInfo(nowMs = Date.now()): {
  wibTimeString: string;
  wibDateString: string;
  currentPeriodId: string;
  nextInterestCountdown: string;
  msUntilNext12Wib: number;
  secondsUntilNextNoonWib: number;
} {
  const WIB_OFFSET_MS = 7 * 3600 * 1000;
  const wibDate = new Date(nowMs + WIB_OFFSET_MS);
  const year = wibDate.getUTCFullYear();
  const month = String(wibDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(wibDate.getUTCDate()).padStart(2, '0');
  const hours = wibDate.getUTCHours();
  const mins = wibDate.getUTCMinutes();
  const secs = wibDate.getUTCSeconds();

  const wibTimeString = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const wibDateString = `${year}-${month}-${day}`;

  // Determine the most recent 12:00 WIB reset period ID
  let periodDate = new Date(Date.UTC(year, wibDate.getUTCMonth(), wibDate.getUTCDate(), 12, 0, 0));
  if (hours < 12) {
    periodDate = new Date(periodDate.getTime() - 24 * 3600 * 1000);
  }
  const pYear = periodDate.getUTCFullYear();
  const pMonth = String(periodDate.getUTCMonth() + 1).padStart(2, '0');
  const pDay = String(periodDate.getUTCDate()).padStart(2, '0');
  const currentPeriodId = `${pYear}-${pMonth}-${pDay}-12WIB`;

  // Next 12:00 WIB in UTC-shifted milliseconds
  const nextResetWibMs = periodDate.getTime() + 24 * 3600 * 1000;
  const msUntilNext12Wib = Math.max(0, nextResetWibMs - (nowMs + WIB_OFFSET_MS));
  const secondsUntilNextNoonWib = Math.floor(msUntilNext12Wib / 1000);
  const remHours = Math.floor(msUntilNext12Wib / 3600000);
  const remMins = Math.floor((msUntilNext12Wib % 3600000) / 60000);
  const remSecs = Math.floor((msUntilNext12Wib % 60000) / 1000);
  const nextInterestCountdown = `${String(remHours).padStart(2, '0')}j ${String(remMins).padStart(2, '0')}m ${String(remSecs).padStart(2, '0')}d`;

  return {
    wibTimeString,
    wibDateString,
    currentPeriodId,
    nextInterestCountdown,
    msUntilNext12Wib,
    secondsUntilNextNoonWib,
  };
}

export type Inventory = {
  wood: number;
  stone: number;
  fish: number;
  fish_bait: number;
  crystal_shard: number;
  coins: number;
  bank_balance: number;
  bank_last_interest_period: string | null;
  bank_history: BankTransactionLog[];
  data_forms: number;
  food_rations: number;
  herbal_tea: number;
  grilled_fish: number;
  hp: number;
  max_hp: number;
  stamina: number;
  max_stamina: number;
  max_capacity: number;
  owned_outfits: string[];
  active_room: RoomRental | null;
  dead_until: string | null;
  awaiting_revive: boolean;
  last_death_id: string | null;
  last_death_penalty: number;
  last_death_cause?: string | null;
  last_active_at: string;
  player_status: PlayerPresenceStatus;
  afk_started_at: string | null;
  afk_phase_started_at: string | null;
  afk_phase: 'stroll' | 'work';
  afk_activity: AfkActivityType;
  last_afk_work_activity: AfkActivityType | null;
  afk_history: AfkActivityType[];
  afk_vault: AfkVault;
};

export type WorkNode = {
  id: string;
  node_type: 'wood' | 'stone' | 'fish';
  name_id: string;
  name_en: string;
  tile_x: number;
  tile_y: number;
  remaining: number;
  max_stock: number;
  yield_amount: number;
};

export type Listing = {
  id: string;
  seller_id: string;
  seller_name?: string;
  resource_type: 'wood' | 'stone' | 'fish';
  quantity: number;
  unit_price: number;
  status: 'open' | 'sold' | 'cancelled';
  created_at: string;
};

export type LocalUser = {
  id: string;
  email?: string;
  is_anonymous: boolean;
};

export type OutfitCatalogItem = {
  id: string;
  name_id: string;
  name_en: string;
  category: 'outfit' | 'hat';
  color: string;
  price: number;
  desc_id: string;
  desc_en: string;
};

export type RoomTierConfig = {
  id: 'basic' | 'comfort' | 'suite';
  name_id: string;
  name_en: string;
  capacity: number;
  base_price_per_6h: number;
  stamina_bonus: number;
  afk_bonus: number;
  desc_id: string;
  desc_en: string;
};

export type WorshipOption = {
  id: string;
  label_id: string;
  label_en: string;
  desc_id: string;
  desc_en: string;
};

export const WORSHIP_OPTIONS: WorshipOption[] = [
  {
    id: 'islam',
    label_id: 'Ibadah & Doa (Islam)',
    label_en: 'Prayer & Supplication (Islam)',
    desc_id: 'Menunaikan ibadah dan berdoa dengan khusyuk di ruang tenang untuk memulihkan ketenangan batin serta stamina (+35 Stamina, +15 HP).',
    desc_en: 'Perform prayer and peaceful supplication in a quiet space to restore inner peace and stamina (+35 Stamina, +15 HP).',
  },
  {
    id: 'kristen',
    label_id: 'Ibadah & Doa (Kristen)',
    label_en: 'Prayer & Devotion (Christian)',
    desc_id: 'Melakukan doa syukur dan perenungan rohani dengan damai untuk memulihkan semangat serta stamina (+35 Stamina, +15 HP).',
    desc_en: 'Engage in grateful prayer and spiritual devotion peacefully to restore spirit and stamina (+35 Stamina, +15 HP).',
  },
  {
    id: 'katolik',
    label_id: 'Doa & Adorasi Hening (Katolik)',
    label_en: 'Prayer & Silent Adoration (Catholic)',
    desc_id: 'Berdoa dalam keheningan yang teduh untuk memulihkan ketenangan hati serta stamina (+35 Stamina, +15 HP).',
    desc_en: 'Pray in serene silence to restore peace of heart and stamina (+35 Stamina, +15 HP).',
  },
  {
    id: 'hindu',
    label_id: 'Sembahyang & Dhyana (Hindu)',
    label_en: 'Prayer & Dhyana (Hindu)',
    desc_id: 'Melakukan sembahyang dan pemusatan pikiran yang harmonis untuk memulihkan energi serta stamina (+35 Stamina, +15 HP).',
    desc_en: 'Perform harmonious prayer and mindfulness to restore energy and stamina (+35 Stamina, +15 HP).',
  },
  {
    id: 'buddha',
    label_id: 'Puja & Meditasi Metta (Buddha)',
    label_en: 'Puja & Metta Meditation (Buddhist)',
    desc_id: 'Melakukan meditasi cinta kasih yang damai untuk menjernihkan pikiran serta memulihkan stamina (+35 Stamina, +15 HP).',
    desc_en: 'Practice loving-kindness meditation to clear the mind and restore stamina (+35 Stamina, +15 HP).',
  },
  {
    id: 'konghucu',
    label_id: 'Doa Kebajikan & Hormat (Konghucu)',
    label_en: 'Virtue & Reverence Prayer (Confucian)',
    desc_id: 'Merenungkan kebajikan dan ketenteraman hidup untuk memulihkan keseimbangan diri serta stamina (+35 Stamina, +15 HP).',
    desc_en: 'Reflect on virtue and harmony to restore balance and stamina (+35 Stamina, +15 HP).',
  },
  {
    id: 'refleksi',
    label_id: 'Renungan Hening Umum',
    label_en: 'Universal Quiet Reflection',
    desc_id: 'Beristirahat dan merenung dalam keheningan yang netral untuk menyegarkan tubuh serta stamina (+35 Stamina, +15 HP).',
    desc_en: 'Rest and reflect in neutral tranquility to refresh body and stamina (+35 Stamina, +15 HP).',
  },
];

export const ROOM_TIERS: RoomTierConfig[] = [
  {
    id: 'basic',
    name_id: 'Kamar Dasar Kayu',
    name_en: 'Basic Timber Room',
    capacity: 20,
    base_price_per_6h: 25,
    stamina_bonus: 35,
    afk_bonus: 0.1,
    desc_id: 'Kamar sederhana yang bersih dengan tempat tidur nyaman. Memulihkan +35 Stamina saat check-in.',
    desc_en: 'Clean, simple room with a cozy bed. Restores +35 Stamina on check-in.',
  },
  {
    id: 'comfort',
    name_id: 'Kamar Nyaman Taman',
    name_en: 'Garden Comfort Room',
    capacity: 12,
    base_price_per_6h: 50,
    stamina_bonus: 65,
    afk_bonus: 0.2,
    desc_id: 'Kamar luas menghadap taman Central dengan teh hangat. Memulihkan +65 Stamina dan +25 HP.',
    desc_en: 'Spacious room overlooking Central garden with warm tea. Restores +65 Stamina and +25 HP.',
  },
  {
    id: 'suite',
    name_id: 'Suite Agung Rimba',
    name_en: 'Grand Rimba Suite',
    capacity: 5,
    base_price_per_6h: 95,
    stamina_bonus: 100,
    afk_bonus: 0.35,
    desc_id: 'Unit hunian terbaik di lantai atas dengan balkon air mancur. Memulihkan HP & Stamina 100% penuh.',
    desc_en: 'Top-floor luxury suite with fountain balcony. Restores 100% full HP & Stamina.',
  },
];

export const OUTFIT_CATALOG: OutfitCatalogItem[] = [
  {
    id: 'tunika-rimba',
    name_id: 'Tunika Rimba Klasik',
    name_en: 'Classic Rimba Tunic',
    category: 'outfit',
    color: '#5f9e6e',
    price: 0,
    desc_id: 'Pakaian tenun dasar warga Rimba.',
    desc_en: 'Standard woven tunic of Rimba citizens.',
  },
  {
    id: 'rompi-petualang',
    name_id: 'Rompi Kulit Penebang',
    name_en: 'Lumberjack Leather Vest',
    category: 'outfit',
    color: '#c47a45',
    price: 45,
    desc_id: 'Rompi tangguh untuk pekerja kayu dan batu.',
    desc_en: 'Sturdy vest crafted for wood and stone workers.',
  },
  {
    id: 'jubah-danau',
    name_id: 'Jubah Biru Samudra',
    name_en: 'Ocean Azure Cloak',
    category: 'outfit',
    color: '#4682b4',
    price: 65,
    desc_id: 'Tenunan sejuk khas pemancing Danau Utara.',
    desc_en: 'Breezy blue cloak worn by Great Lake anglers.',
  },
  {
    id: 'busana-surya',
    name_id: 'Busana Bangsawan Surya',
    name_en: 'Solar Noble Attire',
    category: 'outfit',
    color: '#d99b38',
    price: 95,
    desc_id: 'Pakaian tenun emas warga kehormatan Central.',
    desc_en: 'Golden-trimmed attire from Central Plaza.',
  },
  {
    id: 'zirah-penjaga',
    name_id: 'Zirah Ksatria Kristal',
    name_en: 'Crystal Knight Armor',
    category: 'outfit',
    color: '#7a5ca8',
    price: 140,
    desc_id: 'Pelindung elegan penjelajah Dungeon.',
    desc_en: 'Elegant tunic favored by Dungeon explorers.',
  },
  {
    id: 'none',
    name_id: 'Tanpa Penutup Kepala',
    name_en: 'No Headgear',
    category: 'hat',
    color: 'transparent',
    price: 0,
    desc_id: 'Tampilan rambut alami karakter.',
    desc_en: 'Natural character hairstyle.',
  },
  {
    id: 'caping-bambu',
    name_id: 'Topi Jerami Pedesaan',
    name_en: 'Pastoral Straw Hat',
    category: 'hat',
    color: '#e6c875',
    price: 35,
    desc_id: 'Melindungi dari terik matahari saat bekerja di ladang & danau.',
    desc_en: 'Shields from the sun while working at camp or fishing.',
  },
  {
    id: 'ikat-kepala',
    name_id: 'Bando Ksatria Arena',
    name_en: 'Arena Champion Bandana',
    category: 'hat',
    color: '#d14b4b',
    price: 55,
    desc_id: 'Pita kepala merah petarung Colosseum PvP.',
    desc_en: 'Crimson headband of Colosseum PvP duelists.',
  },
  {
    id: 'mahkota-daun',
    name_id: 'Mahkota Kristal Emas',
    name_en: 'Golden Crystal Circlet',
    category: 'hat',
    color: '#f2d149',
    price: 110,
    desc_id: 'Aksesori kebanggaan Penduduk tetap Rimba.',
    desc_en: 'Precious circlet worn by permanent Residents.',
  },
];

export const GAME_CONFIG = {
  MAP_SIZE: 56,
  CENTRAL_SPAWN: { x: 28, y: 30 },
  REGION_CAPACITY: 25,
  AFK_EFFICIENCY_RATE: 0.60, // Section 8: AFK rewards strictly grant 60% of normal active yield
  AFK_MAX_MINUTES: 480, // 8 hours max offline calculation
  AFK_IDLE_TIMEOUT_MS: 30 * 1000, // 30 seconds without valid input -> AFK mode
  AFK_PHASE_MS: 3 * 60 * 1000, // Section 7: 3 minutes strolling, 3 minutes working
  AFK_CYCLE_MS: 6 * 60 * 1000, // 6 minutes full cycle (3m stroll + 3m work)
  AFK_BATCH_TICK_MS: 12 * 1000, // Server/store batch calculation interval
  AFK_DUNGEON_VISIT_CHANCE: 0.05, // 5% chance to go to low-risk dungeon during AFK work phase
  AFK_DUNGEON_DEATH_CHANCE: 0.05, // 5% chance of death when visiting dungeon during AFK
  AFK_SAFE_HP_THRESHOLD: 40, // Retreat to safe zone if HP < 40
  MAX_SIMULATED_AFK_PER_REGION: 5, // Visual AFK simulation cap for smooth performance
  BANK_DAILY_INTEREST_RATE: 0.03, // Section 9: 3% daily interest reset at 12:00 WIB
  PENDUDUK_UPGRADE_COST: 250,
  DATA_FORM_PRICE: 40,
  BAIT_PACK_PRICE: 10,
  BAIT_PACK_QTY: 5,
  FISH_BAIT_PACK_PRICE: 10,
  FISH_BAIT_PACK_QTY: 5,
  FOOD_PRICE: 12,
  TEA_PRICE: 16,
  GRILLED_FISH_PRICE: 22,
  CLINIC_HEAL_COST: 15,
  DEATH_COOLDOWN_MS: 10 * 60 * 1000, // 10 minutes server-validated cooldown
  DEATH_PENALTY_RATE: 0.10, // Exactly 10% of carried coins (Bank savings are safe!)
  HARVEST_COOLDOWN_MS: 2200,
  ATTACK_COOLDOWN_MS: 750,
  INTERACT_RANGE_TILES: 3.8,
  PLAYER_ATTACK_DAMAGE: 25,
  PLAYER_ATTACK_RANGE_TILES: 2.5,
  MONSTER_DETECT_RANGE_TILES: 3.8,
  MONSTER_ATTACK_RANGE_TILES: 1.65,
  MONSTER_ATTACK_COOLDOWN_MS: 1800,
  MONSTER_STATS: {
    slime: {
      name_id: 'Slime',
      name_en: 'Slime',
      maxHp: 45,
      damage: 8,
      detectRangeTiles: 3.8,
      attackRangeTiles: 1.65,
      speed: 64,
      attackCooldownMs: 1800,
      respawnMs: 5500,
      coinReward: 22,
      shardReward: 1,
    },
    goblin: {
      name_id: 'Goblin',
      name_en: 'Goblin',
      maxHp: 75,
      damage: 14,
      detectRangeTiles: 3.8,
      attackRangeTiles: 1.65,
      speed: 78,
      attackCooldownMs: 1800,
      respawnMs: 5500,
      coinReward: 38,
      shardReward: 2,
    },
  },
};

const STORAGE_KEYS = {
  SESSION: 'rimba_session_v3',
  USERS: 'rimba_users_v3',
  CHARACTERS: 'rimba_characters_v3',
  INVENTORIES: 'rimba_inventories_v3',
  POSITIONS: 'rimba_positions_v3',
  WORK_NODES: 'rimba_work_nodes_v3',
  LISTINGS: 'rimba_listings_v3',
  ROOM_BOOKINGS: 'rimba_room_bookings_v3',
  CITIZEN_SEQ: 'rimba_citizen_seq_v3',
  IDENTITY_LOGS: 'rimba_identity_logs_v3',
};

export const DEFAULT_WORK_NODES: WorkNode[] = [
  // Dedicated Logging Camp (Area Kerja Kayu) — East (44, 28)
  { id: 'work-wood-1', node_type: 'wood', name_id: 'Pohon Ek Area Kerja #1', name_en: 'Work Camp Oak Tree #1', tile_x: 42, tile_y: 26, remaining: 90, max_stock: 90, yield_amount: 3 },
  { id: 'work-wood-2', node_type: 'wood', name_id: 'Pohon Ek Area Kerja #2', name_en: 'Work Camp Oak Tree #2', tile_x: 46, tile_y: 26, remaining: 90, max_stock: 90, yield_amount: 3 },
  { id: 'work-wood-3', node_type: 'wood', name_id: 'Pohon Pinus Area Kerja #3', name_en: 'Work Camp Pine Tree #3', tile_x: 43, tile_y: 30, remaining: 90, max_stock: 90, yield_amount: 3 },
  { id: 'work-wood-4', node_type: 'wood', name_id: 'Pohon Pinus Area Kerja #4', name_en: 'Work Camp Pine Tree #4', tile_x: 47, tile_y: 29, remaining: 90, max_stock: 90, yield_amount: 3 },
  // Dedicated Stone Quarry (Area Kerja Batu) — South-East (38, 45)
  { id: 'work-stone-1', node_type: 'stone', name_id: 'Batu Granit Tambang #1', name_en: 'Quarry Granite Deposit #1', tile_x: 36, tile_y: 43, remaining: 75, max_stock: 75, yield_amount: 2 },
  { id: 'work-stone-2', node_type: 'stone', name_id: 'Batu Granit Tambang #2', name_en: 'Quarry Granite Deposit #2', tile_x: 40, tile_y: 43, remaining: 75, max_stock: 75, yield_amount: 2 },
  { id: 'work-stone-3', node_type: 'stone', name_id: 'Batu Mineral Tambang #3', name_en: 'Quarry Mineral Rock #3', tile_x: 37, tile_y: 47, remaining: 75, max_stock: 75, yield_amount: 2 },
  { id: 'work-stone-4', node_type: 'stone', name_id: 'Batu Mineral Tambang #4', name_en: 'Quarry Mineral Rock #4', tile_x: 41, tile_y: 46, remaining: 75, max_stock: 75, yield_amount: 2 },
  // Great Fishing Lake Pier (Danau Besar Memancing) — North (28, 14)
  { id: 'work-fish-1', node_type: 'fish', name_id: 'Dermaga Pancing Barat', name_en: 'West Fishing Pier Spot', tile_x: 26, tile_y: 14, remaining: 100, max_stock: 100, yield_amount: 2 },
  { id: 'work-fish-2', node_type: 'fish', name_id: 'Dermaga Pancing Utama', name_en: 'Main Fishing Pier Spot', tile_x: 28, tile_y: 13, remaining: 100, max_stock: 100, yield_amount: 2 },
  { id: 'work-fish-3', node_type: 'fish', name_id: 'Dermaga Pancing Timur', name_en: 'East Fishing Pier Spot', tile_x: 30, tile_y: 14, remaining: 100, max_stock: 100, yield_amount: 2 },
];

export type FacilityLandmark = {
  id:
    | 'balaikota'
    | 'bank'
    | 'rumahsakit'
    | 'academy'
    | 'pasar'
    | 'pakaian'
    | 'ibadah'
    | 'kuliner'
    | 'penginapan'
    | 'dungeon1'
    | 'dungeon2'
    | 'arena'
    | 'work_wood'
    | 'work_stone'
    | 'fishing_lake';
  tx: number;
  ty: number;
  name_id: string;
  name_en: string;
  comingSoon?: boolean;
};

export const WORLD_FACILITIES: FacilityLandmark[] = [
  { id: 'balaikota', tx: 28, ty: 22, name_id: 'Balai Kota', name_en: 'Town Hall' },
  { id: 'bank', tx: 25, ty: 22, name_id: 'Bank Rimba', name_en: 'Rimba Bank' },
  { id: 'ibadah', tx: 22, ty: 23, name_id: 'Tempat Ibadah', name_en: 'House of Worship' },
  { id: 'academy', tx: 33, ty: 23, name_id: 'Academy (Coming Soon)', name_en: 'Academy (Coming Soon)', comingSoon: true },
  { id: 'pakaian', tx: 22, ty: 27, name_id: 'Toko Pakaian', name_en: 'Clothing Boutique' },
  { id: 'pasar', tx: 23, ty: 32, name_id: 'Pasar Central', name_en: 'Central Market' },
  { id: 'kuliner', tx: 28, ty: 33, name_id: 'Kedai Makanan & Minuman', name_en: 'Food & Drink Tavern' },
  { id: 'rumahsakit', tx: 34, ty: 27, name_id: 'Rumah Sakit', name_en: 'Hospital' },
  { id: 'penginapan', tx: 33, ty: 32, name_id: 'Penginapan & Sewa Kamar', name_en: 'Inn & Room Rental' },
  { id: 'dungeon1', tx: 9, ty: 10, name_id: 'Dungeon Atas (Slime)', name_en: 'Upper Dungeon (Slime)' },
  { id: 'dungeon2', tx: 47, ty: 46, name_id: 'Dungeon Bawah (Goblin)', name_en: 'Lower Dungeon (Goblin)' },
  { id: 'arena', tx: 45, ty: 11, name_id: 'Arena PvP', name_en: 'PvP Arena' },
  { id: 'work_wood', tx: 44, ty: 28, name_id: 'Area Kerja Kayu', name_en: 'Logging Work Camp' },
  { id: 'work_stone', tx: 38, ty: 45, name_id: 'Area Kerja Tambang Batu', name_en: 'Stone Quarry Work Area' },
  { id: 'fishing_lake', tx: 28, ty: 14, name_id: 'Dermaga Danau Memancing', name_en: 'Great Lake Fishing Pier' },
];

// Section 2: All NPCs removed. World is only inhabited by registered KTP player accounts.
export type WorldNpcConfig = {
  id: string;
  label_id: string;
  label_en: string;
  tx: number;
  ty: number;
  color: string;
  hatColor?: string;
  role: 'service' | 'coming_soon' | 'ambient';
  facilityId?: FacilityLandmark['id'];
  waypoints?: Array<{ x: number; y: number }>;
};
export const WORLD_NPCS: WorldNpcConfig[] = [];

const BLOCKED_NAME_PATTERNS = [
  /@/,
  /https?:\/\//i,
  /www\./i,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i,
  /^guest[-_]/i,
  /^user[-_]/i,
  /^client[-_]/i,
  /\b(npc|admin|moderator|system|gm|developer|anjing|babi|bangsat|kontol|memek|tolol|goblok|fuck|shit|bitch|asshole)\b/i,
];

export function validateAndModerateCharacterName(rawName: string, lang: Lang = 'id'): string {
  const collapsed = rawName.replace(/\s+/g, ' ').trim();
  if (collapsed.length < 2 || collapsed.length > 20) {
    throw new Error(
      lang === 'en'
        ? 'Character name must be between 2 and 20 characters.'
        : 'Nama karakter harus antara 2 sampai 20 karakter.'
    );
  }
  if (!/^[A-Za-z0-9À-ÿ]+([ '\-][A-Za-z0-9À-ÿ]+)*$/.test(collapsed)) {
    throw new Error(
      lang === 'en'
        ? 'Character name may only contain letters, numbers, spaces, hyphens, or apostrophes (no emails or symbols).'
        : 'Nama karakter hanya boleh berisi huruf, angka, spasi, tanda hubung, atau apostrof (tanpa email/simbol).'
    );
  }
  for (const pattern of BLOCKED_NAME_PATTERNS) {
    if (pattern.test(collapsed)) {
      throw new Error(
        lang === 'en'
          ? 'Character name contains restricted words, reserved tags (NPC/Admin), or personal account identifiers.'
          : 'Nama karakter mengandung kata yang dilarang, label khusus (NPC/Admin), atau identitas akun pribadi.'
      );
    }
  }
  return collapsed;
}

export function sanitizePlayerLabelName(rawName: unknown, fallback = 'Warga'): string {
  if (typeof rawName !== 'string') return fallback;
  const cleaned = rawName.replace(/\s+/g, ' ').trim();
  if (!cleaned) return fallback;
  for (const pattern of BLOCKED_NAME_PATTERNS) {
    if (pattern.test(cleaned)) return fallback;
  }
  return cleaned.slice(0, 20);
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

// --- MAP TERRAIN & ZONE GEOMETRY (56 x 56) ---

export function isGreatLakeTile(x: number, y: number): boolean {
  if (x >= 26 && x <= 30 && y >= 12 && y <= 15) return false;
  const dx = (x - 27.5) / 9.5;
  const dy = (y - 7.5) / 5.2;
  return dx * dx + dy * dy <= 1.0;
}

export function isSouthwestOceanTile(x: number, y: number): boolean {
  return x < 13 && y > 41 + Math.sin(x * 0.45) * 1.8;
}

export function isRiverTile(x: number, y: number): boolean {
  if (y < 36 || y > 54) return false;
  if ((y >= 39 && y <= 41) || (x >= 37 && x <= 39)) return false;
  const riverCenter = 33 + (y - 36) * 0.75 + Math.sin(y * 0.5) * 1.1;
  return Math.abs(x - riverCenter) < 1.15;
}

export function isWaterTile(x: number, y: number): boolean {
  return isGreatLakeTile(x, y) || isSouthwestOceanTile(x, y) || isRiverTile(x, y);
}

export function isCentralTile(x: number, y: number): boolean {
  return x >= 21 && x <= 35 && y >= 21 && y <= 35;
}

export function isDungeon1Tile(x: number, y: number): boolean {
  return x >= 6 && x <= 13 && y >= 7 && y <= 14;
}

export function isDungeon2Tile(x: number, y: number): boolean {
  return x >= 44 && x <= 51 && y >= 43 && y <= 50;
}

export function isDungeonTile(x: number, y: number): boolean {
  return isDungeon1Tile(x, y) || isDungeon2Tile(x, y);
}

export function isArenaTile(x: number, y: number): boolean {
  return Math.hypot(x - 45, y - 11) <= 4.8;
}

export function isPvpZoneTile(x: number, y: number): boolean {
  if (isCentralTile(x, y)) return false;
  return isArenaTile(x, y) || isDungeonTile(x, y);
}

export function isWoodWorkAreaTile(x: number, y: number): boolean {
  return x >= 40 && x <= 49 && y >= 24 && y <= 32;
}

export function isStoneWorkAreaTile(x: number, y: number): boolean {
  return x >= 34 && x <= 43 && y >= 41 && y <= 49;
}

export function isRoadTile(x: number, y: number): boolean {
  if (Math.abs(x - 28) <= 1 && y >= 14 && y <= 21) return true;
  if (Math.abs(y - 28) <= 1 && x >= 35 && x <= 45) return true;
  if (Math.abs(x - 28) <= 1 && y >= 35 && y <= 41) return true;
  if (Math.abs(y - 41) <= 1 && x >= 28 && x <= 38) return true;
  if (Math.abs(y - 28) <= 1 && x >= 13 && x <= 21) return true;
  if (Math.abs(x - 13) <= 1 && y >= 28 && y <= 40) return true;
  if (x >= 10 && x <= 21 && y >= 11 && y <= 22 && Math.abs((x - 10) - (y - 11)) <= 1.5) return true;
  if (x >= 35 && x <= 44 && y >= 13 && y <= 22 && Math.abs((x - 35) - (22 - y)) <= 1.5) return true;
  if (Math.abs(y - 45) <= 1 && x >= 41 && x <= 46) return true;
  return false;
}

export function isWalkableTile(x: number, y: number): boolean {
  return x >= 1 && x <= 54 && y >= 1 && y <= 54 && !isWaterTile(x, y);
}

export function isDecorativeTreeTile(x: number, y: number): boolean {
  if (x <= 2 || y <= 2 || x >= 53 || y >= 53) return false;
  if (
    isCentralTile(x, y) ||
    isRoadTile(x, y) ||
    isDungeonTile(x, y) ||
    isArenaTile(x, y) ||
    isWoodWorkAreaTile(x, y) ||
    isStoneWorkAreaTile(x, y) ||
    !isWalkableTile(x, y)
  ) {
    return false;
  }
  if (
    isWaterTile(x + 1, y) ||
    isWaterTile(x - 1, y) ||
    isWaterTile(x, y + 1) ||
    isWaterTile(x, y - 1)
  ) {
    return false;
  }
  if (Math.hypot(x - 6, y - 37) <= 3 || Math.hypot(x - 28, y - 14) <= 3) return false;
  return (x * 37 + y * 73) % 13 === 0;
}

function createDefaultAfkVault(): AfkVault {
  return {
    wood: 0,
    stone: 0,
    fish: 0,
    coins: 0,
    bait_used: 0,
    duration_minutes: 0,
    died_in_dungeon: false,
    death_coin_penalty: 0,
    efficiency_percent: 60,
    last_updated_at: new Date().toISOString(),
    history: [],
  };
}

class LocalGameBackend {
  private lastHarvestByUser = new Map<string, number>();
  private lastAttackByUser = new Map<string, number>();
  private claimInProgressUsers = new Set<string>();
  private reviveInProgressUsers = new Set<string>();

  getSessionUser(): LocalUser | null {
    return readJson<LocalUser | null>(STORAGE_KEYS.SESSION, null);
  }

  signInAnonymously(): LocalUser {
    const existing = this.getSessionUser();
    if (existing) return existing;
    const guestId =
      typeof window !== 'undefined' && window.localStorage.getItem('rimba_guest_uid')
        ? window.localStorage.getItem('rimba_guest_uid')!
        : `guest-${crypto.randomUUID()}`;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('rimba_guest_uid', guestId);
    }
    const user: LocalUser = { id: guestId, is_anonymous: true };
    writeJson(STORAGE_KEYS.SESSION, user);
    return user;
  }

  signUpWithEmail(email: string, password: string, lang: Lang = 'id'): LocalUser {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || password.length < 8) {
      throw new Error(
        lang === 'en'
          ? 'Please enter a valid email and a password of at least 8 characters.'
          : 'Masukkan email valid dan kata sandi minimal 8 karakter.'
      );
    }
    const users = readJson<Record<string, { id: string; email: string; password: string }>>(STORAGE_KEYS.USERS, {});
    if (users[cleanEmail]) {
      throw new Error(
        lang === 'en'
          ? 'Email is already registered. Please use Sign In.'
          : 'Email sudah terdaftar. Silakan gunakan tombol Masuk.'
      );
    }
    const id = `user-${crypto.randomUUID()}`;
    users[cleanEmail] = { id, email: cleanEmail, password };
    writeJson(STORAGE_KEYS.USERS, users);
    const user: LocalUser = { id, email: cleanEmail, is_anonymous: false };
    writeJson(STORAGE_KEYS.SESSION, user);
    return user;
  }

  signInWithEmail(email: string, password: string, lang: Lang = 'id'): LocalUser {
    const cleanEmail = email.trim().toLowerCase();
    const users = readJson<Record<string, { id: string; email: string; password: string }>>(STORAGE_KEYS.USERS, {});
    const found = users[cleanEmail];
    if (!found || found.password !== password) {
      throw new Error(lang === 'en' ? 'Incorrect email or password.' : 'Email atau kata sandi tidak cocok.');
    }
    const user: LocalUser = { id: found.id, email: found.email, is_anonymous: false };
    writeJson(STORAGE_KEYS.SESSION, user);
    return user;
  }

  linkGuestToEmail(userId: string, email: string, password: string, lang: Lang = 'id'): LocalUser {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || password.length < 8) {
      throw new Error(
        lang === 'en'
          ? 'Please enter a valid email and a password of at least 8 characters.'
          : 'Masukkan email valid dan kata sandi minimal 8 karakter.'
      );
    }
    const users = readJson<Record<string, { id: string; email: string; password: string }>>(STORAGE_KEYS.USERS, {});
    if (users[cleanEmail] && users[cleanEmail]!.id !== userId) {
      throw new Error(
        lang === 'en'
          ? 'That email is already linked to another account.'
          : 'Email tersebut sudah dipakai akun lain.'
      );
    }
    users[cleanEmail] = { id: userId, email: cleanEmail, password };
    writeJson(STORAGE_KEYS.USERS, users);
    const updated: LocalUser = { id: userId, email: cleanEmail, is_anonymous: false };
    writeJson(STORAGE_KEYS.SESSION, updated);
    return updated;
  }

  signOut(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(STORAGE_KEYS.SESSION);
  }

  getCharacter(userId: string): Character | null {
    const all = readJson<Record<string, Character>>(STORAGE_KEYS.CHARACTERS, {});
    return all[userId] ?? null;
  }

  private assignRegion(): string {
    const all = Object.values(readJson<Record<string, Character>>(STORAGE_KEYS.CHARACTERS, {}));
    const regionCounts = new Map<number, number>();
    for (const c of all) {
      const m = /Wilayah\s+(\d+)/i.exec(c.home_region);
      const r = m ? Number(m[1]) : 1;
      regionCounts.set(r, (regionCounts.get(r) ?? 0) + 1);
    }
    let regionIndex = 1;
    while ((regionCounts.get(regionIndex) ?? 0) >= GAME_CONFIG.REGION_CAPACITY) {
      regionIndex++;
    }
    return `Wilayah ${regionIndex}`;
  }

  createCharacter(
    userId: string,
    params: { p_display_name: string; p_age: number; p_bio: string; p_model_id: string },
    lang: Lang = 'id'
  ): Character {
    const all = readJson<Record<string, Character>>(STORAGE_KEYS.CHARACTERS, {});
    if (all[userId]) {
      throw new Error(
        lang === 'en'
          ? 'One account may only have one character and one Citizen ID.'
          : 'Satu akun hanya boleh memiliki satu karakter dan satu KTP game.'
      );
    }
    const name = validateAndModerateCharacterName(params.p_display_name, lang);
    const age = Number(params.p_age);
    if (Number.isNaN(age) || age < 18 || age > 99) {
      throw new Error(
        lang === 'en'
          ? 'Character age must be between 18 and 99.'
          : 'Umur karakter harus antara 18 dan 99 tahun.'
      );
    }
    const bio = (params.p_bio ?? '').trim();
    if (bio.length > 120) {
      throw new Error(
        lang === 'en' ? 'Short bio cannot exceed 120 characters.' : 'Deskripsi singkat maksimal 120 karakter.'
      );
    }
    if (!/^(female|male)-(0[1-9]|10)$/.test(params.p_model_id)) {
      throw new Error(
        lang === 'en'
          ? 'Please select one of the 20 available Chibi character models (10 male, 10 female).'
          : 'Pilih salah satu dari 20 model karakter Chibi yang tersedia (10 cowo, 10 cewe).'
      );
    }

    const nextSeq = readJson<number>(STORAGE_KEYS.CITIZEN_SEQ, 0) + 1;
    writeJson(STORAGE_KEYS.CITIZEN_SEQ, nextSeq);

    const spec = getCharacterModelSpec(params.p_model_id);
    const character: Character = {
      user_id: userId,
      citizen_number: nextSeq,
      display_name: name,
      age,
      bio,
      model_id: spec.id,
      gender: spec.gender,
      avatar_color: spec.shirtColor,
      outfit_id: 'tunika-rimba',
      hat_id: 'none',
      residence_status: 'Warga',
      home_region: this.assignRegion(),
      created_at: new Date().toISOString(),
    };

    all[userId] = character;
    writeJson(STORAGE_KEYS.CHARACTERS, all);

    this.getInventory(userId);
    this.savePosition(userId, GAME_CONFIG.CENTRAL_SPAWN.x, GAME_CONFIG.CENTRAL_SPAWN.y);

    return character;
  }

  getInventory(userId: string): Inventory {
    const all = readJson<Record<string, Inventory>>(STORAGE_KEYS.INVENTORIES, {});
    const wib = getWibTimeInfo();
    if (!all[userId]) {
      all[userId] = {
        wood: 8,
        stone: 4,
        fish: 1,
        fish_bait: 6,
        crystal_shard: 0,
        coins: 150,
        bank_balance: 100,
        bank_last_interest_period: wib.currentPeriodId,
        bank_history: [
          {
            id: `bank-init-${Date.now()}`,
            type: 'deposit',
            amount: 100,
            balance_after: 100,
            wib_time: wib.wibTimeString,
            created_at: new Date().toISOString(),
            note: 'Saldo tabungan awal warga Bank Rimba',
            note_id: 'Saldo tabungan awal warga Bank Rimba',
            note_en: 'Initial citizen savings at Rimba Bank',
          },
        ],
        data_forms: 1,
        food_rations: 2,
        herbal_tea: 1,
        grilled_fish: 0,
        hp: 100,
        max_hp: 100,
        stamina: 100,
        max_stamina: 100,
        max_capacity: 120,
        owned_outfits: ['tunika-rimba', 'none'],
        active_room: null,
        dead_until: null,
        awaiting_revive: false,
        last_death_id: null,
        last_death_penalty: 0,
        last_death_cause: null,
        last_active_at: new Date().toISOString(),
        player_status: 'active',
        afk_started_at: null,
        afk_phase_started_at: null,
        afk_phase: 'stroll',
        afk_activity: 'stroll',
        last_afk_work_activity: null,
        afk_history: ['stroll'],
        afk_vault: createDefaultAfkVault(),
      };
      writeJson(STORAGE_KEYS.INVENTORIES, all);
    }
    const inv = all[userId]!;
    if (typeof inv.fish !== 'number') inv.fish = 0;
    if (typeof inv.fish_bait !== 'number') inv.fish_bait = 6;
    if (typeof inv.crystal_shard !== 'number') inv.crystal_shard = 0;
    if (typeof inv.bank_balance !== 'number') inv.bank_balance = 0;
    if (!Array.isArray(inv.bank_history)) inv.bank_history = [];
    if (!inv.bank_last_interest_period) inv.bank_last_interest_period = wib.currentPeriodId;
    if (typeof inv.grilled_fish !== 'number') inv.grilled_fish = 0;
    if (typeof inv.max_capacity !== 'number') inv.max_capacity = 120;
    if (typeof inv.awaiting_revive !== 'boolean') inv.awaiting_revive = Boolean(inv.dead_until);
    if (!Array.isArray(inv.afk_history) || inv.afk_history.length === 0) inv.afk_history = ['stroll'];
    if (!inv.afk_vault) inv.afk_vault = createDefaultAfkVault();
    if (typeof inv.afk_vault.duration_minutes !== 'number') inv.afk_vault.duration_minutes = 0;
    if (!inv.player_status) inv.player_status = 'active';

    // Process 12:00 WIB daily bank interest idempotently
    if (inv.bank_last_interest_period !== wib.currentPeriodId) {
      if (inv.bank_balance > 0) {
        const interest = Math.floor(inv.bank_balance * GAME_CONFIG.BANK_DAILY_INTEREST_RATE);
        if (interest > 0) {
          inv.bank_balance += interest;
          inv.bank_history.unshift({
            id: `bank-int-${wib.currentPeriodId}`,
            type: 'interest',
            amount: interest,
            balance_after: inv.bank_balance,
            wib_time: '12:00:00 WIB',
            created_at: new Date().toISOString(),
            note: `Bunga harian 3% (${wib.currentPeriodId})`,
            note_id: `Bunga harian 3% periode ${wib.currentPeriodId}`,
            note_en: `3% daily interest for ${wib.currentPeriodId}`,
          });
          inv.bank_history = inv.bank_history.slice(0, 15);
        }
      }
      inv.bank_last_interest_period = wib.currentPeriodId;
      all[userId] = inv;
      writeJson(STORAGE_KEYS.INVENTORIES, all);
    }

    if (inv.active_room && new Date(inv.active_room.expires_at).getTime() <= Date.now()) {
      inv.active_room = null;
    }

    if (inv.dead_until) {
      if (new Date(inv.dead_until).getTime() > Date.now()) {
        inv.player_status = 'recovering';
        inv.awaiting_revive = true;
      } else {
        // Section 13: Timer reached 00:00 -> stay in waiting_revive until player clicks Bangkit / Revive!
        inv.player_status = 'waiting_revive';
        inv.awaiting_revive = true;
      }
    } else if (inv.awaiting_revive) {
      inv.player_status = 'waiting_revive';
    }
    return inv;
  }

  /**
   * Returns true if character is downed (either counting down 10m cooldown OR waiting for manual Revive click).
   */
  isDownedOrWaitingRevive(userId: string): {
    downed: boolean;
    locked: boolean;
    active: boolean;
    readyToRevive: boolean;
    remainingSec: number;
    cooldownRemainingSec: number;
    penalty: number;
  } {
    const inv = this.getInventory(userId);
    if (!inv.dead_until && !inv.awaiting_revive) {
      return {
        downed: false,
        locked: false,
        active: false,
        readyToRevive: false,
        remainingSec: 0,
        cooldownRemainingSec: 0,
        penalty: 0,
      };
    }
    if (inv.dead_until) {
      const diff = new Date(inv.dead_until).getTime() - Date.now();
      if (diff > 0) {
        const sec = Math.ceil(diff / 1000);
        return {
          downed: true,
          locked: true,
          active: true,
          readyToRevive: false,
          remainingSec: sec,
          cooldownRemainingSec: sec,
          penalty: inv.last_death_penalty,
        };
      }
    }
    return {
      downed: true,
      locked: true,
      active: false,
      readyToRevive: true,
      remainingSec: 0,
      cooldownRemainingSec: 0,
      penalty: inv.last_death_penalty,
    };
  }

  getUsedBagUnits(inv: Inventory): number {
    return (
      inv.wood +
      inv.stone +
      inv.fish +
      inv.fish_bait +
      inv.crystal_shard +
      inv.data_forms +
      inv.food_rations +
      inv.herbal_tea +
      inv.grilled_fish
    );
  }

  saveInventory(userId: string, inv: Inventory): Inventory {
    const all = readJson<Record<string, Inventory>>(STORAGE_KEYS.INVENTORIES, {});
    inv.last_active_at = new Date().toISOString();
    all[userId] = inv;
    writeJson(STORAGE_KEYS.INVENTORIES, all);
    return inv;
  }

  /**
   * Section 7 + User Note:
   * Picks a random work activity for the 3-minute work phase.
   * - 5% chance to go to low-risk Dungeon (with 5% chance of death) if HP >= 45.
   * - Otherwise picks from valid jobs ('wood', 'stone', 'fish') strictly different from `last_afk_work_activity`.
   * - If fishing bait is 0, excludes 'fish'.
   */
  pickNextAfkWorkActivity(inv: Inventory): AfkActivityType {
    if (inv.hp >= 45 && Math.random() < GAME_CONFIG.AFK_DUNGEON_VISIT_CHANCE) {
      return 'dungeon';
    }

    const candidates: AfkActivityType[] = ['wood', 'stone'];
    if ((inv.fish_bait ?? 0) > 0) {
      candidates.push('fish');
    }

    const previous = inv.last_afk_work_activity;
    const filtered = candidates.filter(c => c !== previous);
    const pool = filtered.length > 0 ? filtered : candidates;
    const chosen = pool[Math.floor(Math.random() * pool.length)] ?? 'wood';
    return chosen;
  }

  getAfkTargetWaypoints(activity: AfkActivityType, phase: 'stroll' | 'work', seed = 0): Array<{ x: number; y: number }> {
    if (phase === 'stroll' || activity === 'stroll') {
      const routes: Array<Array<{ x: number; y: number }>> = [
        [
          { x: 26, y: 29 },
          { x: 30, y: 29 },
          { x: 31, y: 26 },
          { x: 27, y: 25 },
        ],
        [
          { x: 25, y: 31 },
          { x: 29, y: 32 },
          { x: 32, y: 29 },
          { x: 28, y: 26 },
        ],
      ];
      return routes[seed % routes.length]!;
    }
    if (activity === 'wood') {
      return [
        { x: 42, y: 27 },
        { x: 45, y: 27 },
        { x: 44, y: 29 },
      ];
    }
    if (activity === 'stone') {
      return [
        { x: 37, y: 44 },
        { x: 40, y: 44 },
        { x: 38, y: 46 },
      ];
    }
    if (activity === 'fish') {
      return [
        { x: 27, y: 14 },
        { x: 29, y: 14 },
        { x: 28, y: 14 },
      ];
    }
    return [
      { x: 9, y: 12 },
      { x: 10, y: 11 },
      { x: 8, y: 12 },
    ];
  }

  enterAfkMode(userId: string): {
    activity: AfkActivityType;
    phase: 'stroll' | 'work';
    waypoints: Array<{ x: number; y: number }>;
  } | null {
    const char = this.getCharacter(userId);
    if (!char) return null; // Spectators never enter AFK
    const downed = this.isDownedOrWaitingRevive(userId);
    if (downed.downed) return null; // Dead / Cooldown / Waiting Revive cannot enter AFK

    const inv = this.getInventory(userId);
    const nowIso = new Date().toISOString();
    inv.player_status = 'afk';
    inv.afk_started_at = nowIso;
    inv.afk_phase_started_at = nowIso;
    // Section 7: Always start AFK with 3 minutes of strolling on safe paths
    inv.afk_phase = 'stroll';
    inv.afk_activity = 'stroll';
    this.saveInventory(userId, inv);

    return {
      activity: 'stroll',
      phase: 'stroll',
      waypoints: this.getAfkTargetWaypoints('stroll', 'stroll', char.citizen_number),
    };
  }

  /**
   * Runs every 12s while character is in AFK mode.
   * Alternates strictly between 3-minute stroll and 3-minute single work activity.
   * All rewards (at 60% efficiency) go into `inv.afk_vault` (never directly into main inventory/coins).
   */
  processAfkBatchTick(userId: string): {
    inv: Inventory;
    activity: AfkActivityType;
    phase: 'stroll' | 'work';
    waypoints: Array<{ x: number; y: number }>;
    died: boolean;
  } {
    const char = this.getCharacter(userId);
    const inv = this.getInventory(userId);
    if (!char || this.isDownedOrWaitingRevive(userId).downed) {
      return { inv, activity: 'stroll', phase: 'stroll', waypoints: [], died: false };
    }

    const nowMs = Date.now();
    const phaseStartMs = inv.afk_phase_started_at ? new Date(inv.afk_phase_started_at).getTime() : nowMs;
    const elapsedPhaseMs = nowMs - phaseStartMs;

    // Switch phase every 3 minutes (AFK_PHASE_MS = 180,000 ms)
    if (elapsedPhaseMs >= GAME_CONFIG.AFK_PHASE_MS) {
      inv.afk_phase_started_at = new Date(nowMs).toISOString();
      if (inv.afk_phase === 'stroll') {
        inv.afk_phase = 'work';
        const nextWork = this.pickNextAfkWorkActivity(inv);
        inv.afk_activity = nextWork;
        if (nextWork !== 'dungeon') {
          inv.last_afk_work_activity = nextWork;
        }
        inv.afk_history = [...(inv.afk_history ?? []).slice(-8), nextWork];
      } else {
        inv.afk_phase = 'stroll';
        inv.afk_activity = 'stroll';
      }
    }

    // If working on fishing and bait ran out mid-phase, switch to another work job different from previous
    if (inv.afk_phase === 'work' && inv.afk_activity === 'fish' && inv.fish_bait <= 0) {
      const fallbackWork = this.pickNextAfkWorkActivity(inv);
      inv.afk_activity = fallbackWork;
      inv.last_afk_work_activity = fallbackWork;
    }

    const vault = inv.afk_vault ?? createDefaultAfkVault();
    const wib = getWibTimeInfo(nowMs);
    let diedNow = false;

    if (inv.afk_phase === 'work') {
      // 60% AFK efficiency applied on backend
      if (inv.afk_activity === 'wood') {
        const woodGain = Math.max(1, Math.round(2 * GAME_CONFIG.AFK_EFFICIENCY_RATE)); // 1 wood
        const coinGain = Math.max(1, Math.round(4 * GAME_CONFIG.AFK_EFFICIENCY_RATE)); // 2 coins
        vault.wood += woodGain;
        vault.coins += coinGain;
      } else if (inv.afk_activity === 'stone') {
        const stoneGain = Math.max(1, Math.round(2 * GAME_CONFIG.AFK_EFFICIENCY_RATE)); // 1 stone
        const coinGain = Math.max(2, Math.round(5 * GAME_CONFIG.AFK_EFFICIENCY_RATE)); // 3 coins
        vault.stone += stoneGain;
        vault.coins += coinGain;
      } else if (inv.afk_activity === 'fish' && inv.fish_bait > 0) {
        const fishGain = Math.max(1, Math.round(2 * GAME_CONFIG.AFK_EFFICIENCY_RATE)); // 1 fish
        const coinGain = Math.max(2, Math.round(6 * GAME_CONFIG.AFK_EFFICIENCY_RATE)); // 4 coins
        inv.fish_bait = Math.max(0, inv.fish_bait - 1);
        vault.fish += fishGain;
        vault.bait_used += 1;
        vault.coins += coinGain;
      } else if (inv.afk_activity === 'dungeon') {
        // 5% chance of dying during low-risk dungeon AFK
        if (Math.random() < GAME_CONFIG.AFK_DUNGEON_DEATH_CHANCE) {
          const penalty = Math.floor(inv.coins * GAME_CONFIG.DEATH_PENALTY_RATE);
          inv.coins = Math.max(0, inv.coins - penalty);
          inv.hp = 0;
          inv.last_death_penalty = penalty;
          inv.last_death_id = `afk-dungeon-${nowMs}`;
          inv.last_death_cause = 'afk_dungeon_slime';
          inv.dead_until = new Date(nowMs + GAME_CONFIG.DEATH_COOLDOWN_MS).toISOString();
          inv.awaiting_revive = true;
          inv.player_status = 'recovering';
          vault.died_in_dungeon = true;
          vault.death_coin_penalty = penalty;
          vault.history.unshift({
            id: `afk-death-${nowMs}`,
            timestamp: new Date(nowMs).toISOString(),
            wib_time: wib.wibTimeString,
            type: 'dungeon_death',
            summary_id: `Gugur di Dungeon Atas saat AFK (-${penalty} coin dibawa, tabungan Bank aman).`,
            summary_en: `Defeated in Upper Dungeon during AFK (-${penalty} carried coins, Bank savings safe).`,
          });
          diedNow = true;
        } else {
          const coinGain = Math.max(3, Math.round(8 * GAME_CONFIG.AFK_EFFICIENCY_RATE));
          vault.coins += coinGain;
        }
      }
    } else {
      // Stroll phase gently restores stamina
      inv.stamina = Math.min(inv.max_stamina, inv.stamina + 2);
    }

    vault.duration_minutes = (vault.duration_minutes ?? 0) + 1;
    vault.last_updated_at = new Date(nowMs).toISOString();
    vault.history = vault.history.slice(0, 15);
    inv.afk_vault = vault;
    this.saveInventory(userId, inv);

    return {
      inv,
      activity: inv.afk_activity,
      phase: inv.afk_phase,
      waypoints: this.getAfkTargetWaypoints(inv.afk_activity, inv.afk_phase, char.citizen_number),
      died: diedNow,
    };
  }

  /**
   * Immediately stops AFK when the player provides valid input.
   * Does NOT auto-claim rewards; rewards remain in `afk_vault` until claimed.
   */
  recordValidPlayerInput(userId: string): AfkSessionReport | null {
    const all = readJson<Record<string, Inventory>>(STORAGE_KEYS.INVENTORIES, {});
    const inv = all[userId];
    if (!inv) return null;

    const wasAfk = inv.player_status === 'afk' || inv.player_status === 'offline_sim';
    if (!this.isDownedOrWaitingRevive(userId).downed) {
      inv.player_status = 'active';
    }
    inv.afk_started_at = null;
    inv.afk_phase_started_at = null;
    inv.last_active_at = new Date().toISOString();
    all[userId] = inv;
    writeJson(STORAGE_KEYS.INVENTORIES, all);

    if (wasAfk) {
      const v = inv.afk_vault;
      if (v && (v.wood + v.stone + v.fish + v.coins > 0 || v.died_in_dungeon)) {
        return v;
      }
    }
    return null;
  }

  /**
   * Calculates offline AFK earnings into `afk_vault` at 60% efficiency (never directly into main inventory/coins).
   */
  syncOfflineAfkToVault(userId: string): AfkVault | null {
    const char = this.getCharacter(userId);
    if (!char) return null;
    const inv = this.getInventory(userId);
    if (this.isDownedOrWaitingRevive(userId).downed) return inv.afk_vault;

    const elapsedMs = Date.now() - new Date(inv.last_active_at).getTime();
    const rawMinutes = Math.floor(elapsedMs / 60000);
    if (rawMinutes < 3) {
      inv.last_active_at = new Date().toISOString();
      this.saveInventory(userId, inv);
      return null;
    }

    const cappedMinutes = Math.min(rawMinutes, GAME_CONFIG.AFK_MAX_MINUTES);
    // Each 6-minute cycle has 3m stroll + 3m work
    const workCycles = Math.max(1, Math.floor(cappedMinutes / 6));
    const eff = GAME_CONFIG.AFK_EFFICIENCY_RATE; // 0.60

    const woodGain = Math.max(1, Math.floor(workCycles * 2 * eff));
    const stoneGain = Math.max(1, Math.floor(workCycles * 1.5 * eff));
    let fishGain = 0;
    let baitUsed = 0;
    if (inv.fish_bait > 0) {
      fishGain = Math.min(inv.fish_bait, Math.max(1, Math.floor(workCycles * 1.2 * eff)));
      baitUsed = fishGain;
      inv.fish_bait -= baitUsed;
    }
    const coinGain = Math.max(3, Math.floor(workCycles * 8 * eff));

    const vault = inv.afk_vault ?? createDefaultAfkVault();
    vault.wood += woodGain;
    vault.stone += stoneGain;
    vault.fish += fishGain;
    vault.coins += coinGain;
    vault.bait_used += baitUsed;
    vault.duration_minutes = (vault.duration_minutes ?? 0) + cappedMinutes;
    vault.efficiency_percent = 60;
    vault.last_updated_at = new Date().toISOString();

    const wib = getWibTimeInfo();
    vault.history.unshift({
      id: `afk-off-${Date.now()}`,
      timestamp: new Date().toISOString(),
      wib_time: wib.wibTimeString,
      type: 'earned',
      summary_id: `Simulasi AFK (${cappedMinutes} mnt, efisiensi 60%): +${woodGain} Kayu, +${stoneGain} Batu, +${fishGain} Ikan, +${coinGain} Coin masuk penampung.`,
      summary_en: `AFK Simulation (${cappedMinutes}m, 60% efficiency): +${woodGain} Wood, +${stoneGain} Stone, +${fishGain} Fish, +${coinGain} Coins added to vault.`,
    });
    vault.history = vault.history.slice(0, 15);

    inv.afk_vault = vault;
    this.saveInventory(userId, inv);
    return vault;
  }

  /**
   * Section 8: Claims items and coins from `afk_vault` into main inventory & coins.
   * Safe against double-click, refresh, or full inventory.
   * If inventory is full, moves what fits and keeps unmoved items safely in `afk_vault`.
   */
  claimAfkVault(
    userId: string,
    lang: Lang = 'id'
  ): {
    claimedWood: number;
    claimedStone: number;
    claimedFish: number;
    claimedCoins: number;
    partialDueToFullBag: boolean;
    message: string;
    vault: AfkVault;
  } {
    if (this.claimInProgressUsers.has(userId)) {
      throw new Error(lang === 'en' ? 'Claim request already in progress.' : 'Permintaan klaim sedang diproses.');
    }
    this.claimInProgressUsers.add(userId);

    try {
      const inv = this.getInventory(userId);
      const vault = inv.afk_vault ?? createDefaultAfkVault();

      const totalPending = vault.wood + vault.stone + vault.fish + vault.coins;
      if (totalPending <= 0) {
        throw new Error(
          lang === 'en'
            ? 'No AFK rewards available to claim right now.'
            : 'Belum ada hasil AFK yang dapat diklaim saat ini.'
        );
      }

      // 1. Coins can always be claimed atomically once
      const claimedCoins = vault.coins;
      inv.coins += claimedCoins;
      vault.coins = 0;

      // 2. Move items up to available bag capacity (never delete items that don't fit!)
      let spaceLeft = Math.max(0, inv.max_capacity - this.getUsedBagUnits(inv));

      const claimedWood = Math.min(spaceLeft, vault.wood);
      inv.wood += claimedWood;
      vault.wood -= claimedWood;
      spaceLeft -= claimedWood;

      const claimedStone = Math.min(spaceLeft, vault.stone);
      inv.stone += claimedStone;
      vault.stone -= claimedStone;
      spaceLeft -= claimedStone;

      const claimedFish = Math.min(spaceLeft, vault.fish);
      inv.fish += claimedFish;
      vault.fish -= claimedFish;
      spaceLeft -= claimedFish;

      const remainingItems = vault.wood + vault.stone + vault.fish;
      const partialDueToFullBag = remainingItems > 0;

      if (!partialDueToFullBag) {
        vault.duration_minutes = 0;
        vault.bait_used = 0;
      }
      vault.died_in_dungeon = false;
      vault.death_coin_penalty = 0;
      vault.last_updated_at = new Date().toISOString();

      const wib = getWibTimeInfo();
      vault.history.unshift({
        id: `afk-claim-${Date.now()}`,
        timestamp: new Date().toISOString(),
        wib_time: wib.wibTimeString,
        type: 'claimed',
        summary_id: `Diklaim: +${claimedWood} Kayu, +${claimedStone} Batu, +${claimedFish} Ikan, +${claimedCoins} Coin.`,
        summary_en: `Claimed: +${claimedWood} Wood, +${claimedStone} Stone, +${claimedFish} Fish, +${claimedCoins} Coins.`,
      });
      vault.history = vault.history.slice(0, 15);

      inv.afk_vault = vault;
      this.saveInventory(userId, inv);

      const message = partialDueToFullBag
        ? lang === 'en'
          ? `Claimed +${claimedCoins} Coins, +${claimedWood} Wood, +${claimedStone} Stone, +${claimedFish} Fish. Bag is full (${inv.max_capacity}/${inv.max_capacity})—remaining items (${vault.wood} Wood, ${vault.stone} Stone, ${vault.fish} Fish) are safely kept in your AFK Vault!`
          : `Berhasil klaim +${claimedCoins} Coin, +${claimedWood} Kayu, +${claimedStone} Batu, +${claimedFish} Ikan. Tas penuh (${inv.max_capacity}/${inv.max_capacity})—sisa item (${vault.wood} Kayu, ${vault.stone} Batu, ${vault.fish} Ikan) tetap tersimpan aman di Penampung AFK!`
        : lang === 'en'
          ? `Successfully claimed all AFK rewards (+${claimedWood} Wood, +${claimedStone} Stone, +${claimedFish} Fish, +${claimedCoins} Coins)!`
          : `Berhasil mengklaim seluruh hasil AFK (+${claimedWood} Kayu, +${claimedStone} Batu, +${claimedFish} Ikan, +${claimedCoins} Coin)!`;

      return {
        claimedWood,
        claimedStone,
        claimedFish,
        claimedCoins,
        partialDueToFullBag,
        message,
        vault,
      };
    } finally {
      this.claimInProgressUsers.delete(userId);
    }
  }

  // --- SECTION 9: BANK RIMBA (Deposit, Withdraw, 3% Daily Interest at 12:00 WIB) ---
  depositToBank(
    userId: string,
    rawAmount: number,
    playerPos: { x: number; y: number },
    lang: Lang = 'id'
  ): Inventory {
    if (Math.hypot(playerPos.x - 25, playerPos.y - 22) > 5.5) {
      throw new Error(
        lang === 'en'
          ? 'You must walk to Rimba Bank in Central (25, 22) to deposit coins.'
          : 'Kamu wajib berjalan ke bangunan Bank Rimba di Central (25, 22) untuk menyetor coin.'
      );
    }
    if (this.isDownedOrWaitingRevive(userId).downed) {
      throw new Error(lang === 'en' ? 'Cannot use Bank while downed.' : 'Tidak dapat mengakses Bank saat pingsan.');
    }
    const amount = Math.floor(Number(rawAmount));
    if (!Number.isFinite(amount) || amount < 1) {
      throw new Error(lang === 'en' ? 'Minimum deposit is 1 coin.' : 'Minimal setor adalah 1 coin.');
    }
    const inv = this.getInventory(userId);
    if (inv.coins < amount) {
      throw new Error(
        lang === 'en'
          ? `Not enough carried coins (you have ${inv.coins} coins).`
          : `Coin yang dibawa tidak cukup (saldo dibawa: ${inv.coins} coin).`
      );
    }
    const wib = getWibTimeInfo();
    inv.coins -= amount;
    inv.bank_balance += amount;
    inv.bank_history.unshift({
      id: `dep-${Date.now()}`,
      type: 'deposit',
      amount,
      balance_after: inv.bank_balance,
      wib_time: wib.wibTimeString,
      created_at: new Date().toISOString(),
      note: lang === 'en' ? 'Deposited coins to Rimba Bank savings' : 'Setor tunai ke tabungan Bank Rimba',
      note_id: `Setor tunai ke tabungan Bank Rimba`,
      note_en: `Deposited coins to Rimba Bank savings`,
    });
    inv.bank_history = inv.bank_history.slice(0, 15);
    return this.saveInventory(userId, inv);
  }

  withdrawFromBank(
    userId: string,
    rawAmount: number,
    playerPos: { x: number; y: number },
    lang: Lang = 'id'
  ): Inventory {
    if (Math.hypot(playerPos.x - 25, playerPos.y - 22) > 5.5) {
      throw new Error(
        lang === 'en'
          ? 'You must walk to Rimba Bank in Central (25, 22) to withdraw coins.'
          : 'Kamu wajib berjalan ke bangunan Bank Rimba di Central (25, 22) untuk menarik coin.'
      );
    }
    if (this.isDownedOrWaitingRevive(userId).downed) {
      throw new Error(lang === 'en' ? 'Cannot use Bank while downed.' : 'Tidak dapat mengakses Bank saat pingsan.');
    }
    const amount = Math.floor(Number(rawAmount));
    if (!Number.isFinite(amount) || amount < 1) {
      throw new Error(lang === 'en' ? 'Minimum withdrawal is 1 coin.' : 'Minimal penarikan adalah 1 coin.');
    }
    const inv = this.getInventory(userId);
    if (inv.bank_balance < amount) {
      throw new Error(
        lang === 'en'
          ? `Not enough Bank savings (balance: ${inv.bank_balance} coins).`
          : `Saldo tabungan Bank tidak mencukupi (saldo tabungan: ${inv.bank_balance} coin).`
      );
    }
    const wib = getWibTimeInfo();
    inv.bank_balance -= amount;
    inv.coins += amount;
    inv.bank_history.unshift({
      id: `wd-${Date.now()}`,
      type: 'withdraw',
      amount,
      balance_after: inv.bank_balance,
      wib_time: wib.wibTimeString,
      created_at: new Date().toISOString(),
      note: lang === 'en' ? 'Withdrew coins from Rimba Bank savings' : 'Tarik tunai dari tabungan Bank Rimba',
      note_id: `Tarik tunai dari tabungan Bank Rimba`,
      note_en: `Withdrew coins from Rimba Bank savings`,
    });
    inv.bank_history = inv.bank_history.slice(0, 15);
    return this.saveInventory(userId, inv);
  }

  getPosition(userId: string): { tile_x: number; tile_y: number } | null {
    const all = readJson<Record<string, { tile_x: number; tile_y: number; updated_at: string }>>(STORAGE_KEYS.POSITIONS, {});
    return all[userId] ?? null;
  }

  savePosition(userId: string, tileX: number, tileY: number): void {
    const clampedX = Math.max(1, Math.min(54, tileX));
    const clampedY = Math.max(1, Math.min(54, tileY));
    if (!isWalkableTile(clampedX, clampedY)) return;
    const all = readJson<Record<string, { tile_x: number; tile_y: number; updated_at: string }>>(STORAGE_KEYS.POSITIONS, {});
    all[userId] = { tile_x: clampedX, tile_y: clampedY, updated_at: new Date().toISOString() };
    writeJson(STORAGE_KEYS.POSITIONS, all);
  }

  getWorkNodes(): WorkNode[] {
    const nodes = readJson<WorkNode[]>(STORAGE_KEYS.WORK_NODES, DEFAULT_WORK_NODES);
    let changed = false;
    for (const node of nodes) {
      if (node.remaining <= 0) {
        node.remaining = Math.floor(node.max_stock * 0.6);
        changed = true;
      }
    }
    if (changed) writeJson(STORAGE_KEYS.WORK_NODES, nodes);
    return nodes;
  }

  gatherWorkResource(
    userId: string,
    currentTile: { x: number; y: number },
    lang: Lang = 'id'
  ): {
    resource: 'wood' | 'stone' | 'fish';
    nodeName: string;
    amount: number;
    remaining: number;
    stamina: number;
    fishBaitLeft: number;
  } {
    const char = this.getCharacter(userId);
    if (!char) {
      throw new Error(
        lang === 'en'
          ? 'Spectators cannot gather resources. Create a Citizen character first.'
          : 'Penonton tidak dapat mengumpulkan resource. Buat karakter Warga terlebih dahulu.'
      );
    }
    if (this.isDownedOrWaitingRevive(userId).downed) {
      throw new Error(
        lang === 'en'
          ? 'Character is downed or awaiting Revive. Actions are locked.'
          : 'Karakter sedang pingsan atau menunggu Bangkit / Revive. Aksi dikunci.'
      );
    }
    const inv = this.getInventory(userId);
    if (inv.stamina < 6) {
      throw new Error(
        lang === 'en'
          ? 'Stamina is too low (<6). Eat food/drink or rest at the Inn or Sanctuary in Central.'
          : 'Stamina terlalu rendah (<6). Gunakan makanan/minuman atau istirahat di Penginapan/Tempat Ibadah Central.'
      );
    }
    if (this.getUsedBagUnits(inv) >= inv.max_capacity) {
      throw new Error(
        lang === 'en'
          ? `Inventory is full (${inv.max_capacity}/${inv.max_capacity}). Sell items at Central Market first.`
          : `Inventory sudah penuh (${inv.max_capacity}/${inv.max_capacity}). Jual sebagian barang di Pasar Central.`
      );
    }

    const now = Date.now();
    const last = this.lastHarvestByUser.get(userId) ?? 0;
    if (now - last < GAME_CONFIG.HARVEST_COOLDOWN_MS) {
      const waitSec = Math.ceil((GAME_CONFIG.HARVEST_COOLDOWN_MS - (now - last)) / 1000);
      throw new Error(
        lang === 'en'
          ? `Please wait ${waitSec}s before gathering again.`
          : `Tunggu ${waitSec} detik sebelum mengambil resource lagi.`
      );
    }

    const nodes = this.getWorkNodes();
    let closest: WorkNode | null = null;
    let bestDist = Infinity;
    for (const node of nodes) {
      if (node.remaining <= 0) continue;
      const dist = Math.hypot(node.tile_x - currentTile.x, node.tile_y - currentTile.y);
      if (dist <= GAME_CONFIG.INTERACT_RANGE_TILES && dist < bestDist) {
        bestDist = dist;
        closest = node;
      }
    }

    if (!closest) {
      throw new Error(
        lang === 'en'
          ? 'Only resources inside official Work Areas (East Logging Camp, South Stone Quarry, or North Fishing Lake Pier) can be gathered. Walk closer and press [F].'
          : 'Hanya resource di Area Kerja khusus (Area Kerja Kayu Timur, Tambang Batu Selatan, atau Dermaga Danau Utara) yang dapat dikumpulkan. Dekati objek lalu tekan [F].'
      );
    }

    if (closest.node_type === 'fish' && (inv.fish_bait ?? 0) < 1) {
      throw new Error(
        lang === 'en'
          ? 'You need at least 1 Lake Fishing Bait to fish! Buy Fishing Bait at Central Market or the Food Tavern.'
          : 'Kamu memerlukan minimal 1 Umpan Pancing untuk memancing di Danau! Beli Umpan Pancing di Pasar Central atau Kedai Makanan.'
      );
    }

    const spaceLeft = inv.max_capacity - this.getUsedBagUnits(inv);
    const amount = Math.min(closest.yield_amount, closest.remaining, spaceLeft);
    closest.remaining -= amount;
    writeJson(STORAGE_KEYS.WORK_NODES, nodes);

    if (closest.node_type === 'wood') inv.wood += amount;
    else if (closest.node_type === 'stone') inv.stone += amount;
    else {
      inv.fish += amount;
      inv.fish_bait = Math.max(0, (inv.fish_bait ?? 0) - 1);
    }

    inv.stamina = Math.max(0, inv.stamina - 6);
    this.saveInventory(userId, inv);
    this.lastHarvestByUser.set(userId, now);

    return {
      resource: closest.node_type,
      nodeName: lang === 'en' ? closest.name_en : closest.name_id,
      amount,
      remaining: closest.remaining,
      stamina: inv.stamina,
      fishBaitLeft: inv.fish_bait ?? 0,
    };
  }

  buyFishingBait(userId: string, lang: Lang = 'id'): Inventory {
    const inv = this.getInventory(userId);
    if (inv.coins < GAME_CONFIG.BAIT_PACK_PRICE) {
      throw new Error(
        lang === 'en'
          ? `Need ${GAME_CONFIG.BAIT_PACK_PRICE} coins to buy ${GAME_CONFIG.BAIT_PACK_QTY} Fishing Bait.`
          : `Coin tidak cukup (butuh ${GAME_CONFIG.BAIT_PACK_PRICE} coin untuk ${GAME_CONFIG.BAIT_PACK_QTY} Umpan Pancing).`
      );
    }
    if (this.getUsedBagUnits(inv) + GAME_CONFIG.BAIT_PACK_QTY > inv.max_capacity) {
      throw new Error(lang === 'en' ? 'Inventory is full.' : 'Tas sudah penuh.');
    }
    inv.coins -= GAME_CONFIG.BAIT_PACK_PRICE;
    inv.fish_bait = (inv.fish_bait ?? 0) + GAME_CONFIG.BAIT_PACK_QTY;
    return this.saveInventory(userId, inv);
  }

  getRoomOccupancy(): Record<'basic' | 'comfort' | 'suite', number> {
    const bookings = readJson<Record<string, RoomRental>>(STORAGE_KEYS.ROOM_BOOKINGS, {});
    const counts: Record<'basic' | 'comfort' | 'suite', number> = { basic: 3, comfort: 2, suite: 1 };
    const now = Date.now();
    for (const [uid, rent] of Object.entries(bookings)) {
      if (new Date(rent.expires_at).getTime() > now) {
        counts[rent.tier_id] = (counts[rent.tier_id] ?? 0) + 1;
      } else {
        delete bookings[uid];
      }
    }
    writeJson(STORAGE_KEYS.ROOM_BOOKINGS, bookings);
    return counts;
  }

  rentRoom(
    userId: string,
    tierId: 'basic' | 'comfort' | 'suite',
    durationHours: 6 | 24 | 72,
    playerPos: { x: number; y: number },
    lang: Lang = 'id'
  ): { rental: RoomRental; totalCost: number; inventory: Inventory } {
    if (Math.hypot(playerPos.x - 33, playerPos.y - 32) > 6) {
      throw new Error(
        lang === 'en'
          ? 'Please walk to the Central Inn & Rental Housing (33, 32) to rent a room.'
          : 'Berjalanlah mendekati Penginapan & Perumahan Sewa di Central (33, 32) untuk menyewa kamar.'
      );
    }

    const tier = ROOM_TIERS.find(t => t.id === tierId);
    if (!tier) throw new Error('Invalid room tier.');

    const inv = this.getInventory(userId);
    if (inv.active_room && new Date(inv.active_room.expires_at).getTime() > Date.now()) {
      throw new Error(
        lang === 'en'
          ? `You already have an active room booking (${inv.active_room.room_number}) until ${new Date(inv.active_room.expires_at).toLocaleTimeString()}.`
          : `Kamu masih memiliki sewa kamar aktif (${inv.active_room.room_number}) hingga ${new Date(inv.active_room.expires_at).toLocaleTimeString()}.`
      );
    }

    const occupancy = this.getRoomOccupancy();
    if (occupancy[tierId] >= tier.capacity) {
      throw new Error(
        lang === 'en'
          ? 'All rooms of this tier are currently occupied. Please choose another tier.'
          : 'Seluruh unit kamar tipe ini sedang penuh. Silakan pilih tipe kamar lain.'
      );
    }

    const multiplier = durationHours === 6 ? 1 : durationHours === 24 ? 3.5 : 9;
    const totalCost = Math.round(tier.base_price_per_6h * multiplier);

    if (inv.coins < totalCost) {
      throw new Error(
        lang === 'en'
          ? `Not enough coins (need ${totalCost} coins, you have ${inv.coins} coins).`
          : `Saldo coin tidak mencukupi (butuh ${totalCost} coin, saldo ${inv.coins} coin).`
      );
    }

    const now = Date.now();
    const expiresAt = new Date(now + durationHours * 3600 * 1000).toISOString();
    const roomPrefix = tierId === 'basic' ? 'A' : tierId === 'comfort' ? 'B' : 'S';
    const roomNumber = `${roomPrefix}-${String(occupancy[tierId] + 1).padStart(2, '0')}`;

    const rental: RoomRental = {
      tier_id: tierId,
      tier_name_id: tier.name_id,
      tier_name_en: tier.name_en,
      duration_hours: durationHours,
      rented_at: new Date(now).toISOString(),
      expires_at: expiresAt,
      room_number: roomNumber,
    };

    const bookings = readJson<Record<string, RoomRental>>(STORAGE_KEYS.ROOM_BOOKINGS, {});
    bookings[userId] = rental;
    writeJson(STORAGE_KEYS.ROOM_BOOKINGS, bookings);

    inv.coins -= totalCost;
    inv.active_room = rental;
    inv.stamina = Math.min(inv.max_stamina, inv.stamina + tier.stamina_bonus);
    if (tierId === 'comfort') inv.hp = Math.min(inv.max_hp, inv.hp + 25);
    if (tierId === 'suite') inv.hp = inv.max_hp;
    this.saveInventory(userId, inv);

    return { rental, totalCost, inventory: inv };
  }

  getOpenListings(): Listing[] {
    const listings = readJson<Listing[]>(STORAGE_KEYS.LISTINGS, []);
    if (listings.length === 0) {
      const seeded: Listing[] = [
        {
          id: 'seed-wood-1',
          seller_id: 'system-market',
          seller_name: 'Stok Pasar Central',
          resource_type: 'wood',
          quantity: 10,
          unit_price: 4,
          status: 'open',
          created_at: new Date().toISOString(),
        },
        {
          id: 'seed-stone-1',
          seller_id: 'system-market',
          seller_name: 'Stok Pasar Central',
          resource_type: 'stone',
          quantity: 6,
          unit_price: 7,
          status: 'open',
          created_at: new Date().toISOString(),
        },
        {
          id: 'seed-fish-1',
          seller_id: 'system-market',
          seller_name: 'Stok Dermaga Danau',
          resource_type: 'fish',
          quantity: 5,
          unit_price: 6,
          status: 'open',
          created_at: new Date().toISOString(),
        },
      ];
      writeJson(STORAGE_KEYS.LISTINGS, seeded);
      return seeded;
    }
    return listings.filter(l => l.status === 'open');
  }

  createMarketListing(
    userId: string,
    resourceType: 'wood' | 'stone' | 'fish',
    quantity: number,
    unitPrice: number,
    lang: Lang = 'id'
  ): Listing {
    const char = this.getCharacter(userId);
    if (!char) throw new Error(lang === 'en' ? 'Citizen ID required.' : 'Warga wajib memiliki KTP.');
    const qty = Math.floor(Number(quantity));
    const price = Math.floor(Number(unitPrice));
    if (qty < 1 || qty > 1000 || price < 1 || price > 100000) {
      throw new Error(
        lang === 'en'
          ? 'Quantity (1-1000) or price (1-100,000 coins) is out of range.'
          : 'Jumlah (1-1000) atau harga (1-100.000 coin) di luar batas pasar.'
      );
    }
    const inv = this.getInventory(userId);
    const available = resourceType === 'wood' ? inv.wood : resourceType === 'stone' ? inv.stone : inv.fish;
    if (available < qty) {
      throw new Error(
        lang === 'en' ? 'Not enough resource stock in your inventory.' : 'Stok resource di tas tidak mencukupi.'
      );
    }

    if (resourceType === 'wood') inv.wood -= qty;
    else if (resourceType === 'stone') inv.stone -= qty;
    else inv.fish -= qty;
    this.saveInventory(userId, inv);

    const all = readJson<Listing[]>(STORAGE_KEYS.LISTINGS, []);
    const listing: Listing = {
      id: `lst-${crypto.randomUUID()}`,
      seller_id: userId,
      seller_name: char.display_name,
      resource_type: resourceType,
      quantity: qty,
      unit_price: price,
      status: 'open',
      created_at: new Date().toISOString(),
    };
    all.unshift(listing);
    writeJson(STORAGE_KEYS.LISTINGS, all);
    return listing;
  }

  buyMarketListing(userId: string, listingId: string, lang: Lang = 'id'): Listing {
    const all = readJson<Listing[]>(STORAGE_KEYS.LISTINGS, []);
    const idx = all.findIndex(l => l.id === listingId && l.status === 'open');
    if (idx === -1) throw new Error(lang === 'en' ? 'Listing is no longer available.' : 'Penawaran sudah tidak tersedia.');
    const listing = all[idx]!;
    if (listing.seller_id === userId) {
      throw new Error(lang === 'en' ? 'Cannot buy your own listing.' : 'Tidak dapat membeli penawaran milik sendiri.');
    }

    const totalCost = listing.quantity * listing.unit_price;
    const buyerInv = this.getInventory(userId);
    if (buyerInv.coins < totalCost) {
      throw new Error(
        lang === 'en'
          ? `Not enough coins (need ${totalCost}, have ${buyerInv.coins}).`
          : `Coin tidak cukup (butuh ${totalCost} coin, saldo ${buyerInv.coins} coin).`
      );
    }
    if (this.getUsedBagUnits(buyerInv) + listing.quantity > buyerInv.max_capacity) {
      throw new Error(
        lang === 'en' ? 'Not enough bag space for this purchase.' : 'Kapasitas tas tidak cukup untuk pembelian ini.'
      );
    }

    buyerInv.coins -= totalCost;
    if (listing.resource_type === 'wood') buyerInv.wood += listing.quantity;
    else if (listing.resource_type === 'stone') buyerInv.stone += listing.quantity;
    else buyerInv.fish += listing.quantity;
    this.saveInventory(userId, buyerInv);

    if (!listing.seller_id.startsWith('system-')) {
      const sellerInv = this.getInventory(listing.seller_id);
      sellerInv.coins += totalCost;
      this.saveInventory(listing.seller_id, sellerInv);
    }

    listing.status = 'sold';
    writeJson(STORAGE_KEYS.LISTINGS, all);
    return listing;
  }

  cancelMarketListing(userId: string, listingId: string): Listing {
    const all = readJson<Listing[]>(STORAGE_KEYS.LISTINGS, []);
    const idx = all.findIndex(l => l.id === listingId && l.seller_id === userId && l.status === 'open');
    if (idx === -1) throw new Error('Listing not found.');
    const listing = all[idx]!;

    const inv = this.getInventory(userId);
    if (listing.resource_type === 'wood') inv.wood += listing.quantity;
    else if (listing.resource_type === 'stone') inv.stone += listing.quantity;
    else inv.fish += listing.quantity;
    this.saveInventory(userId, inv);

    listing.status = 'cancelled';
    writeJson(STORAGE_KEYS.LISTINGS, all);
    return listing;
  }

  sellToCentralMerchant(
    userId: string,
    resourceType: 'wood' | 'stone' | 'fish',
    quantity: number,
    lang: Lang = 'id'
  ): { coinsEarned: number } {
    const qty = Math.floor(Number(quantity));
    if (qty < 1) throw new Error(lang === 'en' ? 'Minimum 1 unit.' : 'Minimal 1 unit.');
    const inv = this.getInventory(userId);
    const available = resourceType === 'wood' ? inv.wood : resourceType === 'stone' ? inv.stone : inv.fish;
    if (available < qty) {
      throw new Error(lang === 'en' ? 'Not enough items in bag.' : 'Jumlah barang di tas tidak mencukupi.');
    }
    const unitRate = resourceType === 'wood' ? 3 : resourceType === 'stone' ? 5 : 6;
    const coinsEarned = qty * unitRate;
    if (resourceType === 'wood') inv.wood -= qty;
    else if (resourceType === 'stone') inv.stone -= qty;
    else inv.fish -= qty;
    inv.coins += coinsEarned;
    this.saveInventory(userId, inv);
    return { coinsEarned };
  }

  buyDataForm(userId: string, lang: Lang = 'id'): Inventory {
    const inv = this.getInventory(userId);
    if (inv.coins < GAME_CONFIG.DATA_FORM_PRICE) {
      throw new Error(
        lang === 'en'
          ? `Need ${GAME_CONFIG.DATA_FORM_PRICE} coins to buy a Data Change Form.`
          : `Coin tidak cukup untuk membeli Formulir Perubahan Data (${GAME_CONFIG.DATA_FORM_PRICE} coin).`
      );
    }
    inv.coins -= GAME_CONFIG.DATA_FORM_PRICE;
    inv.data_forms += 1;
    return this.saveInventory(userId, inv);
  }

  updateIdentityAtBalaiKota(
    userId: string,
    newName: string,
    newAge: number,
    newBio: string,
    playerPos: { x: number; y: number },
    lang: Lang = 'id'
  ): Character {
    if (Math.hypot(playerPos.x - 28, playerPos.y - 22) > 6) {
      throw new Error(
        lang === 'en'
          ? 'Identity changes can only be performed at Central Town Hall (28, 22).'
          : 'Perubahan data KTP hanya dapat dilakukan di Balai Kota Central (28, 22).'
      );
    }
    const allChars = readJson<Record<string, Character>>(STORAGE_KEYS.CHARACTERS, {});
    const char = allChars[userId];
    if (!char) throw new Error('Character not found.');

    const inv = this.getInventory(userId);
    if (inv.data_forms < 1) {
      throw new Error(
        lang === 'en'
          ? 'You need 1 "Data Change Form" (available at Central Market).'
          : 'Kamu memerlukan 1 "Formulir Perubahan Data" (dapat dibeli di Pasar Central).'
      );
    }

    const cleanName = validateAndModerateCharacterName(newName, lang);
    const age = Number(newAge);
    if (Number.isNaN(age) || age < 18 || age > 99) {
      throw new Error(lang === 'en' ? 'Age must be 18 to 99.' : 'Umur harus 18 sampai 99 tahun.');
    }
    const cleanBio = newBio.trim();
    if (cleanBio.length > 120) {
      throw new Error(lang === 'en' ? 'Bio max 120 characters.' : 'Deskripsi singkat maksimal 120 karakter.');
    }

    inv.data_forms -= 1;
    this.saveInventory(userId, inv);

    char.display_name = cleanName;
    char.age = age;
    char.bio = cleanBio;
    allChars[userId] = char;
    writeJson(STORAGE_KEYS.CHARACTERS, allChars);
    return char;
  }

  upgradeToPenduduk(userId: string, playerPos: { x: number; y: number }, lang: Lang = 'id'): Character {
    if (Math.hypot(playerPos.x - 28, playerPos.y - 22) > 6) {
      throw new Error(
        lang === 'en'
          ? 'Residency status upgrades are only processed at Central Town Hall.'
          : 'Peningkatan status Penduduk hanya dilayani di Balai Kota Central.'
      );
    }
    const allChars = readJson<Record<string, Character>>(STORAGE_KEYS.CHARACTERS, {});
    const char = allChars[userId];
    if (!char) throw new Error('Character not found.');
    if (char.residence_status === 'Penduduk') {
      throw new Error(lang === 'en' ? 'Already a permanent Resident.' : 'Statusmu sudah Penduduk tetap.');
    }
    const inv = this.getInventory(userId);
    if (inv.coins < GAME_CONFIG.PENDUDUK_UPGRADE_COST) {
      throw new Error(
        lang === 'en'
          ? `Requires ${GAME_CONFIG.PENDUDUK_UPGRADE_COST} coins to upgrade to Resident.`
          : `Butuh ${GAME_CONFIG.PENDUDUK_UPGRADE_COST} coin untuk menjadi Penduduk.`
      );
    }
    inv.coins -= GAME_CONFIG.PENDUDUK_UPGRADE_COST;
    this.saveInventory(userId, inv);

    char.residence_status = 'Penduduk';
    allChars[userId] = char;
    writeJson(STORAGE_KEYS.CHARACTERS, allChars);
    return char;
  }

  buyOrEquipOutfit(
    userId: string,
    itemId: string,
    lang: Lang = 'id'
  ): { character: Character; inventory: Inventory } {
    const item = OUTFIT_CATALOG.find(o => o.id === itemId);
    if (!item) throw new Error('Item not found.');

    const allChars = readJson<Record<string, Character>>(STORAGE_KEYS.CHARACTERS, {});
    const char = allChars[userId];
    if (!char) throw new Error('Character not found.');

    const inv = this.getInventory(userId);
    if (!inv.owned_outfits.includes(item.id)) {
      if (inv.coins < item.price) {
        throw new Error(
          lang === 'en'
            ? `Not enough coins (price ${item.price}, balance ${inv.coins}).`
            : `Coin belum cukup (harga ${item.price} coin, saldo ${inv.coins} coin).`
        );
      }
      inv.coins -= item.price;
      inv.owned_outfits.push(item.id);
    }

    if (item.category === 'outfit') {
      char.outfit_id = item.id;
      char.avatar_color = item.color;
    } else {
      char.hat_id = item.id;
    }

    allChars[userId] = char;
    writeJson(STORAGE_KEYS.CHARACTERS, allChars);
    this.saveInventory(userId, inv);
    return { character: char, inventory: inv };
  }

  buyConsumable(userId: string, type: 'food' | 'tea' | 'fish_meal', lang: Lang = 'id'): Inventory {
    const inv = this.getInventory(userId);
    const price =
      type === 'food'
        ? GAME_CONFIG.FOOD_PRICE
        : type === 'tea'
          ? GAME_CONFIG.TEA_PRICE
          : GAME_CONFIG.GRILLED_FISH_PRICE;
    if (inv.coins < price) {
      throw new Error(lang === 'en' ? `Need ${price} coins.` : `Coin tidak cukup (butuh ${price} coin).`);
    }
    if (this.getUsedBagUnits(inv) >= inv.max_capacity) {
      throw new Error(lang === 'en' ? 'Inventory is full.' : 'Tas sudah penuh.');
    }
    inv.coins -= price;
    if (type === 'food') inv.food_rations += 1;
    else if (type === 'tea') inv.herbal_tea += 1;
    else inv.grilled_fish += 1;
    return this.saveInventory(userId, inv);
  }

  consumeItem(userId: string, type: 'food' | 'tea' | 'fish_meal', lang: Lang = 'id'): Inventory {
    const inv = this.getInventory(userId);
    if (type === 'food') {
      if (inv.food_rations < 1) throw new Error(lang === 'en' ? 'No Rice Ration in bag.' : 'Tidak ada Bekal Nasi Rimba.');
      inv.food_rations -= 1;
      inv.stamina = Math.min(inv.max_stamina, inv.stamina + 45);
      inv.hp = Math.min(inv.max_hp, inv.hp + 10);
    } else if (type === 'tea') {
      if (inv.herbal_tea < 1) throw new Error(lang === 'en' ? 'No Herbal Tea in bag.' : 'Tidak ada Teh Herba.');
      inv.herbal_tea -= 1;
      inv.stamina = Math.min(inv.max_stamina, inv.stamina + 30);
    } else {
      if (inv.grilled_fish < 1) throw new Error(lang === 'en' ? 'No Grilled Lake Fish in bag.' : 'Tidak ada Ikan Bakar Danau.');
      inv.grilled_fish -= 1;
      inv.stamina = Math.min(inv.max_stamina, inv.stamina + 65);
      inv.hp = Math.min(inv.max_hp, inv.hp + 25);
    }
    return this.saveInventory(userId, inv);
  }

  /**
   * Section 13: Explicit Bangkit / Revive action after 10-minute death cooldown finishes.
   * Protected against double-click, refresh, or premature calls.
   */
  reviveCharacterAtHospital(userId: string, lang: Lang = 'id'): Inventory {
    if (this.reviveInProgressUsers.has(userId)) {
      throw new Error(lang === 'en' ? 'Revive already in progress.' : 'Proses Bangkit sedang berlangsung.');
    }
    this.reviveInProgressUsers.add(userId);
    try {
      const inv = this.getInventory(userId);
      if (!inv.dead_until && !inv.awaiting_revive) {
        throw new Error(lang === 'en' ? 'Character is already alive.' : 'Karakter sudah dalam kondisi aktif.');
      }
      if (inv.dead_until && new Date(inv.dead_until).getTime() > Date.now()) {
        const remSec = Math.ceil((new Date(inv.dead_until).getTime() - Date.now()) / 1000);
        throw new Error(
          lang === 'en'
            ? `Cannot revive yet. Cooldown remaining: ${remSec}s.`
            : `Belum dapat Bangkit. Sisa waktu cooldown: ${remSec} detik.`
        );
      }
      inv.dead_until = null;
      inv.awaiting_revive = false;
      inv.player_status = 'active';
      inv.hp = inv.max_hp;
      inv.stamina = inv.max_stamina;
      this.savePosition(userId, 34, 28);
      return this.saveInventory(userId, inv);
    } finally {
      this.reviveInProgressUsers.delete(userId);
    }
  }

  healAtClinic(userId: string, lang: Lang = 'id'): Inventory {
    const downed = this.isDownedOrWaitingRevive(userId);
    if (downed.downed) {
      return this.reviveCharacterAtHospital(userId, lang);
    }
    const inv = this.getInventory(userId);
    if (inv.hp >= inv.max_hp && inv.stamina >= inv.max_stamina) {
      throw new Error(
        lang === 'en' ? 'Your HP and Stamina are already full.' : 'Kesehatan dan stamina karaktermu sudah penuh.'
      );
    }
    if (inv.coins < GAME_CONFIG.CLINIC_HEAL_COST) {
      throw new Error(
        lang === 'en'
          ? `Hospital treatment costs ${GAME_CONFIG.CLINIC_HEAL_COST} coins.`
          : `Biaya perawatan Rumah Sakit adalah ${GAME_CONFIG.CLINIC_HEAL_COST} coin.`
      );
    }
    inv.coins -= GAME_CONFIG.CLINIC_HEAL_COST;
    inv.hp = inv.max_hp;
    inv.stamina = Math.min(inv.max_stamina, inv.stamina + 50);
    return this.saveInventory(userId, inv);
  }

  prayAtSanctuary(userId: string, optionId: string, playerPos: { x: number; y: number }, lang: Lang = 'id'): { inv: Inventory; label: string } {
    if (Math.hypot(playerPos.x - 22, playerPos.y - 23) > 6) {
      throw new Error(
        lang === 'en'
          ? 'Please walk to the Central House of Worship (22, 23).'
          : 'Berjalanlah ke Tempat Ibadah Central (22, 23) terlebih dahulu.'
      );
    }
    const opt = WORSHIP_OPTIONS.find(o => o.id === optionId) ?? WORSHIP_OPTIONS[0]!;
    const inv = this.getInventory(userId);
    inv.stamina = Math.min(inv.max_stamina, inv.stamina + 35);
    inv.hp = Math.min(inv.max_hp, inv.hp + 15);
    return {
      inv: this.saveInventory(userId, inv),
      label: lang === 'en' ? opt.label_en : opt.label_id,
    };
  }

  /**
   * Section 10: Player attacks a monster (Slime in Upper Dungeon or Goblin in Lower Dungeon) using Spacebar.
   * Attacking a monster NEVER reduces player HP!
   */
  recordMonsterDefeatReward(
    userId: string,
    monsterType: 'slime' | 'goblin',
    langOrPos: Lang | { x: number; y: number } = 'id',
    maybeLang: Lang = 'id'
  ): { coinsEarned: number; shardEarned: number; message: string } {
    const lang: Lang = typeof langOrPos === 'string' ? langOrPos : maybeLang;
    const inv = this.getInventory(userId);
    const stats = GAME_CONFIG.MONSTER_STATS[monsterType];
    inv.coins += stats.coinReward;
    let shardEarned = 0;
    if (this.getUsedBagUnits(inv) + stats.shardReward <= inv.max_capacity) {
      inv.crystal_shard += stats.shardReward;
      shardEarned = stats.shardReward;
    }
    this.saveInventory(userId, inv);
    const name = lang === 'en' ? stats.name_en : stats.name_id;
    return {
      coinsEarned: stats.coinReward,
      shardEarned,
      message:
        lang === 'en'
          ? `Defeated ${name}! +${stats.coinReward} Coins${shardEarned ? `, +${shardEarned} Crystal Shard` : ''}.`
          : `Mengalahkan ${name}! +${stats.coinReward} Coin${shardEarned ? `, +${shardEarned} Pecahan Kristal` : ''}.`,
    };
  }

  /**
   * Section 10: Monster counterattacks player when player is within monster attack range inside the dungeon.
   * Never damages players in Central, roads, lake, work areas, or Bank.
   * Bank savings (`bank_balance`) are 100% protected from the 10% death penalty!
   */
  applyMonsterCounterAttack(
    userId: string,
    monsterType: 'slime' | 'goblin',
    langOrPos: Lang | { x: number; y: number } = 'id',
    maybeLang: Lang = 'id'
  ): { damage: number; hp: number; maxHp: number; died: boolean; penalty: number; message: string } {
    const lang: Lang = typeof langOrPos === 'string' ? langOrPos : maybeLang;
    const inv = this.getInventory(userId);
    if (this.isDownedOrWaitingRevive(userId).downed) {
      return { damage: 0, hp: inv.hp, maxHp: inv.max_hp, died: false, penalty: 0, message: '' };
    }

    const stats = GAME_CONFIG.MONSTER_STATS[monsterType];
    inv.hp = Math.max(0, inv.hp - stats.damage);

    if (inv.hp <= 0) {
      // Only carried coins (`inv.coins`) are penalized 10%; `inv.bank_balance` is untouched!
      const penalty = Math.floor(inv.coins * GAME_CONFIG.DEATH_PENALTY_RATE);
      inv.coins = Math.max(0, inv.coins - penalty);
      inv.last_death_penalty = penalty;
      inv.last_death_id = `death-${Date.now()}`;
      inv.dead_until = new Date(Date.now() + GAME_CONFIG.DEATH_COOLDOWN_MS).toISOString();
      inv.awaiting_revive = true;
      inv.player_status = 'recovering';
      this.saveInventory(userId, inv);
      const mName = lang === 'en' ? stats.name_en : stats.name_id;
      return {
        damage: stats.damage,
        hp: 0,
        maxHp: inv.max_hp,
        died: true,
        penalty,
        message:
          lang === 'en'
            ? `Defeated by ${mName}! Carried coins -10% (-${penalty} coins; Bank savings untouched). Wait 10m cooldown then click Revive.`
            : `Kamu gugur diserang ${mName}! Coin dibawa -10% (-${penalty} coin; tabungan Bank aman). Tunggu cooldown 10 menit lalu tekan Bangkit / Revive.`,
      };
    }

    this.saveInventory(userId, inv);
    const mName = lang === 'en' ? stats.name_en : stats.name_id;
    return {
      damage: stats.damage,
      hp: inv.hp,
      maxHp: inv.max_hp,
      died: false,
      penalty: 0,
      message:
        lang === 'en'
          ? `${mName} hit you (-${stats.damage} HP · HP ${inv.hp}/${inv.max_hp})`
          : `${mName} menyerangmu (-${stats.damage} HP · HP ${inv.hp}/${inv.max_hp})`,
    };
  }

  // Returns simulated AFK citizens (registered citizen accounts in Wilayah 1)
  getSimulatedRegionAfkCitizens(): SimulatedAfkCitizen[] {
    const list: SimulatedAfkCitizen[] = [
      {
        id: 'sim-afk-1',
        display_name: 'Nadia',
        model_id: 'female-01',
        activity: 'stroll',
        waypoints: [
          { x: 26, y: 30 },
          { x: 30, y: 30 },
          { x: 30, y: 26 },
          { x: 26, y: 26 },
        ],
        phaseOffset: 0,
      },
      {
        id: 'sim-afk-2',
        display_name: 'Rizky',
        model_id: 'male-02',
        activity: 'wood',
        waypoints: [
          { x: 43, y: 27 },
          { x: 46, y: 28 },
          { x: 44, y: 30 },
        ],
        phaseOffset: 17,
      },
      {
        id: 'sim-afk-3',
        display_name: 'Bagas',
        model_id: 'male-05',
        activity: 'stone',
        waypoints: [
          { x: 37, y: 44 },
          { x: 40, y: 45 },
          { x: 38, y: 46 },
        ],
        phaseOffset: 33,
      },
      {
        id: 'sim-afk-4',
        display_name: 'Kirana',
        model_id: 'female-04',
        activity: 'fish',
        waypoints: [
          { x: 27, y: 14 },
          { x: 29, y: 14 },
        ],
        phaseOffset: 49,
      },
      {
        id: 'sim-afk-5',
        display_name: 'Aldo',
        model_id: 'male-08',
        activity: 'dungeon',
        waypoints: [
          { x: 9, y: 12 },
          { x: 11, y: 11 },
        ],
        phaseOffset: 65,
      },
    ];
    return list.slice(0, GAME_CONFIG.MAX_SIMULATED_AFK_PER_REGION);
  }

  getWorldRegionAndNewsStats(onlineNowCount = 1) {
    const chars = Object.values(readJson<Record<string, Character>>(STORAGE_KEYS.CHARACTERS, {}));
    const simCitizens = this.getSimulatedRegionAfkCitizens();
    // Total registered citizens in Wilayah 1 (18 registered citizens in Region 1, capped at 25)
    const totalRegisteredCitizens = Math.min(GAME_CONFIG.REGION_CAPACITY, Math.max(18, 17 + chars.length));
    const totalPermanentResidents = chars.filter(c => c.residence_status === 'Penduduk').length + 7;
    const activeOnlinePlayers = Math.max(1, onlineNowCount);

    return {
      regionName: 'Wilayah 1',
      regionCapacity: GAME_CONFIG.REGION_CAPACITY,
      totalRegisteredCitizens,
      totalPermanentResidents,
      onlineNow: activeOnlinePlayers,
      activeOnlinePlayers,
      visualAfkActive: simCitizens.length,
      visualSimulatedAfkActive: simCitizens.length,
      regionPopulationDisplay: `${totalRegisteredCitizens} / ${GAME_CONFIG.REGION_CAPACITY}`,
      afkDistribution: {
        stroll: 50,
        wood: 35,
        stone: 30,
        fish: 30,
        dungeon: 5,
      },
      news: [
        {
          id: 'news-rev-afk-vault',
          date: '03 November 2026',
          category_id: 'AFK',
          category_en: 'AFK',
          title_id: 'Pembaruan Siklus AFK 3 Menit & Penampung Hasil AFK (60%)',
          title_en: '3-Minute AFK Cycle & AFK Rewards Holding Vault (60%)',
          body_id:
            'Siklus AFK kini berlangsung selama 3 menit berkeliling aman dan 3 menit bekerja secara bergantian (Kayu, Batu, Memancing, serta 5% peluang ke Dungeon dengan 5% risiko gugur). Seluruh hasil AFK (efisiensi 60%) disimpan di menu Hasil AFK untuk diklaim manual.',
          body_en:
            'AFK cycles now alternate between 3 minutes strolling and 3 minutes working (Wood, Stone, Fishing, plus a 5% Dungeon chance with 5% defeat risk). All AFK rewards (60% efficiency) enter the AFK Rewards vault for manual claiming.',
        },
        {
          id: 'news-rev-bank',
          date: '03 November 2026',
          category_id: 'Ekonomi',
          category_en: 'Economy',
          title_id: 'Pembukaan Bank Rimba Central & Bunga Harian 3% (12:00 WIB)',
          title_en: 'Rimba Central Bank Opening & 3% Daily Interest (12:00 WIB)',
          body_id:
            'Warga kini dapat menyetor dan menarik coin langsung di bangunan Bank Rimba (25, 22). Coin di tabungan aman dari penalti kematian 10% dan memperoleh bunga 3% per hari setiap pukul 12:00 WIB.',
          body_en:
            'Citizens can now deposit and withdraw coins directly at Rimba Bank (25, 22). Bank savings are protected from the 10% death penalty and earn 3% daily interest reset at 12:00 WIB.',
        },
        {
          id: 'news-rev-dungeon-arena',
          date: '03 November 2026',
          category_id: 'Dungeon',
          category_en: 'Dungeon',
          title_id: 'Mekanik Monster Slime & Goblin, Serangan Spasi, serta Zona Arena PvP',
          title_en: 'Slime & Goblin Monster Mechanics, Spacebar Attack & PvP Arena Zone',
          body_id:
            'Dungeon Atas kini dihuni Slime dan Dungeon Bawah dihuni Goblin (tanpa boss). Gunakan tombol Spasi untuk menyerang tanpa mengurangi HP sendiri; HP hanya berkurang bila monster menyerang balik. Arena kini menjadi zona fisik PvP aktif.',
          body_en:
            'Upper Dungeon now hosts Slimes and Lower Dungeon hosts Goblins (no bosses). Press Spacebar to attack without self-damage; HP only drops when a monster counterattacks. The Arena is now a live physical PvP zone.',
        },
        {
          id: 'news-rev-revive-ui',
          date: '03 November 2026',
          category_id: 'Gameplay',
          category_en: 'Gameplay',
          title_id: 'Sistem Tombol Bangkit / Revive, Penghapusan NPC & Kontrol Kamera Klik Kanan',
          title_en: 'Manual Revive Button, All-Player World (No NPCs) & Right-Click Camera Drag',
          body_id:
            'Seluruh NPC telah dihapus sehingga dunia Rimba murni dihuni karakter pemain ber-KTP. Setelah cooldown pingsan 10 menit mencapai 00:00, tekan tombol Bangkit / Revive untuk respawn di Rumah Sakit. Gunakan klik kanan tahan & geser untuk menggerakkan kamera kapan saja.',
          body_en:
            'All NPCs have been removed so Rimba is purely inhabited by KTP player characters. When the 10-minute defeat cooldown hits 00:00, click Revive to respawn at the Hospital. Hold right-click & drag to pan the camera anytime.',
        },
        {
          id: 'news-rev-ktp-ui',
          date: '03 November 2026',
          category_id: 'UI',
          category_en: 'UI',
          title_id: 'Perbaikan Bingkai Avatar KTP & Jam Dunia WIB Real-Time',
          title_en: 'KTP Avatar Frame Fix & Real-Time WIB World Clock',
          body_id:
            'Tampilan avatar Chibi pada kartu KTP utama dan detail KTP telah diperbaiki agar utuh dan proporsional di desktop maupun ponsel, dilengkapi indikator jam WIB (Asia/Jakarta) di bar atas.',
          body_en:
            'Chibi avatar framing on the main KTP dock and KTP detail modal has been fixed so head and body render proportionally on desktop and mobile, alongside a live WIB (Asia/Jakarta) clock in the top bar.',
        },
      ],
      creator: {
        name: 'Dhitya (Dhityavv)',
        role_id: 'Kreator, Arsitek Dunia & Pengembang Utama Rimba',
        role_en: 'Creator, World Architect & Lead Developer of Rimba',
        vision_id:
          'Rimba dibangun sebagai dunia web survival-town 2.5D yang hangat, tertib, dan hidup—mengutamakan interaksi langsung di dunia, ekonomi yang adil, serta komunitas warga yang saling menghormati.',
        vision_en:
          'Rimba is crafted as a warm, orderly, and living 2.5D survival-town web world—prioritizing direct world interaction, fair player economy, and a respectful community.',
        websiteUrl: 'https://dhitya-space.vercel.app/',
        tiktokUrl: 'https://www.tiktok.com/@dhityavv',
        saweriaUrl: 'https://saweria.co/dhityavv',
        website_url: 'https://dhitya-space.vercel.app/',
        tiktok_url: 'https://www.tiktok.com/@dhityavv',
        saweria_url: 'https://saweria.co/dhityavv',
        repo: 'github.com/Dhityavv/Rimba',
        version: 'v3.2 — UI, AFK Vault, Bank & Monster Update',
      },
    };
  }
}

export const localBackend = new LocalGameBackend();
