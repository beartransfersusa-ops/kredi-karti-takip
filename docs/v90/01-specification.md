# V90 – 90 Günlük Challenge Uygulaması
# Specification · Bölüm II: Kritik Mimari ve Ürün Gereksinimleri (§87–§124)

> **Durum:** Normatif. §87 uyarınca bu bölümdeki maddeler **opsiyonel değildir**; mimari bu maddelere göre tasarlanmıştır (bkz. `02-architecture.md`).
>
> **Bölüm I (§1–§86)** bu repoda bulunmamaktadır; ürün tanımı, V90 default programı, başlangıç profili ve ekran listesi orada tanımlıdır. Bu belge Bölüm I'e atıf yapar ancak onu tekrar etmez. Bölüm I repoya eklendiğinde `00-specification-part1.md` olarak bu klasöre konur.
>
> **Kimlik şeması:** Her gereksinim `R<bölüm>.<sıra>` kimliği taşır (örn. `R88.3`). Mimari belgeleri ve kabul testleri bu kimliklere atıf yapar. Anahtar sözcükler: **ZORUNLU** (MUST), **YASAK** (MUST NOT), **ÖNERİLİR** (SHOULD), **OLABİLİR** (MAY).

---

## §87. Genel Hüküm

| ID | Gereksinim |
|----|-----------|
| R87.1 | §88–§124 arasındaki tüm maddeler ürün ve mimari için **ZORUNLU** kapsamdadır. |
| R87.2 | Mimari bu maddeleri sonradan eklenen özellikler olarak değil, **temel tasarım kısıtları** olarak ele alır. |
| R87.3 | Her madde için mimari belgede en az bir bileşen/karar ve kabul testlerinde en az bir doğrulama bulunur (izlenebilirlik matrisi: `02-architecture.md §17`). |

---

## §88. Takvim Günü ≠ Antrenman Sırası (Calendar Day ≠ Workout Sequence)

| ID | Gereksinim |
|----|-----------|
| R88.1 | 90 günlük challenge takvimi (`challengeDay`) ile antrenman sırası (`trainingSequenceIndex`) **ZORUNLU** olarak ayrı state olarak tutulur. Örnek: takvim `Day 17 / 90` gösterirken sıradaki antrenman `Day 5 – V-Taper Upper` olabilir. |
| R88.2 | `challengeDay` gerçek takvim günlerine göre ilerler; antrenman sırası yalnızca antrenman sonuçlarına göre ilerler. |
| R88.3 | Kullanıcı bir antrenmanı kaçırdığında uygulama **YASAK** olarak sıradaki antrenmana otomatik geçmez. Örnek: Pzt Pull, Sal Push, Çar Legs, Per kaçırıldı → Cuma açıldığında kaçırılan antrenman (sıradaki) gösterilir, sessizce atlanmaz. |
| R88.4 | Planlanan antrenman (ScheduledWorkout) şu durumları destekler: `planned`, `completed`, `skipped`, `rescheduled`, `partiallyCompleted`. (Mimari ek olarak `inProgress` ara durumunu ve türetilmiş `missed` görünümünü tanımlar.) |
| R88.5 | Kaçırılan antrenman için kullanıcıya üç seçenek sunulur: **"Bugüne taşı"**, **"Başka güne taşı"**, **"Gerçekten atla"**. |
| R88.6 | Antrenman sırası (`trainingSequenceIndex`) yalnızca antrenman `completed` olduğunda, kullanıcı açıkça **atla** (`skipped`) seçtiğinde veya kısmi antrenmanı açıkça "bitmiş say" olarak kapattığında ilerler. Başka hiçbir yol sırayı ilerletemez. |
| R88.7 | Taşıma (reschedule) sırayı ilerletmez; sadece planlanan tarihi değiştirir ve taşıma geçmişi saklanır. |
| R88.8 | 90 günlük takvim, sıra ne olursa olsun gerçek takvim günlerine göre ilerlemeye devam eder (bkz. §89 için istisna modu). |

---

## §89. Programı Dondurma (Program Pause)

