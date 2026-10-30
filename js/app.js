(() => {
  const { maxBytes: MAX } = window.JOOMAX_CONFIG;
  const $ = (s) => document.querySelector(s);
  const MAXZ = 4, MIN_ZOOM = 0.2, PREVIEW_W = 640, BLUR_DEFAULT = 20, BLUR_MAX = 100;
  const ZIP_NAME = "Frame Joomax by Fixs.Arts.zip";
  const HEIC_SRCS = ["js/vendor/heic2any.min.js", "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js"];
  const state = { frames: [], current: 0, per: false, items: [], sel: null };
  const frameIdx = (it) => (state.per ? it.frameIdx : state.current);
  const frameOf = (it) => state.frames[frameIdx(it)].img;
  const pos = (it) => state.items.indexOf(it) + 1; // urutan foto = nama file hasil (1, 2, 3, ...)

  // ---------- Util ----------
  const loadImage = (src) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("gagal load " + src));
    img.src = src;
  });
  const toBlob = (c, type, q) => new Promise((res, rej) => { try { c.toBlob(res, type, q); } catch (e) { rej(e); } });
  const fmt = (b) => (b / 1024 / 1024).toFixed(2) + " MB";
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // Skala zoom: -100 (0.2x) .. 0 (pas memenuhi frame) .. +100 (4x)
  const fromZ = (z) => (z >= 0 ? Math.pow(MAXZ, z / 100) : Math.pow(MIN_ZOOM, -z / 100));
  const toZ = (f) => (f >= 1 ? (100 * Math.log(f)) / Math.log(MAXZ) : (-100 * Math.log(f)) / Math.log(MIN_ZOOM));
  const newCanvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });

  // ---------- Frame ----------
  // Daftar frame dibuat otomatis dari assets/frame/ oleh update-frames.bat -> js/frames.js
  // ("1 Frame Joomax.png" => urutan 1, nama "Frame Joomax"). Saat dibuka lewat file://, frame dibaca dari
  // js/frames-data.js supaya download tidak diblokir browser.
  const loadScript = (src) => new Promise((res, rej) => {
    const el = document.createElement("script"); el.src = src; el.onload = res; el.onerror = rej; document.head.appendChild(el);
  });
  async function loadFrames() {
    if (location.protocol === "file:") { try { await loadScript("js/frames-data.js"); } catch { /* belum dibuat */ } }
    const data = window.JOOMAX_FRAME_DATA || {}, list = window.JOOMAX_FRAMES || [];
    const loaded = await Promise.all(list.map(async (f) => {
      const src = data[f.file] || "assets/frame/" + encodeURIComponent(f.file);
      try { return { name: f.name, img: await loadImage(src), src }; }
      catch { console.warn("File frame tidak ditemukan:", f.file); return null; }
    }));
    state.frames = loaded.filter(Boolean);
    const box = $("#frames");
    if (!state.frames.length) {
      box.innerHTML = '<p class="muted">Belum ada frame. Taruh file .png di assets/frame/ lalu klik dua kali update-frames.bat.</p>';
      return;
    }
    const bad = state.frames.some((f) => { try { const g = newCanvas(1, 1).getContext("2d"); g.drawImage(f.img, 0, 0, 1, 1); g.getImageData(0, 0, 1, 1); return false; } catch { return true; } });
    if (bad) { const w = $("#warn"); w.hidden = false;
      w.textContent = "Download diblokir browser karena frame dibaca dari file lokal. Klik dua kali update-frames.bat (atau buka tools/embed-frames.html), atau jalankan lewat server / GitHub Pages."; }
    state.frames.forEach((f, i) => {
      const b = document.createElement("button"), im = new Image(), label = document.createElement("span");
      const fmtName = displayFrameName(f.name, f.src || f.file);
      b.type = "button"; b.className = "frame"; b.title = fmtName; b.setAttribute("aria-label", fmtName); b.setAttribute("role", "radio");
      im.alt = ""; im.src = f.src; label.className = "frame-name"; label.textContent = fmtName;
      b.appendChild(im); b.appendChild(label);
      b.onclick = () => {
        state.current = i;
        if (state.per) { if (state.sel) { state.sel.frameIdx = i; refresh(state.sel); } }
        else state.items.forEach((it) => { it.frameIdx = i; refresh(it); });
        syncFrameList();
      };
      box.appendChild(b);
    });
    syncFrameList();
  }
  function syncFrameList() {
    const idx = state.per && state.sel ? state.sel.frameIdx : state.current;
    document.querySelectorAll("#frames .frame").forEach((b, j) => b.setAttribute("aria-checked", j === idx));
  }
  function displayFrameName(name, fallback = "") {
    const raw = (name || fallback || "").replace(/\.[^/.]+$/, "").trim();
    const cleaned = raw.replace(/^\s*(\d+)\s*([\s._-]+)\s*/, "").trim();
    return cleaned || raw || "Frame";
  }

  // ---------- Blur ----------
  // Safari lama tidak punya ctx.filter, jadi ada cadangan: box blur 3x (hasilnya mendekati Gaussian)
  const HAS_FILTER = (() => { const g = newCanvas(1, 1).getContext("2d"); g.filter = "blur(2px)"; return g.filter === "blur(2px)"; })();
  function boxLine(src, dst, start, stride, n, r) {
    for (let c = 0; c < 4; c++) {
      const s0 = start + c, at = (i) => src[s0 + clamp(i, 0, n - 1) * stride];
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += at(i);
      for (let i = 0; i < n; i++) { dst[s0 + i * stride] = sum / (2 * r + 1); sum += at(i + r + 1) - at(i - r); }
    }
  }
  function blurData(img, sigma) {
    const { width: w, height: h, data } = img, r = Math.max(1, Math.round(sigma));
    const tmp = new Uint8ClampedArray(data.length);
    for (let p = 0; p < 3; p++) {
      for (let y = 0; y < h; y++) boxLine(data, tmp, y * w * 4, 4, w, r);
      for (let x = 0; x < w; x++) boxLine(tmp, data, x * 4, w * 4, h, r);
    }
  }

  // ---------- Gambar (rotasi, flip, zoom, geser) ----------
  // Foto digambar di titik tengah (cx, cy) dengan skala s: flip di ruang layar, lalu rotasi.
  function drawPhoto(g, it, cx, cy, s) {
    const bw = it.bitmap.width * s, bh = it.bitmap.height * s;
    g.save(); g.translate(cx, cy); g.scale(it.fx ? -1 : 1, it.fy ? -1 : 1); g.rotate((it.rot * Math.PI) / 180);
    g.drawImage(it.bitmap, -bw / 2, -bh / 2, bw, bh);
    g.restore();
  }
  function geom(it, W, H) {
    const sw = it.rot % 180 !== 0, bw = it.bitmap.width, bh = it.bitmap.height;
    const ew = sw ? bh : bw, eh = sw ? bw : bh; // ukuran foto setelah diputar
    return { ew, eh, s0: Math.max(W / ew, H / eh) };
  }
  // Layer blur: foto yang sama (ikut rotasi/flip), ukuran "cover", diperbesar sedikit supaya tepinya tidak pudar
  function blurLayer(it, W, H, sigma, cache) {
    const key = [W, H, sigma.toFixed(2), it.rot, it.fx, it.fy].join();
    if (cache && it.bk === key) return it.bc;
    const { ew, eh } = geom(it, W, H), m = Math.ceil(sigma * 2.5), s = Math.max((W + 2 * m) / ew, (H + 2 * m) / eh);
    const c = newCanvas(W, H), g = c.getContext("2d");
    if (sigma < 0.3 || HAS_FILTER) {
      if (sigma >= 0.3) g.filter = `blur(${sigma}px)`;
      drawPhoto(g, it, W / 2, H / 2, s);
    } else {
      const k = Math.max(1, Math.floor(sigma / 2)), sw = Math.ceil(W / k), sh = Math.ceil(H / k);
      const sc = newCanvas(sw, sh), sg = sc.getContext("2d");
      drawPhoto(sg, it, sw / 2, sh / 2, s / k);
      const id = sg.getImageData(0, 0, sw, sh); blurData(id, sigma / k); sg.putImageData(id, 0, 0);
      g.imageSmoothingQuality = "high"; g.drawImage(sc, 0, 0, W, H);
    }
    if (cache) { it.bk = key; it.bc = c; }
    return c;
  }
  function fit(it) {
    const f = frameOf(it), W = f.naturalWidth, H = f.naturalHeight, { ew, eh, s0 } = geom(it, W, H);
    it.zoom = clamp(it.zoom, MIN_ZOOM, MAXZ);
    const mx = Math.abs(ew * s0 * it.zoom - W) / 2 / W, my = Math.abs(eh * s0 * it.zoom - H) / 2 / H;
    it.ox = clamp(it.ox, -mx, mx); it.oy = clamp(it.oy, -my, my);
  }
  // Urutan layer (bawah -> atas): background putih, foto blur, foto A, frame
  function draw(g, it, frame, W, H, cache) {
    const s = geom(it, W, H).s0 * it.zoom;
    g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
    if (it.blur) g.drawImage(blurLayer(it, W, H, it.radius * W / frame.naturalWidth, cache), 0, 0);
    drawPhoto(g, it, W / 2 + it.ox * W, H / 2 + it.oy * H, s);
    g.drawImage(frame, 0, 0, W, H);
  }

  // ---------- Export ----------
  // PNG dulu. Kalau > 2MB -> JPEG (kualitas terbaik yang muat), kalau masih besar -> kecilkan dimensi
  async function exportUnder(canvas) {
    if (canvas.width * canvas.height <= 12e6) {
      const png = await toBlob(canvas, "image/png");
      if (png && png.size <= MAX) return { blob: png, ext: "png", compressed: false };
    }
    let c = canvas, scale = 1;
    for (let step = 0; step < 10; step++) {
      let lo = 0.5, hi = 0.95, best = null;
      for (let i = 0; i < 6; i++) {
        const q = (lo + hi) / 2, jb = await toBlob(c, "image/jpeg", q);
        if (jb && jb.size <= MAX) { best = jb; lo = q; } else hi = q;
      }
      if (best) return { blob: best, ext: "jpg", compressed: true };
      scale *= 0.85;
      c = newCanvas(Math.round(canvas.width * scale), Math.round(canvas.height * scale));
      c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
    }
    const last = await toBlob(c, "image/jpeg", 0.5);
    if (!last) throw new Error("export gagal");
    return { blob: last, ext: "jpg", compressed: true };
  }
  function setMeta(it, text) { it.metaText = text; if (state.sel === it) $("#edMeta").textContent = text; }
  // Satu proses export per versi edit; download memakai proses yang sama (tidak dobel)
  function ensureExport(it) {
    if (it.job && it.job.v === it.v) return it.job.p;
    const v = it.v, p = exportNow(it, v);
    it.job = { v, p };
    return p;
  }
  async function exportNow(it, v) {
    setMeta(it, "Memproses...");
    try {
      await new Promise((r) => setTimeout(r, 20));
      const f = frameOf(it), c = newCanvas(f.naturalWidth, f.naturalHeight);
      draw(c.getContext("2d"), it, f, c.width, c.height, false);
      const out = await exportUnder(c);
      if (v === it.v) setMeta(it, `${fmt(out.blob.size)} · ${out.ext.toUpperCase()}${out.compressed ? " (dikompres)" : ""}`);
      return out;
    } catch (err) {
      console.error(err);
      if (v === it.v) setMeta(it, err && err.name === "SecurityError"
        ? "Diblokir browser: frame dibaca dari file lokal. Jalankan update-frames.bat."
        : "Gagal memproses, coba lagi");
      throw err;
    }
  }
  function save(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  async function download(it) { const out = await ensureExport(it); save(out.blob, `${pos(it)}.${out.ext}`); }
  async function safeDownload(it, btn) {
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "Menyiapkan...";
    try { await download(it); } catch { /* pesan error sudah tampil di panel */ }
    btn.disabled = false; btn.textContent = label;
  }

  // ZIP tanpa library (mode "store": gambar sudah terkompres, jadi tidak perlu dikompres lagi)
  const CRC = (() => { const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  async function makeZip(files) {
    const enc = new TextEncoder(), now = new Date(), parts = [], central = [];
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    let offset = 0;
    for (const f of files) {
      const data = new Uint8Array(await f.blob.arrayBuffer()), name = enc.encode(f.name), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, date, 2], [14, crc, 4],
       [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]
        .forEach(([o, v, n]) => (n === 4 ? lh.setUint32(o, v, true) : lh.setUint16(o, v, true)));
      parts.push(lh, name, data);
      const ch = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, date, 2], [16, crc, 4],
       [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
        .forEach(([o, v, n]) => (n === 4 ? ch.setUint32(o, v, true) : ch.setUint16(o, v, true)));
      central.push(ch, name);
      offset += 30 + name.length + data.length;
    }
    const csize = central.reduce((a, p) => a + (p.byteLength ?? p.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }

  // ---------- HEIC (foto iPhone) ----------
  const isHeic = (f) => /image\/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
  const isImage = (f) => f.type.startsWith("image/") || isHeic(f);
  let heicLib;
  function loadHeic() {
    return (heicLib ||= (async () => {
      for (const src of HEIC_SRCS) {
        try { await loadScript(src); if (window.heic2any) return window.heic2any; } catch { /* coba sumber berikutnya */ }
      }
      throw new Error("heic2any tidak bisa dimuat");
    })());
  }
  const openBitmap = (b) => createImageBitmap(b, { imageOrientation: "from-image" }).catch(() => createImageBitmap(b));
  async function decode(f) {
    if (!isHeic(f)) return openBitmap(f);
    try { return await openBitmap(f); } catch { /* lanjut konversi */ }
    const conv = await (await loadHeic())({ blob: f, toType: "image/jpeg", quality: 0.92 });
    return openBitmap(Array.isArray(conv) ? conv[0] : conv);
  }

  // ---------- Tampilan: kanvas, editor, grid ----------
  function syncControls(it) {
    const z = toZ(it.zoom);
    $("#zr").value = z;
    if (document.activeElement !== $("#zn")) $("#zn").value = Math.round(z);
    $("#flipH").setAttribute("aria-pressed", !!it.fx); $("#flipV").setAttribute("aria-pressed", !!it.fy);
  }
  function paint(it) { // gambar ulang tile + kanvas editor (tanpa menjadwalkan export)
    const f = frameOf(it), W = PREVIEW_W, H = Math.round(W * f.naturalHeight / f.naturalWidth);
    const targets = [it.canvas]; if (state.sel === it) targets.push($("#edCanvas"));
    for (const cv of targets) {
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      draw(cv.getContext("2d"), it, f, W, H, true);
    }
    if (state.sel === it) syncControls(it);
  }
  function refresh(it) {
    fit(it); paint(it);
    it.v++; clearTimeout(it.timer);
    setMeta(it, "Memproses...");
    it.timer = setTimeout(() => ensureExport(it).catch(() => {}), 600);
  }
  const syncRec = (it) => $("#blRec").classList.toggle("on", it.radius === BLUR_DEFAULT);
  function syncOrder() {
    const it = state.sel; if (!it) return;
    const i = state.items.indexOf(it);
    $("#ordLbl").textContent = `${i + 1}/${state.items.length}`;
    $("#ordPrev").disabled = i === 0; $("#ordNext").disabled = i === state.items.length - 1;
  }
  function syncEditor() {
    const it = state.sel;
    $("#editor").hidden = !it; $("#edEmpty").hidden = !!it;
    if (!it) return;
    $("#edName").textContent = it.name; $("#edMeta").textContent = it.metaText || "";
    $("#blOn").checked = it.blur; $("#blCtl").hidden = !it.blur;
    $("#blR").value = $("#blN").value = it.radius; syncRec(it); syncOrder();
  }
  function select(it) {
    state.sel = it;
    state.items.forEach((x) => x.tile.classList.toggle("sel", x === it));
    if (it) { fit(it); paint(it); }
    syncEditor(); syncFrameList();
  }
  function toggleUI() {
    const n = state.items.length, grid = $("#grid");
    $("#drop").hidden = n > 0; grid.hidden = n === 0; grid.dataset.n = n > 1 ? "many" : "one";
    $("#dlZip").disabled = $("#dlEach").disabled = n === 0;
  }
  // Susun ulang tile sesuai urutan array + perbarui nomor (nomor = nama file hasil)
  function renumber() {
    state.items.forEach((x, i) => { x.tile.querySelector(".badge").textContent = i + 1; $("#grid").insertBefore(x.tile, $("#addTile")); });
    syncOrder();
  }
  function moveItem(it, to) {
    const from = state.items.indexOf(it);
    if (from < 0 || to < 0 || to >= state.items.length || from === to) return;
    state.items.splice(from, 1); state.items.splice(to, 0, it); renumber();
  }
  function removeItem(it) {
    clearTimeout(it.timer); it.tile.remove();
    const i = state.items.indexOf(it); state.items.splice(i, 1);
    if (state.sel === it) select(state.items[i] || state.items[i - 1] || null);
    renumber(); toggleUI();
  }
  let dragging = null;
  function createTile(it) {
    const t = document.createElement("div");
    t.className = "tile"; t.draggable = true; t.tabIndex = 0; t.setAttribute("role", "button");
    t.innerHTML = '<canvas></canvas><span class="badge"></span><button type="button" class="x" aria-label="Hapus foto" title="Hapus">×</button>';
    it.tile = t; it.canvas = t.querySelector("canvas"); it.canvas.setAttribute("aria-label", it.name);
    t.onclick = (e) => { if (!e.target.closest(".x")) select(it); };
    t.onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === t) { e.preventDefault(); select(it); } };
    t.querySelector(".x").onclick = (e) => { e.stopPropagation(); removeItem(it); };
    // geser tile untuk mengubah urutan
    t.ondragstart = (e) => { dragging = it; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", "tile"); t.classList.add("dragging"); };
    t.ondragend = () => { dragging = null; document.querySelectorAll(".tile.dragging,.tile.over").forEach((x) => x.classList.remove("dragging", "over")); };
    t.ondragover = (e) => { if (dragging && dragging !== it) { e.preventDefault(); t.classList.add("over"); } };
    t.ondragleave = () => t.classList.remove("over");
    t.ondrop = (e) => { if (!dragging) return; e.preventDefault(); e.stopPropagation(); t.classList.remove("over"); moveItem(dragging, state.items.indexOf(it)); };
    $("#grid").insertBefore(t, $("#addTile"));
  }

  async function addFiles(files) {
    await ready;
    const list = [...files].filter(isImage), status = $("#status");
    if (!state.frames.length) { status.textContent = "Belum ada frame di assets/frame/. Tambahkan frame lalu klik update-frames.bat."; return; }
    let first = true;
    for (const [n, f] of list.entries()) {
      try {
        if (isHeic(f)) status.textContent = `Mengonversi HEIC (${n + 1}/${list.length})...`;
        const bitmap = await decode(f);
        const it = { name: f.name.replace(/\.[^.]+$/, ""), bitmap, zoom: 1, ox: 0, oy: 0, rot: 0, fx: false, fy: false, v: 0,
          blur: false, radius: BLUR_DEFAULT, frameIdx: state.current };
        state.items.push(it); createTile(it); renumber(); toggleUI(); refresh(it);
        if (first) { select(it); first = false; }
      } catch (err) { console.error(err); alert("Tidak bisa membaca file: " + f.name); }
    }
    status.textContent = "";
  }

  // ---------- Kontrol editor (selalu bekerja pada foto yang dipilih) ----------
  const ed = $("#edStage"), ptrs = new Map(); let last = 0;
  const dist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  ed.addEventListener("pointerdown", (e) => { if (!state.sel) return; ed.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = ptrs.size === 2 ? dist() : 0; });
  ed.addEventListener("pointermove", (e) => {
    const it = state.sel, p = ptrs.get(e.pointerId); if (!it || !p) return;
    const r = ed.getBoundingClientRect();
    if (ptrs.size === 1) { it.ox += (e.clientX - p.x) / r.width; it.oy += (e.clientY - p.y) / r.height; }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const n = dist(); if (last) it.zoom *= n / last; last = n; }
    refresh(it);
  });
  const end = (e) => { ptrs.delete(e.pointerId); last = 0; };
  ed.addEventListener("pointerup", end); ed.addEventListener("pointercancel", end);
  ed.addEventListener("wheel", (e) => { const it = state.sel; if (!it) return; e.preventDefault(); it.zoom *= Math.exp(-e.deltaY * 0.0015); refresh(it); }, { passive: false });
  ed.addEventListener("keydown", (e) => {
    const it = state.sel; if (!it) return;
    const k = { ArrowLeft: [-.02, 0], ArrowRight: [.02, 0], ArrowUp: [0, -.02], ArrowDown: [0, .02] }[e.key];
    if (k) { it.ox += k[0]; it.oy += k[1]; }
    else if (e.key === "+" || e.key === "=") it.zoom *= 1.1;
    else if (e.key === "-") it.zoom /= 1.1;
    else return;
    e.preventDefault(); refresh(it);
  });
  const on = (sel, ev, fn) => { $(sel)[ev] = (e) => { const it = state.sel; if (it) fn(it, e); }; };
  // zoom
  on("#zr", "oninput", (it) => { it.zoom = fromZ(+$("#zr").value); refresh(it); });
  on("#zn", "oninput", (it) => { const n = parseFloat($("#zn").value.replace(",", ".")); if (isFinite(n)) { it.zoom = fromZ(clamp(n, -100, 100)); refresh(it); } });
  on("#zn", "onchange", (it) => { $("#zn").value = Math.round(toZ(it.zoom)); });
  $("#zn").onkeydown = (e) => { if (e.key === "Enter") e.target.blur(); };
  document.querySelectorAll("[data-z]").forEach((b) => b.onclick = () => { const it = state.sel; if (it) { it.zoom *= b.dataset.z === "+" ? 1.15 : 1 / 1.15; refresh(it); } });
  on("#zReset", "onclick", (it) => { Object.assign(it, { zoom: 1, ox: 0, oy: 0, rot: 0, fx: false, fy: false }); refresh(it); });
  // rotasi & flip
  const rotate = (it, d) => { it.rot = (it.rot + d + 360) % 360; it.ox = it.oy = 0; refresh(it); };
  on("#rotL", "onclick", (it) => rotate(it, -90));
  on("#rotR", "onclick", (it) => rotate(it, 90));
  on("#flipH", "onclick", (it) => { it.fx = !it.fx; it.ox = -it.ox; refresh(it); });
  on("#flipV", "onclick", (it) => { it.fy = !it.fy; it.oy = -it.oy; refresh(it); });
  // blur: nyalakan, geser slider, atau ketik angka langsung (mis. 99 atau 99%)
  on("#blOn", "onchange", (it, e) => { it.blur = e.target.checked; $("#blCtl").hidden = !it.blur; refresh(it); });
  on("#blR", "oninput", (it) => { it.radius = +$("#blR").value; $("#blN").value = it.radius; syncRec(it); refresh(it); });
  on("#blN", "oninput", (it) => {
    const n = parseFloat($("#blN").value.replace(",", "."));
    if (!isFinite(n)) return;
    it.radius = clamp(n, 0, BLUR_MAX); $("#blR").value = it.radius; syncRec(it); refresh(it);
  });
  on("#blN", "onchange", (it) => { $("#blN").value = it.radius; });
  $("#blN").onkeydown = (e) => { if (e.key === "Enter") e.target.blur(); };
  on("#blRec", "onclick", (it) => { it.radius = BLUR_DEFAULT; $("#blR").value = $("#blN").value = BLUR_DEFAULT; syncRec(it); refresh(it); });
  // urutan, download, hapus
  on("#ordPrev", "onclick", (it) => moveItem(it, state.items.indexOf(it) - 1));
  on("#ordNext", "onclick", (it) => moveItem(it, state.items.indexOf(it) + 1));
  on("#edDl", "onclick", (it, e) => safeDownload(it, e.currentTarget));
  on("#edRm", "onclick", (it) => removeItem(it));
  $("#perFrame").onchange = (e) => {
    state.per = e.target.checked; $("#perHint").hidden = !state.per;
    if (state.per) state.items.forEach((it) => (it.frameIdx = state.current)); // mulai dari frame yang sedang tampil
    syncFrameList(); state.items.forEach(refresh);
  };

  // ---------- Upload & download semua ----------
  const input = $("#file"), stage = $("#stage");
  input.onchange = () => { const picked = [...input.files]; input.value = ""; addFiles(picked); };
  const hasFiles = (e) => [...((e.dataTransfer && e.dataTransfer.types) || [])].includes("Files");
  ["dragenter", "dragover"].forEach((t) => stage.addEventListener(t, (e) => { if (hasFiles(e)) { e.preventDefault(); stage.classList.add("over"); } }));
  ["dragleave", "drop"].forEach((t) => stage.addEventListener(t, (e) => { if (t === "dragleave" && stage.contains(e.relatedTarget)) return; stage.classList.remove("over"); }));
  stage.addEventListener("drop", (e) => { if (hasFiles(e)) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });

  async function bulk(btn, work) {
    const label = btn.textContent, btns = document.querySelectorAll("#bulk button");
    btns.forEach((b) => (b.disabled = true));
    try { await work((t) => (btn.textContent = t)); }
    catch (err) { console.error(err); alert("Gagal menyiapkan file. Coba lagi atau download satuan."); }
    btn.textContent = label; btns.forEach((b) => (b.disabled = state.items.length === 0));
  }
  $("#dlEach").onclick = (e) => bulk(e.currentTarget, async (say) => {
    for (const [i, it] of state.items.entries()) { say(`Menyiapkan ${i + 1}/${state.items.length}...`); await download(it); await new Promise((r) => setTimeout(r, 300)); }
  });
  $("#dlZip").onclick = (e) => bulk(e.currentTarget, async (say) => {
    const files = [];
    for (const [i, it] of state.items.entries()) {
      say(`Menyiapkan ${i + 1}/${state.items.length}...`);
      const out = await ensureExport(it);
      files.push({ name: `${i + 1}.${out.ext}`, blob: out.blob }); // nama file = urutan foto
    }
    say("Membuat ZIP...");
    save(await makeZip(files), ZIP_NAME);
  });

  const ready = loadFrames();
})();
