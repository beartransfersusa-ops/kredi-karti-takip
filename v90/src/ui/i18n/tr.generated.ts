// ÜRETİLMİŞ DOSYA — ELLE DÜZENLEME.
// Kaynak: docs/v90/06-ux-flows.md "Türkçe metinler" tabloları.
// Yeniden üretmek için: npm run gen:i18n
//
// 530 anahtar. Metin değişecekse ÖNCE belge güncellenir;
// aksi halde `npm run verify:drift` CI'da kırılır.

export const tr = {
  'active.assistance': 'Yardım (kg)',
  'active.assistance.hint': 'Daha az yardım = daha zor',
  'active.band': 'Band / Mesafe (cm)',
  'active.cancel': 'Antrenmanı İptal Et',
  'active.completeSet': 'Seti Tamamla',
  'active.finish': 'Antrenmanı Bitir',
  'active.load': 'Ağırlık (kg)',
  'active.machineLevel': 'Seviye',
  'active.noSession': 'Aktif antrenman yok.',
  'active.note.add': 'Not ekle',
  'active.prefill.lastSession': 'son antrenman',
  'active.prefill.prevSet': 'önceki set',
  'active.prefill.recommended': 'önerilen',
  'active.prefill.target': 'hedef',
  'active.reps': 'Tekrar',
  'active.rest.done': 'Dinlenme bitti',
  'active.rest.notification': 'Dinlenme bitti – sıradaki set',
  'active.rest.remaining': 'Dinlenme {mm:ss}',
  'active.rest.skip': 'Dinlenmeyi atla',
  'active.rest.start': 'Dinlenme başlat',
  'active.rir': 'RIR',
  'active.rir.options': '0 · 1 · 2 · 3 · 4+',
  'active.set.excludeFromPr': 'Exclude from PR',
  'active.set.extra': 'Ek set',
  'active.set.formBreakdown': 'Form bozuldu',
  'active.set.pain': 'Ağrı',
  'active.set.save': 'Kaydet',
  'active.side.left': 'Sol',
  'active.side.right': 'Sağ',
  'active.skipExercise': 'Hareketi Atla',
  'active.substitute': 'Hareketi Değiştir',
  'active.substitute.doneBefore': 'Daha önce yaptın',
  'active.substitute.editEquipment': 'Ekipman profilini düzenle',
  'active.substitute.otherIntent': 'Farklı amaç',
  'active.substitute.rationale': 'Aynı kas, aynı hareket kalıbı, ekipmanın var',
  'active.substitute.reason.equipmentBusy': 'Ekipman dolu',
  'active.substitute.reason.pain': 'Ağrı',
  'active.substitute.reason.preference': 'Tercih',
  'active.undo': 'Geri al',
  'active.unilateral.bothSame': 'Both Same',
  'active.unilateral.separate': 'Track Separately',
  'badge.estimate': 'tahmin',
  'common.add': 'Ekle',
  'common.back': 'Geri',
  'common.cancel': 'Vazgeç',
  'common.details': 'Ayrıntılar',
  'common.next': 'İleri',
  'common.retry': 'Yeniden dene',
  'common.save': 'Kaydet',
  'common.skip': 'Atla',
  'common.tryAgain': 'Tekrar dene',
  'dashboard.kpi.addMeasurement': 'Ölçüm ekle',
  'dashboard.kpi.biceps.baselineOnly': 'Başlangıç: {cm} cm · henüz yeni ölçüm yok',
  'dashboard.kpi.biceps.cta': 'Başlangıç kol ölçümünü ekle.',
  'dashboard.kpi.biceps.leftRight': 'Sol {l} · Sağ {r}',
  'dashboard.kpi.biceps.title': 'Kol (bükülü)',
  'dashboard.kpi.delta.sinceBaseline': 'Başlangıca göre {delta} cm',
  'dashboard.kpi.empty': 'Henüz ölçüm yok',
  'dashboard.kpi.kcal.band': '{kcal} kcal (±100)',
  'dashboard.kpi.kcal.title': 'Kalori hedefi',
  'dashboard.kpi.loadFailed': 'Yüklenemedi',
  'dashboard.kpi.median3': 'Son 3 ölçümün medyanı',
  'dashboard.kpi.ratio.baseline': 'Başlangıç: {ratio}',
  'dashboard.kpi.ratio.title': 'Bel / Omuz oranı',
  'dashboard.kpi.singleValue': 'tek ölçüm',
  'dashboard.kpi.trend.down': '↓ düşüyor',
  'dashboard.kpi.trend.insufficient': 'yetersiz veri',
  'dashboard.kpi.trend.stable': '→ stabil',
  'dashboard.kpi.trend.up': '↑ yükseliyor',
  'dashboard.kpi.waist.title': 'Bel',
  'dashboard.kpi.weight.avg7': '7 günlük ortalama',
  'dashboard.kpi.weight.last': 'Son: {kg} kg ({day})',
  'dashboard.kpi.weight.slope28': '{delta} kg/hafta (28 gün)',
  'dashboard.kpi.weight.title': 'Kilo',
  'error.boundary.home': 'Ana ekrana dön',
  'error.boundary.reload': 'Yeniden yükle',
  'error.boundary.title': 'Bir şeyler ters gitti.',
  'error.dbOpen.body': 'Verilerin cihazda duruyor ama şu an açılamıyor. Yeniden dene ya da bir yedekten geri yükle.',
  'error.dbOpen.restore': 'Yedekten geri yükle',
  'error.dbOpen.retry': 'Yeniden dene',
  'error.dbOpen.support': 'Destek bilgisi',
  'error.dbOpen.title': 'Veritabanı açılamadı.',
  'error.dbWrite': 'Kaydedilemedi. Boş alanı kontrol et.',
  'error.details.copy': 'Kopyala',
  'error.diskSpace.body': 'Güncelleme için yeterli boş alan yok. Yer açıp tekrar dene.',
  'error.diskSpace.title': 'Alan yetersiz',
  'error.import.title': 'İçe aktarma başarısız; mevcut verin değişmedi.',
  'error.import.tooNew': 'Bu yedek daha yeni bir sürümle alınmış',
  'error.migration.export': 'Yedeği dışa aktar',
  'error.migration.inProgress': 'Veritabanı güncelleniyor…',
  'error.migration.retry': 'Yeniden dene',
  'error.migration.title': 'Veritabanı güncellenemedi. Verilerin güvende; uygulamayı güncelleyip tekrar dene.',
  'error.retry': 'Yeniden dene',
  'error.write': 'Kaydedilemedi. Boş alanı kontrol et.',
  'exercises.load_progression_type': 'Alan etiketi (öneri)',
  'finish.back': 'Vazgeç',
  'finish.confirm': 'Bitir',
  'finish.date.edit': 'Düzenle',
  'finish.date.label': 'Antrenman tarihi',
  'finish.date.overridden': 'Tarih elle değiştirildi',
  'finish.empty': 'Henüz set kaydetmedin.',
  'finish.fromResume': 'Bu antrenman {date} tarihinde başlamıştı.',
  'finish.note': 'Oturum notu',
  'finish.partial.continueLater': 'Kalanı sonraki güne taşı',
  'finish.partial.continueLater.hint': 'Kalan {n} hareket için bir gün seçersin; sıra ilerlemez.',
  'finish.partial.countDone': 'Bitmiş say',
  'finish.partial.countDone.hint': 'Bu antrenman "kısmi" olarak kaydedilir; sıra bir sonraki antrenmana geçer.',
  'finish.partial.question': 'Kalan hareketler ne olsun?',
  'finish.partial.summary': '{planned} hareketten {done}\'ı tamamlandı · {missing} hareket eksik',
  'finish.title.full': 'Antrenman tamamlandı',
  'finish.title.partial': 'Bugün burada bitir',
  'finish.volumePr': 'Oturum hacmi PR\'ı',
  'food.new.title': 'Yeni besin',
  'food.override.per100': '100 g başına',
  'food.override.preserved': 'Bu değerler seed güncellemelerinde korunur.',
  'food.override.servingSize': 'Porsiyon ağırlığı (g)',
  'food.override.servingUnit': 'Porsiyon birimi',
  'food.override.sourceNote': 'Kaynak: {source} · Son güncelleme {date}',
  'food.override.title': 'Etiketteki değerlerle düzenle',
  'home.biceps.cta': 'Başlangıç kol ölçümünü ekle.',
  'home.day': 'Day {X} / 90',
  'home.doneToday.preview': 'Sıradaki (öngörü): {templateNameTr} · {date}',
  'home.doneToday.title': 'Bugünkü antrenman tamamlandı',
  'home.empty.cta': 'Programı başlat',
  'home.finished.title': '90 gün tamamlandı',
  'home.missed.title': 'Kaçırılan antrenman: {templateName} ({plannedWeekday})',
  'home.next.planned': 'Planlandı: {weekday}, {date}',
  'home.next.recoCount': '{n} öneri hazır',
  'home.next.sequence': 'Antrenman {n} · {templateNameTr}',
  'home.next.start': 'Antrenmana Başla',
  'home.next.title': 'Sıradaki antrenman',
  'home.paused.resume': 'Programı Devam Ettir',
  'home.paused.title': 'Program dondurulmuş',
  'home.resume.title': 'Devam eden antrenmanın var.',
  'lock.failed': 'Doğrulama başarısız.',
  'lock.fallbackHint': 'Biyometri çalışmazsa cihaz parolanı kullanabilirsin.',
  'lock.noCredential': 'Bu cihazda kilit tanımlı değil. Cihaz ayarlarından Face ID, parmak izi ya da parola ekle.',
  'lock.prompt': 'V90 kilidini aç',
  'lock.title': 'V90 kilitli',
  'lock.unlockButton': 'Kilidi aç',
  'measurement.baselineBadge': 'Başlangıç',
  'measurement.date.today': 'Bugün',
  'measurement.date.yesterday': 'Dün',
  'measurement.deltaPrev': 'Son ölçüme göre {delta} cm',
  'measurement.final.mean': '{value} cm · ortalama',
  'measurement.final.median': '{value} cm · medyan',
  'measurement.final.single': '{value} cm · tek ölçüm',
  'measurement.group.arms': 'Kollar',
  'measurement.group.legs': 'Bacaklar',
  'measurement.group.torso': 'Gövde',
  'measurement.guide.title': 'Nasıl ölçülür?',
  'measurement.hint.second': 'Mümkünse ikinci bir ölçüm al; gürültüyü azaltır.',
  'measurement.noPrev': 'Bu bölge için ilk kayıt.',
  'measurement.sample.1': '1. ölçüm',
  'measurement.sample.2': '2. ölçüm (önerilir)',
  'measurement.sample.3': '3. ölçüm',
  'measurement.saveSingle': 'Tek ölçümle kaydet',
  'measurement.saveWithTwoAnyway': 'Yine de ikisinin ortalamasıyla kaydet',
  'measurement.side.left': 'Sol',
  'measurement.side.right': 'Sağ',
  'measurement.side.single': 'Tek değer',
  'measurement.site.abdomen': 'Karın',
  'measurement.site.bicepsFlexed': 'Üst kol (bükülü)',
  'measurement.site.calf': 'Baldır',
  'measurement.site.chest': 'Göğüs',
  'measurement.site.forearm': 'Ön kol',
  'measurement.site.hip': 'Kalça',
  'measurement.site.neck': 'Boyun',
  'measurement.site.pick': 'Neyi ölçüyorsun?',
  'measurement.site.shoulder': 'Omuz',
  'measurement.site.thigh': 'Uyluk',
  'measurement.site.waist': 'Bel',
  'measurement.thirdSuggested': 'Üçüncü ölçüm önerilir',
  'measurement.thirdSuggestedHint': 'İki ölçüm arasındaki fark {diff} cm. Üçüncü ölçümle medyan alınır.',
  'measurement.title': 'Ölçüm ekle',
  'missed.dismiss': 'Şimdi değil',
  'missed.moveToDate': 'Başka güne taşı',
  'missed.moveToday': 'Bugüne taşı',
  'missed.skip': 'Gerçekten atla',
  'missed.skip.confirm.body': 'Bu antrenman tamamen atlanacak, sıradaki antrenmana geçilecek.',
  'missed.skip.confirm.cancel': 'Vazgeç',
  'missed.skip.confirm.ok': 'Gerçekten atla',
  'missed.subtitle': '{n} gündür bekliyor · sıra ilerlemedi',
  'missed.title': 'Kaçırılan antrenman: {templateName} ({plannedWeekday})',
  'nutrition.addFood': '+ Besin ekle',
  'nutrition.copiedFrom': '{date} tarihinden kopyalandı',
  'nutrition.copyMeal': 'Copy Meal',
  'nutrition.copyMeal.pickSource': 'Hangi günün hangi öğünü?',
  'nutrition.copyYesterday': 'Copy Yesterday',
  'nutrition.copyYesterday.confirmAppend': 'Dünün öğünleri bugüne eklenecek. Bugün girdiklerin silinmez.',
  'nutrition.copyYesterday.emptySource': 'Dün için kayıt yok.',
  'nutrition.dayTotal': 'Gün toplamı',
  'nutrition.entry.delete': 'Sil',
  'nutrition.entry.edit': 'Düzenle',
  'nutrition.favorite.add': 'Favorilere ekle',
  'nutrition.favorite.remove': 'Favorilerden çıkar',
  'nutrition.grams': 'Gram',
  'nutrition.repeatBreakfast': 'Repeat Breakfast',
  'nutrition.repeatSlot': 'Son {slot} öğününü tekrarla',
  'nutrition.repeatSlot.none': 'Son 7 günde bu öğün için kayıt yok.',
  'nutrition.savedMeal.namePrompt': 'Kayıtlı öğün adı',
  'nutrition.savedMeal.saveAs': 'Öğün olarak kaydet',
  'nutrition.savedMeal.tab': 'Kayıtlı Öğünler',
  'nutrition.search.empty': 'Sonuç yok. Yeni besin ekleyebilirsin.',
  'nutrition.search.placeholder': 'Besin ya da tarif ara',
  'nutrition.search.tab.all': 'Tümü',
  'nutrition.search.tab.favorites': 'Favoriler',
  'nutrition.search.tab.recent': 'Son',
  'nutrition.search.tab.recipes': 'Tarifler',
  'nutrition.servings': 'Porsiyon ({unit}, {g} g)',
  'nutrition.slot.breakfast': 'Kahvaltı',
  'nutrition.slot.dinner': 'Akşam',
  'nutrition.slot.lunch': 'Öğle',
  'nutrition.slot.postWorkout': 'Antrenman sonrası',
  'nutrition.slot.preWorkout': 'Antrenman öncesi',
  'nutrition.slot.snack': 'Ara öğün',
  'nutrition.source.labelOverride': 'Etiketten düzenlendi',
  'nutrition.source.seedTrLabel': 'TR etiket',
  'nutrition.source.seedUsda': 'USDA',
  'nutrition.source.user': 'Kullanıcı',
  'nutrition.target': 'Hedef {kcal} kcal · P {p} g',
  'nutrition.title': 'Beslenme',
  'onboarding.biceps.laterHint': 'Ölçene kadar ana ekranda "Başlangıç kol ölçümünü ekle." kartı görünür.',
  'onboarding.biceps.left': 'Sol kol (bükülü)',
  'onboarding.biceps.mode.later': 'Sonra ölçeceğim',
  'onboarding.biceps.mode.separate': 'Sol ve sağ ayrı',
  'onboarding.biceps.mode.single': 'Tek değer',
  'onboarding.biceps.right': 'Sağ kol (bükülü)',
  'onboarding.biceps.save': 'Kaydet ve devam et',
  'onboarding.biceps.single': 'Üst kol (bükülü)',
  'onboarding.biceps.title': 'Bükülü üst kol ölçümü',
  'onboarding.biceps.why': 'Kol gelişimini takip etmek için başlangıç değeri gerekli. Sonradan da ekleyebilirsin.',
  'onboarding.equipment.customBadge': 'Özel',
  'onboarding.equipment.finish': 'Bitir',
  'onboarding.equipment.presetHint': 'Salon tipine göre ön-seçtik. Sonradan Ayarlar > Gym Equipment\'tan değiştirebilirsin.',
  'onboarding.equipment.title': 'Salonunda hangi ekipman var?',
  'onboarding.initial.bicepsUnknown': 'Bilinmiyor – sonraki adımda',
  'onboarding.initial.confirm': 'Onayla ve devam et',
  'onboarding.initial.emptyHint': 'Bilmediğin değeri boş bırak; sıfır girme.',
  'onboarding.initial.enterMyself': 'Kendim gireceğim',
  'onboarding.initial.row.abdomen': 'Karın (cm)',
  'onboarding.initial.row.bicepsFlexed': 'Bükülü üst kol (cm)',
  'onboarding.initial.row.chest': 'Göğüs (cm)',
  'onboarding.initial.row.forearm': 'Ön kol (cm)',
  'onboarding.initial.row.height': 'Boy (cm)',
  'onboarding.initial.row.hip': 'Kalça (cm)',
  'onboarding.initial.row.shoulder': 'Omuz (cm)',
  'onboarding.initial.row.waist': 'Bel (cm)',
  'onboarding.initial.row.weight': 'Kilo (kg)',
  'onboarding.initial.subtitle': 'Bu değerler Day 90 raporunda başlangıç olarak kullanılır. Kontrol et, gerekirse düzelt.',
  'onboarding.initial.title': 'Başlangıç değerlerin',
  'onboarding.initial.usePrefilled': 'Önceden girilmiş değerleri kullan',
  'onboarding.training.days.hint': 'Sıradaki antrenman bu günlerden ilk uygun olana planlanır.',
  'onboarding.training.days.title': 'Hangi günler antrenman yapmak istersin?',
  'onboarding.training.experience.advanced': 'İleri seviye',
  'onboarding.training.experience.beginner': 'Yeni başlayan',
  'onboarding.training.experience.intermediate': 'Orta seviye',
  'onboarding.training.experience.title': 'Antrenman deneyimin',
  'onboarding.training.gymType.fullCommercialGym': 'Tam donanımlı salon',
  'onboarding.training.gymType.homeGym': 'Ev salonu',
  'onboarding.training.gymType.limitedGym': 'Sınırlı ekipmanlı salon',
  'onboarding.training.gymType.title': 'Nerede antrenman yapıyorsun?',
  'onboarding.training.minutes.hint': '15–240 dakika. Program şablonu bundan uzunsa uyarı alırsın.',
  'onboarding.training.minutes.title': 'Bir antrenmana genelde kaç dakika ayırıyorsun?',
  'onboarding.training.pain.hint': 'Seçtiğin bölgeleri zorlayan hareketler alternatif listesinde geriye alınır.',
  'onboarding.training.pain.none': 'Yok',
  'onboarding.training.pain.title': 'Şu an ağrı ya da sakatlığın olan bölge var mı?',
  'onboarding.training.sleep.title': 'Uyku hedefin (saat)',
  'onboarding.training.subtitle': 'Bu bilgiler programı değiştirmez; önerileri ve planlamayı sana göre ayarlar.',
  'onboarding.training.title': 'Antrenman profilin',
  'photos.add': 'Fotoğraf ekle',
  'photos.androidSecureActive': 'Ekran görüntüsü engelleme açık.',
  'photos.compare': 'Karşılaştır',
  'photos.delete': 'Sil',
  'photos.delete.confirm': 'Fotoğraf kalıcı olarak silinecek; dosya da cihazdan kaldırılır.',
  'photos.empty': 'Henüz fotoğraf yok. Aynı ışık ve pozla düzenli çekim karşılaştırmayı kolaylaştırır.',
  'photos.fileMissing': 'Dosya bulunamadı',
  'photos.iosScreenshotNote': 'iOS\'ta ekran görüntüsü engellenemez. Arka plana geçince görüntü gizlenir.',
  'photos.note': 'Not',
  'photos.pose.back': 'Arka',
  'photos.pose.backFlexed': 'Arka (kaslı)',
  'photos.pose.front': 'Ön',
  'photos.pose.frontFlexed': 'Ön (kaslı)',
  'photos.pose.other': 'Diğer',
  'photos.pose.sideLeft': 'Sol yan',
  'photos.pose.sideRight': 'Sağ yan',
  'photos.privacyNote': 'Fotoğraflar yalnızca uygulamanın özel alanında saklanır; galeriye eklenmez ve buluta gönderilmez.',
  'photos.removeRecord': 'Kaydı kaldır',
  'photos.source.camera': 'Kamera',
  'photos.source.file': 'Dosya seç',
  'photos.source.library': 'Galeri',
  'photos.title': 'Progress Photos',
  'photos.webNote': 'Web\'de ekran görüntüsü engellenemez. Fotoğraflar bu tarayıcının deposunda tutulur; sunucuya gönderilmez.',
  'plateau.ack': 'Anladım',
  'plateau.checklist.checked': 'Kontrol ettim',
  'plateau.checklist.noData': 'Veri yok',
  'plateau.checklist.title': 'Sırayla kontrol et',
  'plateau.dismiss': 'Yok say',
  'plateau.entry': 'Plato işareti: {exerciseNameTr}',
  'plateau.explain': '3 ardışık antrenmanda yük, tekrar ve RIR ilerlemedi. Tek kötü antrenman değil.',
  'plateau.noAuto': 'Program senin onayın olmadan değişmez.',
  'plateau.resolve': 'Çözüldü olarak işaretle',
  'plateau.suggest.apply': 'Uygula (öneri olarak ekle)',
  'plateau.suggest.deload': 'Deload düşün',
  'plateau.suggest.repTargetAdjust': 'Tekrar hedefini ayarla',
  'plateau.suggest.sameLoad': 'Aynı yükle devam',
  'plateau.suggest.substitution': 'Küçük hareket değişikliği',
  'plateau.title': 'Plato incelemesi · {exerciseNameTr}',
  'pr.banner.title': 'Yeni PR!',
  'pr.estimateBadge': 'tahmin',
  'pr.excludeHint': 'Bu set PR hesaplarına dahil edilmeyecek.',
  'pr.side.left': '(sol)',
  'pr.side.right': '(sağ)',
  'pr.type.estimatedPerformancePr': 'Tahmini performans PR\'ı · e1RM {estimated_1rm} kg',
  'pr.type.loadPr': 'Yük PR\'ı · {effectiveLoad} kg × {reps}',
  'pr.type.repPrAtLoad': 'Aynı yükte tekrar PR\'ı · {effectiveLoad} kg × {reps}',
  'pr.type.sessionVolumePr': 'Oturum hacmi PR\'ı · {session_volume} kg',
  'privacyOverlay.a11y': 'İçerik gizlendi',
  'privacyOverlay.label': 'V90',
  'program.mode.active': 'Active 90 days',
  'program.mode.active.hint': 'Dondurma günleri sayılmaz.',
  'program.mode.preview': 'Bugün: Day {strict} → Day {active}',
  'program.mode.strict': 'Strict 90 calendar days',
  'program.mode.strict.hint': 'Dondurma günleri de sayılır.',
  'program.mode.title': 'Takvim modu',
  'program.pause.blockedByActive': 'Önce devam eden antrenmanı bitir veya iptal et.',
  'program.pause.button': 'Programı Dondur',
  'program.pause.confirm': 'Dondur',
  'program.pause.hint': 'Dondurma süresince antrenman sırası ilerlemez ve kaçırılan antrenman uyarısı gösterilmez.',
  'program.pause.note': 'Not',
  'program.pause.reason.illness': 'Hastalık',
  'program.pause.reason.injury': 'Sakatlık',
  'program.pause.reason.other': 'Diğer',
  'program.pause.reason.personal': 'Kişisel',
  'program.pause.reason.title': 'Sebep (isteğe bağlı)',
  'program.pause.reason.travel': 'Seyahat',
  'program.pause.reason.work': 'İş',
  'program.paused.banner': 'Program dondurulmuş · {reasonLabel} · {n} gündür',
  'program.resume.button': 'Programı Devam Ettir',
  'progress.volume.activeExcluded': 'Devam eden antrenman dahil değil.',
  'progress.volume.baselineMark': 'Program hedefi',
  'progress.volume.directHint': 'Hareketin ana kasına yapılan working set\'ler. Sol/sağ ayrı setler bir set sayılır.',
  'progress.volume.empty': 'Bu hafta tamamlanmış antrenman yok.',
  'progress.volume.estimateUnit': '~{n} set',
  'progress.volume.maxMark': 'Üst sınır',
  'progress.volume.priority': 'Öncelikli kas',
  'progress.volume.secondaryHint': 'Compound hareketlerin dolaylı katkısı tahmindir; her set 0,5 olarak sayılır ve 1 tam set olarak toplanmaz.',
  'progress.volume.setsUnit': '{n} set',
  'progress.volume.tab.direct': 'Direkt setler',
  'progress.volume.tab.secondary': 'İkincil (tahmin)',
  'progress.volume.title': 'Weekly Sets by Muscle',
  'progress.volume.whyRecommended': 'Neden önerildi?',
  'recipe.addIngredient': 'Malzeme ekle',
  'recipe.addToMeal': 'Öğüne ekle',
  'recipe.cookedYield': 'Pişmiş toplam ağırlık (g)',
  'recipe.cookedYield.hint': 'Piştikten sonraki toplam ağırlık. Porsiyon hesabı buna göre yapılır.',
  'recipe.cookedYield.unusual': 'Pişmiş ağırlık ham toplama göre olağandışı görünüyor.',
  'recipe.name': 'Tarif adı',
  'recipe.noCookedYield': 'pişmiş ağırlık girilmedi, ham toplam kullanılıyor',
  'recipe.per100.cooked': '100 g pişmiş başına',
  'recipe.per100.raw': '100 g ham başına',
  'recipe.portion': 'Porsiyon (g)',
  'recipe.portionResult': '{g} g porsiyon: {kcal} kcal · P {p} g · K {c} g · Y {f} g',
  'recipe.rawTotal': 'Ham toplam: {g} g',
  'recipe.save': 'Tarifi kaydet',
  'recipe.title': 'Tarif oluştur',
  'recipe.total': 'Toplam: {kcal} kcal · P {p} g · K {c} g · Y {f} g',
  'reco.accept': 'Kabul',
  'reco.decided.accepted': 'Kabul edildi · {value}',
  'reco.decided.ignored': 'Yok sayıldı',
  'reco.decided.modified': 'Değiştirildi · {value}',
  'reco.estimateBadge': 'tahmin',
  'reco.ignore': 'Yok say',
  'reco.kind.deload': 'Deload düşün',
  'reco.kind.holdLoad': 'Ağırlığı koru',
  'reco.kind.loadDecrease': 'Ağırlığı azalt',
  'reco.kind.loadIncrease': 'Ağırlığı artır',
  'reco.kind.nutritionHold': 'Kaloriyi değiştirme',
  'reco.kind.repIncrease': 'Tekrar hedefini artır',
  'reco.kind.substitution': 'Hareket değişikliği öner',
  'reco.kind.volumeHold': 'Hacmi koru',
  'reco.kind.volumeIncrease': 'Set ekle (+{delta})',
  'reco.modify': 'Değiştir',
  'reco.modify.save': 'Kaydet',
  'reco.proposed.assistance': 'Yardımı {assistanceKg} kg\'a düşür',
  'reco.proposed.load': 'Bir sonraki antrenmanda {load} kg öneriyoruz.',
  'reco.proposed.reps': 'Hedef tekrar: {reps}',
  'reco.rationale.example': 'Son antrenmanda 3/3 sette 12 tekrar yaptın ve RIR hedefinin içinde kaldın.',
  'reco.userValueBadge': 'senin değerin',
  'reco.why': 'Neden önerildi?',
  'report.adherence': '{completed} tam · {partial} kısmi · {skipped} atlandı · {missed} kaçırıldı',
  'report.complete.button': 'Programı tamamla',
  'report.complete.confirm': 'Program "tamamlandı" olarak kapatılacak. Kayıtların ve raporun kalır; yeni bir program başlatabilirsin.',
  'report.complete.hint': 'Kapatmak zorunlu değil; istersen devam edebilirsin.',
  'report.completedOn': 'Tamamlandı: {date}',
  'report.delta.cm': '{delta} cm',
  'report.delta.kg': '{delta} kg',
  'report.disclaimer': 'Bu rapor ölçümlerinin özetidir; vücut kompozisyonu hakkında kesin bir iddia taşımaz.',
  'report.noData': 'Bu ölçüm için yeterli kayıt yok',
  'report.period': '{start} → {end}',
  'report.preview': 'Day {day} / 90 · ön izleme',
  'report.prs.bestE1rm': 'En yüksek tahmini 1RM: {kg} kg',
  'report.prs.count': '{n} kişisel rekor',
  'report.ratio.title': 'Bel / Omuz oranı',
  'report.row': '{from} → {to}',
  'report.section.body': 'Vücut ölçüleri',
  'report.section.prs': 'Kişisel rekorlar',
  'report.section.training': 'Antrenman',
  'report.section.weight': 'Kilo',
  'report.title': 'Day 90 raporu',
  'report.weight.baselineHint': 'Başlangıç: ilk 7 günün ortalaması',
  'report.weight.finalHint': 'Final: Day 90\'da biten 7 günlük ortalama',
  'report.weight.slope': 'Son 28 gün: {delta} kg/hafta',
  'reschedule.afterEnd': '90 günlük takvimin dışında',
  'reschedule.cancel': 'Vazgeç',
  'reschedule.confirm': 'Taşı',
  'reschedule.forecast': 'öngörü',
  'reschedule.hint': 'Bu antrenman {date} tarihine taşınacak; sıra değişmeyecek.',
  'reschedule.historyCount': '{n} kez taşındı',
  'reschedule.pausedDay': 'Program dondurulmuş',
  'reschedule.preferredDay': 'Tercih ettiğin gün',
  'reschedule.title': 'Tarih seç',
  'resume.cancel': 'Antrenmanı İptal Et',
  'resume.cancel.confirm.body': 'Bu antrenman iptal edilecek. Kaydettiğin setler silinmez ama geçmişte ve PR hesaplarında sayılmaz. Antrenman planı yeniden "planlandı" durumuna döner; sıra ilerlemez.',
  'resume.cancel.confirm.cancel': 'Vazgeç',
  'resume.cancel.confirm.ok': 'Antrenmanı İptal Et',
  'resume.continue': 'Devam Et',
  'resume.finish': 'Antrenmanı Bitir',
  'resume.progress': '{doneExercises}/{plannedExercises} hareket · {sets} set',
  'resume.startedAt': 'Başladı: {weekday} {HH:mm}',
  'resume.title': 'Devam eden antrenmanın var.',
  'settings.appLock.checking': 'Kontrol ediliyor…',
  'settings.appLock.description': 'Açıkken uygulamayı her açtığında ve ön plana getirdiğinde kimlik doğrulaması istenir.',
  'settings.appLock.disableFailed': 'Doğrulama yapılamadı; kilit açık kalmaya devam ediyor.',
  'settings.appLock.enableFailed': 'Doğrulama yapılamadı; kilit açılmadı.',
  'settings.appLock.fallbackNote': 'Biyometri çalışmazsa cihaz parolan kullanılır (platform destekliyorsa).',
  'settings.appLock.grace.0': 'Hemen',
  'settings.appLock.grace.30': '30 saniye',
  'settings.appLock.grace.300': '5 dakika',
  'settings.appLock.grace.hint': 'Uygulamadan bu süreden kısa ayrılırsan tekrar doğrulama istenmez.',
  'settings.appLock.grace.title': 'Yeniden kilitleme gecikmesi',
  'settings.appLock.prompt': 'V90 kilidini aç',
  'settings.appLock.title': 'Face ID / Touch ID / Biometric Lock',
  'settings.appLock.toggle': 'Uygulama kilidi',
  'settings.appLock.unavailable': 'Bu cihazda biyometrik doğrulama yok ya da kayıtlı değil. Cihaz ayarlarından Face ID / parmak izi ekleyip tekrar dene.',
  'settings.appLock.webUnavailable': 'Web\'de uygulama kilidi yok; tarayıcı biyometrik doğrulama sunmaz. Sekme arka plana geçince içerik perdelenir.',
  'settings.backup.export.activeSessionNote': 'Devam eden antrenmanın da yedeğe dahil edilir.',
  'settings.backup.export.button': 'Yedeği dışa aktar',
  'settings.backup.export.downloaded': '{name} indirildi · {size}',
  'settings.backup.export.failed': 'Yedek oluşturulamadı. Boş alanı kontrol et.',
  'settings.backup.export.last': 'Son yedek: {date} · {size}',
  'settings.backup.export.missingPhotos': '{n} fotoğraf dosyası bulunamadı ve yedeğe eklenmedi.',
  'settings.backup.export.none': 'Henüz yedek almadın.',
  'settings.backup.export.passwordHint': 'Parolayı unutursan yedek açılamaz.',
  'settings.backup.export.passwordToggle': 'Parola ile şifrele (ZIP AES)',
  'settings.backup.export.reshare': 'Tekrar paylaş',
  'settings.backup.export.step.manifest': 'Manifest yazılıyor…',
  'settings.backup.export.step.photos': 'Fotoğraflar kopyalanıyor…',
  'settings.backup.export.step.read': 'Veriler okunuyor…',
  'settings.backup.export.step.zip': 'ZIP oluşturuluyor…',
  'settings.backup.export.success': 'Yedek hazır: {fileName} ({size}). {tables} tablo, {photos} fotoğraf.',
  'settings.backup.export.unencryptedWarning': 'Yedek dosyası şifresizdir; içinde ölçümlerin, kan sonuçların ve fotoğrafların bulunur. Güvenli bir yerde sakla.',
  'settings.backup.import.blockedActiveSession': 'Önce devam eden antrenmanı bitir ya da iptal et.',
  'settings.backup.import.button': 'Yedekten geri yükle',
  'settings.backup.import.confirm': 'Mevcut verin bu yedekle değiştirilecek. 7 gün içinde geri alabilirsin.',
  'settings.backup.import.description': 'Bir V90 yedek dosyası (.zip) seç. Mevcut verin yedekle değiştirilir; 7 gün içinde geri alabilirsin.',
  'settings.backup.import.failed': 'İçe aktarma başarısız; mevcut verin değişmedi.',
  'settings.backup.import.mode.replace': 'Değiştir',
  'settings.backup.import.preview.appVersion': 'Uygulama sürümü: {v}',
  'settings.backup.import.preview.columns': 'Tablo · Yedek · Mevcut',
  'settings.backup.import.preview.createdAt': 'Alınma zamanı: {date}',
  'settings.backup.import.preview.fewerWarning': 'Yedekte mevcut verinden daha az kayıt var.',
  'settings.backup.import.preview.photos': 'Fotoğraflar: {count} ({size})',
  'settings.backup.import.preview.schemaSame': 'Şema {v} (güncel)',
  'settings.backup.import.preview.schemaUpgrade': 'Şema {v} → {cur} olarak yükseltilecek',
  'settings.backup.import.preview.showAll': 'Tümünü göster',
  'settings.backup.import.preview.title': 'Yedek önizlemesi',
  'settings.backup.import.step.photos': 'Fotoğraflar kopyalanıyor…',
  'settings.backup.import.step.swap': 'Değiştiriliyor…',
  'settings.backup.import.step.write': 'Veriler yazılıyor…',
  'settings.backup.import.success': 'Yedek geri yüklendi: {tables} tablo, {rows} kayıt, {photos} fotoğraf.',
  'settings.backup.import.tooNew': 'Bu yedek daha yeni bir sürümle alınmış',
  'settings.backup.import.tooNewHint': 'Uygulamayı güncelleyip tekrar dene.',
  'settings.backup.import.validating': 'Yedek doğrulanıyor…',
  'settings.backup.keyLossWarning': 'Cihaz sıfırlanırsa veritabanı anahtarı kaybolur ve veriler açılamaz. Düzenli yedek al.',
  'settings.backup.reminder.card': 'Son yedeğin üzerinden bir aydan uzun süre geçti. Yedek almak ister misin?',
  'settings.backup.reminder.toggle': 'Ayda bir yedek hatırlat',
  'settings.backup.title': 'Yedekleme',
  'settings.backup.undo.button': 'Geri al',
  'settings.backup.undo.card': 'İçe aktarma {date} tarihinde yapıldı. {days} gün içinde geri alabilirsin.',
  'settings.backup.undo.confirm': 'İçe aktarmadan sonra girdiğin her şey silinecek; önceki verin geri gelecek.',
  'settings.backup.undo.success': 'Önceki verin geri yüklendi.',
  'settings.backup.web.hint': 'Web\'de yedek tarayıcının indirme klasörüne kaydedilir. Tarayıcı verisi silinirse kayıtlar yalnızca bu dosyadan geri gelir; düzenli yedek al.',
  'settings.equipment.activeSessionNote': 'Devam eden antrenman etkilenmez; değişiklik sonraki antrenmanda uygulanır.',
  'settings.equipment.impact': 'Programdaki {n} hareket bu ekipmanla yapılamıyor; antrenmanda alternatif önerilecek.',
  'settings.equipment.impactNone': 'Programdaki tüm hareketler bu ekipmanla yapılabiliyor.',
  'settings.equipment.preset.custom': 'Özel',
  'settings.equipment.preset.fullCommercialGym': 'Tam donanımlı',
  'settings.equipment.preset.homeGym': 'Ev',
  'settings.equipment.preset.limitedGym': 'Sınırlı',
  'settings.equipment.presetReplaceConfirm': 'Mevcut seçimlerin preset ile değiştirilecek.',
  'settings.equipment.selectAll': 'Tümünü seç',
  'settings.equipment.title': 'Gym Equipment',
  'settings.privacy.androidFlagSecure': 'Fotoğraf ve Labs ekranlarında ekran görüntüsünü engelle',
  'settings.privacy.androidFlagSecureHint': 'Yalnızca Android. Bu ekranlarda ekran görüntüsü ve ekran kaydı engellenir.',
  'settings.privacy.iosNoScreenshotBlock': 'iOS ekran görüntüsünü engellemeye güvenilir biçimde izin vermez; V90 bunu vaat etmez. Arka plana geçişte içerik gizlenir.',
  'settings.privacy.noCloud': 'Tüm veri yalnızca bu cihazda saklanır.',
  'settings.privacy.sensitiveScreens': 'Progress Photos ve Labs ekranları gizlilik hassas görünümdür; uygulama arka plana geçince içerik perdeyle kapatılır.',
  'settings.privacy.title': 'Gizlilik',
  'settings.privacy.webNote': 'Web\'de ekran görüntüsü engellenemez; sekme arka plana geçince içerik perdelenir.',
  'settings.web.encryption': 'Veritabanı bu tarayıcıda AES-GCM ile şifreli saklanır; anahtar tarayıcının WebCrypto deposundadır ve dışa aktarılamaz.',
  'settings.web.limits': 'Biyometrik kilit ve bildirim web\'de yok; fotoğraflar tarayıcı deposunda tutulur.',
  'settings.web.persist.denied': 'Kalıcı depolama: verilmedi — tarayıcı yer açmak için silebilir; düzenli yedek al',
  'settings.web.persist.granted': 'Kalıcı depolama: verildi',
  'settings.web.persist.unsupported': 'Kalıcı depolama: bu tarayıcıda sorulamıyor; düzenli yedek al',
  'settings.web.title': 'Web sürümü',
  'validation.outOfRange.cm': '1–300 cm arasında bir değer gir.',
  'validation.outOfRange.kg': '1–400 kg arasında bir değer gir.',
  'validation.positiveGrams': 'Gram 0\'dan büyük olmalı.',
  'validation.zeroNotAllowed': '0 geçerli bir değer değil. Ölçmediysen boş bırak.',
  'video.channel': 'Kanal: {channelName}',
  'video.cues.title': 'Teknik ipuçları',
  'video.goToSource': 'Kaynağa git',
  'video.lastVerified': 'Son doğrulama: {date}',
  'video.loading': 'Video yükleniyor…',
  'video.none': 'Bu hareket için video yok',
  'video.offline': 'Çevrimdışısın; video için bağlantı gerekir.',
  'video.retry': 'Tekrar dene',
  'video.unavailable.body': 'Teknik ipuçları ve kaynak bağlantısı aşağıda.',
  'video.unavailable.title': 'Video şu an oynatılamıyor',
} as const;

