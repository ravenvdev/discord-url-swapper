# Discord URL Swapper

Bağımsız bir Discord **vanity URL swapper** sistemi. `btwtool2-main` içindeki swapper mantığının
temiz, tek başına çalışan JS (Node.js + Express) sürümü.

Bir vanity URL'yi (örn. `discord.gg/ornek`) bir sunucudan silip anında başka bir sunucuya aktarır.
İşlem iki hesap ve her ikisinin **2FA (MFA) şifresini** gerektirir.

## Kurulum

```bash
npm install
```

## Çalıştırma

```bash
npm start
```

Ardından tarayıcıda: **http://localhost:3000**

Windows'ta tek tıkla başlatmak için `start.bat` dosyasını çalıştırabilirsin (ilk açılışta
bağımlılıkları da kurar).

## Nasıl çalışır

1. **Alma hesabı** için MFA token alınır.
2. **Silme hesabı** için MFA token alınır.
3. Mevcut URL, sahibi olan sunucudan silinir (silme token).
4. URL hedef sunucuya `PATCH` ile eklenir (alma token).

Tüm adımlar arayüzde canlı olarak (NDJSON akışı) gösterilir.

## Alanlar

| Alan | Açıklama |
|------|----------|
| Alınacak Vanity URL | Transfer edilecek kod (`discord.gg/` kısmı otomatik temizlenir) |
| Aktarılacak Sunucu ID | URL'nin gideceği sunucu |
| Silecek Token | URL'ye şu an sahip olan hesabın tokenı |
| Silme Hesabı Şifresi | Silme hesabının 2FA şifresi |
| Alacak Token | Hedef sunucunun yönetici tokenı |
| Alma Hesabı Şifresi | Alma hesabının 2FA şifresi |

## Dosya yapısı

```
discord url swapper/
├── server.js        Express sunucusu + /api/swapper ucu
├── swapper.js       Çekirdek motor (HTTP/2, MFA, delete + patch)
├── package.json
├── start.bat        Windows başlatıcı
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

## Notlar

- Her iki hesapta da **2FA açık** olmalı ve verilen şifreler 2FA şifreleridir.
- Alma hesabı, hedef sunucuda **yönetici** yetkisine sahip olmalıdır.
- Node.js **16+** gerekir (`http2` çekirdek modülü kullanılır).
