# V90 – 90 Günlük Challenge Uygulaması
# Specification · Bölüm I: Ürün, Program ve İçerik (§1–§86)

> **Durum:** Normatif. Bu belge ürünün **ne** olduğunu tanımlar: kullanıcı, hedef, V90 antrenman programı, beslenme ve toparlanma stratejisi, ekran listesi ve içerik kuralları.
>
> **Bölüm II (§87–§124)** — [`01-specification.md`](01-specification.md) — bu ürünün **nasıl** inşa edileceğine dair kritik mimari ve ürün kısıtlarını tanımlar. İki bölüm birlikte tam specification'ı oluşturur. Çelişki hâlinde **Bölüm II önceliklidir**: oradaki maddeler mimari güvenlik kısıtlarıdır (veri kaybı, gizlilik, sessiz atlama, sahte kesinlik) ve Bölüm I'in hiçbir ürün tercihi onları geçersiz kılamaz.
>
> **Kimlik şeması:** `R<bölüm>.<sıra>` (örn. `R22.3`). Anahtar sözcükler: **ZORUNLU** (MUST), **YASAK** (MUST NOT), **ÖNERİLİR** (SHOULD), **OLABİLİR** (MAY).
>
> **Sayısal değerler hakkında:** Bu belgedeki kalori, set, hacim ve hedef değerleri **başlangıç noktalarıdır**, kesin reçete değildir. Hepsi kullanıcı tarafından düzenlenebilir (§121, Bölüm II) ve trend verisiyle ayarlanır (§49). Uygulama hiçbirini bilimsel kesinlik olarak sunmaz (§123, Bölüm II).

---

# A. ÜRÜN VE KULLANICI

## §1. Ürün özeti

| ID | Gereksinim |
|----|-----------|
| R1.1 | V90, tek kullanıcılı, **offline-first**, cihazda saklanan bir mobil hipertrofi (kas gelişimi) takip uygulamasıdır. |
| R1.2 | Uygulama 90 günlük yapılandırılmış bir challenge yürütür: antrenman, beslenme, ölçüm, uyku ve toparlanma verisini tek yerde toplar. |
| R1.3 | Uygulama bir **koçtur**: veri toplar, gerekçeli öneri üretir, kararı kullanıcıya bırakır. Otomatik program değiştirmez (bkz. §104, §121 Bölüm II). |
| R1.4 | Sunucu, hesap, giriş ekranı ve bulut senkronizasyonu **YOKTUR**. Tüm veri kullanıcının cihazındadır. |
| R1.5 | Uygulamanın adı `V90`; "V" hedeflenen V-taper siluetini, "90" challenge süresini ifade eder. |

## §2. Kullanıcı ve bağlam

| ID | Gereksinim |
|----|-----------|
| R2.1 | Tek kullanıcı: ticari bir spor salonuna (full commercial gym) düzenli erişimi olan, orta seviye antrenman deneyimine sahip bir yetişkin. |
| R2.2 | Kullanıcı Türkçe konuşur; uygulama dili Türkçedir (§77). |
| R2.3 | Kullanıcı İstanbul'da yaşar ancak seyahat eder; uygulama saat dilimi değişimine dayanıklı olmalıdır (§112, Bölüm II). |
| R2.4 | Kullanıcı haftada 4–5 gün antrenman yapabilecek zamana sahiptir; tipik antrenman süresi 60–75 dakikadır. |
| R2.5 | Uygulama, salon içinde tek elle ve hızlı kullanılabilecek biçimde tasarlanır (§108, Bölüm II). |
| R2.6 | Kullanıcının cinsiyeti, doğum yılı ve diğer demografik alanları **opsiyoneldir** ve girilmediğinde hiçbir hesap bunlara bağımlı olmamalıdır. |

## §3. Ana hedef ve alt hedefler

| ID | Gereksinim |
|----|-----------|
| R3.1 | **Ana hedef: V-taper siluetinin belirginleştirilmesi** — omuz/bel oranının artması. |
| R3.2 | **İkinci hedef: kol gelişimi** — biceps ve triceps kesitinde ölçülebilir artış. Bu, program hacim önceliklerini belirler (§28). |
| R3.3 | **Üçüncü hedef: yağ kaybı** — bel ve karın çevresinin azalması, kas kütlesinin korunması. |
| R3.4 | Öncelikli kaslar: **yan omuz (lateral delts), lats/sırt, biceps, triceps**. Bu dört grup en yüksek haftalık direkt set payını alır (§27). |
| R3.5 | Bacak antrenmanı programın parçasıdır ancak koruyucu/dengeleyici hacimdedir; öncelik değildir (§27). |
| R3.6 | Hedefler kullanıcı tarafından değiştirilebilir **OLABİLİR**; ancak v1'de program şablonu bu hedeflere göre sabittir ve kullanıcı hareket/set düzeyinde özelleştirir. |

## §4. 90 gün sonunda başarı kriterleri

| ID | Gereksinim |
|----|-----------|
| R4.1 | Day 90 raporu (§76) şu metrikleri başlangıç–final olarak gösterir: kilo (7 günlük ortalama), bel, karın, omuz, göğüs, kalça, ön kol, bükülü üst kol, omuz/bel oranı. |
| R4.2 | Uygulama **YASAK** olarak "başarı" için sabit bir sayısal eşik dayatmaz (örn. "8 kg vermelisin"); rapor değişimi ve yönü gösterir, yorumu kullanıcıya bırakır (§123, Bölüm II). |
| R4.3 | Süreç hedefleri de raporlanır: tamamlanan antrenman sayısı, haftalık uyum yüzdesi, ortalama uyku, protein hedefine uyulan gün sayısı. |
| R4.4 | Gerçekçi bir 90 günlük beklenti aralığı bilgilendirme metni olarak sunulur ve **tahmin** olarak etiketlenir; kişiye özel garanti verilmez. |
| R4.5 | Ölçüm alınmamış metrikler raporda **"ölçülmedi"** olarak görünür; sıfır veya tahmini değerle doldurulmaz (§119, Bölüm II). |

## §5. Ürün ilkeleri

| ID | Gereksinim |
|----|-----------|
| R5.1 | **Veri kaybolmaz.** Girilen hiçbir veri uygulama hatası, çökme veya kapanma nedeniyle kaybolmaz (§90, Bölüm II). |
| R5.2 | **Sessiz karar yok.** Uygulama kullanıcı adına antrenman atlamaz, program değiştirmez, hedef güncellemez. |
| R5.3 | **Açıklanabilirlik.** Her önemli öneri gerekçesiyle birlikte gelir (§122, Bölüm II). |
| R5.4 | **Sahte kesinlik yok.** Gürültülü veriden kesin sonuç üretilmez; trendler öne çıkarılır (§123, Bölüm II). |
| R5.5 | **Gizlilik varsayılan.** Sağlık verisi cihazda şifreli durur, dışarı gönderilmez (§93, §116, §118, Bölüm II). |
| R5.6 | **Salon dostu.** Antrenman sırasında etkileşim minimum dokunuşla tamamlanır (§108, Bölüm II). |
| R5.7 | **Kullanıcı otoritedir.** Algoritmanın her çıktısı reddedilebilir veya değiştirilebilir (§121, Bölüm II). |

## §6. Kapsam (v1)

| ID | Gereksinim |
|----|-----------|
| R6.1 | **Kapsam içi:** antrenman planlama ve loglama, progression/plateau önerileri, beslenme loglama ve tarif, vücut ölçümleri ve fotoğraflar, uyku/kardiyo/check-in, takviye takibi, kan tahlili kaydı, yedekleme/geri yükleme, Day 90 raporu. |
| R6.2 | **Kapsam dışı (v1):** çoklu kullanıcı, sosyal/paylaşım özellikleri, bulut senkronizasyonu, giyilebilir cihaz entegrasyonu, barkod tarama, canlı besin API'si, koç–danışan modu, ödeme/abonelik. |
| R6.3 | Kapsam dışı özellikler mimaride **geleceğe kapatılmaz**; ancak v1'de UI'da "yakında" olarak da gösterilmez (§116.3, Bölüm II). |
| R6.4 | Barkod tarama ve harici besin veritabanı v2 adayıdır (§86). |

## §7. Platform ve dağıtım

| ID | Gereksinim |
|----|-----------|
| R7.1 | Hedef platformlar: **iOS ve Android**, React Native + Expo ile tek kod tabanı. |
| R7.2 | Dağıtım kişisel kullanım içindir; mağaza yayını zorunlu değildir (TestFlight / internal distribution yeterlidir). |
| R7.3 | Şifreli veritabanı gereksinimi nedeniyle **Expo Development Build / prebuild ZORUNLUDUR**; Expo Go yalnızca UI prototipleme için kullanılabilir (§93, Bölüm II). |
| R7.4 | Uygulama tablet için optimize edilmek zorunda değildir; telefon dikey (portrait) birincil hedeftir. |

## §8. Dil, birim ve biçim

| ID | Gereksinim |
|----|-----------|
| R8.1 | Arayüz dili **Türkçe**dir. Antrenman terminolojisinde yerleşik İngilizce terimler korunur (set, rep, RIR, drop set, PR). |
| R8.2 | Birimler: kilogram (kg), santimetre (cm), kilokalori (kcal), gram (g), saat/dakika. Pound ve inç v1'de desteklenmez. |
| R8.3 | Tarih biçimi `7 Eylül 2026 Pazartesi`, kısa biçim `07.09.2026`; saat 24 saat düzeninde. |
| R8.4 | Ondalık ayırıcı virgüldür (`82,5 kg`); veri katmanında nokta kullanılır ve dönüşüm yalnızca sunum katmanında yapılır. |
| R8.5 | Yuvarlama kuralları §83'te tanımlıdır. |

## §9. Tek kullanıcı ve veri sahipliği

| ID | Gereksinim |
|----|-----------|
| R9.1 | Uygulama tek profil varsayar; profil seçimi/geçişi yoktur. |
| R9.2 | Kullanıcı tüm verisini istediği an tam olarak dışa aktarabilir (§95, Bölüm II). |
| R9.3 | Kullanıcı tüm verisini silebilir; silme işlemi geri alınamaz olduğu için çift onay ister ve öncesinde yedek almayı önerir. |
| R9.4 | Uygulama hiçbir veriyi analiz, pazarlama veya model eğitimi amacıyla dışarı göndermez (§118, Bölüm II). |

## §10. Bölüm II ile ilişki

| ID | Gereksinim |
|----|-----------|
| R10.1 | Bu belge ürün tanımıdır; mimari, veri modeli ve algoritmalar Bölüm II ve türev belgelerdedir (`02`–`06`). |
| R10.2 | Bölüm I'deki bir ürün tercihi Bölüm II'deki bir kısıtla çelişirse **Bölüm II kazanır** ve Bölüm I güncellenir. |
| R10.3 | Bu belgedeki program verisi (`§21`–`§28`) uygulamada `data/programs/v90.json` seed dosyasının kaynağıdır. |
| R10.4 | Bu belgedeki hareket kataloğu (§35) `data/exercises.json` seed dosyasının kaynağıdır. |
| R10.5 | Bu belgedeki başlangıç değerleri (§11) `data/initial-profile.json` seed dosyasının kaynağıdır (R119.1, Bölüm II). |

---

# B. BAŞLANGIÇ DURUMU VE ÖLÇÜMLER

## §11. Başlangıç antropometrisi

| ID | Gereksinim |
|----|-----------|
| R11.1 | Başlangıç değerleri: **Boy 187 cm**, **Kilo 107 kg**, **Bel 95 cm**, **Karın 114 cm**, **Omuz 137 cm**, **Kalça 119 cm**, **Göğüs 110 cm**, **Ön kol 37 cm**. |
| R11.2 | **Bükülü üst kol (flexed biceps) ölçüsü BİLİNMİYOR**tur ve onboarding'de kullanıcıdan istenir (§96, Bölüm II). |
| R11.3 | Bu değerler onboarding'de kullanıcıya gösterilir ve yalnızca **onaylanırsa** yazılır; kullanıcı tek tek düzenleyebilir veya boş bırakabilir. |
| R11.4 | Başlangıç omuz/bel oranı: `137 ÷ 95 = 1,44`. Bu, V-taper ilerlemesinin referans noktasıdır (§13). |
| R11.5 | Başlangıç değerleri `is_baseline = 1` olarak işaretlenir ve Day 90 raporunun başlangıç sütununu besler. |

## §12. Bilinmeyen ve türetilmeyen değerler