| ID | Gereksinim |
|----|-----------|
| R89.1 | Program Settings içinde **"Programı Dondur"** özelliği bulunur. |
| R89.2 | Dondurma sebebi opsiyoneldir; seçenekler: `illness`, `travel`, `injury`, `work`, `personal`, `other`. |
| R89.3 | Dondurma süresince antrenman sırası **ilerlemez** ve kaçırılan antrenman uyarısı üretilmez. |
| R89.4 | Kullanıcı devam ettirdiğinde (resume) antrenman sırası kaldığı yerden devam eder. |
| R89.5 | Challenge takvimi için iki mod desteklenir: **A) Strict 90 calendar days** (dondurma günleri de sayılır), **B) Active 90 days** (dondurma günleri sayılmaz). |
| R89.6 | Varsayılan mod: **Strict Calendar**. |
| R89.7 | Mod ne olursa olsun antrenman sırası **YASAK** olarak sessizce egzersiz atlamaz. |
| R89.8 | Dondurma ve devam ettirme olayları zaman damgası ve yerel tarih anahtarıyla saklanır; mod hesaplaması bu kayıtlardan türetilir. |

---

## §90. Autosave – Antrenman Asla Kaybolmamalı

| ID | Gereksinim |
|----|-----------|
| R90.1 | Aktif antrenman sırasında her işlem (set tamamlama, ağırlık/tekrar düzenleme, hareket değiştirme, hareket atlama, dinlenme başlatma, not) **anında** yerel veritabanına yazılır. |
| R90.2 | Uygulamanın kapatılması, telefonun yeniden başlatılması, uygulamanın çökmesi, arka plana alınması veya yanlışlıkla çıkılması durumunda aktif antrenman **YASAK** olarak kaybolmaz. |
| R90.3 | Aktif oturum (active session) kalıcıdır; uygulama yeniden açıldığında yalnızca DB'den geri yüklenir. |
| R90.4 | Uygulama yeniden açıldığında aktif oturum varsa **"Devam eden antrenmanın var."** kartı gösterilir. |
| R90.5 | Kartta üç buton bulunur: **Devam Et**, **Antrenmanı Bitir**, **Antrenmanı İptal Et**. |
| R90.6 | Set kayıtları antrenman sonunda toplu olarak **YASAK** olarak kaydedilmez; her tamamlanan set ayrı bir transaction olarak hemen kalıcı hale getirilir. |
| R90.7 | UI state (in-memory store) DB'nin türevi olarak kabul edilir; DB ile UI arasındaki tek doğruluk kaynağı DB'dir. |

---

## §91. Rest Timer – Arka Plan Güvenli

| ID | Gereksinim |
|----|-----------|
| R91.1 | Dinlenme sayacı yalnızca JavaScript `setInterval` üzerinden **YASAK** olarak çalıştırılmaz. |
| R91.2 | Zamanlayıcı modeli `restStartedAt` (UTC zaman damgası) ve `restDurationSeconds` alanlarını saklar. |
| R91.3 | Kalan süre her zaman `restDurationSeconds - (now - restStartedAt)` formülüyle hesaplanır; `setInterval` yalnızca ekranı yeniler. |
| R91.4 | Ekran kilidi, arka plan, ön plana dönüş ve uygulama yeniden yüklenmesi sayacı **bozmaz**. |
| R91.5 | Sayaç başladığında (kullanıcı bildirimlere izin verdiyse) bitiş anı için yerel bildirim planlanır. |
| R91.6 | Sayaç iptal/atlandığında ilgili bildirim iptal edilir. |
| R91.7 | Uygulama ön plana döndüğünde kalan süre zaman damgasından yeniden hesaplanır; süre dolduysa "dinlenme bitti" durumu gösterilir. |
| R91.8 | Zamanlayıcı durumu DB'de saklanır; uygulama yeniden başlatıldığında da doğru kalan süre gösterilir. |

---

## §92. Veritabanı Migrasyonları

| ID | Gereksinim |
|----|-----------|
| R92.1 | Şema ilk sürümde hardcode edilip bırakılmaz; sürümlü migration mimarisi kullanılır (örn. `001_initial`, `002_add_workout_state`, `003_add_lab_results`). |
| R92.2 | Şema sürümü veritabanı içinde saklanır (`schema_migrations` tablosu + `PRAGMA user_version`). |
| R92.3 | Her migration **idempotent**, mümkün olduğunda **transactional** ve **test edilmiş** olur. |
| R92.4 | Uygulamanın yeni sürümü eski kullanıcı verisini **YASAK** olarak silmez. |
| R92.5 | Migration başlamadan önce mümkünse güvenlik yedeği (DB dosya kopyası) alınır. |
| R92.6 | Migration başarısız olursa kullanıcı verisi bozulmaz: transaction geri alınır ve/veya yedekten geri dönülür; kullanıcıya Türkçe kurtarma ekranı gösterilir. |
| R92.7 | Her migration için otomatik test bulunur: (a) boş DB'den en son sürüme, (b) her eski sürüm fixture'ından en son sürüme, (c) iki kez çalıştırma (idempotency). |

