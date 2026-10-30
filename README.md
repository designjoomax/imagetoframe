# Frame Image - Joomax

Website statis untuk menambahkan frame ke foto. Live: https://designjoomax.github.io/frame/

Header/footer dan widget TIDAK ada di repo ini. Keduanya dimuat dari repo lain lewat GitHub Pages:

| Bagian | Repo | URL |
|---|---|---|
| Header & Footer | `headerfooter` | https://designjoomax.github.io/headerfooter/ |
| Widget Fixs.Arts | `widget` | https://designjoomax.github.io/widget/ |

Mengubah menu/footer atau popup: edit di repo masing-masing, bukan di sini.
Konsekuensinya, website ini butuh internet untuk memuat header, footer, dan widget (termasuk saat dibuka lokal).

## Struktur
```
index.html
update-frames.bat    <- klik setelah mengubah isi assets/frame/
jalankan-lokal.bat
css/style.css        <- tampilan aplikasi
js/                  <- app.js, config.js, frames.js, frames-data.js, vendor/
tools/               <- update-frames.ps1, embed-frames.html
assets/              <- favicon.png, frame/
```

## Menambah / mengganti frame
1. Taruh `.png` transparan di `assets/frame/`.
2. Klik dua kali `update-frames.bat` (Windows). Mac/Linux: buka `tools/embed-frames.html`, simpan hasilnya ke `js/`.

Urutan & nama lewat nama file: `1 Frame Joomax.png` -> "Frame Joomax" di urutan 1. Tanpa angka = setelah yang bernomor.
Setiap kali menambah, menghapus, atau mengganti nama frame, jalankan lagi langkah 2.

## Fitur
Upload banyak foto (JPG/PNG/WEBP/HEIC), geser & zoom, rotasi 90°, flip, Gaussian blur background (default 20 px), urutan drag, frame sama atau beda tiap foto, hasil otomatis di bawah 2 MB (`js/config.js`), ZIP bernama `Frame Joomax by Fixs.Arts.zip`.

## Deploy (GitHub Pages)
Upload isi folder ini ke root repo `frame`, lalu Settings > Pages > Deploy from branch > `main` / `(root)`.
