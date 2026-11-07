/* ============================================================
   SlalomX Kayıt — kayıt masası telefon uygulaması
   Google Sheet (Apps Script köprüsü) ile çalışır, internetsizken
   işlemleri telefonda biriktirir, bağlantı gelince gönderir.
   ============================================================ */
(function () {
  'use strict';

  const C = window.KAYIT_AYAR || {};
  const ON = C.depoOnEki || 'sx_';
  const D = {
    ayar: ON + 'ayar', liste: ON + 'liste', kuyruk: ON + 'kuyruk',
    gorulen: ON + 'gorulen', hatalar: ON + 'hatalar', whatsapp: ON + 'whatsapp'
  };

  // ---------------- Telefon hafızası ----------------
  function oku(k, v) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : v; } catch (e) { return v; } }
  function yaz(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* hafıza dolu/kapalı */ } }

  let ayar = Object.assign({ url: '', anahtar: '', masa: (C.masalar || ['Masa 1'])[0], tutar: '', waMesaj: '', waKayitMesaj: '', waHedef: 'uygulama', waVarsayilan: 'otomatik' }, oku(D.ayar, {}));
  let waGiden = oku(D.whatsapp, {});   // kayıt id -> gönderim saati (bu telefondan)
  let veri = oku(D.liste, { kayitlar: [], sonKapiNo: 0, yaris: '', zaman: '' });
  let kuyruk = oku(D.kuyruk, []);
  let hatalar = oku(D.hatalar, []);
  let gorulen = new Set(oku(D.gorulen, []));
  let ilkSenkron = gorulen.size === 0;
  let sekme = 'bekleyen';
  let filtre = 'benim';
  let senkronCalisiyor = false;
  let tekrarGerek = false;          // senkron sırasında yeni işlem eklendiyse
  let sonBaglanti = null;           // true / false / null
  const kapiSirasi = [];            // gösterilecek büyük kapı numaraları
  let kapiEkraniKayit = null;

  const $ = function (id) { return document.getElementById(id); };

  // ---------------- Yardımcılar ----------------
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function buyuk(s) { return String(s || '').toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ').trim(); }
  function normal(s) {
    return String(s || '').toLocaleLowerCase('tr-TR')
      .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ç/g, 'c')
      .replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/[^a-z0-9]/g, '');
  }
  function istekId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function yilGecerli(y) {
    const n = Number(String(y || '').trim());
    return /^\d{4}$/.test(String(y || '').trim()) && n >= 1886 && n <= new Date().getFullYear() + 1;
  }
  function saat() {
    const d = new Date();
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  function bildir(mesaj, tur) {
    const b = $('bildirim');
    b.textContent = mesaj;
    b.className = 'bildirim ' + (tur || '');
    clearTimeout(bildir._t);
    bildir._t = setTimeout(function () { b.className = 'bildirim gizli'; }, tur === 'hata' ? 6000 : 3500);
  }

  function ses() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = ses._ctx || (ses._ctx = new Ctx());
      [0, 0.22].forEach(function (gecikme) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; o.type = 'sine';
        g.gain.setValueAtTime(0.25, ctx.currentTime + gecikme);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + gecikme + 0.18);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + gecikme); o.stop(ctx.currentTime + gecikme + 0.2);
      });
    } catch (e) { /* ses çalınamadı */ }
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* titreşim yok */ }
  }

  function hataEkle(mesaj) {
    hatalar.unshift({ zaman: saat(), mesaj: mesaj });
    hatalar = hatalar.slice(0, 50);
    yaz(D.hatalar, hatalar);
  }

  // ---------------- Sunucu ----------------
  async function api(govde) {
    if (!ayar.url) throw new Error('AYAR');
    const kontrol = new AbortController();
    const zaman = setTimeout(function () { kontrol.abort(); }, 20000);
    try {
      const yanit = await fetch(ayar.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ anahtar: ayar.anahtar }, govde)),
        redirect: 'follow',
        signal: kontrol.signal
      });
      if (!yanit.ok) throw new Error('HTTP ' + yanit.status);
      return await yanit.json();
    } finally {
      clearTimeout(zaman);
    }
  }

  function baglantiGoster(durum) {
    sonBaglanti = durum;
    const el = $('baglanti');
    const bekleyen = kuyruk.length;
    if (!ayar.url) { el.textContent = '⚙ Ayar gerekli'; el.className = 'baglanti kirmizi'; return; }
    if (durum === false) {
      el.textContent = '📶 Çevrimdışı' + (bekleyen ? ' · ' + bekleyen + ' bekliyor' : '');
      el.className = 'baglanti kirmizi';
    } else if (bekleyen) {
      el.textContent = '⏳ ' + bekleyen + ' işlem gönderiliyor';
      el.className = 'baglanti sari';
    } else {
      el.textContent = '🟢 Bağlı ' + (veri.zaman ? '· ' + veri.zaman : '');
      el.className = 'baglanti yesil';
    }
  }

  async function senkron() {
    if (senkronCalisiyor) { tekrarGerek = true; return; }
    if (!ayar.url) { baglantiGoster(sonBaglanti); return; }
    senkronCalisiyor = true;
    try {
      await kuyrukGonder();
      const r = await api({ islem: 'liste' });
      if (!r.ok) {
        if (r.kod === 'ANAHTAR') bildir('⚠ ' + r.hata, 'hata');
        baglantiGoster(false);
        return;
      }
      veri = { kayitlar: r.kayitlar || [], sonKapiNo: r.sonKapiNo || 0, yaris: r.yaris || '',
               yarisTarihi: r.yarisTarihi || '', yarisYeri: r.yarisYeri || '', startSaati: r.startSaati || '',
               waKayit: r.waKayit || '', waOnay: r.waOnay || '', waHatirlatma: r.waHatirlatma || '',
               waTesekkur: r.waTesekkur || '', waSonuclar: r.waSonuclar || '',
               klasmanlar: r.klasmanlar || '', zaman: saat() };
      yaz(D.liste, veri);
      waAktifGoster();
      yeniKayitKontrol();
      baglantiGoster(true);
      ciz();
    } catch (e) {
      baglantiGoster(false);
    } finally {
      senkronCalisiyor = false;
      if (tekrarGerek) { tekrarGerek = false; setTimeout(senkron, 300); }
    }
  }

  function yeniKayitKontrol() {
    const bekleyenler = veri.kayitlar.filter(function (k) { return k.durum === 'Bekliyor'; });
    const yeniler = bekleyenler.filter(function (k) { return !gorulen.has(k.id); });
    veri.kayitlar.forEach(function (k) { gorulen.add(k.id); });
    yaz(D.gorulen, Array.from(gorulen).slice(-2000));
    if (!ilkSenkron && yeniler.length) {
      const bant = $('uyariBandi');
      bant.textContent = '🔔 ' + (yeniler.length === 1
        ? 'Yeni kayıt bekliyor: ' + yeniler[0].pilot
        : yeniler.length + ' yeni kayıt bekliyor');
      bant.classList.remove('gizli');
      ses();
    }
    ilkSenkron = false;
  }

  // ---------------- Çevrimdışı kuyruk ----------------
  function kuyrugaEkle(islem) {
    islem.istekId = istekId();
    islem.masa = ayar.masa;
    islem.eklenme = saat();
    kuyruk.push(islem);
    yaz(D.kuyruk, kuyruk);
    baglantiGoster(sonBaglanti);
    ciz();
    // hemen göndermeyi dene
    setTimeout(senkron, 50);
  }

  async function kuyrukGonder() {
    if (!kuyruk.length) return;
    const gonderilen = kuyruk.slice();
    const r = await api({ islem: 'toplu', islemler: gonderilen });
    if (!r.ok) {
      if (r.kod === 'ANAHTAR' || r.kod === 'KAPALI') bildir('⚠ ' + r.hata, 'hata');
      throw new Error(r.hata || 'Gönderilemedi');
    }
    const sonucHaritasi = {};
    (r.sonuclar || []).forEach(function (s) { sonucHaritasi[s.istekId] = s; });

    const kalan = [];
    const tekrarSor = [];
    kuyruk.forEach(function (i) {
      const s = sonucHaritasi[i.istekId];
      if (!s) { kalan.push(i); return; }                       // bu gönderimde yoktu (sonradan eklendi)
      if (s.ok) {
        if (i.islem === 'isaretle') {
          bildir('✓ ' + ((s.kayit && s.kayit.pilot) || '') + ': ' +
            (i.alan === 'kapi' ? 'Kapı No' : 'Ödeme') + (i.deger ? ' işaretlendi' : ' işareti kaldırıldı'), 'tamam');
        } else if (s.kayit && s.kayit.kapiNo && i.islem !== 'reddet') {
          kapiGoster(s.kayit, i.eklenme);
        } else if (i.islem === 'reddet') {
          bildir('Kayıt reddedildi: ' + ((s.kayit && s.kayit.pilot) || ''), 'tamam');
        }
        return;
      }
      if (s.kod === 'MESGUL' || s.kod === 'SUNUCU') { kalan.push(i); return; }   // tekrar denenecek
      if (s.kod === 'MUKERRER' && (i.islem === 'masaKayit' || i.islem === 'onayla')) { tekrarSor.push({ islem: i, sonuc: s }); return; }
      const ad = (i.alanlar && i.alanlar.pilot) || i.pilot || '';
      hataEkle((ad ? ad + ': ' : '') + s.hata);
      bildir('⚠ ' + (ad ? ad + ': ' : '') + s.hata, 'hata');
    });
    kuyruk = kalan;
    yaz(D.kuyruk, kuyruk);

    tekrarSor.forEach(function (t) {
      if (confirm('⚠ ' + t.sonuc.hata + '\n\nYine de ' + (t.islem.islem === 'onayla' ? 'onaylansın' : 'eklensin') + ' mi?')) {
        const yeni = Object.assign({}, t.islem, { yineDeEkle: true });
        delete yeni.istekId;
        kuyrugaEkle(yeni);
      }
    });
  }

  // ---------------- Mükerrer kontrolü ----------------
  function ayniIsimliler(pilot, haricId) {
    const a = normal(pilot);
    return veri.kayitlar.filter(function (k) {
      return k.id !== haricId && k.durum !== 'Reddedildi' && normal(k.pilot) === a;
    });
  }
  function aracAnahtari(marka, model) { return normal(marka) + '|' + normal(model); }
  /** Aynı isimli kayıt varsa sorar; true = devam et. */
  function mukerrerSor(alanlar, haricId, eylem) {
    const ayni = ayniIsimliler(alanlar.pilot, haricId);
    if (!ayni.length) return { devam: true, yineDeEkle: false };
    const benimArac = aracAnahtari(alanlar.marka, alanlar.model);
    const ayniArac = ayni.some(function (k) { return aracAnahtari(k.marka, k.model) === benimArac; });
    const satirlar = ayni.map(function (k) {
      return '• ' + k.pilot + ' — ' + ([k.marka, k.model, k.yil].filter(Boolean).join(' ') || 'araç yok') +
        ' (' + k.durum + (k.kapiNo ? ', Kapı No ' + k.kapiNo : '') + (k.masa ? ', ' + k.masa : '') + ')' +
        (aracAnahtari(k.marka, k.model) === benimArac ? '  ← AYNI ARAÇ' : '');
    });
    const mesaj = '⚠ ' + (ayniArac ? 'AYNI PİLOT VE AYNI ARAÇ ZATEN KAYITLI' : 'BU PİLOT ZATEN KAYITLI') + '\n\n' +
      satirlar.join('\n') + '\n\n' +
      (ayniArac ? 'Büyük ihtimalle aynı kayıt (form iki kez doldurulmuş). Bu durumda İptal edip kaydı reddedin.\n\n'
                : 'Pilot ikinci bir araçla yarışıyorsa onaylayabilirsiniz.\n\n') +
      'Yine de ' + eylem + '?';
    return confirm(mesaj) ? { devam: true, yineDeEkle: true } : { devam: false };
  }

  // ---------------- WhatsApp bildirimi (ücretsiz: WhatsApp hazır mesajla açılır, Gönder'e basılır) ----------------
  function waNumara(tel) {
    let d = String(tel || '').replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.length === 11 && d[0] === '0') d = '90' + d.slice(1);       // 0533... -> 90533...
    else if (d.length === 10 && d[0] === '5') d = '90' + d;           // 533...  -> 90533...
    return d.length >= 11 ? d : '';
  }
  // Hangi mesajın gideceğini kullanıcı seçer (1-2-3); öneri: onaylı + kapı no varsa 3, yoksa 1
  const WA_TURLER = [['kayit', '1 · Kayıt alındı'], ['hatirlatma', '2 · Hatırlatma'], ['onay', '3 · Kayıt tamamlandı'],
    ['tesekkur', '4 · Yarış sonrası']];
  // 4. mesaj için SlalomX'in yazdığı sonuçlar (kapı no ya da pilot adıyla); sonuç yoksa boş
  function waSonuc(k) {
    let s = {};
    try { s = JSON.parse(veri.waSonuclar || '{}') || {}; } catch (e) { s = {}; }
    const ad = 'p:' + String(k.pilot || '').trim().replace(/\s+/g, ' ').toUpperCase();
    return (k.kapiNo !== undefined && k.kapiNo !== '' && s['k:' + k.kapiNo]) || s[ad] || {};
  }
  function waTur(k) {
    const v = ayar.waVarsayilan || 'otomatik';
    if (v !== 'otomatik') return v;                      // Ayarlar'da seçilen mesaj
    return k.durum === 'Onaylandı' && k.kapiNo ? 'onay' : 'kayit';
  }
  // Otomatik (SlalomX'ten giden) mesajlar: telefonda elle gönderilemez ama 'son giden' olarak görünür
  const WA_TUM_ADLAR = WA_TURLER.concat([['tekrar', '5 · Tekrar kayıt'], ['guncel', '6 · Bilgi güncellendi'],
    ['yil', '7 · Yıl hatalı']]);
  function waTurAdi(tur) { const t = WA_TUM_ADLAR.find(function (x) { return x[0] === tur; }); return t ? t[1] : tur; }
  // SlalomX'in otomatik gönderdikleri (WA_SONUCLAR._wa): {"p:PİLOT": {"kayit": "07.11 00:53", ...}}
  function waSunucu(k) {
    let s = {};
    try { s = (JSON.parse(veri.waSonuclar || '{}') || {})._wa || {}; } catch (e) { s = {}; }
    return s['p:' + String(k.pilot || '').trim().replace(/\s+/g, ' ').toUpperCase()] || {};
  }
  function waYerel(k, tur) { return waGiden[k.id + ':' + tur] || (tur === 'onay' ? waGiden[k.id] : '') || ''; }
  function waGidenZaman(k, tur) { return waYerel(k, tur) || waSunucu(k)[tur] || ''; }
  // 'gg.aa ss:dd' -> sıralanabilir anahtar (eski kayıtlarda sadece saat vardı: en eski sayılır)
  function waSiraAnahtari(z) {
    const m = String(z || '').match(/^(\d\d)\.(\d\d) (\d\d:\d\d)$/);
    return m ? m[2] + m[1] + m[3] : '0000' + String(z || '');
  }
  // En son giden mesaj (bu telefondan elle ya da SlalomX'ten otomatik): {tur, zaman, oto}
  function waSonGiden(k) {
    let son = null;
    const sun = waSunucu(k);
    WA_TUM_ADLAR.forEach(function (t) {
      [[waYerel(k, t[0]), false], [sun[t[0]], true]].forEach(function (a) {
        if (a[0] && (!son || waSiraAnahtari(a[0]) > waSiraAnahtari(son.zaman))) son = { tur: t[0], zaman: a[0], oto: a[1] };
      });
    });
    return son;
  }
  function waZaman() {
    const d = new Date(), iki = function (n) { return String(n).padStart(2, '0'); };
    return iki(d.getDate()) + '.' + iki(d.getMonth() + 1) + ' ' + iki(d.getHours()) + ':' + iki(d.getMinutes());
  }
  // Mesaj metinleri SlalomX > Yarış Bilgileri > WhatsApp Mesajları'ndan gelir (tablo üzerinden)
  function waSablon(tur) {
    if (tur === 'onay') return (veri.waOnay || '').trim() || C.whatsappMesaji || '';
    if (tur === 'tesekkur') return (veri.waTesekkur || '').trim() || C.whatsappTesekkurMesaji || '';
    if (tur === 'hatirlatma') return (veri.waHatirlatma || '').trim() || C.whatsappHatirlatmaMesaji || '';
    return (veri.waKayit || '').trim() || C.whatsappKayitMesaji || '';
  }
  function waMesaj(k, tur) {
    let sablon = waSablon(tur || waTur(k));
    const arac = [k.marka, k.model].filter(Boolean).join(' ') + (k.yil ? ' (' + k.yil + ')' : '');
    // '2.000 TL (Nakit)' / 'Ücretsiz'
    const tutarSayi = Number(String(k.tutar === undefined ? '' : k.tutar).replace(/\./g, '').replace(',', '.'));
    const odeme = !k.odeme ? '' : (k.odeme === 'Ücretsiz' ? 'Ücretsiz'
      : (String(k.tutar || '').trim() !== '' && !isNaN(tutarSayi)
        ? tutarSayi.toLocaleString('tr-TR') + ' TL (' + k.odeme + ')' : k.odeme));
    const degerler = {
      pilot: k.pilot || '', yaris: veri.yaris || C.varsayilanYarisAdi || 'yarış', kapi: k.kapiNo || '',
      arac: arac.trim(), klasman: klasmanBul(k.yil), odeme: odeme, plaka: k.plaka || '', link: k.link || '',
      tarih: veri.yarisTarihi || '', yer: veri.yarisYeri || '', saat: veri.startSaati || ''
    };
    const sonuc = waSonuc(k);
    ['sira', 'klasman_sira', 'ozel_sira', 'ham_sure', 'sure'].forEach(function (a) { degerler[a] = sonuc[a] || ''; });
    // Değeri boş olan alanın satırı tamamen çıkarılır
    if (!degerler.link) sablon = sablon.replace(/^.*\n?.*\{link\}.*(\n|$)/m, function (m) {
      return /:\s*\n/.test(m) ? '' : m;     // 'düzeltebilirsiniz:' + link satırı birlikte çıkar
    });
    return sablon.split('\n').filter(function (satir) {
      const m = satir.match(/\{(\w+)\}/g) || [];
      return m.every(function (a) { return degerler[a.slice(1, -1)] !== ''; });
    }).join('\n').replace(/\{(\w+)\}/g, function (_t, ad) {
      return degerler[ad] !== undefined ? degerler[ad] : '';
    }).replace(/\n{3,}/g, '\n\n');
  }
  // Mesaj seçme penceresi: 1-2-3 düğmeleri, gönderilenlerin saati, seçilenin önizlemesi
  function waSec(k, sonra) {
    if (!waNumara(k.telefon)) { alert('"' + (k.pilot || '') + '" için geçerli telefon numarası yok.'); return; }
    let secili = waTur(k);
    const p = $('waSecim');
    function ciz() {
      $('waSecimPilot').textContent = (k.kapiNo ? k.kapiNo + ' · ' : '') + (k.pilot || '');
      $('waSecimTurler').innerHTML = WA_TURLER.map(function (t) {
        const g = waGidenZaman(k, t[0]);
        return '<button class="btn wa-tur' + (t[0] === secili ? ' secili' : '') + '" data-tur="' + t[0] + '">' +
          '<span>' + esc(t[1]) + (t[0] === waTur(k) ? ' <em>önerilen</em>' : '') + '</span>' +
          (g ? '<small>✔ gönderildi ' + esc(g) + '</small>' : '') + '</button>';
      }).join('');
      $('waSecimOnizleme').textContent = waMesaj(k, secili);
    }
    $('waSecimTurler').onclick = function (e) {
      const b = e.target.closest('[data-tur]');
      if (b) { secili = b.getAttribute('data-tur'); ciz(); }
    };
    $('waSecimGonder').onclick = function () { p.classList.add('gizli'); waGonder(k, secili); if (sonra) sonra(); };
    $('waSecimIptal').onclick = function () { p.classList.add('gizli'); };
    ciz();
    p.classList.remove('gizli');
  }
  function waGonder(k, tur) {
    tur = tur || waTur(k);
    const no = waNumara(k.telefon);
    if (!no) { alert('"' + (k.pilot || '') + '" için geçerli telefon numarası yok.'); return; }
    if (!k.link && /\{link\}/.test(waSablon(tur)) &&
      !confirm('"' + (k.pilot || '') + '" için düzeltme linki henüz yok.\n\nMesaj linksiz gönderilsin mi?')) return;
    const metin = encodeURIComponent(waMesaj(k, tur));
    waGiden[k.id + ':' + tur] = waZaman();
    yaz(D.whatsapp, waGiden);
    // wa.me yönlendirmesi emojileri bozuyor (�) ve her seferinde yeni sayfa açıyordu:
    //  - telefonda WhatsApp uygulaması doğrudan açılır (yeni sayfa yok)
    //  - bilgisayarda hep AYNI WhatsApp Web sekmesi kullanılır
    if ((ayar.waHedef || 'uygulama') === 'uygulama' || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      location.href = 'whatsapp://send?phone=' + no + '&text=' + metin;
    } else {
      const url = 'https://web.whatsapp.com/send?phone=' + no + '&text=' + metin;
      const pencere = window.open(url, 'slalomx_whatsapp');
      if (pencere) { try { pencere.focus(); } catch (e) { /* önemsiz */ } } else location.href = url;
    }
    cizOnayli();
  }
  function waDugme(k) {
    if (!k.telefon) return '';
    const tur = waTur(k), giden = waGidenZaman(k, tur);
    const son = waSonGiden(k);
    return '<button class="btn wa' + (giden ? ' gitti' : '') + '" data-wa="' + esc(k.id) + '">💬 WhatsApp: ' +
      esc(waTurAdi(tur)) + (giden ? ' · gönderildi ' + esc(giden) : '') +
      (son ? '<small class="wa-son">Son giden: ' + esc(waTurAdi(son.tur)) + ' · ' + esc(son.zaman) +
        (son.oto ? ' (otomatik)' : '') + '</small>' : '<small class="wa-son">Henüz mesaj gitmedi</small>') +
      '</button>';
  }

  // ---------------- Büyük kapı numarası ----------------
  function kapiGoster(kayit, eklenme) {
    kapiSirasi.push({ kayit: kayit, eklenme: eklenme });
    if ($('kapiEkrani').classList.contains('gizli')) sonrakiKapi();
  }
  function sonrakiKapi() {
    const s = kapiSirasi.shift();
    if (!s) { $('kapiEkrani').classList.add('gizli'); return; }
    kapiEkraniKayit = s.kayit;
    $('kapiWa').classList.toggle('gizli', !waNumara(s.kayit.telefon));
    $('kapiWa').textContent = '💬 WhatsApp: ' + waTurAdi(waTur(s.kayit));
    $('kapiNoBuyuk').textContent = s.kayit.kapiNo;
    $('kapiPilot').textContent = s.kayit.pilot || '';
    $('kapiAlt').textContent = [s.kayit.marka, s.kayit.model, s.kayit.yil].filter(Boolean).join(' · ') +
      (s.eklenme ? '  (onay ' + s.eklenme + ')' : '');
    $('kapiEkrani').classList.remove('gizli');
    ses();
  }

  // ---------------- Liste görünümü ----------------
  function kuyruktakiIslem(kayitId) {
    return kuyruk.find(function (i) { return i.kayitId === kayitId && i.islem !== 'isaretle'; });
  }

  function aramaUyar(k, metin) {
    if (!metin) return true;
    const n = normal(metin);
    return [k.pilot, k.marka, k.model, k.plaka, k.telefon, k.kapiNo, k.yil].some(function (x) {
      return normal(x).indexOf(n) >= 0;
    });
  }

  function klasmanBul(yil) {
    const n = Number(yil);
    if (!n) return '';
    const tanim = String(veri.klasmanlar || C.klasmanlar || '');
    const parca = tanim.split(';').map(function (p) {
      const m = p.trim().match(/^([^:]+):(\d{4})-(\d{4})$/);
      return m ? { ad: m[1].trim(), bas: Number(m[2]), bit: Number(m[3]) } : null;
    }).filter(Boolean).find(function (k) { return n >= k.bas && n <= k.bit; });
    return parca ? parca.ad : '';
  }
  function telBicim(v) {
    const ham = String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim();
    if (!ham) return '';
    let d = ham.replace(/\D/g, '');
    if (d.length === 14 && d.indexOf('0090') === 0) d = '0' + d.slice(4);
    else if (d.length === 12 && d.indexOf('90') === 0) d = '0' + d.slice(2);
    else if (d.length === 10 && d[0] !== '0') d = '0' + d;
    if (d.length === 11 && d[0] === '0') return d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7, 9) + ' ' + d.slice(9);
    return ham;
  }
  function ucret() {
    const t = String(ayar.tutar || '').replace(',', '.').trim();
    return t !== '' && !isNaN(Number(t)) ? t : String(C.varsayilanTutar || 0);
  }

  function kartAlt(k) {
    const arac = [k.marka, k.model].filter(Boolean).join(' ');
    return '<div class="kart-arac">' + esc(arac || '—') +
      (k.plaka ? ' <span class="plaka">' + esc(k.plaka) + '</span>' : '') +
      (k.yil ? ' <span class="yil">' + esc(k.yil) + '</span>' : ' <span class="yil eksik">YIL YOK</span>') +
      (klasmanBul(k.yil) ? ' <span class="klasman">' + esc(klasmanBul(k.yil)) + '</span>' : '') +
      (k.kadin ? ' <span class="etiket">KADIN</span>' : '') +
      (k.genc ? ' <span class="etiket genc">GENÇ</span>' : '') + '</div>' +
      (k.telefon ? '<div class="kart-tel">📞 ' + esc(telBicim(k.telefon)) + '</div>' : '') +
      uyariNotu(k.not);
  }
  /** Nottan sadece ⚠ uyarıları (yıl yok, mükerrer) gösterilir; saat/masa kayıtları gösterilmez. */
  function uyariNotu(not) {
    const uyarilar = String(not || '').split(' | ').filter(function (p) { return p.indexOf('⚠') === 0; });
    return uyarilar.length ? '<div class="kart-not">' + esc(uyarilar.join(' · ')) + '</div>' : '';
  }

  function cizBekleyen() {
    const ara = $('araBekleyen').value;
    const liste = veri.kayitlar.filter(function (k) { return k.durum === 'Bekliyor'; });
    $('sayBekleyen').textContent = liste.filter(function (k) { return !kuyruktakiIslem(k.id); }).length;

    const html = liste.filter(function (k) { return aramaUyar(k, ara); }).map(function (k) {
      const bekleyenIslem = kuyruktakiIslem(k.id);
      const baskaMasa = k.masa && k.masa !== ayar.masa;
      let butonlar;
      if (bekleyenIslem) {
        butonlar = '<div class="durum-satir sari">⏳ ' +
          (bekleyenIslem.islem === 'reddet' ? 'Red gönderiliyor' : 'Onaylandı — numara bağlantı gelince verilecek') + '</div>';
      } else if (baskaMasa) {
        butonlar = '<div class="durum-satir">🔒 ' + esc(k.masa) + ' işlemde</div>';
      } else {
        butonlar = '<div class="kart-butonlar">' +
          '<button class="btn birincil" data-onayla="' + esc(k.id) + '">✅ Onayla</button>' +
          '<button class="btn tehlike ince" data-reddet="' + esc(k.id) + '">Reddet</button></div>' +
          (k.telefon ? '<div class="kart-butonlar">' + waDugme(k) + '</div>' : '');
      }
      return '<div class="kart' + (bekleyenIslem ? ' soluk' : '') + '">' +
        '<div class="kart-pilot">' + esc(k.pilot) + '</div>' + kartAlt(k) + butonlar + '</div>';
    }).join('');
    $('listeBekleyen').innerHTML = html || '<div class="bos">Bekleyen kayıt yok.</div>';
  }

  function cizOnayli() {
    const ara = $('araOnayli').value;
    const durum = filtre === 'red' ? 'Reddedildi' : 'Onaylandı';
    let liste = veri.kayitlar.filter(function (k) { return k.durum === durum; });
    if (filtre === 'benim') liste = liste.filter(function (k) { return k.masa === ayar.masa; });
    liste.sort(function (a, b) { return (Number(b.kapiNo) || 0) - (Number(a.kapiNo) || 0); });
    $('sayOnayli').textContent = veri.kayitlar.filter(function (k) { return k.durum === 'Onaylandı'; }).length;

    // Masada eklenip henüz numara almamış kayıtlar
    const bekleyenYeni = filtre === 'red' ? [] : kuyruk.filter(function (i) { return i.islem === 'masaKayit'; });
    const ustHtml = bekleyenYeni.map(function (i) {
      const a = i.alanlar || {};
      return '<div class="kart soluk"><div class="kart-ust"><div class="kapi kucuk">⏳</div><div>' +
        '<div class="kart-pilot">' + esc(a.pilot) + '</div>' +
        '<div class="kart-arac">' + esc([a.marka, a.model, a.yil].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="durum-satir sari">Numara bağlantı gelince verilecek (' + esc(i.eklenme) + ')</div>' +
        '</div></div></div>';
    }).join('');

    const html = liste.filter(function (k) { return aramaUyar(k, ara); }).map(function (k) {
      const islem = kuyruktakiIslem(k.id);
      let alt = '';
      if (islem) {
        alt = '<div class="durum-satir sari">⏳ ' + (islem.islem === 'reddet' ? 'Red gönderiliyor' : 'Onay gönderiliyor') + '</div>';
      } else if (k.slalomx) {
        alt = '<div class="durum-satir yesil">✓ ' + esc(C.program || 'Program') + '\'e alındı</div>';
      } else if (k.durum === 'Onaylandı' && k.masa === ayar.masa) {
        alt = '<div class="kart-butonlar"><button class="btn tehlike ince" data-reddet="' + esc(k.id) + '">Reddedilenlere al</button></div>';
      } else if (k.durum === 'Reddedildi' && (!k.masa || k.masa === ayar.masa || k.masa === 'SlalomX')) {
        alt = '<div class="kart-butonlar"><button class="btn birincil" data-onayla="' + esc(k.id) + '">↩ Onaya al</button></div>';
      } else if (k.durum === 'Reddedildi' && k.masa) {
        alt = '<div class="durum-satir">🔒 ' + esc(k.masa) + ' reddetti</div>';
      }
      if (k.durum === 'Onaylandı') alt = isaretlerHtml(k) + (k.kapiNo ? '<div class="kart-butonlar">' + waDugme(k) + '</div>' : '') + alt;
      return '<div class="kart' + (islem ? ' soluk' : '') + '"><div class="kart-ust"><div class="kapi' + (k.durum === 'Reddedildi' ? ' red' : '') + '">' +
        esc(k.kapiNo || '–') + '</div><div class="kart-govde">' +
        '<div class="kart-pilot">' + esc(k.pilot) + '</div>' + kartAlt(k) + alt +
        '</div></div></div>';
    }).join('');
    $('listeOnayli').innerHTML = (ustHtml + html) || '<div class="bos">Kayıt yok.</div>';
  }

  function isaretDurumu(k, alan) {
    const bekleyen = kuyruk.filter(function (i) { return i.kayitId === k.id && i.islem === 'isaretle' && i.alan === alan; }).pop();
    return { acik: bekleyen ? !!bekleyen.deger : !!(alan === 'kapi' ? k.kapiVerildi : k.odemeAlindi), bekliyor: !!bekleyen };
  }
  function isaretlerHtml(k) {
    const kapi = isaretDurumu(k, 'kapi'), odeme = isaretDurumu(k, 'odeme');
    const tus = function (alan, d, etiket, ek) {
      return '<button class="isaret' + (d.acik ? ' acik' : '') + '" data-isaret="' + alan + '" data-id="' + esc(k.id) + '">' +
        '<span class="kutu">' + (d.acik ? '✓' : '') + '</span>' + etiket + (ek ? '<small>' + esc(ek) + '</small>' : '') +
        (d.bekliyor ? ' ⏳' : '') + '</button>';
    };
    return '<div class="isaretler">' +
      tus('kapi', kapi, '🎫 Kapı No', '') +
      tus('odeme', odeme, '💳 Ödeme', odeme.acik && k.odeme ? k.odeme + (k.tutar !== '' && k.tutar !== undefined ? ' ' + k.tutar : '') : '') + '</div>';
  }

  function cizAyarlar() {
    $('kuyrukListe').innerHTML = kuyruk.length ? kuyruk.map(function (i) {
      const ad = (i.alanlar && i.alanlar.pilot) || (veri.kayitlar.find(function (k) { return k.id === i.kayitId; }) || {}).pilot || '';
      const tur = { onayla: 'Onay', masaKayit: 'Yeni kayıt', reddet: 'Red' }[i.islem] || i.islem;
      return '<div>⏳ ' + esc(i.eklenme) + ' · ' + esc(tur) + ' · ' + esc(ad) + '</div>';
    }).join('') : '<div class="bos">Yok</div>';
    $('hataListe').innerHTML = hatalar.length ? hatalar.map(function (h) {
      return '<div>⚠ ' + esc(h.zaman) + ' · ' + esc(h.mesaj) + '</div>';
    }).join('') : '<div class="bos">Yok</div>';
  }

  function ciz() {
    $('sonNo').textContent = veri.sonKapiNo || '–';
    $('yarisAdi').textContent = veri.yaris || '';
    $('masaEtiket').textContent = ayar.masa;
    cizBekleyen();
    cizOnayli();
    cizAyarlar();
  }

  // ---------------- Form alanları ----------------
  function alanlarHtml(k, yeni) {
    k = k || {};
    const odemeler = (C.odemeTipleri || []).map(function (o, i) {
      return '<label class="secim"><input type="radio" name="odeme" value="' + esc(o) + '"' +
        (i === 0 ? ' checked' : '') + '><span>' + esc(o) + '</span></label>';
    }).join('');
    return '' +
      '<label>Pilot (Ad Soyad) *<input name="pilot" required value="' + esc(k.pilot) + '"></label>' +
      '<label>Telefon<input name="telefon" type="tel" inputmode="tel" placeholder="0533 860 54 27" value="' + esc(telBicim(k.telefon)) + '"></label>' +
      '<div class="iki">' +
      '<label>Marka<input name="marka" value="' + esc(k.marka) + '"></label>' +
      '<label>Model<input name="model" value="' + esc(k.model) + '"></label></div>' +
      '<label>Plaka<input name="plaka" autocapitalize="characters" value="' + esc(k.plaka) + '"></label>' +
      '<div class="iki">' +
      '<label>Üretim Yılı *<input name="yil" inputmode="numeric" maxlength="4" placeholder="Örn. 1972" value="' + esc(k.yil) + '"></label>' +
      '<label>Doğum Tarihi<input name="dogum" type="date" value="' + esc(/^\d{4}-\d{2}-\d{2}$/.test(k.dogum || '') ? k.dogum : '') + '"></label></div>' +
      '<label class="onay-kutu"><input type="checkbox" name="kadin"' + (k.kadin ? ' checked' : '') + '> Kadın kategorisi</label>' +
      '<label>Not<input name="not" value="' + esc(k.not) + '"></label>' +
      '<div class="alan-baslik">Ödeme</div><div class="secimler">' + odemeler + '</div>' +
      '<label>Tutar *<input name="tutar" type="number" inputmode="decimal" min="0" step="any" value="' + esc(ucret()) + '"></label>' +
      '<div class="kart-butonlar">' +
      '<button type="submit" class="btn birincil buyuk">' + (yeni ? '＋ Kaydet ve Numara Ver' : '✅ Onayla ve Numara Ver') + '</button>' +
      (yeni ? '' : '<button type="button" class="btn ince" data-kapat>Vazgeç</button>') + '</div>';
  }

  function formOku(form) {
    const f = new FormData(form);
    const odeme = f.get('odeme') || '';
    let tutar = String(f.get('tutar') || '').replace(',', '.').trim();
    if (odeme === 'Ücretsiz' && tutar === '') tutar = '0';
    return {
      alanlar: {
        pilot: buyuk(f.get('pilot')), telefon: telBicim(f.get('telefon')),
        marka: buyuk(f.get('marka')), model: buyuk(f.get('model')), plaka: buyuk(f.get('plaka')),
        yil: String(f.get('yil') || '').trim(), dogum: String(f.get('dogum') || '').trim(),
        kadin: !!f.get('kadin'), not: buyuk(f.get('not'))
      },
      odeme: odeme,
      tutar: tutar
    };
  }

  function formKontrol(d) {
    if (!d.alanlar.pilot) return 'Pilot adı boş olamaz.';
    if (!yilGecerli(d.alanlar.yil)) return 'Üretim yılı 4 haneli olmalı (örn. 1972). Klasman yıla göre belirlenir.';
    if (!d.odeme) return 'Ödeme tipini seçin.';
    if (d.tutar === '' || isNaN(Number(d.tutar)) || Number(d.tutar) < 0) return 'Tutarı girin. Ücretsiz kayıt için 0 yazın.';
    return null;
  }

  function odemeDegisti(form) {
    form.addEventListener('focusout', function (e) {
      if (e.target.name === 'telefon') e.target.value = telBicim(e.target.value);
    });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'odeme' && e.target.value === 'Ücretsiz') form.elements.tutar.value = '0';
    });
  }

  // ---------------- Onay penceresi ----------------
  function onayAc(kayitId) {
    const k = veri.kayitlar.find(function (x) { return x.id === kayitId; });
    if (!k) return;
    const serbest = !k.masa || k.masa === ayar.masa || (k.masa === 'SlalomX' && k.durum === 'Reddedildi');
    if (!serbest) { bildir('🔒 Bu kayıt ' + k.masa + ' tarafından işleniyor.', 'hata'); return; }
    $('pencereBaslik').textContent = k.durum === 'Reddedildi'
      ? 'Onaya Al' + (k.kapiNo ? ' (eski Kapı No ' + k.kapiNo + ' geri verilecek)' : '')
      : 'Kaydı Onayla';
    const form = $('formOnay');
    form.innerHTML = alanlarHtml(k, false);
    form.dataset.kayitId = kayitId;
    form.dataset.mod = 'onay';
    $('pencere').classList.remove('gizli');
  }
  function pencereKapat() { $('pencere').classList.add('gizli'); }

  function odemeAc(kayitId) {
    const k = veri.kayitlar.find(function (x) { return x.id === kayitId; });
    if (!k) return;
    $('pencereBaslik').textContent = '💳 Ödeme — ' + k.pilot + (k.kapiNo ? ' (Kapı No ' + k.kapiNo + ')' : '');
    const form = $('formOnay');
    form.innerHTML = '<p class="aciklama">Ücret: <b>' + esc(ucret()) + ' TL</b> — ödeme tipine dokunun.</p>' +
      '<div class="secimler odeme-tus">' + (C.odemeTipleri || []).map(function (o) {
        return '<button type="button" class="btn birincil buyuk" data-odeme-tipi="' + esc(o) + '">' + esc(o) + '</button>';
      }).join('') + '</div>' +
      '<div class="kart-butonlar"><button type="button" class="btn ince" data-kapat>Vazgeç</button></div>';
    form.dataset.kayitId = kayitId;
    form.dataset.mod = 'odeme';
    $('pencere').classList.remove('gizli');
  }
  $('formOnay').addEventListener('click', function (e) {
    const tus = e.target.closest('[data-odeme-tipi]');
    if (!tus) return;
    const odeme = tus.getAttribute('data-odeme-tipi');
    kuyrugaEkle({ islem: 'isaretle', kayitId: e.currentTarget.dataset.kayitId, alan: 'odeme', deger: true,
                  odeme: odeme, tutar: odeme === 'Ücretsiz' ? '0' : ucret() });
    pencereKapat();
  });

  $('formOnay').addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.target.dataset.mod === 'odeme') return;
    const d = formOku(e.target);
    const hata = formKontrol(d);
    if (hata) { bildir('⚠ ' + hata, 'hata'); return; }
    const kayitId = e.target.dataset.kayitId;
    const sor = mukerrerSor(d.alanlar, kayitId, 'onaylıyor musunuz');
    if (!sor.devam) return;
    kuyrugaEkle({ islem: 'onayla', kayitId: kayitId, alanlar: d.alanlar, odeme: d.odeme, tutar: d.tutar, yineDeEkle: sor.yineDeEkle });
    pencereKapat();
    if (sonBaglanti === false || !navigator.onLine) {
      bildir('📶 İnternet yok. Onay kaydedildi, numara bağlantı gelince verilecek.', 'uyari');
    }
  });
  $('formOnay').addEventListener('click', function (e) { if (e.target.hasAttribute('data-kapat')) pencereKapat(); });
  odemeDegisti($('formOnay'));
  $('pencere').addEventListener('click', function (e) { if (e.target.id === 'pencere') pencereKapat(); });

  // ---------------- Yeni kayıt ----------------
  function yeniFormuHazirla() {
    $('formYeni').innerHTML = alanlarHtml({}, true);
  }
  $('formYeni').addEventListener('submit', function (e) {
    e.preventDefault();
    const d = formOku(e.target);
    const hata = formKontrol(d);
    if (hata) { bildir('⚠ ' + hata, 'hata'); return; }
    const sor = mukerrerSor(d.alanlar, null, 'kaydediyor musunuz');
    if (!sor.devam) return;
    kuyrugaEkle({ islem: 'masaKayit', alanlar: d.alanlar, odeme: d.odeme, tutar: d.tutar, yineDeEkle: sor.yineDeEkle });
    yeniFormuHazirla();
    sekmeAc('onayli');
    if (sonBaglanti === false || !navigator.onLine) {
      bildir('📶 İnternet yok. Kayıt saklandı, numara bağlantı gelince verilecek.', 'uyari');
    }
  });
  odemeDegisti($('formYeni'));

  // ---------------- Liste butonları ----------------
  $('listeBekleyen').addEventListener('click', function (e) {
    const wa = e.target.closest('[data-wa]');
    if (wa) {
      const k = veri.kayitlar.find(function (x) { return x.id === wa.getAttribute('data-wa'); });
      if (k) { waGonder(k); cizBekleyen(); }
      return;
    }
    const onay = e.target.closest('[data-onayla]');
    const red = e.target.closest('[data-reddet]');
    if (onay) onayAc(onay.getAttribute('data-onayla'));
    if (red) reddetSor(red.getAttribute('data-reddet'));
  });
  $('listeOnayli').addEventListener('click', function (e) {
    const wa = e.target.closest('[data-wa]');
    if (wa) {
      const k = veri.kayitlar.find(function (x) { return x.id === wa.getAttribute('data-wa'); });
      if (k) waGonder(k);
      return;
    }
    const isaret = e.target.closest('[data-isaret]');
    if (isaret) {
      const id = isaret.getAttribute('data-id'), alan = isaret.getAttribute('data-isaret');
      const k = veri.kayitlar.find(function (x) { return x.id === id; }) || {};
      const d = isaretDurumu(k, alan);
      if (alan === 'odeme' && !d.acik) { odemeAc(id); return; }   // ekran açılır, yönteme dokununca biter
      if (d.acik && !confirm('"' + k.pilot + '" için ' + (alan === 'kapi' ? 'Kapı No verildi' : 'Ödeme alındı') +
        ' işareti kaldırılsın mı?')) return;
      kuyrugaEkle({ islem: 'isaretle', kayitId: id, alan: alan, deger: !d.acik });
      return;
    }
    const onay = e.target.closest('[data-onayla]');
    const red = e.target.closest('[data-reddet]');
    if (onay) onayAc(onay.getAttribute('data-onayla'));
    if (red) reddetSor(red.getAttribute('data-reddet'));
  });
  function reddetSor(id) {
    const k = veri.kayitlar.find(function (x) { return x.id === id; }) || {};
    const ek = k.durum === 'Onaylandı'
      ? '\n\nBu kayıt ONAYLI (Kapı No ' + k.kapiNo + '). Reddedilirse ' + (C.program || 'ana program') +
        ' bu kaydı almaz. Tekrar onaya alınırsa aynı numara geri verilir.'
      : '';
    const sebep = prompt('"' + (k.pilot || '') + '" kaydı reddedilsin mi?' + ek + '\n\nSebep (isteğe bağlı):', '');
    if (sebep === null) return;
    kuyrugaEkle({ islem: 'reddet', kayitId: id, sebep: sebep });
  }

  // ---------------- Sekmeler ----------------
  function sekmeAc(ad) {
    sekme = ad;
    document.querySelectorAll('.sekmeler button').forEach(function (b) {
      b.classList.toggle('aktif', b.dataset.sekme === ad);
    });
    document.querySelectorAll('.sekme').forEach(function (s) {
      s.classList.toggle('gizli', s.id !== 's-' + ad);
    });
    if (ad === 'bekleyen') $('uyariBandi').classList.add('gizli');
    ciz();
  }
  document.querySelectorAll('.sekmeler button').forEach(function (b) {
    b.addEventListener('click', function () { sekmeAc(b.dataset.sekme); });
  });
  document.querySelectorAll('.filtre button').forEach(function (b) {
    b.addEventListener('click', function () {
      filtre = b.dataset.filtre;
      document.querySelectorAll('.filtre button').forEach(function (x) { x.classList.toggle('aktif', x === b); });
      cizOnayli();
    });
  });
  $('uyariBandi').addEventListener('click', function () { sekmeAc('bekleyen'); });
  $('araBekleyen').addEventListener('input', cizBekleyen);
  $('araOnayli').addEventListener('input', cizOnayli);
  $('kapiTamam').addEventListener('click', sonrakiKapi);
  $('kapiWa').addEventListener('click', function () {
    if (!kapiEkraniKayit) return;
    // Kapı ekranındaki kayıt, listedeki güncel hâliyle (ödeme vb.) gönderilir
    const k = veri.kayitlar.find(function (x) { return x.id === kapiEkraniKayit.id; }) || kapiEkraniKayit;
    waGonder(k);
    $('kapiWa').textContent = '💬 ' + waTurAdi(waTur(k)) + ' · gönderildi';
  });

  // ---------------- Ayarlar ----------------
  function waAktifGoster() {
    [['kayit', 'Kayit', C.whatsappKayitMesaji], ['hatirlatma', 'Hatirlatma', C.whatsappHatirlatmaMesaji],
     ['onay', 'Onay', C.whatsappMesaji], ['tesekkur', 'Tesekkur', C.whatsappTesekkurMesaji]].forEach(function (t) {
      const metin = waSablon(t[0]);
      const varsayilan = metin.trim() === String(t[2] || '').trim();
      const rozet = $('waDurum' + t[1]), kutu = $('waMetin' + t[1]);
      if (!rozet || !kutu) return;
      rozet.textContent = (varsayilan ? 'ORİJİNAL METİN' : '✏ SlalomX\'te DEĞİŞTİRİLDİ') +
        ((ayar.waVarsayilan || 'otomatik') === t[0] ? '  ·  ◀ DÜĞME BUNU GÖNDERİR' : '');
      rozet.className = 'wa-rozet ' + (varsayilan ? 'v' : 'd');
      kutu.textContent = metin;
    });
  }
  $('ayWaVarsayilan').addEventListener('change', function () {
    ayar.waVarsayilan = this.value;
    yaz(D.ayar, ayar);
    waAktifGoster();
    try { cizBekleyen(); cizOnayli(); } catch (e) { /* önemsiz */ }
    bildir('💬 WhatsApp düğmesi artık: ' + (this.value === 'otomatik' ? 'Otomatik' : waTurAdi(this.value)), 'tamam');
  });
  function ayarlariDoldur() {
    waAktifGoster();
    $('ayUrl').value = ayar.url;
    $('ayAnahtar').value = ayar.anahtar;
    $('ayTutar').value = ayar.tutar;
    $('ayWaHedef').value = ayar.waHedef || 'uygulama';
    $('ayWaVarsayilan').value = ayar.waVarsayilan || 'otomatik';
    $('ayMasa').innerHTML = (C.masalar || ['Masa 1']).map(function (m) {
      return '<option' + (m === ayar.masa ? ' selected' : '') + '>' + esc(m) + '</option>';
    }).join('');
  }
  $('ayKaydet').addEventListener('click', async function () {
    const url = $('ayUrl').value.trim();
    if (url && !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
      $('ayDurum').textContent = '⚠ Adres "https://script.google.com/..." ile başlamalı.';
      return;
    }
    const masaDegisti = ayar.masa !== $('ayMasa').value;
    if (masaDegisti && kuyruk.length &&
      !confirm('Gönderilmemiş ' + kuyruk.length + ' işlem var. Masa değişirse bu işlemler eski masa adıyla gönderilir. Devam edilsin mi?')) return;
    ayar = {
      url: url, anahtar: $('ayAnahtar').value.trim().toUpperCase(),
      masa: $('ayMasa').value, tutar: $('ayTutar').value.trim(),
      waHedef: $('ayWaHedef').value, waVarsayilan: $('ayWaVarsayilan').value
    };
    yaz(D.ayar, ayar);
    yeniFormuHazirla();
    $('ayDurum').textContent = '⏳ Bağlantı deneniyor…';
    try {
      const r = await api({ islem: 'ping' });
      $('ayDurum').textContent = r.ok ? '✅ ' + r.mesaj + (r.yaris ? ' — ' + r.yaris : '') : '⚠ ' + r.hata;
      if (r.ok) senkron();
    } catch (e) {
      $('ayDurum').textContent = e.message === 'AYAR'
        ? '⚠ Web uygulaması adresini girin.'
        : '⚠ Bağlanılamadı. İnterneti ve adresi kontrol edin.';
    }
    ciz();
  });
  $('hataTemizle').addEventListener('click', function () { hatalar = []; yaz(D.hatalar, hatalar); cizAyarlar(); });

  // ---------------- Başlangıç ----------------
  document.title = C.uygulamaAdi || document.title;
  $('baslik').textContent = C.uygulamaAdi || 'Kayıt';
  ayarlariDoldur();
  yeniFormuHazirla();
  ciz();
  baglantiGoster(null);
  if (!ayar.url) sekmeAc('ayarlar');

  window.addEventListener('online', senkron);
  window.addEventListener('offline', function () { baglantiGoster(false); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) senkron(); });
  setInterval(senkron, (C.yenilemeSn || 15) * 1000);
  senkron();

  try { $('surumYazi').textContent = 'Uygulama sürümü: ' + (C.surum || '?'); } catch (e) { /* yok */ }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function (k) {
      try { k.update(); } catch (e) { /* önemsiz */ }
    }).catch(function () { /* çevrimdışı önbellek kurulamadı */ });
  }
  // ---------------- Otomatik güncelleme ----------------
  // Sunucudaki sürüm farklıysa uygulama kendini yeniler (açık kalan uygulama da güncellenir)
  let guncellemeSurerken = false;
  async function guncellemeKontrol() {
    if (guncellemeSurerken || !navigator.onLine) return;
    try {
      const metin = await (await fetch('config.js?s=' + Date.now(), { cache: 'no-store' })).text();
      const m = metin.match(/surum:\s*'([^']+)'/);
      if (m && C.surum && m[1] !== C.surum) {
        // aynı sürüm için 5 dakikada bir defadan fazla yenileme (sonsuz döngü olmasın)
        let son = {};
        try { son = JSON.parse(sessionStorage.getItem('sx_guncelleme') || '{}'); } catch (e) { son = {}; }
        if (son.hedef === m[1] && Date.now() - son.zaman < 300000) return;
        try { sessionStorage.setItem('sx_guncelleme', JSON.stringify({ hedef: m[1], zaman: Date.now() })); } catch (e) { /* yok */ }
        await uygulamayiGuncelle();
      }
    } catch (e) { /* çevrimdışı */ }
  }
  async function uygulamayiGuncelle() {
    guncellemeSurerken = true;
    try {
      if ('serviceWorker' in navigator) {
        const kayitlar = await navigator.serviceWorker.getRegistrations();
        await Promise.all(kayitlar.map(function (k) { return k.unregister(); }));
      }
      if (window.caches) {
        const anahtarlar = await caches.keys();
        await Promise.all(anahtarlar.map(function (a) { return caches.delete(a); }));
      }
    } catch (e) { /* önemsiz */ }
    location.replace(location.pathname + '?g=' + Date.now());
  }
  setTimeout(guncellemeKontrol, 3000);
  setInterval(guncellemeKontrol, 120000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) guncellemeKontrol(); });
  try { $('ayGuncelle').addEventListener('click', uygulamayiGuncelle); } catch (e) { /* yok */ }
})();