---

## §93. Veritabanı Şifreleme

| ID | Gereksinim |
|----|-----------|
| R93.1 | Sağlık verileri, kan sonuçları, kilo, vücut ölçümleri ve progress fotoğrafları **hassas kullanıcı verisi** olarak ele alınır. |
| R93.2 | Production native build'lerde **SQLCipher ile şifreli SQLite** kullanılır. |
| R93.3 | Şifreleme bir soyutlama arkasında sunulur (`DatabaseProvider`); şifreli ve şifresiz sağlayıcılar aynı arayüzü uygular. |
| R93.4 | Expo Go uyumluluğu uğruna production güvenliğinden **YASAK** olarak vazgeçilmez; gerekirse Expo Development Build / prebuild kullanılır. |
| R93.5 | Şifreleme anahtarı kaynak kodda veya normal AsyncStorage içinde plaintext olarak **YASAK** olarak tutulmaz. |
| R93.6 | Anahtar platform güvenli depolamasında saklanır (iOS Keychain / Android Keystore; `expo-secure-store`). |
| R93.7 | Production build'de şifresiz sağlayıcının kullanılması build zamanında engellenir. |

---

## §94. Uygulama Kilidi (App Lock)

| ID | Gereksinim |
|----|-----------|
| R94.1 | Settings içinde **Face ID / Touch ID / Biometric Lock** seçeneği bulunur; varsayılan kapalı (opsiyonel). |
| R94.2 | Etkinse uygulama açılışında ve ön plana dönüşte biyometrik doğrulama istenir (yapılandırılabilir gecikme toleransı ile). |
| R94.3 | Fallback: cihaz kimlik doğrulaması / parola, platform desteklediği ölçüde. |
| R94.4 | Progress Photos ve Labs ekranları **privacy-sensitive view** olarak ele alınır. |
| R94.5 | App switcher snapshot'ında hassas görüntülerin görünmemesi için platformun sunduğu gizlilik yaklaşımı uygulanır (arka plana geçişte gizlilik perdesi). |
| R94.6 | Platformun güvenilir biçimde desteklemediği güvenlik özellikleri (örn. iOS'ta ekran görüntüsü engelleme) **YASAK** olarak vaat edilmez. |

---

## §95. Yedekleme Gerçekten Tam Olsun

| ID | Gereksinim |
|----|-----------|
| R95.1 | Export yalnızca birkaç tabloyu değil, tüm kullanıcı verisini kapsar: profile, program, workout history, sets, nutrition, measurements, supplements, labs, sleep, cardio, check-ins, settings, references (exercise/food özelleştirmeleri, recipe'ler). |
| R95.2 | Yedek bir **manifest** içerir (`manifest.json`). |
| R95.3 | Progress fotoğrafları için ayrı medya yedekleme stratejisi bulunur (`photos/` dizini). |
| R95.4 | Tam yedek tercihen ZIP formatındadır: `manifest.json`, `data.json`, `photos/`. |
| R95.5 | Yedek `schemaVersion` içerir. |
| R95.6 | Import sırasında Zod validation, şema uyumluluk kontrolü, transaction ve rollback kullanılır. |
| R95.7 | Import başarısız olursa mevcut veri **YASAK** olarak silinmez veya kısmen değiştirilmez. |
| R95.8 | Eski `schemaVersion` içeren yedekler içe aktarılırken aynı migration zinciriyle güncel şemaya yükseltilir; daha yeni şema sürümü reddedilir ve kullanıcıya açıklanır. |

---

## §96. Flexed Biceps Baseline

| ID | Gereksinim |
|----|-----------|
| R96.1 | Onboarding'de **Flexed Upper Arm Circumference** (bükülü üst kol çevresi) ölçümü özellikle istenir. |
| R96.2 | Sol ve sağ ayrı tutulabilir (`leftBicepsCm`, `rightBicepsCm`); tek değer girildiğinde `bicepsCm` olarak saklanır. |
| R96.3 | Kullanıcı henüz ölçmediyse dashboard **YASAK** olarak `0 cm` göstermez. |
| R96.4 | Bunun yerine **"Başlangıç kol ölçümünü ekle."** CTA'sı gösterilir. |
| R96.5 | Kol gelişim KPI'sı ancak baseline alındıktan sonra aktif olur. |

---

## §97. Ölçüm Kalitesi

| ID | Gereksinim |
|----|-----------|
| R97.1 | Her vücut ölçümü için nasıl ölçüleceği görsel/metin ile açıklanır. |
| R97.2 | Bel (waist): her seferinde aynı anatomik noktadan. Karın (abdomen): göbek deliği hizası. Omuz (shoulder): omuzların en geniş çevresi. Biceps: kol flexed, her seferinde aynı pozisyon. |
| R97.3 | Mümkünse 2 ölçüm alınır; aralarındaki fark eşiği aşarsa üçüncü ölçüm önerilir. |
| R97.4 | Final değer ortalama veya medyan olarak hesaplanır; kullanıcı isterse tek ölçümle devam edebilir. |
| R97.5 | Ham örnekler (samples) ve türetilen final değer birlikte saklanır. |

---

## §98. Ekipman Profili

| ID | Gereksinim |
|----|-----------|
| R98.1 | **Settings > Gym Equipment** ekranı bulunur. |
| R98.2 | Kullanıcı erişimi olan ekipmanları seçer: cable station, lat pulldown, chest supported row, plate loaded machines, dumbbells, barbells, smith machine, hack squat, leg press, leg extension, leg curl, pec deck, preacher bench, adjustable bench (liste genişletilebilir). |
| R98.3 | Varsayılan: **Full commercial gym** (tüm ekipman mevcut). |
| R98.4 | Antrenman oluşturulurken ve hareket değiştirirken mevcut ekipmana göre alternatif önerilir. |

---

## §99. Akıllı Hareket Değiştirme (Smart Exercise Substitution)

| ID | Gereksinim |
|----|-----------|
| R99.1 | Kullanıcı bir hareket için **"Hareketi Değiştir"** diyebilir. |
| R99.2 | Alternatifler rastgele **değildir**; deterministik bir sıralama ile üretilir. |
| R99.3 | Exercise modeli şu alanları içerir: `primaryMuscle`, `secondaryMuscles`, `movementPattern`, `equipment`, `lengthenedBias`, `skillLevel`, `jointStressProfile`. |
| R99.4 | Alternatifler aynı hareket amacını (movement intent) mümkün olduğunca korur. Örnekler: Cable Lateral Raise → Machine Lateral Raise → Dumbbell Lateral Raise; Lat Pulldown → Assisted Pull-up → Plate-loaded Pulldown; Hack Squat → Leg Press → Smith Squat. |
| R99.5 | Değiştirme sonrası geçmiş exercise history **kaybolmaz**. |
| R99.6 | Ana hareket ile varyant/alternatif ilişkisi saklanır (`exercise_relations`). |
| R99.7 | Bir oturumdaki değiştirme, orijinal hareket referansını korur (`originalExerciseId`). |

---

## §100. Harekete Özel Yük Artış Adımları

| ID | Gereksinim |
|----|-----------|
| R100.1 | Her hareket için minimum artış adımı tanımlanır. Varsayılanlar: Dumbbell +2 kg, Machine +5 kg, Cable +2.5 kg, Barbell +2.5 kg. |
| R100.2 | Bu değer kullanıcı tarafından hareket bazında düzenlenebilir. |
| R100.3 | Progression algoritması "+2.5–5%" hesaplayıp salonda olmayan `83.2 kg` gibi imkânsız değer **YASAK** olarak önermez. |
| R100.4 | Önerilen yük en yakın kullanılabilir artış adımına yuvarlanır. |
| R100.5 | Yuvarlama sonucu mevcut yükle aynı çıkıyorsa (küçük yüklerde), algoritma yük yerine tekrar hedefini artırmayı önerir (double progression). |

---

## §101. Yük Davranışı (Load Behavior)

| ID | Gereksinim |
|----|-----------|
| R101.1 | "Daha yüksek ağırlık = daha güçlü" varsayımı tüm hareketlerde **YASAK** olarak kullanılmaz. |
| R101.2 | Exercise modeli `loadProgressionType` alanını destekler: `externalLoadHigherIsHarder`, `assistanceLowerIsHarder`, `bodyweight`, `bodyweightPlusExternalLoad`, `machineLevel`, `distanceOrBand`. |
| R101.3 | Assisted pull-up örneği: 40 kg assistance → 35 kg assistance **ilerlemedir**; algoritma bunu ters yorumlamaz. |
| R101.4 | PR, progression ve plateau hesapları tür-bilinçli "effective load" üzerinden yapılır. |

---

## §102. Tek Taraflı (Unilateral) Hareketler

| ID | Gereksinim |
|----|-----------|
| R102.1 | Single-arm cable gibi hareketler için sol ve sağ ayrı set kaydı seçeneği bulunur. |
| R102.2 | Hızlı UX: **Both Same** (ikisi aynı) veya **Track Separately** (ayrı takip). |
| R102.3 | Bir taraf daha zayıfsa veri kaybedilmez; taraf bazında geçmiş saklanır. |
| R102.4 | Toplam hacim hesaplarında unilateral setler **çift sayılmaz** (sol+sağ = 1 set). |

---

## §103. Kısmi Antrenman (Partial Workout)

| ID | Gereksinim |
|----|-----------|
| R103.1 | Kullanıcı antrenmanın yarısını yapıp çıkarsa antrenman otomatik olarak `completed` **YASAK** olarak işaretlenmez. |
| R103.2 | Durum **Partial** (`partiallyCompleted`) olur. |
| R103.3 | Kullanıcı **"Bugün burada bitir"** seçerse kısmi antrenman kaydedilir. |
| R103.4 | Haftalık adherence kısmi antrenmanı ayrı gösterir (tam / kısmi / atlanmış / kaçırılmış). |
| R103.5 | Progression engine yapılmayan hareketler için **YASAK** olarak öneri üretmez; yalnızca gerçekleşen working set'lere dayanır. |

---

## §104. Plateau Engine

| ID | Gereksinim |
|----|-----------|
| R104.1 | Tek kötü antrenman program değişikliği tetiklemez. |
| R104.2 | Plateau tanımı: aynı hareket için **3 ardışık exposure** boyunca tekrar artmıyor, yük artmıyor, teknik aynı ve hedef RIR içinde ilerleme yok. |
| R104.3 | Plateau tespit edildiğinde **insight** gösterilir; program otomatik değiştirilmez. |
| R104.4 | Kontrol sırası: 1) recovery, 2) sleep, 3) calorie/protein adherence, 4) RIR accuracy, 5) technique, 6) rest duration, 7) exercise suitability. |
| R104.5 | Otomatik "+5 set" gibi agresif değişiklikler **YASAK**. |
| R104.6 | Gerekirse önerilir: same load strategy, rep target adjustment, small exercise substitution, deload consideration. |
| R104.7 | Kullanıcı onayı olmadan program **YASAK** olarak değiştirilmez. |