| ID | Gereksinim |
|----|-----------|
| R12.1 | Ölçülmemiş hiçbir değer `0` olarak saklanmaz veya gösterilmez; `null` kalır (§119, Bölüm II). |
| R12.2 | Eksik bir ölçüm için ilgili KPI kartı pasif olur ve **"… ölçümünü ekle."** biçiminde bir CTA gösterir. |
| R12.3 | Uygulama eksik veriyi geçmişten interpolasyon veya formülle **YASAK** olarak doldurmaz. |
| R12.4 | Vücut yağ oranı, yağsız kütle ve bazal metabolizma **hesaplanmaz ve gösterilmez** (§18). |

## §13. Hedef ölçüler ve V-taper tanımı

| ID | Gereksinim |
|----|-----------|
| R13.1 | **V-taper göstergesi = omuz çevresi ÷ bel çevresi.** Artan değer hedeflenen yöndür. |
| R13.2 | Oran yalnızca iki ölçümün birbirine en fazla 3 gün mesafede olduğu çiftlerden hesaplanır; aksi hâlde gösterilmez. |
| R13.3 | 90 günlük yönelim: bel ve karın çevresinin azalması, omuz ve bükülü kol çevresinin korunması veya artması. Sayısal hedef dayatılmaz (R4.2). |
| R13.4 | Kullanıcı isterse her ölçüm sitesi için kendi hedef değerini girebilir **OLABİLİR**; girilen hedef yalnızca görselleştirmede referans çizgisi olarak kullanılır, öneri üretmez. |
| R13.5 | Kol gelişim KPI'sı yalnızca bükülü üst kol baseline'ı alındıktan sonra aktif olur (§96, Bölüm II). |

## §14. Ölçüm siteleri

| ID | Gereksinim |
|----|-----------|
| R14.1 | Takip edilen siteler: bel, karın, omuz, göğüs, kalça, ön kol (sol/sağ/tek), bükülü üst kol (sol/sağ/tek), uyluk (sol/sağ/tek), baldır (sol/sağ/tek), boyun. |
| R14.2 | Zorunlu çekirdek set: **bel, karın, omuz, bükülü üst kol**. Diğerleri opsiyoneldir. |
| R14.3 | Her site için nasıl ölçüleceği görsel ve metinle açıklanır (§97, Bölüm II). |
| R14.4 | Çift taraflı siteler için kullanıcı sol/sağ ayrı veya tek değer girebilir; tek değer girildiğinde taraf ayrımı yapılmaz. |
| R14.5 | Ölçüm rehberi metinleri: **Bel** — her seferinde aynı anatomik noktadan, nefes verirken, mezura yere paralel. **Karın** — göbek deliği hizası. **Omuz** — omuzların en geniş çevresi, kollar yanda gevşek. **Bükülü üst kol** — kol 90°, biceps kasılı, her seferinde aynı pozisyon ve aynı kol. **Göğüs** — meme uçları hizası, nefes normal. **Kalça** — kalçanın en geniş noktası. **Ön kol** — dirsekten 5 cm aşağıda en kalın nokta. |

## §15. Ölçüm sıklığı ve protokolü

| ID | Gereksinim |
|----|-----------|
| R15.1 | Önerilen ölçüm sıklığı: **2 haftada bir**, aynı gün ve aynı koşullarda (sabah, aç karnına, antrenmandan önce). |
| R15.2 | Uygulama daha sık ölçümü engellemez ancak haftadan kısa aralıklarda "ölçüm gürültüsü" bilgisi gösterir. |
| R15.3 | Her ölçümde 2 örnek alınması **ÖNERİLİR**; örnekler arasındaki fark eşiği aşarsa üçüncü ölçüm önerilir (§97, Bölüm II). |
| R15.4 | Kullanıcı tek ölçümle devam edebilir; uygulama bunu engellemez. |
| R15.5 | Ölçüm hatırlatması opsiyonel bir bildirimdir (§79) ve varsayılan kapalıdır. |

## §16. Kilo takibi

| ID | Gereksinim |
|----|-----------|
| R16.1 | Kilo takibi **günlük ÖNERİLİR**, sabah tuvalet sonrası, aç karnına, aynı tartıda. |
| R16.2 | Birincil metrik **7 günlük hareketli ortalamadır**; günlük değer ikincil gösterilir (§123, Bölüm II). |
| R16.3 | Pencerede en az 3 günlük veri yoksa ortalama gösterilmez; "Yeterli tartı yok" bilgisi verilir. |
| R16.4 | Aynı güne birden çok tartı girilirse o günün ortalaması kullanılır. |
| R16.5 | Kilo değişimi asla "kas" veya "yağ" olarak etiketlenmez; yalnızca kilo değişimi olarak sunulur (§123, Bölüm II). |

## §17. Progress fotoğrafları

| ID | Gereksinim |
|----|-----------|
| R17.1 | Önerilen çekim sıklığı: **2 haftada bir**, ölçüm günüyle aynı gün. |
| R17.2 | Standart pozlar: önden, arkadan, sol yan, sağ yan, önden bükülü (front flexed), arkadan bükülü (back flexed). |
| R17.3 | Tutarlılık için rehber: aynı ışık, aynı mesafe, aynı kıyafet, aynı saat. Uygulama önceki fotoğrafı yarı saydam kılavuz olarak gösterebilir **OLABİLİR**. |
| R17.4 | Fotoğraflar uygulamaya özel gizli alanda saklanır, galeriye eklenmez (§116, Bölüm II). |
| R17.5 | Karşılaştırma görünümü iki tarihi yan yana gösterir; tarih ve varsa kilo bilgisi fotoğrafın altında yer alır. |

## §18. Vücut kompozisyonu: yapılmayacaklar

| ID | Gereksinim |
|----|-----------|
| R18.1 | Uygulama vücut yağ oranını çevre ölçümlerinden **YASAK** olarak tahmin edip göstermez. |
| R18.2 | BMI hesaplanmaz ve gösterilmez; boy/kilo oranı hedef veya uyarı olarak kullanılmaz. |
| R18.3 | "Kas kazanımı" ve "yağ kaybı" ayrı ayrı sayısallaştırılmaz (§123, Bölüm II). |
| R18.4 | Bunların yerine gösterilen kanıt: kilo trendi, çevre ölçümleri trendi, gym performansı (yük/tekrar) ve fotoğraflar. |

---

# C. V90 ANTRENMAN PROGRAMI

## §19. Program felsefesi

| ID | Gereksinim |
|----|-----------|
| R19.1 | Program **hipertrofi odaklıdır**: kontrollü teknik, hedef kasta gerilim, makul yakınlıkta başarısızlık (RIR 1–2) ve haftadan haftaya kademeli aşırı yüklenme. |
| R19.2 | Hareket seçimi **makine ve kablo ağırlıklıdır**: öğrenme eğrisi düşük, eklem stresi kontrollü, yük artışı ölçülebilir ve yorgunluk yönetimi kolaydır. |
| R19.3 | Öncelikli kaslar (yan omuz, sırt, biceps, triceps) haftada **en az iki kez** uyarılır (§27). |
| R19.4 | Uzamış pozisyonda gerilim veren hareketlere (incline curl, overhead triceps extension, seated leg curl) programda yer verilir; `lengthenedBias` alanı bunu işaretler (§36). |
| R19.5 | Program bir başlangıç noktasıdır: kullanıcı hareketleri değiştirebilir (§99, Bölüm II), set sayısını düzenleyebilir ve şablonu kalıcı olarak özelleştirebilir. |
| R19.6 | Uygulama **YASAK** olarak programı kullanıcı onayı olmadan değiştirmez (§104.7, Bölüm II). |

## §20. Rotasyon ve haftalık yapı

| ID | Gereksinim |
|----|-----------|
| R20.1 | V90 **5 antrenmanlık döngüsel bir rotasyondur** (`program_templates.is_cyclic = 1`). Sıra sona geldiğinde başa döner. |
| R20.2 | Varsayılan haftalık yerleşim: **Pazartesi–Cuma antrenman, Cumartesi–Pazar dinlenme**. Bir tam rotasyon = bir hafta. |
| R20.3 | Bu yerleşim yalnızca varsayılandır; kullanıcı onboarding'de tercih ettiği günleri seçer (§120, Bölüm II) ve rotasyon o günlere dağıtılır. |
| R20.4 | Haftalık hacim hedefleri (§27) **bir tam rotasyonu** varsayar. Kullanıcı haftada 5'ten az antrenman yaparsa gerçekleşen haftalık set sayısı düşer; uygulama bunu olduğu gibi raporlar, telafi etmeye çalışmaz. |
| R20.5 | Rotasyon takvimden bağımsız ilerler: kaçırılan antrenman sırayı **YASAK** olarak sessizce atlatmaz (§88, Bölüm II). |
| R20.6 | 90 gün ≈ 12,8 hafta ≈ **64 antrenman** (5/hafta tempoyla). Bu bir hedef değil, planlama referansıdır. |

## §21. Antrenman şablonları (genel bakış)

`program_templates.id = 'v90'`, `version = 1`, `is_cyclic = 1`.

| `sequence_order` | `id` | `name` | `name_tr` | Set | Tahmini süre |
|---|---|---|---|---|---|
| 0 | `v90-d1-push` | Day 1 – Push | Gün 1 – İtiş | 17 | 60 dk |
| 1 | `v90-d2-pull` | Day 2 – Pull | Gün 2 – Çekiş | 18 | 62 dk |
| 2 | `v90-d3-legs` | Day 3 – Legs | Gün 3 – Bacak | 18 | 70 dk |
| 3 | `v90-d4-arms-delts` | Day 4 – Arms & Delts | Gün 4 – Kol ve Omuz | 17 | 55 dk |
| 4 | `v90-d5-vtaper-upper` | Day 5 – V-Taper Upper | Gün 5 – V-Taper Üst | 17 | 58 dk |

| ID | Gereksinim |
|----|-----------|
| R21.1 | Şablon adları arayüzde `name_tr` ile gösterilir; `name` teknik referans ve loglama içindir. |
| R21.2 | `sequence_order = 4` olan şablon **"Day 5 – V-Taper Upper"**tır; `trainingSequenceIndex = 4` bu şablona karşılık gelir (§88, Bölüm II). |
| R21.3 | Şablon set sayıları yalnızca **working set**leri sayar; ısınma setleri ayrıdır (§30). |

## §22. Day 1 – Push (Gün 1 – İtiş)

| # | Hareket | Set | Tekrar | Hedef RIR | Dinlenme | Isınma | Birincil kas |
|---|---------|-----|--------|-----------|----------|--------|--------------|
| 1 | Incline Smith Press | 3 | 8–12 | 2 | 150 sn | 2 | Göğüs |
| 2 | Machine Chest Press | 3 | 10–12 | 2 | 120 sn | 1 | Göğüs |
| 3 | Pec Deck | 2 | 12–15 | 1 | 90 sn | 0 | Göğüs |
| 4 | Cable Lateral Raise | 3 | 12–15 | 1 | 90 sn | 1 | Yan omuz |
| 5 | Overhead Cable Triceps Extension | 3 | 10–14 | 1 | 90 sn | 1 | Triceps |
| 6 | Rope Pushdown | 3 | 12–15 | 1 | 75 sn | 0 | Triceps |

**Direkt set:** Göğüs 8 · Yan omuz 3 · Triceps 6 → **17 set**

## §23. Day 2 – Pull (Gün 2 – Çekiş)

| # | Hareket | Set | Tekrar | Hedef RIR | Dinlenme | Isınma | Birincil kas |
|---|---------|-----|--------|-----------|----------|--------|--------------|
| 1 | Lat Pulldown (geniş tutuş) | 3 | 10–12 | 2 | 120 sn | 1 | Lats |
| 2 | Chest Supported Row | 3 | 10–12 | 2 | 120 sn | 1 | Üst sırt |
| 3 | Plate-Loaded Pulldown (nötr tutuş) | 3 | 10–12 | 2 | 120 sn | 0 | Lats |
| 4 | Reverse Pec Deck | 3 | 12–15 | 1 | 75 sn | 0 | Arka omuz |
| 5 | Incline Dumbbell Curl | 3 | 10–12 | 1 | 90 sn | 1 | Biceps |
| 6 | Cable Hammer Curl | 3 | 10–14 | 1 | 75 sn | 0 | Biceps |

**Direkt set:** Lats 6 · Üst sırt 3 · Arka omuz 3 · Biceps 6 → **18 set**

## §24. Day 3 – Legs (Gün 3 – Bacak)

| # | Hareket | Set | Tekrar | Hedef RIR | Dinlenme | Isınma | Birincil kas |
|---|---------|-----|--------|-----------|----------|--------|--------------|
| 1 | Hack Squat | 3 | 8–12 | 2 | 180 sn | 3 | Quadriceps |
| 2 | Leg Press | 2 | 10–14 | 2 | 150 sn | 1 | Quadriceps |
| 3 | Leg Extension | 2 | 12–15 | 1 | 90 sn | 0 | Quadriceps |
| 4 | Seated Leg Curl | 3 | 10–14 | 1 | 90 sn | 1 | Hamstring |
| 5 | Lying Leg Curl | 3 | 10–14 | 1 | 90 sn | 0 | Hamstring |
| 6 | Romanian Deadlift | 2 | 8–12 | 2 | 150 sn | 2 | Hamstring |
| 7 | Standing Calf Raise | 3 | 10–15 | 1 | 90 sn | 1 | Baldır |

