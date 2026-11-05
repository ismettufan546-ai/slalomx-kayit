// ============================================================
//  Kayıt masası ayarları — SlalomX
//  (TimeX Kayıt için bu dosyanın kopyasında sadece adlar değişir)
// ============================================================
window.KAYIT_AYAR = {
  uygulamaAdi: 'SlalomX Kayıt',
  surum: 'v18',
  program: 'SlalomX',
  // Apps Script'teki ODEME_TIPLERI ile birebir aynı olmalı
  odemeTipleri: ['Nakit', 'Kart', 'Havale', 'Ücretsiz'],
  masalar: ['Masa 1', 'Masa 2', 'Masa 3'],
  varsayilanTutar: 2000,   // Ayarlar'da ücret girilmemişse
  // SlalomX tabloya yazana kadar kullanılacak klasman yıl aralıkları
  klasmanlar: 'E:1940-1960;F:1961-1970;G:1971-1980;H:1981-1990;J:1991-1996;T:1997-2100',
  yenilemeSn: 15,          // kaç saniyede bir liste yenilensin
  depoOnEki: 'sx_',        // telefonda saklanan veri öneki (TimeX'te 'tx_')
  varsayilanYarisAdi: 'KTKOD Klasik Otomobil Slalom yarışı',
  // Kayıt onaylanınca WhatsApp'tan gönderilecek mesaj (Ayarlar'dan değiştirilebilir)
  whatsappMesaji: 'Sayın {pilot},\n' +
    'Yarış kaydınız tamamlandı. ✅\n' +
    '\n' +
    '🏁 Yarış: {yaris}\n' +
    '📅 Tarih: {tarih}\n' +
    '📍 Yer: {yer}\n' +
    '⏰ Start: {saat}\n' +
    '\n' +
    '🚗 Araç: {arac}\n' +
    '🏆 Klasman: {klasman}\n' +
    '\n' +
    '✏ Bilgilerinizde hata varsa size özel bağlantıdan düzeltebilirsiniz:\n' +
    '{link}\n' +
    '\n' +
    'İyi yarışlar!\n' +
    'Kıbrıs Türk Klasik Otomobil Derneği',
  // Form doldurulunca (Bekleyenler) gönderilecek mesaj -- {link}: kişiye özel form düzeltme bağlantısı
  whatsappKayitMesaji: 'Sayın {pilot},\n' +
    'Yarış kaydınız alındı. ✅\n' +
    '\n' +
    '🏁 Yarış: {yaris}\n' +
    '📅 Tarih: {tarih}\n' +
    '📍 Yer: {yer}\n' +
    '⏰ Start: {saat}\n' +
    '\n' +
    '🚗 Araç: {arac}\n' +
    '🏆 Klasman: {klasman}\n' +
    '🚘 Plaka: {plaka}\n' +
    '\n' +
    '✏ Bilgilerinizde hata varsa size özel bağlantıdan düzeltebilirsiniz:\n' +
    '{link}\n' +
    '\n' +
    'Kapı numaranız kayıt masasında verilecektir.\n' +
    'Kıbrıs Türk Klasik Otomobil Derneği'
};