---

## §105. Hacim Korkulukları (Volume Guardrails)

| ID | Gereksinim |
|----|-----------|
| R105.1 | Öncelikli kaslar için set artırımı önerilebilir ancak limitsiz hacim eklenmez. |
| R105.2 | Her kas için `baselineWeeklyDirectSets`, `currentWeeklySets`, `maximumAllowedRecommendation` takip edilir. |
| R105.3 | Otomatik öneri yalnızca recovery iyi **ve** performans stabil/yükseliyorsa oluşur. |
| R105.4 | Bir haftada +1–2 setten fazla otomatik öneri **YASAK**. |
| R105.5 | Her önerinin altında **"Neden önerildi?"** açıklaması gösterilir. |

---

## §106. Kas Hacmi Analitiği

| ID | Gereksinim |
|----|-----------|
| R106.1 | Progress ekranında **Weekly Sets by Muscle** gösterilir (örn. Lateral Delts 12, Biceps 13, Triceps 13, Lats/Back 15, Chest 10, Quads 7, Hamstrings 8). |
| R106.2 | Ana görünüm **direct/primary working sets** üzerindendir. |
| R106.3 | Compound hareketlerin dolaylı katkısı **YASAK** olarak "1 tam set" kesinliğiyle toplanmaz. |
| R106.4 | Secondary contribution istenirse ayrı bir analitik olarak, tahmin olduğu açıkça belirtilerek gösterilir. |