**Direkt set:** Quadriceps 7 · Hamstring 8 · Baldır 3 → **18 set**

## §25. Day 4 – Arms & Delts (Gün 4 – Kol ve Omuz)

Öncelikli kaslara ayrılmış gündür (R3.2, R3.4).

| # | Hareket | Set | Tekrar | Hedef RIR | Dinlenme | Isınma | Birincil kas |
|---|---------|-----|--------|-----------|----------|--------|--------------|
| 1 | Machine Lateral Raise | 3 | 12–15 | 1 | 90 sn | 1 | Yan omuz |
| 2 | Single-Arm Cable Lateral Raise | 3 | 12–15 | 1 | 75 sn | 0 | Yan omuz |
| 3 | Machine Preacher Curl | 4 | 10–12 | 1 | 90 sn | 1 | Biceps |
| 4 | Cross-Body Cable Extension | 4 | 12–15 | 1 | 75 sn | 1 | Triceps |
| 5 | Cable Crunch | 3 | 12–20 | 1 | 60 sn | 0 | Karın |

**Direkt set:** Yan omuz 6 · Biceps 4 · Triceps 4 · Karın 3 → **17 set**

## §26. Day 5 – V-Taper Upper (Gün 5 – V-Taper Üst)

Programın imza antrenmanı: lat genişliği ve yan omuz vurgusu.

| # | Hareket | Set | Tekrar | Hedef RIR | Dinlenme | Isınma | Birincil kas |
|---|---------|-----|--------|-----------|----------|--------|--------------|
| 1 | Lat Pulldown (geniş tutuş) | 3 | 10–12 | 2 | 120 sn | 1 | Lats |
| 2 | Seated Cable Row | 3 | 10–12 | 2 | 120 sn | 1 | Üst sırt |
| 3 | Cable Lateral Raise | 3 | 12–15 | 1 | 90 sn | 0 | Yan omuz |
| 4 | Incline Dumbbell Curl | 3 | 10–12 | 1 | 90 sn | 1 | Biceps |
| 5 | Overhead Cable Triceps Extension | 3 | 10–14 | 1 | 90 sn | 0 | Triceps |
| 6 | Machine Chest Press | 2 | 10–12 | 2 | 120 sn | 1 | Göğüs |

**Direkt set:** Lats 3 · Üst sırt 3 · Yan omuz 3 · Biceps 3 · Triceps 3 · Göğüs 2 → **17 set**

## §27. Haftalık direkt set dağılımı

Bir tam rotasyon (5 antrenman) sonunda kas başına **direkt working set** sayısı:

| Kas | Gün 1 | Gün 2 | Gün 3 | Gün 4 | Gün 5 | **Haftalık** | Haftada kaç kez |
|-----|------:|------:|------:|------:|------:|-------------:|:---------------:|
| Yan omuz (lateral delts) | 3 | — | — | 6 | 3 | **12** | 3 |
| Biceps | — | 6 | — | 4 | 3 | **13** | 3 |
| Triceps | 6 | — | — | 4 | 3 | **13** | 3 |
| Lats | — | 6 | — | — | 3 | 9 | 2 |
| Üst sırt | — | 3 | — | — | 3 | 6 | 2 |
| **Lats + Üst sırt (Sırt)** | — | 9 | — | — | 6 | **15** | 2 |
| Göğüs | 8 | — | — | — | 2 | **10** | 2 |
| Hamstring | — | — | 8 | — | — | **8** | 1 |
| Quadriceps | — | — | 7 | — | — | **7** | 1 |
| Arka omuz | — | 3 | — | — | — | 3 | 1 |
| Baldır | — | — | 3 | — | — | 3 | 1 |
| Karın | — | — | — | 3 | — | 3 | 1 |
| **Toplam** | 17 | 18 | 18 | 17 | 17 | **87** | |

| ID | Gereksinim |
|----|-----------|
| R27.1 | Bu tablo Progress ekranındaki **Weekly Sets by Muscle** görünümünün baseline referansıdır (§106, Bölüm II). |
| R27.2 | Sayımda yalnızca **birincil kası hedef alan working setler** yer alır; compound hareketlerin dolaylı katkısı bu tabloya **YASAK** olarak eklenmez (§106.3, Bölüm II). |
| R27.3 | "Sırt" satırı `lats` ve `upperBack` kaslarının sunum düzeyinde birleştirilmiş görünümüdür; analitik her zaman kas bazlı üretilir. |
| R27.4 | Unilateral hareketler (Single-Arm Cable Lateral Raise, Cross-Body Cable Extension) **tek set** sayılır; sol ve sağ ayrı loglansa bile çift sayılmaz (§102.4, Bölüm II). |
| R27.5 | Ön kol, kalça ve ön omuz direkt set almaz; bu kaslar dolaylı çalışır ve secondary analitikte ayrı, **tahmin** etiketiyle gösterilir. |

## §28. Hacim hedefleri ve tavanlar

`muscle_volume_targets` tablosunun seed değerleri:

| Kas | `baseline_weekly_direct_sets` | `max_recommended_weekly_sets` | `is_priority` |
|-----|------------------------------:|------------------------------:|:-------------:|
| `lateralDelts` | 12 | 20 | ✅ |
| `biceps` | 13 | 20 | ✅ |
| `triceps` | 13 | 20 | ✅ |
| `lats` | 9 | 16 | ✅ |
| `upperBack` | 6 | 12 | — |
| `chest` | 10 | 16 | — |
| `hamstrings` | 8 | 12 | — |
| `quads` | 7 | 12 | — |
| `rearDelts` | 3 | 9 | — |
| `calves` | 3 | 9 | — |
| `abs` | 3 | 9 | — |
| `glutes` | 0 | 6 | — |
| `forearms` | 0 | 6 | — |
| `frontDelts` | 0 | 6 | — |
| `lowerBack` | 0 | 6 | — |
| `neck` | 0 | 4 | — |

| ID | Gereksinim |
|----|-----------|
| R28.1 | `max_recommended_weekly_sets`, otomatik hacim önerilerinin **aşamayacağı tavandır** (§105, Bölüm II). |
| R28.2 | Tavan bir "maksimum toparlanabilir hacim" iddiası değildir; muhafazakâr bir güvenlik sınırıdır ve kullanıcı manuel olarak aşabilir. |
| R28.3 | Otomatik öneri haftada kas başına en fazla **+1–2 set** artış önerir (§105.4, Bölüm II). |
| R28.4 | `is_priority` işaretli kaslar hacim önerilerinde önceliklidir; öncelikli olmayan kaslar için otomatik artış önerisi üretilmez. |
| R28.5 | Kullanıcı bu tabloyu Ayarlar'dan düzenleyebilir **OLABİLİR**; düzenleme geçmişi `settings_history`'ye yazılır. |

## §29. Set, tekrar ve RIR şeması

| ID | Gereksinim |
|----|-----------|
| R29.1 | **RIR (Reps In Reserve)** = sette bırakılan tahmini tekrar sayısı. Uygulama RIR'ı `0, 1, 2, 3, 4+` olarak toplar; `4+` veri katmanında `4` olarak saklanır. |
| R29.2 | Bileşik/ağır hareketlerde hedef **RIR 2**, izolasyon hareketlerinde **RIR 1**'dir. |
| R29.3 | Tekrar aralıkları: bileşik 8–12, orta izolasyon 10–14, hafif izolasyon 12–15, karın 12–20. |
| R29.4 | **Double progression:** tüm working setler aralığın üst sınırına ulaşıp hedef RIR korunduğunda yük artırılır; aksi hâlde tekrar artırılır (§104, Bölüm II ve `04-domain-engines.md` §4). |
| R29.5 | RIR öz-bildirimdir ve gürültülüdür; uygulama RIR'ı tek başına kesin bir performans göstergesi olarak **YASAK** olarak sunmaz. |
| R29.6 | RIR girişi **opsiyoneldir**; girilmediğinde progression yalnızca tekrar sayısına bakar. |

## §30. Isınma protokolü

| ID | Gereksinim |
|----|-----------|
| R30.1 | Genel ısınma: 5 dakika düşük tempolu kardiyo + ilgili eklem hazırlığı. Loglanmaz. |
| R30.2 | Hareket bazlı ısınma setleri şablonda `warmup_sets` alanında tanımlıdır (§22–§26). |
| R30.3 | Isınma setleri **PR oluşturmaz** ve progression hesabına girmez (§107.2, §103.5, Bölüm II). |
| R30.4 | Isınma setlerinin loglanması **opsiyoneldir**; kullanıcı atlayabilir. |
| R30.5 | Aynı kası çalıştıran ikinci ve sonraki hareketlerde ısınma seti genelde 0'dır; şablon bunu yansıtır. |

## §31. Dinlenme süreleri

| ID | Gereksinim |
|----|-----------|
| R31.1 | Varsayılan dinlenme süreleri hareket bazında şablonda tanımlıdır: bileşik 150–180 sn, orta 120 sn, izolasyon 75–90 sn, karın 60 sn. |
| R31.2 | Sayaç set tamamlandığında otomatik başlar; kullanıcı atlayabilir veya süreyi anında değiştirebilir. |
| R31.3 | Sayaç arka planda, ekran kilitliyken ve uygulama yeniden başlatıldığında doğru çalışmak **ZORUNDADIR** (§91, Bölüm II). |
| R31.4 | Gerçekleşen dinlenme süresi kaydedilir ve plateau değerlendirmesinde girdi olarak kullanılır (§104.4, Bölüm II). |
| R31.5 | Uygulama kısa dinlenmeyi hata olarak işaretlemez; yalnızca plateau bağlamında bilgi olarak sunar. |

## §32. Tempo ve teknik standartları

| ID | Gereksinim |
|----|-----------|
| R32.1 | Varsayılan tempo: **eksantrik 2 saniye kontrollü**, uzamış pozisyonda kısa duraklama, konsantrik kontrollü. Sayısal tempo kodu (örn. 3-1-1-0) loglanmaz. |
| R32.2 | Her hareket için 3–6 maddelik **teknik ipucu** (`cues`) katalogda saklanır ve video yüklenemediğinde de gösterilir (§114.4, Bölüm II). |
| R32.3 | Hareket açıklığı (ROM) tam olmalıdır; yükü artırmak için ROM kısaltmak **teknik bozulması** sayılır. |
| R32.4 | Kullanıcı bir seti **"form bozuldu"** veya **"ağrı"** olarak işaretleyebilir; bu işaretler progression ve plateau motorlarına girdi olur ve PR'a sayılmaması varsayılan gelir (§107.3, Bölüm II). |
| R32.5 | Uygulama tekniği kamera veya sensörle değerlendirmez; teknik değerlendirmesi tamamen kullanıcı bildirimidir. |

## §33. Progression modeli

| ID | Gereksinim |
|----|-----------|
| R33.1 | Birincil model **double progression**tır (R29.4). |
| R33.2 | Yük artışı hareketin gerçek artış adımına yuvarlanır; imkânsız değer önerilmez (§100, Bölüm II). |
| R33.3 | Yük ölçeği hareket türüne göre yorumlanır: assisted hareketlerde **yardımın azalması** ilerlemedir (§101, Bölüm II). |
| R33.4 | Öneriler gerekçeli sunulur ve kullanıcı **Kabul / Değiştir / Yok say** seçeneklerine sahiptir (§121, §122, Bölüm II). |
| R33.5 | Tek kötü antrenman program değişikliği tetiklemez; durağanlık en az 3 ardışık exposure ile değerlendirilir (§104, Bölüm II). |

## §34. Deload

| ID | Gereksinim |
|----|-----------|
| R34.1 | Program **zorunlu takvimsel deload içermez**; deload ihtiyaca göre önerilir. |
| R34.2 | Deload önerisi şu durumlarda üretilir: plateau tespiti sonrası toparlanma göstergeleri iyiyken (§104), veya kullanıcı üst üste yüksek yorgunluk/düşük enerji bildirdiğinde. |
| R34.3 | Önerilen deload biçimi: **bir hafta boyunca yüklerde ~%10 azaltma, set sayısını koruma**, veya set sayısını yarıya indirip yükü koruma. |
| R34.4 | Deload **YASAK** olarak otomatik uygulanmaz; kullanıcı kabul ederse program şablonu geçici olarak değil, o haftanın önerilen değerleri olarak sunulur. |
| R34.5 | Kullanıcı istediği zaman kendi kararıyla programı dondurabilir (§89, Bölüm II); dondurma deload'un yerine geçen meşru bir seçenektir. |

