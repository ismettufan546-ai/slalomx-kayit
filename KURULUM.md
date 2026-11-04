# SlalomX Kayıt — Kurulum

## 1. Apps Script (bir kez)
1. SlalomX'in form yanıt tablosunu aç → Uzantılar > Apps Script.
2. Apps Script kodunu (ayrı dosya, depoda yok) Kod.gs'e yapıştır, kaydet.
3. Tabloyu yenile → menü **SlalomX Kayıt > 1) Kurulum** → izinleri onayla. Çıkan **bağlantı anahtarını** not et.
4. **SlalomX Kayıt > 2) Mevcut form yanıtlarını aktar**.
5. Dağıt > Yeni dağıtım > Web uygulaması → Çalıştıran: **Ben**, Erişim: **Herkes** → **web uygulaması adresini** kopyala.
   (Kodu sonradan değiştirirsen: Dağıt > Dağıtımları yönet > Düzenle > Yeni sürüm. Adres aynı kalır.)

## 2. GitHub Pages (bir kez)
1. github.com'da yeni depo: `slalomx-kayit` (Public).
2. "Add file > Upload files" ile bu klasördeki dosyaların hepsini yükle
   (index.html, app.js, config.js, style.css, manifest.json, sw.js, icons klasörü).
3. Settings > Pages > Branch: `main`, klasör `/ (root)` → Save.
4. 1-2 dakika sonra adres: `https://KULLANICIADI.github.io/slalomx-kayit/`

## 3. Telefon
1. Adresi telefonda aç (Android: Chrome, iPhone: Safari).
2. Android: ⋮ > Ana ekrana ekle. iPhone: Paylaş > Ana Ekrana Ekle.
3. Uygulamayı aç → ⚙ Ayarlar: web uygulaması adresi, bağlantı anahtarı, **masa** (her telefonda farklı), varsayılan ücret → Kaydet.
   "✅ Bağlantı başarılı" görünmeli.

## Güncelleme
Dosya değiştirince `sw.js` içindeki `SURUM` numarasını artır (v1 → v2), GitHub'a yükle. Telefon bir sonraki açılışta yeni sürümü alır.

## TimeX Kayıt için
Aynı dosyalar; `config.js` içinde uygulamaAdi/program/depoOnEki ve `manifest.json` içinde ad değişir, ayrı depoya yüklenir.