---

## §107. Antrenman PR Mantığı

| ID | Gereksinim |
|----|-----------|
| R107.1 | PR yalnızca ağırlığa göre hesaplanmaz. PR türleri: **load PR**, **rep PR at same load**, **estimated performance PR**, **session volume PR**. |
| R107.2 | Isınma setleri PR **oluşturmaz**. |
| R107.3 | Form bozuk / ağrı işaretli set için kullanıcı **`Exclude from PR`** seçebilir. |
| R107.4 | PR hesapları `loadProgressionType`'a duyarlıdır (§101). |

---

## §108. Hızlı Antrenman UX'i

| ID | Gereksinim |
|----|-----------|
| R108.1 | Ağırlık ve tekrar girişleri büyük sayısal kontroller, +/- hızlı artış butonları ve önceki değer ön-doldurma (prefill) destekler. |
| R108.2 | Örnek: Ağırlık `[-2.5] 80 [+2.5]`; Tekrar `[-] 11 [+]`; RIR `0 1 2 3 4+`. |
| R108.3 | Set tamamlama tek büyük buton ile yapılır. |
| R108.4 | Bir seti loglamak 3–5 saniyeden uzun **sürmemelidir** (ölçülebilir UX hedefi). |
| R108.5 | Artış adımı hareketin `minIncrement` değerinden gelir (§100). |