## §35. Egzersiz kataloğu (seed)

`data/exercises.json` seed içeriği. Kısaltmalar: **LPT** = `loadProgressionType` (`ext` = `externalLoadHigherIsHarder`, `asst` = `assistanceLowerIsHarder`, `bw` = `bodyweight`, `bw+` = `bodyweightPlusExternalLoad`), **LB** = `lengthenedBias` (0–3), **Uni** = unilateral, **Inc** = `defaultIncrementKg`.

| `id` | Ad | Birincil | İkincil | Hareket kalıbı | Ekipman | LB | Seviye | LPT | Uni | Inc |
|------|-----|----------|---------|----------------|---------|:--:|--------|-----|:---:|----:|
| `incline-smith-press` | Incline Smith Press | chest | frontDelts, triceps | horizontalPush | smithMachine, adjustableBench | 2 | intermediate | ext | — | 2.5 |
| `machine-chest-press` | Machine Chest Press | chest | frontDelts, triceps | horizontalPush | selectorizedMachine | 2 | beginner | ext | — | 5 |
| `pec-deck` | Pec Deck | chest | frontDelts | horizontalPush | pecDeck | 3 | beginner | ext | — | 5 |
| `cable-lateral-raise` | Cable Lateral Raise | lateralDelts | frontDelts | lateralRaise | cableStation | 3 | beginner | ext | — | 2.5 |
| `machine-lateral-raise` | Machine Lateral Raise | lateralDelts | — | lateralRaise | selectorizedMachine | 2 | beginner | ext | — | 5 |
| `single-arm-cable-lateral-raise` | Single-Arm Cable Lateral Raise | lateralDelts | — | lateralRaise | cableStation | 3 | beginner | ext | ✅ | 2.5 |
| `dumbbell-lateral-raise` | Dumbbell Lateral Raise | lateralDelts | — | lateralRaise | dumbbells | 1 | beginner | ext | — | 2 |
| `overhead-cable-triceps-extension` | Overhead Cable Triceps Extension | triceps | — | elbowExtension | cableStation | 3 | beginner | ext | — | 2.5 |
| `rope-pushdown` | Rope Pushdown | triceps | — | elbowExtension | cableStation | 1 | beginner | ext | — | 2.5 |
| `cross-body-cable-extension` | Cross-Body Cable Extension | triceps | — | elbowExtension | cableStation | 2 | beginner | ext | ✅ | 2.5 |
| `dip-machine` | Triceps Dip Machine | triceps | chest, frontDelts | elbowExtension | selectorizedMachine | 1 | beginner | ext | — | 5 |
| `lat-pulldown` | Lat Pulldown | lats | biceps, upperBack | verticalPull | latPulldown | 2 | beginner | ext | — | 2.5 |
| `plate-loaded-pulldown` | Plate-Loaded Pulldown | lats | biceps, upperBack | verticalPull | plateLoadedMachine | 2 | beginner | ext | — | 2.5 |
| `assisted-pullup` | Assisted Pull-up | lats | biceps, upperBack | verticalPull | assistedPullupMachine | 2 | beginner | asst | — | 5 |
| `pullup` | Pull-up | lats | biceps, upperBack | verticalPull | pullupBar | 2 | advanced | bw+ | — | 2.5 |
| `chest-supported-row` | Chest Supported Row | upperBack | lats, biceps, rearDelts | horizontalPull | chestSupportedRow | 2 | beginner | ext | — | 2.5 |
| `seated-cable-row` | Seated Cable Row | upperBack | lats, biceps | horizontalPull | cableStation | 2 | beginner | ext | — | 2.5 |
| `reverse-pec-deck` | Reverse Pec Deck | rearDelts | upperBack | rearDeltFly | pecDeck | 2 | beginner | ext | — | 5 |
| `incline-dumbbell-curl` | Incline Dumbbell Curl | biceps | forearms | elbowFlexion | dumbbells, adjustableBench | 3 | beginner | ext | — | 2 |
| `cable-hammer-curl` | Cable Hammer Curl | biceps | forearms | elbowFlexion | cableStation | 2 | beginner | ext | — | 2.5 |
| `machine-preacher-curl` | Machine Preacher Curl | biceps | forearms | elbowFlexion | preacherBench, selectorizedMachine | 2 | beginner | ext | — | 5 |
| `bayesian-cable-curl` | Bayesian Cable Curl | biceps | forearms | elbowFlexion | cableStation | 3 | intermediate | ext | ✅ | 2.5 |
| `ez-bar-curl` | EZ Bar Curl | biceps | forearms | elbowFlexion | barbells | 1 | beginner | ext | — | 2.5 |
| `hack-squat` | Hack Squat | quads | glutes, hamstrings | kneeDominant | hackSquat | 3 | intermediate | ext | — | 5 |
| `leg-press` | Leg Press | quads | glutes, hamstrings | kneeDominant | legPress | 2 | beginner | ext | — | 5 |
| `smith-squat` | Smith Machine Squat | quads | glutes, hamstrings | kneeDominant | smithMachine | 2 | intermediate | ext | — | 2.5 |
| `leg-extension` | Leg Extension | quads | — | kneeExtension | legExtension | 1 | beginner | ext | — | 5 |
| `seated-leg-curl` | Seated Leg Curl | hamstrings | calves | kneeFlexion | legCurl | 3 | beginner | ext | — | 5 |
| `lying-leg-curl` | Lying Leg Curl | hamstrings | calves | kneeFlexion | legCurl | 2 | beginner | ext | — | 5 |
| `romanian-deadlift` | Romanian Deadlift | hamstrings | glutes, lowerBack | hipHinge | barbells | 3 | intermediate | ext | — | 2.5 |
| `standing-calf-raise` | Standing Calf Raise | calves | — | calfRaise | selectorizedMachine | 3 | beginner | ext | — | 5 |
| `cable-crunch` | Cable Crunch | abs | — | trunkFlexion | cableStation | 2 | beginner | ext | — | 2.5 |

**Eklem stresi profilleri** (`jointStressProfile`, 0–3) yalnızca sıfır olmayan değerlerle: `incline-smith-press` omuz 2, dirsek 1 · `pec-deck` omuz 2 · `cable-lateral-raise` omuz 1 · `machine-lateral-raise` omuz 1 · `overhead-cable-triceps-extension` dirsek 2, omuz 1 · `rope-pushdown` dirsek 1 · `lat-pulldown` omuz 1 · `pullup` omuz 2, dirsek 1 · `chest-supported-row` omuz 1 · `incline-dumbbell-curl` dirsek 2 · `ez-bar-curl` bilek 2, dirsek 1 · `machine-preacher-curl` dirsek 2 · `hack-squat` diz 2, bel 1 · `leg-press` diz 2, bel 1 · `smith-squat` diz 2, bel 2 · `leg-extension` diz 2 · `romanian-deadlift` bel 3, kalça 1 · `standing-calf-raise` ayak bileği 1.

**Alternatif ilişkileri** (`exercise_relations`, öncelik sırasıyla): `cable-lateral-raise` → `machine-lateral-raise`, `dumbbell-lateral-raise` · `lat-pulldown` → `assisted-pullup`, `plate-loaded-pulldown` · `hack-squat` → `leg-press`, `smith-squat` · `machine-preacher-curl` → `ez-bar-curl`, `bayesian-cable-curl` · `chest-supported-row` → `seated-cable-row` · `overhead-cable-triceps-extension` → `dip-machine`, `rope-pushdown` · `seated-leg-curl` → `lying-leg-curl` · `machine-chest-press` → `incline-smith-press`, `pec-deck`.

**Teknik ipuçları (`cues`)** — video yüklenemediğinde gösterilen çekirdek içerik (§32.2, §114.4 Bölüm II):

| `id` | İpuçları |
|------|----------|
| `incline-smith-press` | Bank 30°, kürek kemikleri sıkışık ve sabit · Bar göğsün üst kısmına inecek · Dirsekler gövdeyle ~45° açı · Altta 1 sn kontrollü duraklama |
| `machine-chest-press` | Oturak yüksekliği tutamaklar göğüs hizasında olacak şekilde · Sırt desteğe yapışık · Sonda dirsekleri kilitleme · Kontrollü geri dönüş |
| `pec-deck` | Dirsek açısı sabit kalır, kol açılıp kapanmaz · Gerilmiş pozisyonda 1 sn bekle · Göğüsle sıkıştır, kollarla itme |
| `cable-lateral-raise` | Makara en alt konumda, kol gövdenin önünden başlar · Kolu omuz hizasına kadar kaldır, daha yukarı çıkma · Bilek nötr, serçe parmak hafif yukarıda · İnişi 2 sn kontrol et |
| `machine-lateral-raise` | Ped kolun üst kısmına gelsin, dirseğe değil · Omuz yukarı kaçmadan sadece kolu kaldır · Tepe noktada kısa duraklama |
| `single-arm-cable-lateral-raise` | Boştaki elle sabit bir noktadan destek al · Gövdeyi sallandırma · Her iki tarafta aynı tutuş ve mesafe |
| `dumbbell-lateral-raise` | Hafif öne eğil, dirsekler hafif bükülü · Ağırlığı savurmadan kaldır · Zirvede omuzları kulağa çekme |
| `overhead-cable-triceps-extension` | Dirsekler baş hizasında sabit, dışa açılmasın · Kolu tam gerdirmeden önce uzamış pozisyonu hisset · Gövdeyi öne eğerek sabitle |
| `rope-pushdown` | Dirsekler gövdeye yapışık · Sonda ipi hafifçe dışa aç · Omuz öne düşmesin |
| `cross-body-cable-extension` | Kolu gövdenin çaprazına doğru uzat · Dirsek sabit, yalnızca ön kol hareket eder · Zirvede 1 sn sık |
| `dip-machine` | Sırt desteğe yapışık, omuzlar aşağıda · Dirsekleri gövdeye yakın tut · Tam kilitleme yapma |
| `lat-pulldown` | Omuz genişliğinin biraz dışında tutuş · Önce omuzları aşağı indir, sonra çek · Barı köprücük kemiğine getir, boyna değil · Yukarıda lat gerilmesini hisset |
| `plate-loaded-pulldown` | Nötr tutuş, göğüs yukarı · Dirsekleri cebe doğru çek · Üst pozisyonda kontrollü uzama |
| `assisted-pullup` | Yardım ağırlığını azaltmak ilerlemedir · Tam asılı pozisyondan başla · Çeneyi bara zorlamadan göğsü yukarı taşı |
| `pullup` | Kürek kemiklerini önce aşağı-geri kilitle · Sallanma ve tekme yok · İnişi 2 sn kontrol et |
| `chest-supported-row` | Göğüs pede yapışık, gövde sabit · Dirsekleri geriye ve aşağıya çek · Zirvede kürekleri sık, gövdeyi kaldırma |
| `seated-cable-row` | Diz hafif bükülü, bel nötr · Gövdeyi geriye yatırma · Çekişte omuzları geriye ve aşağıya |
| `reverse-pec-deck` | Kolları omuz hizasında yatay tut · Dirsek açısı sabit · Trapezi kasmadan arka omuzla aç |
| `incline-dumbbell-curl` | Bank 45–60°, kollar gövdenin gerisinde serbest · Alt pozisyonda tam uzama, bu hareketin amacı budur · Dirseği öne getirme |
| `cable-hammer-curl` | Nötr tutuş, bilek sabit · Dirsek gövde yanında kalır · İnişi kontrol et |
| `machine-preacher-curl` | Koltuk altı pede tam otursun · Alt pozisyonda dirseği tamamen açma, gerilimi koru · Zirvede 1 sn sık |
| `bayesian-cable-curl` | Kablo arkadan gelir, kol gövdenin gerisinde · Uzamış pozisyonda gerilim maksimum · Gövdeyi sabit tut |
| `ez-bar-curl` | Bilek nötr, EZ barın açılı yerinden tut · Dirsekler sabit, gövde sallanmaz · İnişi 2 sn |
| `hack-squat` | Ayaklar platformun ortasında, omuz genişliğinde · Topuklar yerde, diz ayak ucu yönünde · Kalçayı pedden ayırmadan in · Dizleri sonda kilitleme |
| `leg-press` | Ayaklar platformda orta-yüksek · Bel destekten kalkmadan in · Diz ~90° veya rahat olduğun kadar · Sonda kilitleme yok |
| `smith-squat` | Ayaklar bardan biraz önde · Gövde dik, bel nötr · Kontrollü in, dipte duraklama yok |
| `leg-extension` | Diz eklemi makinenin dönüş ekseniyle hizalı · Sonda 1 sn sık · İnişi kontrol et, ağırlığı bırakma |
| `seated-leg-curl` | Kalça sabit, gövde dik · Uzamış pozisyonda hamstring gerilmesini hisset · Kalçayı kaldırma |
| `lying-leg-curl` | Kalça pede yapışık · Topuğu kalçaya doğru çek · İnişi kontrol et |
| `romanian-deadlift` | Bel nötr, kürekler sıkışık · Kalçayı geriye it, diz hafif bükülü sabit · Bar bacağa yakın seyreder · Hamstring gerilmesi bitince dur, yere kadar inme |
| `standing-calf-raise` | Ayak ön kısmı basamakta, topuk boşta · Altta tam uzama, üstte 1 sn sıkma · Diz sabit |
| `cable-crunch` | Kalça sabit, hareket yalnızca omurgadan · Gövdeyi kıvırarak in, kalçadan bükme · Nefesi vererek sık |

