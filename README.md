# Rimba — Survival-Town 2.5D Multiplayer

Dunia sosial survival-town 2.5D isometrik berbasis browser bergaya **Pastel Isometric Fantasy Town** dengan dukungan **Mode Penonton**, **Mode Tamu (Guest Mode — tanpa email)**, **2 Bahasa (`Bahasa Indonesia | English`)**, sistem **KTP Game**, **Warga vs Penduduk**, **8 Fasilitas Central** (interaksi langsung di peta dengan tombol `F`), **3 Area Kerja Resmi**, **2 Dungeon**, dan **Colosseum Arena PvP**.

## Perbaikan Utama & Fitur Baru (Revisi Terbaru)

1. **Peta Isometrik 2.5D Bergaya *Pastel Isometric Fantasy Town* (`56 × 56`)**:
   - Alun-alun Central berbenteng batu dengan 4 gerbang, jalan cobble, dan Air Mancur Kristal di `(28, 28)`.
   - 8 bangunan Central ikonik: **Balai Kota** `(28, 22)` dengan menara jam, **Rumah Sakit** `(34, 27)`, **Academy (`Coming Soon`)** `(33, 23)`, **Pasar** `(23, 32)`, **Toko Pakaian** `(22, 27)`, **Tempat Ibadah** `(23, 23)`, **Kedai Makanan & Minuman** `(28, 33)`, dan **Penginapan / Sewa Kamar** `(33, 32)`.
   - Bentang alam luar: **Danau Besar Utara & Dermaga Memancing** `(28, 14)`, **Pantai Barat Daya & Mercusuar** `(12, 34)`, **Area Kerja Kayu** `(44, 28)`, **Area Kerja Batu** `(38, 45)`, **Dungeon 1 Gua Kristal** `(9, 10)`, **Dungeon 2 Reruntuhan Kuno** `(47, 46)`, dan **Colosseum Arena PvP** `(45, 11)`.
2. **Perbaikan Bug Layar Macet di Pojok Kiri Bawah & Mode Tamu**:
   - Memperbaiki bug konversi ganda `tileToWorld` di `WorldScene.update()` sehingga kamera dan karakter selalu berada tepat di koordinat dunia yang benar.
   - Mode Tamu (`Main sebagai tamu — tanpa email`) langsung bekerja baik dengan Supabase maupun melalui fallback *Local Authoritative Store* (`/src/localStore.ts`).
3. **Tata Letak UI Baru & Interaksi Langsung (`F` / `E`)**:
   - Menghapus panel tombol pintas fasilitas di sisi kanan layar; pemain wajib berjalan ke bangunan di peta dan menekan **`F`** (atau klik bangunan) untuk berinteraksi.
   - Sisi kanan layar menampilkan **KTP Game** dan tombol **Inventori (`E`)**.
   - Indikator atas digabung menjadi satu pil ringkas: `Rimba • Wilayah 1 • 1 online`.
   - Tombol **Panduan / Guide** tersedia di pojok kanan bawah.
4. **Dukungan Penuh 2 Bahasa (`ID | EN`)**:
   - Sakelar bahasa `ID | EN` di topbar mengubah seluruh teks UI, dialog fasilitas, KTP, inventori, panduan, dan notifikasi secara instan.

## Dokumentasi Arsitektur & Desain

- [`architecture.md`](./architecture.md) — Kontrak teknis, invarian koordinat isometrik, geometri peta `56 × 56`, dan aturan state.
- [`design.md`](./design.md) — Panduan art direction *Pastel Isometric Fantasy Town*, palet warna, tipografi, dan tata letak HUD.
