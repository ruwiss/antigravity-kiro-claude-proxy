# Proje Güncelleme Özeti - PR #170 ve #169

Bu döküman, orijinal depodan (upstream) çekilen #170 ve #169 numaralı Pull Request'ler ile yapılan değişiklikleri özetlemektedir.

## Yapılan İşlemler
1.  **PR #170 Çekildi:** Cihaz parmak izi bağlama özelliği eklendi.
2.  **`ratelimiting` Dalı Oluşturuldu:** Bu özellikler yeni bir dalda toplandı ve `origin`'e push edildi.
3.  **PR #169 Çekildi ve Birleştirildi:** Yeni konfigürasyon ayarları (`new configs`) `ratelimiting` dalına eklendi.
4.  **Çakışmalar Giderildi:** `src/constants.js` dosyasındaki çakışmalar başarıyla çözüldü ve tüm yeni stratejiler dahil edildi.

## Eklenen Özellikler

### 1. Device Fingerprint Binding (#170)
*   Rate limit'leri (istek sınırlarını) azaltmak için cihaz parmak izi bağlama özelliği.
*   Web UI üzerinden parmak izi yönetimi desteği.

### 2. Yeni Konfigürasyonlar ve Stratejiler (#169)
*   **Yeni Hesap Seçim Stratejileri:**
    *   `silent-failover`: Hataları gizle, sessizce hesap değiştir.
    *   `on-demand`: İstek anında hesabı etkinleştir, sonra devre dışı bırak.
    *   `aggressive`: Herhangi bir sorunda anında hesap değiştir.
    *   `quota-first`: Kotası en yüksek olan hesaba öncelik ver.
    *   `conservative`: Bir hesap bitene kadar onu kullanmaya devam et.
*   **Gelişmiş Rate Limit Yönetimi:** İstek sınırlarına karşı daha dirençli yeni ayarlar ve bekleme süreleri eklendi.

## Mevcut Durum
Şu anda `ratelimiting` dalındasınız ve bu dal hem parmak izi bağlama hem de yeni konfigürasyon özelliklerini içermektedir.

---
*Not: Bu dosya Antigravity tarafından otomatik olarak Türkçe oluşturulmuştur.*