| ID | Gereksinim |
|----|-----------|
| R35.1 | Katalog **küratörlüdür**: her hareketin tüm alanları elle doldurulur, otomatik veya tahmini üretilmez. |
| R35.2 | Kullanıcı kendi hareketini ekleyebilir (`is_custom = 1`); zorunlu alanlar aynıdır. |
| R35.3 | Seed güncellemeleri kullanıcının düzenlediği alanları **YASAK** olarak ezmez (§111 mantığının hareketlere uygulanması). |
| R35.4 | Katalogdaki bir hareket silinemez; yalnızca `is_deleted = 1` ile gizlenir, böylece geçmiş kayıtlar bozulmaz. |

## §36. Egzersiz alan tanımları

| Alan | Anlamı |
|------|--------|
| `primaryMuscle` | Setin haftalık **direkt** hacim sayımında sayıldığı kas (§27.2). |
| `secondaryMuscles` | Anlamlı dolaylı katkı alan kaslar; yalnızca ayrı, tahmini analitikte kullanılır. |
| `movementPattern` | Hareket amacı; alternatif önerisinde en belirleyici ikinci ölçüttür (§99, Bölüm II). |
| `equipment` | Hareketin yapılabilmesi için **hepsi** gereken ekipman etiketleri. |
| `lengthenedBias` | 0 = yok, 3 = uzamış pozisyonda belirgin gerilim. Alternatif seçiminde ve program tasarımında kullanılır (R19.4). |
| `skillLevel` | Teknik zorluk; kullanıcı seviyesinin üstündeki hareketler alternatif listesinde uyarıyla gösterilir. |
| `jointStressProfile` | Eklem başına 0–3 stres tahmini; kullanıcının ağrı bölgeleriyle eşleşen adaylar cezalandırılır. |
| `loadProgressionType` | Yükün nasıl yorumlanacağı (§101, Bölüm II). |
| `isUnilateral` | Tek taraflı çalışılıyorsa `true`; taraf bazlı loglama ve çift sayım koruması için. |
| `defaultIncrementKg` | Varsayılan minimum yük artışı; kullanıcı düzenleyebilir (§100, Bölüm II). |
| `cues` | Türkçe teknik ipuçları; video fallback'inin çekirdeğidir (§114, Bölüm II). |

## §37. Ekipman varsayımı

| ID | Gereksinim |
|----|-----------|
| R37.1 | Varsayılan ekipman profili **full commercial gym**tır: tüm etiketler mevcut kabul edilir (§98.3, Bölüm II). |
| R37.2 | V90 şablonu bu varsayımla tasarlanmıştır; ekipman eksikse alternatif motoru devreye girer (§99, Bölüm II). |
| R37.3 | Kullanıcı ekipman profilini daralttığında mevcut şablon **otomatik değişmez**; yapılamayan hareketler antrenman ekranında rozetle işaretlenir ve değiştirme kısayolu sunulur. |
| R37.4 | Vücut ağırlığı hareketleri her zaman mevcut kabul edilir. |

## §38. Egzersiz videoları

| ID | Gereksinim |
|----|-----------|
| R38.1 | Her hareket için **küratörlü** bir video referansı tutulur; runtime'da arama yapılmaz (§114, Bölüm II). |
| R38.2 | Video seçim ölçütleri: hareketin doğru ve tam ROM ile gösterilmesi, açıklamanın teknik olması, kanalın güvenilirliği, videonun kısa ve reklamsız olması. |
| R38.3 | Video kaynağı bulunamayan hareketler için `cues` metni ve statik görsel yeterlidir; hareket katalogda **eksik sayılmaz**. |
| R38.4 | Videolar indirilip yeniden host edilmez; resmi gömülü oynatıcı kullanılır (§114.5, Bölüm II). |
| R38.5 | Manifest düzenli olarak doğrulanır (`npm run verify:exercise-videos`, §115, Bölüm II). |

## §39. Antrenman süresi ve yoğunluk

| ID | Gereksinim |
|----|-----------|
| R39.1 | Hedef antrenman süresi **55–70 dakika** (ısınma dahil, genel ısınma hariç). |
| R39.2 | Kullanıcının onboarding'de bildirdiği tipik süre şablonun tahmini süresinden belirgin kısaysa, uygulama **bilgi** verir ve hareket sayısını azaltmayı önerir; kendiliğinden kısaltmaz. |
| R39.3 | Uygulama antrenman süresini ölçer (`started_at_utc` → `completed_at_utc`) ancak süreyi bir performans göstergesi olarak sunmaz. |
| R39.4 | Süper set ve drop set v1'de şablonda yer almaz; kullanıcı isterse set tipi olarak `dropset` loglayabilir. |

## §40. Kardiyo ve günlük hareket