---

## §109. Beslenme: Kopyala / Tekrarla

| ID | Gereksinim |
|----|-----------|
| R109.1 | **Copy Yesterday**, **Copy Meal**, **Repeat Breakfast**, **Saved Meal**, **Favorite Food**, **Recent Food** özellikleri bulunur. |
| R109.2 | Kullanıcı aynı 4–5 öğünü tekrar tekrar sıfırdan girmez. |

---

## §110. Tarif / Öğün Oluşturucu (Recipe / Meal Builder)

| ID | Gereksinim |
|----|-----------|
| R110.1 | Kullanıcı "Tavuklu Pilav" gibi tarif oluşturabilir; malzemeler (örn. 500 g chicken, 300 g rice, 20 g oil) girilir. |
| R110.2 | Toplam besin değerleri otomatik hesaplanır. |
| R110.3 | Pişmiş toplam ağırlık (cooked yield) girilebilir (örn. 1050 g). |
| R110.4 | Porsiyon (örn. 350 g) girildiğinde makrolar pişmiş ağırlık oranıyla otomatik hesaplanır. |
| R110.5 | Cooked yield girilmemişse ham toplam ağırlık kullanılır ve bu durum kullanıcıya belirtilir. |

---

## §111. Besin Değeri Kaynağı

| ID | Gereksinim |
|----|-----------|
| R111.1 | Seed besin değerleri tek "doğru gerçek" kabul edilmez. |
| R111.2 | Her food item `source`, `servingUnit`, `lastUpdated`, `customEdited` alanlarını destekler. |
| R111.3 | Kullanıcı etiket üzerindeki değerleri manuel olarak override edebilir; override seed güncellemelerinde korunur. |

---

## §112. Seyahat / Timezone Güvenli Tarihler

| ID | Gereksinim |
|----|-----------|
| R112.1 | Tüm tarih mantığı timezone-safe'tir. |
| R112.2 | Antrenman/gün kayıtları yalnızca UTC timestamp'ten türetilip yanlış güne **YASAK** olarak kaydırılmaz. |
| R112.3 | Saklanan alanlar: UTC timestamp + local date key (`YYYY-MM-DD`) + uygun yerlerde timezone (IANA) ve offset. |
| R112.4 | Kullanıcı İstanbul'dan başka ülkeye seyahat ettiğinde `Day X / 90` ve günlük beslenme logları yanlış güne kaymaz. |
| R112.5 | Yerel gün geçişi (day rollover) kontrollüdür; uygulama açıkken gece yarısı geçişi tutarlı biçimde işlenir. |

---

## §113. Gün Sınırı (Day Boundary)

| ID | Gereksinim |
|----|-----------|
| R113.1 | 00:10'da biten bir antrenmanın yanlış güne taşınması gibi hatalar önlenir. |
| R113.2 | Workout session'da `startedAt`, `completedAt`, `calendarDate` alanları ayrıdır. |
| R113.3 | Varsayılan antrenman tarihi: oturumun **başlangıç** yerel tarihi. |
| R113.4 | Kullanıcı `calendarDate`'i gerektiğinde düzenleyebilir. |

