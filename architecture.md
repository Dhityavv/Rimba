# ARCHITECTURE.md — Rimba: Survival Town (2.5D Isometric Web Engine)

> **MANDATORY INSTRUCTION FOR AI AGENTS:**
> Before modifying any code in this repository, read both `architecture.md` and `design.md`. Every architectural invariant below exists to prevent regressions in coordinate math, spectator/citizen permissions, proximity-based gameplay, AFK simulation, Bank interest, monster combat, and economy security.

---

## 1. Core Coordinate & Camera Invariant (CRITICAL — DO NOT BREAK)

The world is a **56 × 56 isometric tile grid** (`tx, ty ∈ [0..55]`), with **Central Safe Zone** spanning `tx ∈ [21..35], ty ∈ [21..35]` and default spawn at `(28, 30)`.

### Isometric Projection Formulas (`src/main.ts`)
- **Tile → World Pixel (`tileToWorld`)**:
  ```ts
  wx = (tx - ty) * 32;
  wy = (tx + ty) * 16;
  ```
- **World Pixel → Tile (`worldToTile` / `worldToTileFloat`)**:
  ```ts
  tx = (wx / 32 + wy / 16) / 2;
  ty = (wy / 16 - wx / 32) / 2;
  ```
- **Invariant**: `this.worldPos` in `WorldScene` is **ALWAYS stored in World Pixel Coordinates `(wx, wy)`**.
  - **NEVER** pass `this.worldPos.x, this.worldPos.y` into `tileToWorld()` again (doing so multiplies coordinates by 32× and locks the camera in the void).
  - Camera bounds are `setBounds(-1950, -260, 3900, 2250)` so the entire 56×56 diamond (`X: [-1792..1792], Y: [0..1792]`) can be traversed smoothly.

---

## 2. Pure Player World (Zero NPCs) & Zone Rules (`src/localStore.ts`)

1. **Zero NPCs (`WORLD_NPCS = []`)**:
   - The world contains **no NPCs** (no NPC merchants, guards, ambient villagers, or bot stand-ins).
   - Every character rendered in the world is a real registered player account with a KTP (either online manual control or simulated AFK from registered accounts).
   - Facilities are accessed directly through building proximity (`[F]` or left-clicking the building).
2. **Central Safe Zone (`tx: 21..35, ty: 21..35`)**:
   - Walled limestone plaza with a central **Crystal Fountain (`28, 28`)** and four stone gate bridges.
   - **Zero PvP / Zero Monster Damage**: `PvP = OFF` is strictly enforced inside Central.
   - **Facilities inside Central (Walk-to-Interact within 4.4 tiles)**:
     - **Balai Kota / Town Hall (`28, 22`)**: Upgrade residency (`Warga` → `Penduduk`) and update KTP identity (`display_name`, `age`, `bio`) using 1 `Formulir Perubahan Data` while preserving `citizen_number`.
     - **Bank Rimba / Rimba Bank (`25, 22`)**: Deposit (`Setor`) and withdraw (`Tarik`) coins when standing near the Bank building. Coins saved in Bank (`bank_balance`) are 100% protected from the 10% death penalty and earn **3% daily interest** (`Math.floor(bank_balance * 0.03)`) processed idempotently at **12:00 WIB (`Asia/Jakarta`, UTC+7)**.
     - **Rumah Sakit / Central Hospital (`34, 27`)**: Heal HP and post-death manual revival point (`34, 28`).
     - **Pasar / Central Market (`23, 32`)**: Player-to-player escrow listings, cooperative selling, `Formulir Perubahan Data`, and **Lake Fishing Bait (`Umpan Pancing Danau`)**.
     - **Toko Pakaian / Boutique (`22, 27`)**: Buy and equip outfits and hats.
     - **Kedai Makanan / Food Tavern (`28, 33`)**: Buy and consume stamina/HP meals and fishing bait.
     - **Tempat Ibadah / House of Worship (`23, 23`)**: Multi-faith respectful prayer & reflection.
     - **Penginapan / Central Inn (`33, 32`)**: Tiered room rental (`Kamar Dasar`, `Kamar Nyaman`, `Suite Agung`) for `6 Hours`, `1 Day`, or `3 Days`.
     - **Academy (`33, 23`)**: Marked **`Coming Soon`**.