| ID | Gereksinim |
|----|-----------|
| R40.1 | Önerilen kardiyo: **haftada 3–4 kez, 25–40 dakika düşük–orta şiddet** (eğimli yürüyüş, bisiklet). |
| R40.2 | Kardiyo antrenmandan **sonra** veya ayrı bir zamanda yapılır; ağır bacak gününden hemen önce yapılması önerilmez. |
| R40.3 | Günlük adım hedefi başlangıç olarak **8.000–10.000** adımdır; adım verisi elle girilir (giyilebilir entegrasyonu v1'de yoktur). |
| R40.4 | Kardiyo kaydı: tür, süre, opsiyonel mesafe ve ortalama nabız. Yakılan kalori **hesaplanmaz ve gösterilmez** (§123, Bölüm II). |
| R40.5 | Kardiyo, kalori hedefini otomatik olarak **YASAK** olarak artırmaz; hedef yalnızca kilo trendine göre ayarlanır (§49). |

---

# D. BESLENME

## §41. Beslenme stratejisi

| ID | Gereksinim |
|----|-----------|
| R41.1 | 90 günlük strateji: **kas kütlesini koruyarak/artırarak yağ kaybı** — orta düzeyde kalori açığı, yüksek protein, korunan antrenman performansı. |
| R41.2 | Agresif açık, sıfır karbonhidrat, uzun açlık veya "detoks" yaklaşımları programın parçası **DEĞİLDİR** ve uygulama bunları önermez. |
| R41.3 | Beslenme hedefleri **başlangıç tahminidir**; gerçek ayarlama kilo trendi, bel ölçüsü ve gym performansı üzerinden yapılır (§49). |
| R41.4 | Uygulama besin yasaklamaz; hedeflere uyulduğu sürece besin seçimi kullanıcıya aittir. |
| R41.5 | Beslenme loglama **sürtünmesiz olmak ZORUNDADIR**: kopyala, tekrarla, kayıtlı öğün ve tarif özellikleri çekirdek gereksinimdir (§109, §110, Bölüm II). |

## §42. Kalori başlangıç hedefi

| ID | Gereksinim |
|----|-----------|
| R42.1 | Başlangıç günlük hedef: **2.800 kcal**. |
| R42.2 | Bu değer 107 kg vücut ağırlığı ve orta aktivite için ~3.200–3.400 kcal tahmini idame üzerinden **yaklaşık 500 kcal açık** varsayar. |
| R42.3 | İdame tahmini bir aralıktır ve uygulamada **kesin bir sayı olarak YASAK** gösterilmez; yalnızca hedefin nasıl türetildiği açıklanır. |
| R42.4 | Hedef kullanıcı tarafından her zaman değiştirilebilir; değişiklik `nutrition_targets` tablosunda tarihli olarak saklanır. |
| R42.5 | Hedeflenen kilo kaybı hızı: **haftada vücut ağırlığının %0,4–0,7'si** (≈ 0,4–0,75 kg). Bu bir aralıktır, günlük hedef değildir. |

## §43. Protein

| ID | Gereksinim |
|----|-----------|
| R43.1 | Başlangıç protein hedefi: **200 g/gün** (≈ 1,9 g/kg mevcut ağırlık). |
| R43.2 | Protein hedefi kalori açığı sırasında **öncelikli** hedeftir; diğer makrolar esnetilebilir. |
| R43.3 | Günlük protein 3–5 öğüne dağıtılır; öğün başına 35–50 g **ÖNERİLİR**. |
| R43.4 | Uygulama protein hedefine uyumu günlük ve haftalık yüzde olarak gösterir; bu veri plateau değerlendirmesinde girdi olur (§104.4, Bölüm II). |
| R43.5 | Protein hedefinin aşılması uyarı üretmez. |

## §44. Yağ ve karbonhidrat

| ID | Gereksinim |
|----|-----------|
| R44.1 | Başlangıç yağ hedefi: **80 g/gün** (≈ 0,75 g/kg) — hormonal ve besinsel taban. |
| R44.2 | Başlangıç karbonhidrat hedefi: **320 g/gün** (kalan kaloriler). |
| R44.3 | Makro dağılımı: 2.800 kcal = 200 g protein (800 kcal) + 320 g karbonhidrat (1.280 kcal) + 80 g yağ (720 kcal). |
| R44.4 | Karbonhidratın antrenman öncesi/sonrası öğünlerde yoğunlaştırılması **ÖNERİLİR** ancak zorunlu değildir. |
| R44.5 | Lif hedefi: **30–40 g/gün**. Lif takibi opsiyoneldir ve eksik veriden hedef ihlali çıkarılmaz. |
| R44.6 | Kalori ayarlaması yapıldığında değişiklik varsayılan olarak **karbonhidrattan** alınır; yağ tabanı 0,6 g/kg altına indirilmez. |

## §45. Öğün düzeni

| ID | Gereksinim |
|----|-----------|
| R45.1 | Desteklenen öğün slotları: kahvaltı, öğle, akşam, ara öğün, antrenman öncesi, antrenman sonrası. |
| R45.2 | Öğün zamanlaması serbesttir; uygulama belirli bir yeme penceresi dayatmaz. |
| R45.3 | Antrenman öncesi öğün 1–3 saat önce, protein + karbonhidrat içerecek biçimde **ÖNERİLİR**. |
| R45.4 | Aynı gün ve slot için birden fazla kayıt olabilir; uygulama bunları gruplar. |
| R45.5 | Öğün kaydı geriye dönük yapılabilir; tarih seçici gün anahtarını açıkça belirler (§112, Bölüm II). |

## §46. Besin veritabanı ve kaynak

| ID | Gereksinim |
|----|-----------|
| R46.1 | Uygulama, Türkiye'de yaygın besinleri kapsayan bir **seed besin listesi** ile gelir (yaklaşık 150–250 kalem: temel protein kaynakları, tahıllar, süt ürünleri, meyve/sebze, yağlar, yaygın markalı ürünler). |
| R46.2 | Her besin `source`, `servingUnit`, `lastUpdated` ve `customEdited` alanlarını taşır (§111, Bölüm II). |
| R46.3 | Seed değerleri **tek doğru gerçek değildir**; kullanıcı etiket üzerindeki değerlerle override edebilir ve override korunur. |
| R46.4 | Besin değerleri 100 g üzerinden saklanır; porsiyon birimleri gram karşılığıyla tanımlanır. |
| R46.5 | Uygulama besinleri "iyi/kötü", "temiz/kirli" olarak **YASAK** olarak etiketlemez. |

## §47. Tartım ve porsiyon

| ID | Gereksinim |
|----|-----------|
| R47.1 | Mutfak tartısı kullanımı **ÖNERİLİR**; pişmemiş (çiğ) ağırlık üzerinden giriş varsayılandır. |
| R47.2 | Pişmiş ağırlıkla çalışmak isteyen kullanıcı için tarif özelliği pişmiş verim (cooked yield) girişini destekler (§110, Bölüm II). |
| R47.3 | Göz kararı porsiyonlar kabul edilir; uygulama bunu hata olarak işaretlemez, yalnızca tutarlılığın önemini bir kez açıklar. |
| R47.4 | Yağlar ve kalorisi yoğun besinler için tartım özellikle önerilir (bilgi metni). |

## §48. Su ve tuz

| ID | Gereksinim |
|----|-----------|
| R48.1 | Günlük su hedefi başlangıç olarak **3–3,5 litre**; sıcak havada ve yoğun antrenmanda artar. |
| R48.2 | Su takibi opsiyoneldir ve eksik su kaydı hiçbir öneriyi engellemez. |
| R48.3 | Tuz kısıtlaması önerilmez; ani kilo dalgalanmalarının su/tuz kaynaklı olabileceği trend metinlerinde açıklanır (§123, Bölüm II). |

## §49. Ayarlama kuralları

| ID | Gereksinim |
|----|-----------|
| R49.1 | Kalori hedefi **en fazla 2 haftada bir** gözden geçirilir; daha sık ayarlama önerilmez (gürültü). |
| R49.2 | Karar girdileri: son 2 haftanın **7 günlük kilo ortalaması eğilimi**, **bel ölçüsü değişimi** ve **gym performansı** (yük/tekrar trendi). |
| R49.3 | Kilo değişimi hedef aralığın altındaysa (< ~0,2 kg/hafta) **ve** bel ölçüsü değişmediyse: günlük **−150 ila −200 kcal** (karbonhidrattan) önerilir. |
| R49.4 | Kilo kaybı hedef aralığın üstündeyse (> ~1,0 kg/hafta) **veya** gym performansı belirgin düşüyorsa: günlük **+150 kcal** önerilir. |
| R49.5 | Kilo sabit ama bel azalıyor **ve** performans korunuyorsa: **değişiklik önerilmez** ve gerekçe gösterilir — "Bel çevren azaldı ve gym performansın yükseldi." (R122.2, Bölüm II). |
| R49.6 | Her ayarlama önerisi gerekçeli sunulur ve **Kabul / Değiştir / Yok say** seçenekleriyle gelir (§121, Bölüm II). |
| R49.7 | Uygulama kalori hedefini **YASAK** olarak kendiliğinden değiştirmez. |
| R49.8 | Yeterli veri yoksa (2 haftada 4 günden az tartı veya ölçüm yok) öneri üretilmez; bunun yerine "Öneri için daha fazla veri gerekiyor" bilgisi gösterilir. |

## §50. Diyet arası ve refeed

| ID | Gereksinim |
|----|-----------|
| R50.1 | 6–8 haftada bir, **1 haftalık idame arası (diet break)** opsiyonel olarak önerilir. |
| R50.2 | Diyet arasında hedef idame seviyesine çekilir (≈ +400–500 kcal, karbonhidrattan); protein korunur. |
| R50.3 | Diyet arası uygulama tarafından **otomatik başlatılmaz**; öneri olarak sunulur. |
| R50.4 | Tek günlük refeed'ler v1'de ayrı bir özellik değildir; kullanıcı hedefini o gün için elle değiştirebilir. |
| R50.5 | Diyet arasında kilo artışı beklenen bir sonuçtur ve uygulama bunu trend metninde açıklar; "geri alma" veya suçlayıcı dil kullanılmaz (§77). |

## §51. Dışarıda yemek ve esneklik

| ID | Gereksinim |
|----|-----------|
| R51.1 | Uygulama tahmini giriş yapmayı destekler; kullanıcı yaklaşık porsiyon ve besin seçerek hızlıca loglayabilir. |
| R51.2 | Loglanmamış gün "başarısız gün" olarak işaretlenmez; adherence hesabında yalnızca **loglanmış günler** paydaya girer ve loglanan gün sayısı ayrıca gösterilir. |
| R51.3 | Uygulama telafi davranışı (ertesi gün kalori kısma, ekstra kardiyo) **YASAK** olarak önermez. |

## §52. Takviyeler

| ID | Takviye | Doz | Zamanlama | Kanıt düzeyi | Not |
|----|---------|-----|-----------|--------------|-----|
| R52.1 | Kreatin monohidrat | 5 g/gün | Günün herhangi bir saati, her gün | Güçlü | Yükleme gerekmez |
| R52.2 | Whey/protein tozu | İhtiyaca göre | Protein hedefini tamamlamak için | Güçlü (pratik) | Besin değil, kolaylık |
| R52.3 | D vitamini | Lab sonucuna göre | Yağlı öğünle | Orta (eksiklik varsa) | Yalnızca eksiklik doğrulanırsa |
| R52.4 | Omega-3 (EPA/DHA) | 1–2 g/gün | Öğünle | Orta | Balık tüketimi düşükse |
| R52.5 | Kafein | 100–200 mg | Antrenmandan 30–45 dk önce | Güçlü | Uykuya 8 saatten yakın alınmaz |
| R52.6 | Magnezyum | 200–400 mg | Akşam | Zayıf–orta | Uyku/kramp şikâyeti varsa |

| ID | Gereksinim |
|----|-----------|
| R52.7 | Takviyelerin tamamı **opsiyoneldir**; hiçbiri programın çalışması için gerekli değildir. |
| R52.8 | Uygulama takviye satmaz, markaya yönlendirmez ve bağlantı vermez. |
| R52.9 | Kanıt düzeyi her takviyenin yanında gösterilir; "yağ yakıcı", "test booster" gibi kategoriler programda yer almaz. |
| R52.10 | D vitamini ve benzeri, lab sonucuna bağlı takviyeler için uygulama **doktora danışılmasını** açıkça belirtir (§59). |

---

# E. TOPARLANMA VE SAĞLIK

## §53. Uyku hedefi

| ID | Gereksinim |
|----|-----------|
| R53.1 | Başlangıç uyku hedefi: **7,5 saat/gece** (kabul edilebilir aralık 7–9 saat). |
| R53.2 | Hedef onboarding'de kullanıcı tarafından belirlenir; girilmezse öneri üretmeyen alanlar (§105 hacim önerisi) devre dışı kalır. |
| R53.3 | Uyku hijyeni önerileri kısa bilgi kartları olarak sunulur: sabit yatış saati, yatmadan önce ekran/kafein azaltma, karanlık ve serin oda. |
| R53.4 | Uygulama uykuyu **ölçmez** (sensör yok); yalnızca kullanıcı bildirimini kaydeder. |

## §54. Uyku takibi

| ID | Gereksinim |
|----|-----------|
| R54.1 | Uyku kaydı: yatış saati, uyanış saati (veya doğrudan süre) ve 1–5 arası kalite puanı. |
| R54.2 | Kayıt **uyanılan güne** aittir. |
| R54.3 | Uyku ortalaması 7 günlük pencerede hesaplanır; pencerede 4'ten az kayıt varsa ortalama gösterilmez. |
| R54.4 | Uyku verisi plateau kontrol listesinin ikinci maddesidir (§104.4, Bölüm II) ve hacim önerisi kapılarından biridir (§105.3, Bölüm II). |
| R54.5 | Uygulama uyku puanı, "toparlanma skoru" veya benzeri birleşik bir sayı **YASAK** olarak üretmez (§123, Bölüm II). |

## §55. Günlük check-in

| ID | Gereksinim |
|----|-----------|
| R55.1 | Günde en fazla bir kez, dört soruluk kısa check-in: **kas ağrısı (soreness)**, **enerji**, **stres**, **motivasyon** — her biri 1–5. |
| R55.2 | Ölçek yönleri: kas ağrısı 1 = yok … 5 = çok yüksek; enerji, stres ve motivasyon 1 = çok düşük … 5 = çok yüksek. Bu yönler arayüzde etiketle gösterilir. |
| R55.3 | Check-in tamamen opsiyoneldir; atlanan gün eksik veri olarak işlenir, ceza veya seri (streak) bozulması yoktur. |
| R55.4 | Check-in verisi yalnızca öneri kapılarında ve plateau kontrol listesinde kullanılır; tek başına bir skora dönüştürülmez. |
| R55.5 | Uygulama check-in verisinden ruh hâli veya psikolojik durum **YASAK** olarak çıkarımı yapmaz. |

## §56. Ağrı, sakatlık ve kırmızı bayraklar

| ID | Gereksinim |
|----|-----------|
| R56.1 | Kullanıcı onboarding'de mevcut ağrı/sakatlık bölgelerini bildirebilir (opsiyonel); bu bilgi alternatif hareket önerisini etkiler (§99, Bölüm II). |
| R56.2 | Set düzeyinde **ağrı işaretleme** mümkündür; işaretli set yük artışı önerisini engeller (`04-domain-engines.md` §4). |
| R56.3 | Bir harekette üst üste ağrı işaretlendiğinde uygulama alternatif hareket önerir ve **doktora/fizyoterapiste danışılmasını** belirtir. |
| R56.4 | Uygulama sakatlık teşhisi koymaz, tedavi veya rehabilitasyon protokolü **YASAK** olarak önermez. |
| R56.5 | Keskin ağrı, uyuşma, şişlik veya hareket kısıtlılığı bildirildiğinde gösterilecek tek mesaj: antrenmanı durdur ve sağlık profesyoneline başvur. |

## §57. Kan tahlilleri

| ID | Gereksinim |
|----|-----------|
| R57.1 | Program başlangıcında (veya ilk 2 hafta içinde) ve 90. gün civarında kan tahlili yaptırılması **ÖNERİLİR**; zorunlu değildir. |
| R57.2 | Uygulama tahlil **kaydeder ve trendini gösterir**; yorum veya teşhis yapmaz. |
| R57.3 | Her sonuç için değer, birim, laboratuvarın referans aralığı ve tarih saklanır. |
| R57.4 | Referans aralığı dışındaki değerler görsel olarak işaretlenir ve yanında **"Bu sonucu doktorunla değerlendir."** metni yer alır. |
| R57.5 | Lab verileri gizliliğe duyarlı ekran olarak ele alınır (§94.4, Bölüm II). |

## §58. Takip edilen lab markerları

| Panel | Markerlar |
|-------|-----------|
| Metabolik | Açlık glukozu, HbA1c, insülin (opsiyonel) |
| Lipid | Total kolesterol, LDL, HDL, trigliserit |
| Karaciğer / böbrek | ALT, AST, GGT, kreatinin, eGFR, ürik asit |
| Hemogram | Hemoglobin, hematokrit, lökosit, trombosit |
| Demir | Ferritin, demir, transferrin satürasyonu |
| Vitamin / mineral | D vitamini (25-OH), B12, folat, magnezyum |
| Tiroid | TSH, sT4, (gerekirse sT3) |
| Hormon (opsiyonel) | Total testosteron, serbest testosteron, SHBG, estradiol, prolaktin |
| İnflamasyon | CRP (hs-CRP) |

| ID | Gereksinim |
|----|-----------|
| R58.1 | Bu liste bir **panel önerisi değildir**; hangi testlerin yapılacağına kullanıcı ve hekimi karar verir. |
| R58.2 | Uygulama listede olmayan marker'ların elle eklenmesine izin verir. |
| R58.3 | Referans aralıkları laboratuvara göre değişir; uygulama **kendi referans aralığını YASAK** olarak dayatmaz, kullanıcının girdiği aralığı kullanır. |
| R58.4 | Marker trendleri yalnızca aynı birimde ve en az iki ölçümle gösterilir. |

## §59. Tıbbi sorumluluk sınırı

| ID | Gereksinim |
|----|-----------|
| R59.1 | Uygulama **tıbbi cihaz değildir** ve tıbbi tavsiye vermez. Bu, ilk açılışta bir kez ve Labs ekranında kalıcı olarak belirtilir. |
| R59.2 | Uygulama hastalık teşhis etmez, ilaç önermez, tedavi planlamaz. |
| R59.3 | Lab sonuçları, ağrı bildirimleri ve sağlık verileri için tek yönlendirme **sağlık profesyoneline danışmak**tır. |
| R59.4 | Beslenme ve antrenman içeriği genel sağlıklı yetişkin varsayımıyla hazırlanmıştır; kronik hastalık, gebelik, ilaç kullanımı gibi durumlarda hekime danışılmalıdır. |
| R59.5 | Uygulama acil durum işlevi içermez ve içerdiğini ima etmez. |

## §60. Stres ve yaşam yükü

| ID | Gereksinim |
|----|-----------|
| R60.1 | Yüksek stres ve düşük uyku dönemlerinde performans düşüşü **beklenen** bir sonuç olarak açıklanır; bu dönemlerde hacim artışı önerilmez (§105.3, Bölüm II). |
| R60.2 | Uygulama stres yönetimi tavsiyesi vermez; yalnızca stresi bir bağlam verisi olarak kullanır. |
| R60.3 | Programı dondurma (§89, Bölüm II) stresli veya yoğun dönemler için meşru ve teşvik edilen bir seçenektir; kullanımı olumsuz bir sinyal olarak sunulmaz. |

---

# F. UYGULAMA YAPISI VE EKRANLAR

## §61. Ekran haritası

| Sekme / bölge | Rota | Ekran | Bölüm |
|---------------|------|-------|-------|
| — | `/onboarding/*` | Onboarding akışı | §62 |
| Ana | `/(tabs)/` | Dashboard | §63 |
| Program | `/(tabs)/program` | Program ve takvim | §64 |
| — | `/workout/active` | Aktif antrenman | §65 |
| — | `/workout/summary` | Antrenman özeti ve bitirme | §65 |
| Program | `/workout/history`, `/exercise/[id]` | Geçmiş ve hareket detayı | §66 |
| İlerleme | `/(tabs)/progress` | Progress (grafikler, hacim) | §67 |
| İlerleme | `/progress/measurements` | Ölçümler | §68 |
| İlerleme | `/progress/photos` | Fotoğraflar | §69 |
| Beslenme | `/(tabs)/nutrition` | Günlük beslenme | §70 |
| Beslenme | `/nutrition/recipes`, `/nutrition/saved-meals` | Tarifler ve kayıtlı öğünler | §71 |
| Beslenme | `/nutrition/supplements` | Takviyeler | §72 |
| İlerleme | `/progress/sleep`, `/progress/cardio` | Uyku ve kardiyo | §73 |
| İlerleme | `/progress/labs` | Kan tahlilleri | §74 |
| Ayarlar | `/(tabs)/settings/*` | Ayarlar | §75 |
| İlerleme | `/progress/report` | Day 90 raporu | §76 |

| ID | Gereksinim |
|----|-----------|
| R61.1 | Alt sekme çubuğu dört sekme içerir: **Ana**, **Program**, **Beslenme**, **İlerleme**. Ayarlar Ana ekrandan ve İlerleme'den erişilir. |
| R61.2 | Aktif antrenman ekranı sekme çubuğunun üstünde tam ekran açılır; aktif oturum varken Ana ekranda kalıcı bir "Antrenmana dön" çubuğu bulunur. |
| R61.3 | Her ekranın boş, yükleniyor, hata ve normal durumları tanımlıdır (§82, ayrıntı `06-ux-flows.md`). |
| R61.4 | Hiçbir ekran veri hatasında beyaz ekran vermez (§117, Bölüm II). |

## §62. Onboarding

| ID | Gereksinim |
|----|-----------|
| R62.1 | Onboarding adımları: (1) karşılama ve sorumluluk reddi, (2) antrenman profili, (3) ekipman profili, (4) başlangıç ölçüleri, (5) bükülü üst kol ölçümü, (6) beslenme hedefleri, (7) program başlangıç tarihi ve tercih edilen günler, (8) özet ve başlat. |
| R62.2 | Antrenman profili adımı şunları toplar: deneyim (başlangıç/orta/ileri), salon tipi (full commercial / home / limited), tipik antrenman süresi, tercih edilen antrenman günleri, uyku hedefi, mevcut ağrı bölgeleri (opsiyonel). |
| R62.3 | Bu bilgiler programı **YASAK** olarak tamamen değiştirmez; yalnızca önerileri, ekipman filtresini ve planlamayı iyileştirir (§120, Bölüm II). |
| R62.4 | Başlangıç ölçüleri adımında §11 değerleri **önerilen değerler** olarak gösterilir; kullanıcı onaylar, düzenler veya "kendim gireceğim" der. |
| R62.5 | Bükülü üst kol ölçümü ayrı bir adımda, ölçüm rehberiyle birlikte istenir; kullanıcı **"Sonra"** diyebilir ve dashboard'da kalıcı CTA görür (§96, Bölüm II). |
| R62.6 | Onboarding her adımda atlanabilir olmalıdır; yalnızca program başlangıç tarihi zorunludur. |
| R62.7 | Onboarding tamamlanmadan uygulama kullanılabilir olmalıdır (kısmi profil ile). |

## §63. Dashboard (Ana)

| ID | Gereksinim |
|----|-----------|
| R63.1 | Üst blokta **`Day X / 90`** sayacı ve program durumu (aktif/dondurulmuş) yer alır. |
| R63.2 | Kart öncelik sırası: (1) devam eden antrenman, (2) kısmi antrenman kararı bekliyor, (3) kaçırılan antrenman, (4) bugünün/sıradaki antrenmanı, (5) açık öneriler, (6) KPI'lar. |
| R63.3 | KPI kartları: kilo (7 günlük ortalama), omuz/bel oranı, kol gelişimi, haftalık uyum, haftalık direkt set. |
| R63.4 | Ölçümü olmayan KPI kartı pasif gösterilir ve ilgili CTA'yı taşır; **asla `0` göstermez** (§96, §119, Bölüm II). |
| R63.5 | Dashboard tek ekranda kaydırmasız olarak en kritik üç bilgiyi göstermelidir: gün, sıradaki antrenman, bekleyen karar. |

## §64. Program ve takvim

| ID | Gereksinim |
|----|-----------|
| R64.1 | 90 günlük takvim görünümü: her gün için durum (tamamlandı / kısmi / atlandı / kaçırıldı / planlı / dondurulmuş / boş). |
| R64.2 | Takvim **gerçek takvim günlerine** göre ilerler; antrenman sırası ayrı gösterilir (§88, Bölüm II). |
| R64.3 | Sıradaki antrenman kartı şablon adını, hareket listesini ve tahmini süreyi gösterir; buradan antrenman başlatılır. |
| R64.4 | Gelecek antrenmanlar **öngörü** olarak gösterilir ve saklanmaz; bir kaçırma tüm takvimi kaydırmaz. |
| R64.5 | Program ayarları bu ekrandan erişilir: **Programı Dondur**, takvim modu (strict / active), antrenman sırasını düzelt, şablon özelleştirme. |

## §65. Aktif antrenman ve bitirme

| ID | Gereksinim |
|----|-----------|
| R65.1 | Hareket listesi sırayla ilerler; her hareket için planlanan set sayısı, tekrar aralığı ve hedef RIR görünür. |
| R65.2 | Set girişi büyük sayısal kontroller, +/− hızlı artış butonları ve önceki değer ön-doldurma ile yapılır (§108, Bölüm II). |
| R65.3 | Ekranda her zaman erişilebilir eylemler: seti tamamla, dinlenmeyi atla, hareketi değiştir, hareketi atla, not ekle. |
| R65.4 | Unilateral hareketlerde **Both Same / Track Separately** seçeneği bulunur (§102, Bölüm II). |
| R65.5 | Bitirme ekranı tam/kısmi ayrımını otomatik belirler; kısmi ise **"Bugün burada bitir"** akışına girer (§103, Bölüm II). |
| R65.6 | Özet ekranı: süre, toplam set, PR'lar, hareket bazında yapılan/planlanan set, antrenman tarihi (düzenlenebilir) ve not alanı. |

## §66. Geçmiş ve hareket detayı

| ID | Gereksinim |
|----|-----------|
| R66.1 | Antrenman geçmişi tarihe göre listelenir; her kayıt durumu (tamamlandı/kısmi/iptal) ve özetini gösterir. |
| R66.2 | Hareket detay ekranı: teknik ipuçları, video (varsa), kişisel rekorlar, yük/tekrar grafiği ve son 10 exposure tablosu. |
| R66.3 | Grafik varsayılan olarak **tek hareket** üzerinden çizilir; kullanıcı "Aile olarak göster" ile varyantları birleştirebilir (§99, Bölüm II). |
| R66.4 | Geçmiş kayıtlar düzenlenebilir; her düzenleme denetim kaydı bırakır ve PR'lar yeniden hesaplanır. |
| R66.5 | Hareket değiştirildiğinde eski hareketin geçmişi **kaybolmaz** (§99.5, Bölüm II). |

## §67. Progress

| ID | Gereksinim |
|----|-----------|
| R67.1 | Sekmeler: **Vücut** (kilo, ölçümler), **Antrenman** (hacim, PR, uyum), **Yaşam** (uyku, kardiyo, check-in). |
| R67.2 | **Weekly Sets by Muscle** görünümü direkt setleri gösterir; ikincil katkı ayrı sekmede ve **"tahmini"** etiketiyle sunulur (§106, Bölüm II). |
| R67.3 | Her kas satırı baseline ve tavan değerlerine göre konumlandırılır (§28). |
| R67.4 | Kilo grafiği 7 günlük ortalamayı çizgi, günlük değerleri nokta olarak gösterir (§123, Bölüm II). |
| R67.5 | Tüm tahmini metrikler rozetle işaretlenir. |

## §68. Ölçümler

| ID | Gereksinim |
|----|-----------|
| R68.1 | Ölçüm ekleme akışı: site seç → rehber göster → 1–3 örnek gir → final değeri onayla. |
| R68.2 | İki örnek arasındaki fark eşiği aşarsa üçüncü ölçüm önerilir; kullanıcı yine de kaydedebilir (§97, Bölüm II). |
| R68.3 | Her site için geçmiş liste ve trend grafiği bulunur. |
| R68.4 | Başlangıç (baseline) ölçümü ayrı işaretlenir ve raporda başlangıç sütununu besler. |
| R68.5 | Ölçüm silme çift onay ister; silinen ölçüm KPI ve rapordan da düşer. |

## §69. Fotoğraflar

| ID | Gereksinim |
|----|-----------|
| R69.1 | Fotoğraflar tarihe ve poza göre gruplanır. |
| R69.2 | Karşılaştırma görünümü iki tarihi yan yana veya kaydırmalı gösterir. |
| R69.3 | Ekran gizliliğe duyarlıdır: arka plana geçişte perde, Android'de opsiyonel ekran görüntüsü engelleme (§94, §116, Bölüm II). |
| R69.4 | Silme işlemi dosyayı da siler (§116.4, Bölüm II). |
| R69.5 | Fotoğraflar galeriye **YASAK** olarak otomatik kaydedilmez. |

## §70. Beslenme

| ID | Gereksinim |
|----|-----------|
| R70.1 | Günlük görünüm: kalori ve makro halkaları (hedef vs gerçekleşen), öğün slotları ve girişler. |
| R70.2 | Hızlı ekleme yolları: **Dünü kopyala**, **Öğünü kopyala**, **Kahvaltıyı tekrarla**, **Kayıtlı öğün**, **Favoriler**, **Son kullanılanlar** (§109, Bölüm II). |
| R70.3 | Besin arama; sonuçlar favoriler → son kullanılanlar → seed sırasıyla gösterilir. |
| R70.4 | Girişler gram cinsinden saklanır; porsiyon birimleri gram'a çevrilir. |
| R70.5 | Kalori hedefinin aşılması kırmızı/uyarı diliyle **YASAK** olarak sunulmaz; nötr bilgi verilir (§77). |

## §71. Tarifler ve kayıtlı öğünler

| ID | Gereksinim |
|----|-----------|
| R71.1 | Tarif oluşturma: malzeme + gram; toplam besin değeri otomatik hesaplanır (§110, Bölüm II). |
| R71.2 | Pişmiş toplam ağırlık girilebilir; porsiyon girildiğinde makrolar bu orana göre hesaplanır. |
| R71.3 | Pişmiş ağırlık girilmemişse ham toplam kullanılır ve kullanıcıya belirtilir. |
| R71.4 | Kayıtlı öğünler tek dokunuşla güne eklenir. |
| R71.5 | Tarif düzenlendiğinde geçmiş öğün kayıtları **değişmez** (snapshot korunur). |

## §72. Takviyeler

| ID | Gereksinim |
|----|-----------|
| R72.1 | Takviye listesi: ad, doz, birim, zamanlama; aktif/pasif durumu. |
| R72.2 | Günlük işaretleme tek dokunuşla yapılır; geçmiş takvimde görünür. |
| R72.3 | §52 tablosu başlangıç önerisi olarak sunulur; kullanıcı hepsini silebilir. |
| R72.4 | Uygulama takviye hatırlatması gönderebilir **OLABİLİR**; varsayılan kapalıdır. |

## §73. Uyku ve kardiyo

| ID | Gereksinim |
|----|-----------|
| R73.1 | Uyku kaydı: yatış/uyanış veya doğrudan süre + kalite (1–5). |
| R73.2 | Kardiyo kaydı: tür, süre, opsiyonel mesafe ve ortalama nabız; **kalori yakımı gösterilmez** (§40.4). |
| R73.3 | Her ikisi de haftalık özet ve trend olarak gösterilir. |
| R73.4 | Eksik günler grafikte boşluk olarak görünür; sıfır olarak çizilmez. |

## §74. Kan tahlilleri (Labs)

| ID | Gereksinim |
|----|-----------|
| R74.1 | Sonuç ekleme: panel, marker, değer, birim, referans aralığı, tarih, laboratuvar adı (opsiyonel). |
| R74.2 | Marker bazlı trend görünümü ve referans aralığı bandı. |
| R74.3 | Referans dışı değerlerde **"Bu sonucu doktorunla değerlendir."** metni gösterilir; yorum yapılmaz (§57, §59). |
| R74.4 | Ekran gizliliğe duyarlıdır (§94.4, Bölüm II). |

## §75. Ayarlar

| ID | Bölüm | İçerik |
|----|-------|--------|
| R75.1 | Program | Programı dondur/devam ettir, takvim modu, şablon özelleştirme, antrenman sırasını düzelt |
| R75.2 | Salon ekipmanı | Ekipman profili ve preset seçimi (§98, Bölüm II) |
| R75.3 | Hareket ayarları | Hareket bazında minimum artış adımı ve mevcut yükler (§100, Bölüm II) |
| R75.4 | Beslenme | Kalori ve makro hedefleri, hedef geçmişi |
| R75.5 | Güvenlik | Face ID / Touch ID / biyometrik kilit, gecikme toleransı, Android ekran görüntüsü engelleme |
| R75.6 | Yedekleme | Dışa aktar, içe aktar, son yedek zamanı, yedek hatırlatması |
| R75.7 | Bildirimler | Dinlenme sayacı, antrenman, ölçüm ve takviye hatırlatmaları (§79) |
| R75.8 | Gizlilik | Analytics durumu (v1: kapalı ve yok), veri silme |
| R75.9 | Hakkında | Sürüm, sorumluluk reddi, açık kaynak lisansları |

## §76. Day 90 raporu

| ID | Gereksinim |
|----|-----------|
| R76.1 | Rapor 90. gün geçildiğinde veya kullanıcı programı tamamladığında üretilir; otomatik olarak program kapatılmaz. |
| R76.2 | İçerik: başlangıç–final metrik tablosu, antrenman istatistikleri, PR listesi, kas bazlı hacim özeti, fotoğraf karşılaştırması, kullanıcı notları. |
| R76.3 | Başlangıç değeri baseline kaydından, final değer son 7 günün medyanından alınır; eksikse **"ölçülmedi"** yazılır (§4.5). |
| R76.4 | Rapor salt okunurdur ve dışa aktarılabilir; hiçbir hedefi otomatik değiştirmez. |
| R76.5 | `activeDays` modunda rapor hem aktif gün hem takvim günü sayısını gösterir (§89, Bölüm II). |

---

# G. İÇERİK, DİL VE KALİTE

## §77. Türkçe içerik ve ton

| ID | Gereksinim |
|----|-----------|
| R77.1 | Ton: **sakin, nesnel, destekleyici**. Suçlayıcı, motivasyonel-zorlayıcı veya abartılı dil kullanılmaz. |
| R77.2 | Yasaklı dil örnekleri: "başarısız oldun", "hedefi kaçırdın", "bugün de mi?", "mükemmel vücut", "yağ yak". |
| R77.3 | Tercih edilen dil: "bu antrenman kaydedilmedi", "7 günlük ortalaman şu yönde", "bu hafta 3 antrenman tamamladın". |
| R77.4 | Hata mesajları Türkçe, anlaşılır ve **aksiyon içerir** (§117.5, Bölüm II). |
| R77.5 | Uygulama seri (streak) mekaniği, rozet veya ceza kullanmaz; süreklilik uyum yüzdesiyle gösterilir. |
| R77.6 | Metinler tek bir sözlük dosyasında toplanır; yasaklı ifade listesi otomatik testle denetlenir (`04-domain-engines.md` §9.2). |

## §78. Terminoloji sözlüğü

| Terim | Türkçe karşılık / kullanım |
|-------|----------------------------|
| Set | set (çevrilmez) |
| Rep / repetition | tekrar |
| RIR | RIR (kısaltma korunur, ilk kullanımda "kalan tekrar" açıklaması) |
| Working set | working set / çalışma seti |
| Warmup set | ısınma seti |
| PR (personal record) | PR / kişisel rekor |
| Deload | deload (çevrilmez) |
| Plateau | plateau / durağanlık |
| Progression | progression / ilerleme |
| Volume | hacim |
| Adherence | uyum |
| Baseline | başlangıç ölçümü |
| Challenge day | Day X / 90 |
| Substitution | hareket değiştirme |

| ID | Gereksinim |
|----|-----------|
| R78.1 | Terminoloji tüm ekranlarda tutarlı kullanılır; aynı kavram için iki farklı kelime kullanılmaz. |
| R78.2 | Kısaltmalar ilk kullanımda açıklanır; sözlük Ayarlar > Hakkında altında erişilebilir. |

## §79. Bildirimler

| ID | Gereksinim |
|----|-----------|
| R79.1 | Tüm bildirimler **yereldir**; push sunucusu yoktur. |
| R79.2 | Bildirim türleri: dinlenme sayacı bitişi (varsayılan **açık**), antrenman günü hatırlatması (kapalı), ölçüm hatırlatması (kapalı), takviye hatırlatması (kapalı), yedekleme hatırlatması (açık, aylık). |
| R79.3 | Bildirim izni reddedilirse uygulamanın hiçbir çekirdek özelliği bozulmaz (§91.5, Bölüm II). |
| R79.4 | Bildirim metinleri hassas veri içermez (ölçüm, kilo, lab değeri yazılmaz). |
| R79.5 | Uygulama pazarlama veya "geri dön" tipi bildirim göndermez. |

## §80. Erişilebilirlik

| ID | Gereksinim |
|----|-----------|
| R80.1 | Tüm etkileşimli öğeler en az **44×44 pt** dokunma alanına sahiptir; salon kullanımı için set butonları daha büyüktür. |
| R80.2 | Metin/arka plan kontrast oranı en az **4.5:1**; kritik sayılar için daha yüksek. |
| R80.3 | Uygulama sistem yazı tipi boyutunu takip eder; büyük yazı boyutunda düzen bozulmaz. |
| R80.4 | Renk tek başına anlam taşımaz; durumlar ikon ve metinle de ayırt edilir (uyum renkleri dahil). |
| R80.5 | Ekran okuyucu etiketleri sayısal kontroller ve durum kartları için tanımlıdır. |

## §81. Performans hedefleri

| ID | Gereksinim |
|----|-----------|
| R81.1 | Soğuk açılıştan Dashboard'un kullanılabilir olmasına kadar geçen süre **< 2 saniye** (referans cihazda). |
| R81.2 | Set kaydetme işlemi (dokunuştan UI güncellemesine) **< 100 ms**. |
| R81.3 | Bir seti loglamak uçtan uca **3–5 saniyeden uzun sürmemelidir** (§108.4, Bölüm II). |
| R81.4 | Aktif antrenman ekranı hiçbir koşulda ağ beklemez; tüm çekirdek antrenman özellikleri çevrimdışı çalışır (AT-18, Bölüm II). |
| R81.5 | 90 günlük tam veri (≈ 5.000 set kaydı) ile grafikler **< 500 ms** içinde çizilir. |

## §82. Boş ve ilk kullanım durumları

| ID | Gereksinim |
|----|-----------|
| R82.1 | Her boş durum üç şey içerir: ne olduğunu açıklayan bir cümle, tek bir birincil eylem, gereksiz görsel yok. |
| R82.2 | Boş durum metni **YASAK** olarak sıfır değer göstermez ("0 cm", "0 kg" yerine "Henüz ölçüm yok"). |
| R82.3 | İlk hafta boyunca trend gerektiren kartlar "Veri toplanıyor" durumunda gösterilir. |
| R82.4 | Öneri motoru yeterli veri olmadığında sessiz kalmaz; nedenini açıklar (§49.8). |

## §83. Sayı biçimlendirme ve yuvarlama

| Değer | Biçim | Örnek |
|-------|-------|-------|
| Ağırlık (yük) | 1 ondalık, gereksiz sıfır atılır | `82,5 kg` · `80 kg` |
| Vücut ağırlığı | 1 ondalık | `106,9 kg` |
| Çevre ölçümü | 1 ondalık | `38,3 cm` |
| Oran | 2 ondalık | `1,44` |
| Kalori | tam sayı | `2.800 kcal` |
| Makro | tam sayı | `200 g` |
| Yüzde | tam sayı | `%86` |
| Süre | sa/dk | `1 sa 4 dk` |
| Set sayısı | tam sayı | `12 set` |

| ID | Gereksinim |
|----|-----------|
| R83.1 | Yuvarlama yalnızca **sunumda** yapılır; veri katmanında tam değer saklanır. |
| R83.2 | Hesaplamalarda yuvarlanmış değer **YASAK** olarak girdi alınmaz (yuvarlama hatası birikmez). |
| R83.3 | Binlik ayırıcı nokta, ondalık ayırıcı virgüldür (`2.800 kcal`, `82,5 kg`). |

## §84. Sorumluluk reddi

| ID | Gereksinim |
|----|-----------|
| R84.1 | İlk açılışta bir kez gösterilen ve Ayarlar > Hakkında'da kalıcı olan metin: uygulama tıbbi tavsiye vermez, bir sağlık profesyonelinin yerini tutmaz. |
| R84.2 | Antrenman içeriği için: yeni bir programa başlamadan önce, özellikle mevcut sağlık sorunu varsa hekime danışılmalıdır. |
| R84.3 | Lab ekranında kalıcı bilgi satırı bulunur (§59). |
| R84.4 | Uygulama sonuç garantisi vermez ve başka kullanıcıların sonuçlarını referans göstermez. |

## §85. Bölüm II'ye köprü

| Bölüm I konusu | Bölüm II karşılığı |
|----------------|--------------------|
| Program rotasyonu ve takvim (§20) | §88 takvim ≠ sıra, §89 dondurma |
| Antrenman loglama (§65) | §90 autosave, §102 unilateral, §103 kısmi |
| Dinlenme süreleri (§31) | §91 arka plan güvenli timer |
| Ölçümler (§14, §15) | §96 biceps baseline, §97 ölçüm kalitesi, §119 ilk veri |
| Ekipman ve hareket kataloğu (§35, §37) | §98 ekipman profili, §99 akıllı değiştirme |
| Progression (§29, §33) | §100 artış adımı, §101 yük davranışı, §104 plateau |
| Hacim hedefleri (§27, §28) | §105 korkuluklar, §106 hacim analitiği |
| Beslenme loglama (§70, §71) | §109 kopyala/tekrarla, §110 tarif, §111 besin kaynağı |
| Video (§38) | §114 manifest, §115 doğrulama scripti |
| Fotoğraf ve lab gizliliği (§69, §74) | §93 şifreleme, §94 app lock, §116 fotoğraf gizliliği |
| Raporlama (§76) | §123 sahte kesinlik yok, AT-20 |
| İçerik ve hata dili (§77) | §117 hata yönetimi |

| ID | Gereksinim |
|----|-----------|
| R85.1 | Bu tablo iki bölüm arasındaki izlenebilirlik köprüsüdür; Bölüm II'nin izlenebilirlik matrisi (`02-architecture.md` §17) ile birlikte okunur. |
| R85.2 | Bölüm I'de tanımlanan her ürün özelliğinin Bölüm II'de bir mimari karşılığı **olmak ZORUNDADIR**; yoksa eksik kabul edilir. |

## §86. v1 sonrası yol haritası

| ID | Aday özellik | Neden v1'de yok |
|----|--------------|-----------------|
| R86.1 | Barkod tarama ve harici besin veritabanı | Ağ bağımlılığı ve veri kalitesi; offline-first ilkesiyle dikkatli tasarım gerektirir |
| R86.2 | Giyilebilir cihaz entegrasyonu (adım, nabız, uyku) | Platform izinleri ve veri güvenilirliği; §123 gereği ham veri yorumu dikkat ister |
| R86.3 | Bulut yedekleme (uçtan uca şifreli) | v1'de sunucu yok; gizlilik varsayılanını bozmayan bir tasarım gerekir (§116.3) |
| R86.4 | Program şablonu kütüphanesi (birden çok program) | v1 tek programa (V90) odaklıdır; şema çoklu programı zaten destekler |
| R86.5 | Süper set / drop set şablon desteği | Veri modeli `set_type` ile hazır; UI ve progression kuralları tanımlanmalı |
| R86.6 | Tarif revizyon geçmişi | Snapshot mekanizması makroları koruyor; tam revizyon geçmişi ek tablo gerektirir |
| R86.7 | Hareket bazlı video kütüphanesinin genişletilmesi | Küratörlük maliyeti; §115 doğrulama scripti bunun altyapısıdır |

| ID | Gereksinim |
|----|-----------|
| R86.8 | Yol haritası maddeleri v1 arayüzünde **"yakında"** olarak gösterilmez (§6.3). |
| R86.9 | Yeni özellik eklendiğinde bu belgeye yeni bölüm eklenir ve Bölüm II izlenebilirlik matrisi güncellenir. |