---

## §114. Video Kalite Kontrolü

| ID | Gereksinim |
|----|-----------|
| R114.1 | Exercise video URL'leri runtime'da rastgele YouTube arama sonuçlarından **YASAK** olarak çekilmez; küratörlü manifest kullanılır. |
| R114.2 | Her hareket için manifest alanları: `videoProvider`, `videoId`, `channelName`, `sourceUrl`, `lastVerifiedAt`, opsiyonel `fallbackUrl`. |
| R114.3 | Video kaldırılmışsa uygulama çökmez. |
| R114.4 | Fallback: teknik metin ipuçları, thumbnail, kaynak linki çalışmaya devam eder. |
| R114.5 | YouTube videosu indirilip yeniden host **YASAK**; resmi embedded player / API yaklaşımı kullanılır. |

---

## §115. Video Doğrulama Scripti

| ID | Gereksinim |
|----|-----------|
| R115.1 | Geliştirme araçları içinde manifest'teki video ID/URL'leri için geçerlilik denetleyicisi bulunur. |
| R115.2 | Komut: `npm run verify:exercise-videos`; bozuk videoları raporlar. |
| R115.3 | Script build'i zorunlu olarak bloklamaz; CI'da uyarı/rapor olarak çalışır (opsiyonel strict mod). |

---

## §116. Progress Fotoğraflarının Gizliliği