3. **Simplified Dungeon Monsters & Physical Arena PvP Zone**:
   - **Upper Dungeon (`dungeon1`, `tx: 6..13, ty: 7..14`)**: Spawns **Slime** only (`HP 45`, counterattack `-8 HP`).
   - **Lower Dungeon (`dungeon2`, `tx: 44..51, ty: 43..50`)**: Spawns **Goblin** only (`HP 75`, counterattack `-14 HP`). No boss monsters.
   - **Spacebar Combat (`Spasi`)**: Pressing `Space` attacks the nearest monster in range (`2.5` tiles) for `25` damage. **Attacking a monster NEVER reduces player HP.** Player HP only decreases when a monster chases (within `3.8` tiles inside its dungeon) and counterattacks (within `1.65` tiles on a `1.8s` cooldown). Monsters never leave dungeon bounds.
   - **Physical Arena PvP (`tx: 45, ty: 11`, radius `4.8`)**: Arena is a physical map zone, not a modal button that deducts HP. Entering the Arena sets `PvP = ON`; leaving sets `PvP = OFF`.
4. **10-Minute Death Cooldown & Manual Revive (`Bangkit / Revive`)**:
   - When HP reaches `0`, carried coins (`inv.coins`, excluding `bank_balance`) drop by **10% once** (`Math.floor(coins * 0.10)`). Inventory items are never dropped.
   - When the 10-minute timer reaches `00:00`, the character **does not auto-respawn**; it enters `waiting_revive` until the player clicks the **`Bangkit / Revive`** button (`reviveCharacterAtHospital`), which restores HP and places the character at Central Hospital (`34, 28`).

---

## 3. Controls & Camera Architecture (`src/main.ts`)

| Input | Function |
|---|---|
| `WASD` / Arrow Keys | Move character |
| `Left-Click` | Walk to clicked point / interact with building or resource node (never primary attack) |
| `Space` (`Spasi`) | Attack valid target in range |
| `E` | Open / close Inventory |
| `F` | Contextual interaction / gather resource / use facility |
| `Right-Click Hold & Drag` | Pan / move camera at **any time** (alive, AFK, downed, waiting for revive, or spectator) |

---

## 4. 3-Minute AFK Cycle, 60% Holding Vault & Region 1 Population

1. **Entering & Exiting AFK (`30 Seconds`)**:
   - After **30 seconds without valid input** (`AFK_IDLE_TIMEOUT_MS = 30_000`), a Citizen character enters AFK mode and its overhead label changes from `Nama` to `Nama (AFK)`.
   - Giving any valid input immediately removes `(AFK)` and restores manual control.
2. **3-Minute Stroll + 3-Minute Work Cycle (`AFK_PHASE_MS = 180_000`)**:
   - Alternates **3 minutes strolling** on safe paths and **3 minutes working** on 1 random job (`wood`, `stone`, `fish`, plus a **5% chance** to visit low-risk Dungeon with a **5% death chance**).
   - Each 3-minute work period focuses on a single job and never repeats `last_afk_work_activity` consecutively.
3. **60% Efficiency & Temporary Holding Vault (`inv.afk_vault`)**:
   - All AFK gains are calculated at **60% efficiency** (`AFK_EFFICIENCY_RATE = 0.60`) and stored in `inv.afk_vault` (`Hasil AFK`).
   - Rewards move into main inventory/coins **only** when the player clicks **`Klaim / Claim`** (`claimAfkVault`), with double-click and full-bag protection.
4. **Region 1 Population & Creator Links**:
   - Region 1 (`Wilayah 1`, capacity `25`) displays `Total penduduk terdaftar: 18`, `Simulasi AFK / populasi wilayah: 18 / 25`, and an honest note (`Visual AFK aktif: 5 dari 18 penduduk terdaftar`).
   - Creator Info includes external buttons (`target="_blank" rel="noopener noreferrer"`) for `https://dhitya-space.vercel.app/`, `https://www.tiktok.com/@dhityavv`, and `https://saweria.co/dhityavv`.