export type TrKey = keyof typeof tr;

/** Metindeki {placeholder} adları — t() çağrısını tip düzeyinde denetler. */
export type TrParams = {
  'active.assistance': undefined;
  'active.assistance.hint': undefined;
  'active.band': undefined;
  'active.cancel': undefined;
  'active.completeSet': undefined;
  'active.finish': undefined;
  'active.load': undefined;
  'active.machineLevel': undefined;
  'active.noSession': undefined;
  'active.note.add': undefined;
  'active.prefill.lastSession': undefined;
  'active.prefill.prevSet': undefined;
  'active.prefill.recommended': undefined;
  'active.prefill.target': undefined;
  'active.reps': undefined;
  'active.rest.done': undefined;
  'active.rest.notification': undefined;
  'active.rest.remaining': { 'mm:ss': string | number };
  'active.rest.skip': undefined;
  'active.rest.start': undefined;
  'active.rir': undefined;
  'active.rir.options': undefined;
  'active.set.excludeFromPr': undefined;
  'active.set.extra': undefined;
  'active.set.formBreakdown': undefined;
  'active.set.pain': undefined;
  'active.set.save': undefined;
  'active.side.left': undefined;
  'active.side.right': undefined;
  'active.skipExercise': undefined;
  'active.substitute': undefined;
  'active.substitute.doneBefore': undefined;
  'active.substitute.editEquipment': undefined;
  'active.substitute.otherIntent': undefined;
  'active.substitute.rationale': undefined;
  'active.substitute.reason.equipmentBusy': undefined;
  'active.substitute.reason.pain': undefined;
  'active.substitute.reason.preference': undefined;
  'active.undo': undefined;
  'active.unilateral.bothSame': undefined;
  'active.unilateral.separate': undefined;
  'badge.estimate': undefined;
  'common.add': undefined;
  'common.back': undefined;
  'common.cancel': undefined;
  'common.details': undefined;
  'common.next': undefined;
  'common.retry': undefined;
  'common.save': undefined;
  'common.skip': undefined;
  'common.tryAgain': undefined;
  'dashboard.kpi.addMeasurement': undefined;
  'dashboard.kpi.biceps.baselineOnly': { 'cm': string | number };
  'dashboard.kpi.biceps.cta': undefined;
  'dashboard.kpi.biceps.leftRight': { 'l': string | number; 'r': string | number };
  'dashboard.kpi.biceps.title': undefined;
  'dashboard.kpi.delta.sinceBaseline': { 'delta': string | number };
  'dashboard.kpi.empty': undefined;
  'dashboard.kpi.kcal.band': { 'kcal': string | number };
  'dashboard.kpi.kcal.title': undefined;
  'dashboard.kpi.loadFailed': undefined;
  'dashboard.kpi.median3': undefined;
  'dashboard.kpi.ratio.baseline': { 'ratio': string | number };
  'dashboard.kpi.ratio.title': undefined;
  'dashboard.kpi.singleValue': undefined;
  'dashboard.kpi.trend.down': undefined;
  'dashboard.kpi.trend.insufficient': undefined;
  'dashboard.kpi.trend.stable': undefined;
  'dashboard.kpi.trend.up': undefined;
  'dashboard.kpi.waist.title': undefined;
  'dashboard.kpi.weight.avg7': undefined;
  'dashboard.kpi.weight.last': { 'day': string | number; 'kg': string | number };
  'dashboard.kpi.weight.slope28': { 'delta': string | number };
  'dashboard.kpi.weight.title': undefined;
  'error.boundary.home': undefined;
  'error.boundary.reload': undefined;
  'error.boundary.title': undefined;
  'error.dbOpen.body': undefined;
  'error.dbOpen.restore': undefined;
  'error.dbOpen.retry': undefined;
  'error.dbOpen.support': undefined;
  'error.dbOpen.title': undefined;
  'error.dbWrite': undefined;
  'error.details.copy': undefined;
  'error.diskSpace.body': undefined;
  'error.diskSpace.title': undefined;
  'error.import.title': undefined;
  'error.import.tooNew': undefined;
  'error.migration.export': undefined;
  'error.migration.inProgress': undefined;
  'error.migration.retry': undefined;
  'error.migration.title': undefined;
  'error.retry': undefined;
  'error.write': undefined;
  'exercises.load_progression_type': undefined;
  'finish.back': undefined;
  'finish.confirm': undefined;
  'finish.date.edit': undefined;
  'finish.date.label': undefined;
  'finish.date.overridden': undefined;
  'finish.empty': undefined;
  'finish.fromResume': { 'date': string | number };
  'finish.note': undefined;
  'finish.partial.continueLater': undefined;
  'finish.partial.continueLater.hint': { 'n': string | number };
  'finish.partial.countDone': undefined;
  'finish.partial.countDone.hint': undefined;
  'finish.partial.question': undefined;
  'finish.partial.summary': { 'done': string | number; 'missing': string | number; 'planned': string | number };
  'finish.title.full': undefined;
  'finish.title.partial': undefined;
  'finish.volumePr': undefined;
  'food.new.title': undefined;
  'food.override.per100': undefined;
  'food.override.preserved': undefined;
  'food.override.servingSize': undefined;
  'food.override.servingUnit': undefined;
  'food.override.sourceNote': { 'date': string | number; 'source': string | number };
  'food.override.title': undefined;
  'home.biceps.cta': undefined;
  'home.day': { 'X': string | number };
  'home.doneToday.preview': { 'date': string | number; 'templateNameTr': string | number };
  'home.doneToday.title': undefined;
  'home.empty.cta': undefined;
  'home.finished.title': undefined;
  'home.missed.title': { 'plannedWeekday': string | number; 'templateName': string | number };
  'home.next.planned': { 'date': string | number; 'weekday': string | number };
  'home.next.recoCount': { 'n': string | number };
  'home.next.sequence': { 'n': string | number; 'templateNameTr': string | number };
  'home.next.start': undefined;
  'home.next.title': undefined;
  'home.paused.resume': undefined;
  'home.paused.title': undefined;
  'home.resume.title': undefined;
  'lock.failed': undefined;
  'lock.fallbackHint': undefined;
  'lock.noCredential': undefined;
  'lock.prompt': undefined;
  'lock.title': undefined;
  'lock.unlockButton': undefined;
  'measurement.baselineBadge': undefined;
  'measurement.date.today': undefined;
  'measurement.date.yesterday': undefined;
  'measurement.deltaPrev': { 'delta': string | number };
  'measurement.final.mean': { 'value': string | number };
  'measurement.final.median': { 'value': string | number };
  'measurement.final.single': { 'value': string | number };
  'measurement.group.arms': undefined;
  'measurement.group.legs': undefined;
  'measurement.group.torso': undefined;
  'measurement.guide.title': undefined;
  'measurement.hint.second': undefined;
  'measurement.noPrev': undefined;
  'measurement.sample.1': undefined;
  'measurement.sample.2': undefined;
  'measurement.sample.3': undefined;
  'measurement.saveSingle': undefined;
  'measurement.saveWithTwoAnyway': undefined;
  'measurement.side.left': undefined;
  'measurement.side.right': undefined;
  'measurement.side.single': undefined;
  'measurement.site.abdomen': undefined;
  'measurement.site.bicepsFlexed': undefined;
  'measurement.site.calf': undefined;
  'measurement.site.chest': undefined;
  'measurement.site.forearm': undefined;
  'measurement.site.hip': undefined;
  'measurement.site.neck': undefined;
  'measurement.site.pick': undefined;
  'measurement.site.shoulder': undefined;
  'measurement.site.thigh': undefined;
  'measurement.site.waist': undefined;
  'measurement.thirdSuggested': undefined;
  'measurement.thirdSuggestedHint': { 'diff': string | number };
  'measurement.title': undefined;
  'missed.dismiss': undefined;
  'missed.moveToDate': undefined;
  'missed.moveToday': undefined;
  'missed.skip': undefined;
  'missed.skip.confirm.body': undefined;
  'missed.skip.confirm.cancel': undefined;
  'missed.skip.confirm.ok': undefined;
  'missed.subtitle': { 'n': string | number };
  'missed.title': { 'plannedWeekday': string | number; 'templateName': string | number };
  'nutrition.addFood': undefined;
  'nutrition.copiedFrom': { 'date': string | number };
  'nutrition.copyMeal': undefined;
  'nutrition.copyMeal.pickSource': undefined;
  'nutrition.copyYesterday': undefined;
  'nutrition.copyYesterday.confirmAppend': undefined;
  'nutrition.copyYesterday.emptySource': undefined;
  'nutrition.dayTotal': undefined;
  'nutrition.entry.delete': undefined;
  'nutrition.entry.edit': undefined;
  'nutrition.favorite.add': undefined;
  'nutrition.favorite.remove': undefined;
  'nutrition.grams': undefined;
  'nutrition.repeatBreakfast': undefined;
  'nutrition.repeatSlot': { 'slot': string | number };
  'nutrition.repeatSlot.none': undefined;
  'nutrition.savedMeal.namePrompt': undefined;
  'nutrition.savedMeal.saveAs': undefined;
  'nutrition.savedMeal.tab': undefined;
  'nutrition.search.empty': undefined;
  'nutrition.search.placeholder': undefined;
  'nutrition.search.tab.all': undefined;
  'nutrition.search.tab.favorites': undefined;
  'nutrition.search.tab.recent': undefined;
  'nutrition.search.tab.recipes': undefined;
  'nutrition.servings': { 'g': string | number; 'unit': string | number };
  'nutrition.slot.breakfast': undefined;
  'nutrition.slot.dinner': undefined;
  'nutrition.slot.lunch': undefined;
  'nutrition.slot.postWorkout': undefined;
  'nutrition.slot.preWorkout': undefined;
  'nutrition.slot.snack': undefined;
  'nutrition.source.labelOverride': undefined;
  'nutrition.source.seedTrLabel': undefined;
  'nutrition.source.seedUsda': undefined;
  'nutrition.source.user': undefined;
  'nutrition.target': { 'kcal': string | number; 'p': string | number };
  'nutrition.title': undefined;
  'onboarding.biceps.laterHint': undefined;
  'onboarding.biceps.left': undefined;
  'onboarding.biceps.mode.later': undefined;
  'onboarding.biceps.mode.separate': undefined;
  'onboarding.biceps.mode.single': undefined;
  'onboarding.biceps.right': undefined;
  'onboarding.biceps.save': undefined;
  'onboarding.biceps.single': undefined;
  'onboarding.biceps.title': undefined;
  'onboarding.biceps.why': undefined;
  'onboarding.equipment.customBadge': undefined;
  'onboarding.equipment.finish': undefined;
  'onboarding.equipment.presetHint': undefined;
  'onboarding.equipment.title': undefined;
  'onboarding.initial.bicepsUnknown': undefined;
  'onboarding.initial.confirm': undefined;
  'onboarding.initial.emptyHint': undefined;
  'onboarding.initial.enterMyself': undefined;
  'onboarding.initial.row.abdomen': undefined;
  'onboarding.initial.row.bicepsFlexed': undefined;
  'onboarding.initial.row.chest': undefined;
  'onboarding.initial.row.forearm': undefined;
  'onboarding.initial.row.height': undefined;
  'onboarding.initial.row.hip': undefined;
  'onboarding.initial.row.shoulder': undefined;
  'onboarding.initial.row.waist': undefined;
  'onboarding.initial.row.weight': undefined;
  'onboarding.initial.subtitle': undefined;
  'onboarding.initial.title': undefined;
  'onboarding.initial.usePrefilled': undefined;
  'onboarding.training.days.hint': undefined;
  'onboarding.training.days.title': undefined;
  'onboarding.training.experience.advanced': undefined;
  'onboarding.training.experience.beginner': undefined;
  'onboarding.training.experience.intermediate': undefined;
  'onboarding.training.experience.title': undefined;
  'onboarding.training.gymType.fullCommercialGym': undefined;
  'onboarding.training.gymType.homeGym': undefined;
  'onboarding.training.gymType.limitedGym': undefined;
  'onboarding.training.gymType.title': undefined;
  'onboarding.training.minutes.hint': undefined;
  'onboarding.training.minutes.title': undefined;
  'onboarding.training.pain.hint': undefined;
  'onboarding.training.pain.none': undefined;
  'onboarding.training.pain.title': undefined;
  'onboarding.training.sleep.title': undefined;
  'onboarding.training.subtitle': undefined;
  'onboarding.training.title': undefined;
  'photos.add': undefined;
  'photos.androidSecureActive': undefined;
  'photos.compare': undefined;
  'photos.delete': undefined;
  'photos.delete.confirm': undefined;
  'photos.empty': undefined;
  'photos.fileMissing': undefined;
  'photos.iosScreenshotNote': undefined;
  'photos.note': undefined;
  'photos.pose.back': undefined;
  'photos.pose.backFlexed': undefined;
  'photos.pose.front': undefined;
  'photos.pose.frontFlexed': undefined;
  'photos.pose.other': undefined;
  'photos.pose.sideLeft': undefined;
  'photos.pose.sideRight': undefined;
  'photos.privacyNote': undefined;
  'photos.removeRecord': undefined;
  'photos.source.camera': undefined;
  'photos.source.file': undefined;
  'photos.source.library': undefined;
  'photos.title': undefined;
  'photos.webNote': undefined;
  'plateau.ack': undefined;
  'plateau.checklist.checked': undefined;
  'plateau.checklist.noData': undefined;
  'plateau.checklist.title': undefined;
  'plateau.dismiss': undefined;
  'plateau.entry': { 'exerciseNameTr': string | number };
  'plateau.explain': undefined;
  'plateau.noAuto': undefined;
  'plateau.resolve': undefined;
  'plateau.suggest.apply': undefined;
  'plateau.suggest.deload': undefined;
  'plateau.suggest.repTargetAdjust': undefined;
  'plateau.suggest.sameLoad': undefined;
  'plateau.suggest.substitution': undefined;
  'plateau.title': { 'exerciseNameTr': string | number };
  'pr.banner.title': undefined;
  'pr.estimateBadge': undefined;
  'pr.excludeHint': undefined;
  'pr.side.left': undefined;
  'pr.side.right': undefined;
  'pr.type.estimatedPerformancePr': { 'estimated_1rm': string | number };
  'pr.type.loadPr': { 'effectiveLoad': string | number; 'reps': string | number };
  'pr.type.repPrAtLoad': { 'effectiveLoad': string | number; 'reps': string | number };
  'pr.type.sessionVolumePr': { 'session_volume': string | number };
  'privacyOverlay.a11y': undefined;
  'privacyOverlay.label': undefined;
  'program.mode.active': undefined;
  'program.mode.active.hint': undefined;
  'program.mode.preview': { 'active': string | number; 'strict': string | number };
  'program.mode.strict': undefined;
  'program.mode.strict.hint': undefined;
  'program.mode.title': undefined;
  'program.pause.blockedByActive': undefined;
  'program.pause.button': undefined;
  'program.pause.confirm': undefined;
  'program.pause.hint': undefined;
  'program.pause.note': undefined;
  'program.pause.reason.illness': undefined;
  'program.pause.reason.injury': undefined;
  'program.pause.reason.other': undefined;
  'program.pause.reason.personal': undefined;
  'program.pause.reason.title': undefined;
  'program.pause.reason.travel': undefined;
  'program.pause.reason.work': undefined;
  'program.paused.banner': { 'n': string | number; 'reasonLabel': string | number };
  'program.resume.button': undefined;
  'progress.volume.activeExcluded': undefined;
  'progress.volume.baselineMark': undefined;
  'progress.volume.directHint': undefined;
  'progress.volume.empty': undefined;
  'progress.volume.estimateUnit': { 'n': string | number };
  'progress.volume.maxMark': undefined;
  'progress.volume.priority': undefined;
  'progress.volume.secondaryHint': undefined;
  'progress.volume.setsUnit': { 'n': string | number };
  'progress.volume.tab.direct': undefined;
  'progress.volume.tab.secondary': undefined;
  'progress.volume.title': undefined;
  'progress.volume.whyRecommended': undefined;
  'recipe.addIngredient': undefined;
  'recipe.addToMeal': undefined;
  'recipe.cookedYield': undefined;
  'recipe.cookedYield.hint': undefined;
  'recipe.cookedYield.unusual': undefined;
  'recipe.name': undefined;
  'recipe.noCookedYield': undefined;
  'recipe.per100.cooked': undefined;
  'recipe.per100.raw': undefined;
  'recipe.portion': undefined;
  'recipe.portionResult': { 'c': string | number; 'f': string | number; 'g': string | number; 'kcal': string | number; 'p': string | number };
  'recipe.rawTotal': { 'g': string | number };
  'recipe.save': undefined;
  'recipe.title': undefined;
  'recipe.total': { 'c': string | number; 'f': string | number; 'kcal': string | number; 'p': string | number };
  'reco.accept': undefined;
  'reco.decided.accepted': { 'value': string | number };
  'reco.decided.ignored': undefined;
  'reco.decided.modified': { 'value': string | number };
  'reco.estimateBadge': undefined;
  'reco.ignore': undefined;
  'reco.kind.deload': undefined;
  'reco.kind.holdLoad': undefined;
  'reco.kind.loadDecrease': undefined;
  'reco.kind.loadIncrease': undefined;
  'reco.kind.nutritionHold': undefined;
  'reco.kind.repIncrease': undefined;
  'reco.kind.substitution': undefined;
  'reco.kind.volumeHold': undefined;
  'reco.kind.volumeIncrease': { 'delta': string | number };
  'reco.modify': undefined;
  'reco.modify.save': undefined;
  'reco.proposed.assistance': { 'assistanceKg': string | number };
  'reco.proposed.load': { 'load': string | number };
  'reco.proposed.reps': { 'reps': string | number };
  'reco.rationale.example': undefined;
  'reco.userValueBadge': undefined;
  'reco.why': undefined;
  'report.adherence': { 'completed': string | number; 'missed': string | number; 'partial': string | number; 'skipped': string | number };
  'report.complete.button': undefined;
  'report.complete.confirm': undefined;
  'report.complete.hint': undefined;
  'report.completedOn': { 'date': string | number };
  'report.delta.cm': { 'delta': string | number };
  'report.delta.kg': { 'delta': string | number };
  'report.disclaimer': undefined;
  'report.noData': undefined;
  'report.period': { 'end': string | number; 'start': string | number };
  'report.preview': { 'day': string | number };
  'report.prs.bestE1rm': { 'kg': string | number };
  'report.prs.count': { 'n': string | number };
  'report.ratio.title': undefined;
  'report.row': { 'from': string | number; 'to': string | number };
  'report.section.body': undefined;
  'report.section.prs': undefined;
  'report.section.training': undefined;
  'report.section.weight': undefined;
  'report.title': undefined;
  'report.weight.baselineHint': undefined;
  'report.weight.finalHint': undefined;
  'report.weight.slope': { 'delta': string | number };
  'reschedule.afterEnd': undefined;
  'reschedule.cancel': undefined;
  'reschedule.confirm': undefined;
  'reschedule.forecast': undefined;
  'reschedule.hint': { 'date': string | number };
  'reschedule.historyCount': { 'n': string | number };
  'reschedule.pausedDay': undefined;
  'reschedule.preferredDay': undefined;
  'reschedule.title': undefined;
  'resume.cancel': undefined;
  'resume.cancel.confirm.body': undefined;
  'resume.cancel.confirm.cancel': undefined;
  'resume.cancel.confirm.ok': undefined;
  'resume.continue': undefined;
  'resume.finish': undefined;
  'resume.progress': { 'doneExercises': string | number; 'plannedExercises': string | number; 'sets': string | number };
  'resume.startedAt': { 'HH:mm': string | number; 'weekday': string | number };
  'resume.title': undefined;
  'settings.appLock.checking': undefined;
  'settings.appLock.description': undefined;
  'settings.appLock.disableFailed': undefined;
  'settings.appLock.enableFailed': undefined;
  'settings.appLock.fallbackNote': undefined;
  'settings.appLock.grace.0': undefined;
  'settings.appLock.grace.30': undefined;
  'settings.appLock.grace.300': undefined;
  'settings.appLock.grace.hint': undefined;
  'settings.appLock.grace.title': undefined;
  'settings.appLock.prompt': undefined;
  'settings.appLock.title': undefined;
  'settings.appLock.toggle': undefined;
  'settings.appLock.unavailable': undefined;
  'settings.appLock.webUnavailable': undefined;
  'settings.backup.export.activeSessionNote': undefined;
  'settings.backup.export.button': undefined;
  'settings.backup.export.downloaded': { 'name': string | number; 'size': string | number };
  'settings.backup.export.failed': undefined;
  'settings.backup.export.last': { 'date': string | number; 'size': string | number };
  'settings.backup.export.missingPhotos': { 'n': string | number };
  'settings.backup.export.none': undefined;
  'settings.backup.export.passwordHint': undefined;
  'settings.backup.export.passwordToggle': undefined;
  'settings.backup.export.reshare': undefined;
  'settings.backup.export.step.manifest': undefined;
  'settings.backup.export.step.photos': undefined;
  'settings.backup.export.step.read': undefined;
  'settings.backup.export.step.zip': undefined;
  'settings.backup.export.success': { 'fileName': string | number; 'photos': string | number; 'size': string | number; 'tables': string | number };
  'settings.backup.export.unencryptedWarning': undefined;
  'settings.backup.import.blockedActiveSession': undefined;
  'settings.backup.import.button': undefined;
  'settings.backup.import.confirm': undefined;
  'settings.backup.import.description': undefined;
  'settings.backup.import.failed': undefined;
  'settings.backup.import.mode.replace': undefined;
  'settings.backup.import.preview.appVersion': { 'v': string | number };
  'settings.backup.import.preview.columns': undefined;
  'settings.backup.import.preview.createdAt': { 'date': string | number };
  'settings.backup.import.preview.fewerWarning': undefined;
  'settings.backup.import.preview.photos': { 'count': string | number; 'size': string | number };
  'settings.backup.import.preview.schemaSame': { 'v': string | number };
  'settings.backup.import.preview.schemaUpgrade': { 'cur': string | number; 'v': string | number };
  'settings.backup.import.preview.showAll': undefined;
  'settings.backup.import.preview.title': undefined;
  'settings.backup.import.step.photos': undefined;
  'settings.backup.import.step.swap': undefined;
  'settings.backup.import.step.write': undefined;
  'settings.backup.import.success': { 'photos': string | number; 'rows': string | number; 'tables': string | number };
  'settings.backup.import.tooNew': undefined;
  'settings.backup.import.tooNewHint': undefined;
  'settings.backup.import.validating': undefined;
  'settings.backup.keyLossWarning': undefined;
  'settings.backup.reminder.card': undefined;
  'settings.backup.reminder.toggle': undefined;
  'settings.backup.title': undefined;
  'settings.backup.undo.button': undefined;
  'settings.backup.undo.card': { 'date': string | number; 'days': string | number };
  'settings.backup.undo.confirm': undefined;
  'settings.backup.undo.success': undefined;
  'settings.backup.web.hint': undefined;
  'settings.equipment.activeSessionNote': undefined;
  'settings.equipment.impact': { 'n': string | number };
  'settings.equipment.impactNone': undefined;
  'settings.equipment.preset.custom': undefined;
  'settings.equipment.preset.fullCommercialGym': undefined;
  'settings.equipment.preset.homeGym': undefined;
  'settings.equipment.preset.limitedGym': undefined;
  'settings.equipment.presetReplaceConfirm': undefined;
  'settings.equipment.selectAll': undefined;
  'settings.equipment.title': undefined;
  'settings.privacy.androidFlagSecure': undefined;
  'settings.privacy.androidFlagSecureHint': undefined;
  'settings.privacy.iosNoScreenshotBlock': undefined;
  'settings.privacy.noCloud': undefined;
  'settings.privacy.sensitiveScreens': undefined;
  'settings.privacy.title': undefined;
  'settings.privacy.webNote': undefined;
  'settings.web.encryption': undefined;
  'settings.web.limits': undefined;
  'settings.web.persist.denied': undefined;
  'settings.web.persist.granted': undefined;
  'settings.web.persist.unsupported': undefined;
  'settings.web.title': undefined;
  'validation.outOfRange.cm': undefined;
  'validation.outOfRange.kg': undefined;
  'validation.positiveGrams': undefined;
  'validation.zeroNotAllowed': undefined;
  'video.channel': { 'channelName': string | number };
  'video.cues.title': undefined;
  'video.goToSource': undefined;
  'video.lastVerified': { 'date': string | number };
  'video.loading': undefined;
  'video.none': undefined;
  'video.offline': undefined;
  'video.retry': undefined;
  'video.unavailable.body': undefined;
  'video.unavailable.title': undefined;
};