| ID | Gereksinim |
|----|-----------|
| R116.1 | Fotoğraflar varsayılan olarak app-private storage'da saklanır. |
| R116.2 | Normal (public) fotoğraf albümüne otomatik **YASAK** olarak eklenmez. |
| R116.3 | Cloud sync varsayılan **OFF** (v1'de cloud sync yoktur). |
| R116.4 | Silme işlemi gerçek dosyayı da temizler; DB kaydı silinip dosya orphan kalmaz (orphan sweeper ile garanti). |
| R116.5 | Ekran görüntüsü engelleme yalnızca platformun güvenilir biçimde desteklediği yerde (Android `FLAG_SECURE`) opsiyonel privacy mode olarak sunulur; desteklenmeyen platformda **YASAK** olarak vaat edilmez. |

---

## §117. Hata Yönetimi

| ID | Gereksinim |
|----|-----------|
| R117.1 | Hiçbir database/network/video hatasında beyaz ekran (white screen) **YASAK**. |
| R117.2 | Global error boundary bulunur. |
| R117.3 | Database hataları sınıflandırılır ve kullanıcıya uygun aksiyon sunulur. |
| R117.4 | Video fallback (§114), import rollback (§95), güvenli retry UI bulunur. |
| R117.5 | Kullanıcıya gösterilen mesajlar Türkçe ve anlaşılırdır; teknik detay "Ayrıntılar" altında opsiyoneldir. |

---

## §118. Crash / Analytics Gizliliği

| ID | Gereksinim |
|----|-----------|
| R118.1 | Analytics veya crash reporting eklenirse varsayılan olarak hassas fitness/sağlık payload'u **YASAK** olarak gönderilmez. |
| R118.2 | Lab values, measurements, photos, food logs, workout notes ve PII crash event metadata'sına dahil edilmez. |
| R118.3 | Analytics varsayılan **OFF** veya privacy-first (allowlist event şeması) olur. |

---

## §119. İlk Çalıştırma Veri Doğrulaması

| ID | Gereksinim |
|----|-----------|
| R119.1 | Başlangıç değerleri: Height 187 cm, Weight 107 kg, Waist 95 cm, Abdomen 114 cm, Shoulder 137 cm, Hip 119 cm, Chest 110 cm, Forearm 37 cm. |
| R119.2 | Flexed biceps: **UNKNOWN** – onboarding'de kullanıcıdan istenir (§96). |
| R119.3 | Bilinmeyen sağlık/vücut değerleri veritabanına `0` olarak **YASAK** olarak yazılmaz; nullable tutulur. |
| R119.4 | Zod şemaları sıfır/negatif/aşırı değerleri reddeder ve `null` ile "bilinmiyor"u ayırt eder. |

---

## §120. Onboarding – Training Profile

| ID | Gereksinim |
|----|-----------|
| R120.1 | Onboarding şu bilgileri toplar: training experience (`beginner`/`intermediate`/`advanced`), gym type (`fullCommercialGym`/`homeGym`/`limitedGym`), typical workout time, preferred workout days, typical sleep target, current pain/injury areas (opsiyonel). |
| R120.2 | Bu bilgiler programı otomatik olarak tamamen **değiştirmez**; suggestions ve UX'i iyileştirir (ekipman profili ön-seçimi, substitution filtresi, bildirim saati, recovery yorumu). |

---

## §121. Kullanıcı Override Her Zaman Mümkün

| ID | Gereksinim |
|----|-----------|
| R121.1 | Algoritma bir koçtur, diktatör değildir. Her öneri **Accept / Modify / Ignore** destekler. |
| R121.2 | Örnek: "Bir sonraki antrenmanda 82.5 kg öneriyoruz." → kullanıcı 80 / 82.5 / 85 manuel girebilir. |
| R121.3 | Kullanıcının kararı (kabul/değiştirme/yok sayma ve girilen değer) geçmişte saklanır. |

---

## §122. Açıklanabilir Öneriler

| ID | Gereksinim |
|----|-----------|
| R122.1 | Black-box öneri **YASAK**; her önemli önerinin yanında kısa gerekçe bulunur. |
| R122.2 | Örnek: **Ağırlığı artır** – "Son antrenmanda 3/3 sette 12 tekrar yaptın ve RIR hedefinin içinde kaldın." / **Kaloriyi değiştirme** – "Bel çevren azaldı ve gym performansın yükseldi." |
| R122.3 | Gerekçe, öneriyi üreten kanıt verilerine (set kayıtları, ölçümler) referans verir. |

---

## §123. Sahte Kesinlik Yok (No Fake Precision)

| ID | Gereksinim |
|----|-----------|
| R123.1 | "Bugün 34.7 gram kas kazandın", "Recovery score'un %87 olduğu için kesin hazırsın" gibi bilim dışı kesin sonuçlar **YASAK**. |
| R123.2 | Kilo ve vücut ölçümleri gürültülü kabul edilir; trendlere öncelik verilir. |
| R123.3 | 7 günlük ve çok haftalık trendler gösterilir; tekil değerler bağlamıyla sunulur. |
| R123.4 | Tahmini metrikler (e1RM, secondary volume, kalori hedefi) "tahmin" olarak etiketlenir. |

---

## §124. Yayın Öncesi Kabul Testleri

| ID | Senaryo |
|----|---------|
| AT-01 | Workout başlat → app kapat → tekrar aç → workout aynen devam ediyor. |
| AT-02 | Set logla → crash/reload → set kaybolmuyor. |
| AT-03 | Rest timer başlat → screen lock → süre doğru devam ediyor. |
| AT-04 | Bir workout kaçır → sonraki workout sessizce atlanmıyor. |
| AT-05 | Workout'u reschedule et → calendar doğru. |
| AT-06 | Partial workout kaydet → adherence doğru. |
| AT-07 | 12/12/12 hedef RIR → doğru progression. |
| AT-08 | Machine increment nedeniyle önerilen ağırlık gerçek kullanılabilir değere yuvarlanıyor. |
| AT-09 | Assisted exercise progression ters hesaplanmıyor. |
| AT-10 | Weight 7-day average doğru. |
| AT-11 | Waist/shoulder ratio doğru. |
| AT-12 | Biceps baseline yokken `0 cm` gösterilmiyor. |
| AT-13 | Timezone değiştir → günlük loglar yanlış güne kaymıyor. |
| AT-14 | Backup export → app reset → import → tüm data geri geliyor. |
| AT-15 | Failed import → mevcut data silinmiyor. |
| AT-16 | Schema migration → eski data korunuyor. |
| AT-17 | Video unavailable → exercise page yine çalışıyor. |
| AT-18 | Offline → bütün core workout özellikleri çalışıyor. |
| AT-19 | Biometrics enabled → app lock çalışıyor. |
| AT-20 | Day 90 report doğru başlangıç/final değerlerini kullanıyor. |

| ID | Gereksinim |
|----|-----------|
| R124.1 | Bu 20 senaryo başarıyla geçmeden core application **"complete"** olarak raporlanmaz. |
| R124.2 | Her senaryo için otomatik test (unit/integration/E2E) ve gerekiyorsa manuel test adımı tanımlanır (`05-acceptance-tests.md`). |
| R124.3 | Kabul testi sonuçları sürüm notlarında senaryo bazında raporlanır. |
