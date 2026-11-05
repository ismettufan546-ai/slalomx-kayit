// ============================================================
//  Kayıt masası ayarları — SlalomX
//  (TimeX Kayıt için bu dosyanın kopyasında sadece adlar değişir)
// ============================================================
window.KAYIT_AYAR = {
  uygulamaAdi: 'SlalomX Kayıt',
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
    '{yaris} kaydınız tamamlandı. ✅\n' +
    '\n' +
    '🏁 Kapı No: {kapi}\n' +
    '🚗 Araç: {arac}\n' +
    '🏆 Klasman: {klasman}\n' +
    '💳 Ödeme: {odeme}\n' +
    '\n' +
    'İyi yarışlar!\n' +
    'Kıbrıs Türk Klasik Otomobil Derneği'
};
