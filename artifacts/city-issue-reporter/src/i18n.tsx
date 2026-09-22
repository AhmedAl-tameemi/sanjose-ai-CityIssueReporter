import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export const languages = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'Arabic', dir: 'rtl' },
  { code: 'zh-CN', label: 'Chinese (Simplified)', dir: 'ltr' },
  { code: 'zh-TW', label: 'Chinese (Traditional)', dir: 'ltr' },
  { code: 'fil', label: 'Filipino', dir: 'ltr' },
  { code: 'hi', label: 'Hindi', dir: 'ltr' },
  { code: 'ja', label: 'Japanese', dir: 'ltr' },
  { code: 'ko', label: 'Korean', dir: 'ltr' },
  { code: 'fa', label: 'Persian', dir: 'rtl' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)', dir: 'ltr' },
  { code: 'ru', label: 'Russian', dir: 'ltr' },
  { code: 'es', label: 'Spanish', dir: 'ltr' },
  { code: 'vi', label: 'Vietnamese', dir: 'ltr' },
] as const;

export type LanguageCode = (typeof languages)[number]['code'];
export type Direction = (typeof languages)[number]['dir'];

const rows = {
  brandName: ["City Issue Reporter","بوابة الإبلاغ عن مشكلات المدينة","城市问题报告","城市問題回報","Tagapag-ulat ng Isyu sa Lungsod","शहर समस्या रिपोर्टर","市の問題報告","도시 문제 신고","سامانه گزارش مشکلات شهری","Relator de Problemas da Cidade","Сообщить о городской проблеме","Reporte de Problemas de la Ciudad","Báo cáo Vấn đề Thành phố"],
  headerNote: ["A clearer way to care for our streets","طريقة أوضح للعناية بشوارعنا","更清晰地关心我们的街道","更清楚地關心我們的街道","Mas malinaw na paraan para alagaan ang ating mga kalsada","हमारी सड़कों की देखभाल का आसान तरीका","地域の道路を守る、わかりやすい方法","우리 거리를 돌보는 더 쉬운 방법","راهی روشن‌تر برای مراقبت از خیابان‌ها","Uma forma mais clara de cuidar das nossas ruas","Понятный способ заботиться о наших улицах","Una forma más clara de cuidar nuestras calles","Cách rõ ràng hơn để chăm sóc đường phố"],
  languageLabel: ["Language","اللغة","语言","語言","Wika","भाषा","言語","언어","زبان","Idioma","Язык","Idioma","Ngôn ngữ"],
  eyebrow: ["Your neighborhood, heard","صوت حيّك مسموع","倾听您的社区","傾聽您的社區","Naririnig ang inyong komunidad","आपके पड़ोस की आवाज़","地域の声を届ける","우리 동네의 목소리","صدای محله شما شنیده می‌شود","Seu bairro, ouvido","Ваш район услышан","Tu vecindario, escuchado","Khu phố của bạn được lắng nghe"],
  heroLead: ["Notice it.","لاحظها.","发现问题。","發現問題。","Napansin mo.","देखा है।","気づいたら。","발견했다면.","دیدید.","Notou.","Заметили.","¿Lo notaste?","Nhận thấy."],
  heroAction: ["Tell us.","أخبرنا.","告诉我们。","告訴我們。","Ipaalam sa amin.","हमें बताएं।","お知らせください。","알려주세요.","به ما بگویید.","Conte para nós.","Сообщите нам.","Cuéntanos.","Hãy báo cho chúng tôi."],
  intro: ["Help the City understand what is happening on your street. A few thoughtful details help us send your report to the right people.","ساعد المدينة على فهم ما يحدث في شارعك. بعض التفاصيل المفيدة تساعدنا في توجيه بلاغك إلى الجهة المناسبة.","帮助市政府了解您街道上的情况。提供一些详细信息，有助于我们将报告发送给合适的部门。","協助市府了解您街道上的情況。提供一些詳細資訊，有助於我們將回報交給適當的單位。","Tulungan ang Lungsod na maunawaan ang nangyayari sa inyong kalsada. Makakatulong ang ilang detalye upang maipadala ang ulat sa tamang tanggapan.","शहर को आपकी सड़क पर हो रही समस्या समझने में मदद करें। कुछ उपयोगी विवरण आपकी रिपोर्ट सही विभाग तक पहुँचाने में मदद करेंगे।","道路で起きていることを市にお知らせください。詳しい情報があると、適切な部署に届けやすくなります。","거리에서 무슨 일이 일어나는지 시에서 알 수 있도록 도와주세요. 자세한 정보는 담당 부서에 신고를 전달하는 데 도움이 됩니다.","به شهرداری کمک کنید تا بداند در خیابان شما چه می‌گذرد. چند جزئیات مفید گزارش را به بخش مناسب می‌رساند.","Ajude a Prefeitura a entender o que está acontecendo na sua rua. Alguns detalhes ajudam a encaminhar seu relato à equipe certa.","Помогите городу понять, что происходит на вашей улице. Несколько деталей помогут направить обращение нужным специалистам.","Ayuda a la Ciudad a entender lo que ocurre en tu calle. Algunos detalles nos ayudan a enviar tu reporte al equipo adecuado.","Hãy giúp Thành phố hiểu điều đang xảy ra trên đường phố của bạn. Một vài chi tiết sẽ giúp chuyển báo cáo đến đúng bộ phận."],
  trustBuiltTitle: ["Built for neighbors","مصمم للسكان","为居民而设计","為居民而設計","Ginawa para sa mga kapitbahay","निवासियों के लिए बनाया गया","地域の皆さまのために","주민을 위한 서비스","ساخته‌شده برای همسایه‌ها","Feito para moradores","Создано для жителей","Hecho para residentes","Dành cho cư dân"],
  trustBuiltText: ["Plain language, no account required.","لغة بسيطة، ولا حاجة إلى حساب.","语言简单，无需账户。","用語簡單，無需帳戶。","Simpleng salita, hindi kailangan ng account.","सरल भाषा, किसी खाते की आवश्यकता नहीं।","わかりやすい言葉で、アカウント不要。","쉬운 표현, 계정 불필요.","زبان ساده، بدون نیاز به حساب.","Linguagem simples, sem necessidade de conta.","Простой язык, регистрация не нужна.","Lenguaje sencillo, sin necesidad de cuenta.","Ngôn ngữ đơn giản, không cần tài khoản."],
  trustTimeTitle: ["About five minutes","حوالي خمس دقائق","大约五分钟","約五分鐘","Mga limang minuto","लगभग पाँच मिनट","約5分","약 5분","حدود پنج دقیقه","Cerca de cinco minutos","Около пяти минут","Aproximadamente cinco minutos","Khoảng năm phút"],
  trustTimeText: ["Save your progress and return if needed.","احفظ تقدمك وعُد لاحقًا عند الحاجة.","保存进度，需要时可以返回。","儲存進度，需要時可再回來。","I-save ang progreso at bumalik kung kailangan.","अपनी प्रगति सहेजें और ज़रूरत पर वापस आएं।","途中で保存して、後で再開できます。","진행 상황을 저장하고 나중에 돌아올 수 있습니다.","پیشرفت خود را ذخیره کنید و بعداً برگردید.","Salve seu progresso e volte quando precisar.","Сохраните данные и вернитесь позже.","Guarda tu progreso y vuelve cuando sea necesario.","Lưu tiến trình và quay lại khi cần."],
  trustNextTitle: ["Know what happens next","اعرف ما سيحدث بعد ذلك","了解后续流程","了解後續流程","Alamin ang susunod na mangyayari","जानें आगे क्या होगा","次の流れがわかります","다음 단계를 확인하세요","بدانید بعد چه می‌شود","Saiba o que acontece depois","Узнайте, что будет дальше","Conoce lo que sigue","Biết điều gì xảy ra tiếp theo"],
  trustNextText: ["Leave with a report number to keep.","ستحصل على رقم بلاغ للاحتفاظ به.","提交后会获得报告编号。","送出後會取得回報編號。","Makakakuha ka ng numero ng ulat.","आपको सुरक्षित रखने के लिए रिपोर्ट नंबर मिलेगा।","控え用の受付番号を発行します。","보관할 신고 번호를 받습니다.","یک شماره گزارش برای نگهداری دریافت می‌کنید.","Você receberá um número de protocolo.","Вы получите номер обращения.","Recibirás un número de reporte.","Bạn sẽ nhận được mã báo cáo."],
  formTitle: ["Tell us what you noticed","أخبرنا بما لاحظته","告诉我们您发现了什么","告訴我們您發現了什麼","Sabihin sa amin ang napansin mo","हमें बताएं कि आपने क्या देखा","気づいたことを教えてください","발견한 내용을 알려주세요","آنچه دیدید به ما بگویید","Conte o que você percebeu","Расскажите, что вы заметили","Cuéntanos qué notaste","Hãy cho chúng tôi biết bạn nhận thấy gì"],
  requiredNote: ["Required fields are marked with an asterisk.","الحقول المطلوبة مميزة بعلامة النجمة.","必填项标有星号。","必填欄位標有星號。","May asterisk ang mga kailangang sagutan.","आवश्यक फ़ील्ड तारांकन से चिह्नित हैं।","必須項目にはアスタリスクがあります。","필수 항목에는 별표가 있습니다.","فیلدهای ضروری با ستاره مشخص شده‌اند.","Os campos obrigatórios têm um asterisco.","Обязательные поля отмечены звездочкой.","Los campos obligatorios tienen un asterisco.","Các trường bắt buộc được đánh dấu sao."],
  stepOf: ["Step {step} of 3","الخطوة {step} من 3","第 {step} 步，共 3 步","第 {step} 步，共 3 步","Hakbang {step} ng 3","चरण {step} / 3","3ステップ中{step}","3단계 중 {step}단계","مرحله {step} از ۳","Etapa {step} de 3","Шаг {step} из 3","Paso {step} de 3","Bước {step} trên 3"],
  step1Title: ["Where should we look?","أين نبحث؟","我们应该查看哪里？","我們應該查看哪裡？","Saan kami dapat tumingin?","हमें कहाँ देखना चाहिए?","場所を教えてください","어디를 확인해야 하나요?","کجا را بررسی کنیم؟","Onde devemos verificar?","Где нужно посмотреть?","¿Dónde debemos revisar?","Chúng tôi nên kiểm tra ở đâu?"],
  step1Desc: ["Start with the kind of issue and the place where it is happening.","ابدأ بنوع المشكلة والمكان الذي تحدث فيه.","请先选择问题类型和发生地点。","請先選擇問題類型和發生地點。","Magsimula sa uri ng isyu at lugar kung saan ito nangyayari.","समस्या का प्रकार और स्थान बताकर शुरू करें।","問題の種類と発生場所から入力してください。","문제 유형과 발생 장소부터 알려주세요.","با نوع مشکل و محل وقوع آن شروع کنید.","Comece pelo tipo de problema e onde ele acontece.","Сначала выберите тип проблемы и место.","Empieza con el tipo de problema y el lugar donde ocurre.","Hãy bắt đầu với loại vấn đề và nơi xảy ra."],
  issueType: ["Issue type","نوع المشكلة","问题类型","問題類型","Uri ng isyu","समस्या का प्रकार","問題の種類","문제 유형","نوع مشکل","Tipo de problema","Тип проблемы","Tipo de problema","Loại vấn đề"],
  issueUnsafe: ["Unsafe driving","قيادة غير آمنة","危险驾驶","危險駕駛","Mapanganib na pagmamaneho","असुरक्षित ड्राइविंग","危険な運転","위험 운전","رانندگی ناایمن","Direção perigosa","Опасное вождение","Conducción peligrosa","Lái xe không an toàn"],
  issueSpeeding: ["Speeding","السرعة الزائدة","超速","超速","Labis na bilis","तेज़ गति","スピード違反","과속","سرعت غیرمجاز","Excesso de velocidade","Превышение скорости","Exceso de velocidad","Chạy quá tốc độ"],
  issuePotholes: ["Potholes","حفر الشوارع","道路坑洞","道路坑洞","Lubak","सड़क के गड्ढे","道路の穴","도로 파임","چاله خیابان","Buracos na rua","Ямы на дороге","Baches","Ổ gà"],
  issueDumping: ["Illegal dumping","إلقاء نفايات بشكل غير قانوني","非法倾倒垃圾","非法傾倒垃圾","Ilegal na pagtatapon","अवैध कचरा फेंकना","不法投棄","불법 투기","تخلیه غیرقانونی زباله","Descarte irregular","Незаконный сброс мусора","Vertido ilegal","Đổ rác trái phép"],
  issueStreetlight: ["Streetlight problems","مشكلات إنارة الشوارع","路灯问题","路燈問題","Problema sa ilaw sa kalsada","स्ट्रीटलाइट की समस्या","街路灯の問題","가로등 문제","مشکلات چراغ خیابان","Problemas na iluminação pública","Проблемы с уличным освещением","Problemas de alumbrado público","Vấn đề đèn đường"],
  issueOther: ["Other","أخرى","其他","其他","Iba pa","अन्य","その他","기타","سایر","Outro","Другое","Otro","Khác"],
  locationLabel: ["Where is it?","أين تقع المشكلة؟","在哪里？","在哪裡？","Saan ito?","यह कहाँ है?","場所はどこですか？","어디인가요?","کجاست؟","Onde fica?","Где это?","¿Dónde está?","Ở đâu?"],
  locationPlaceholder: ["Street address, intersection, or landmark","عنوان الشارع أو التقاطع أو معلم معروف","街道地址、路口或地标","街道地址、路口或地標","Address, kanto, o palatandaan","सड़क का पता, चौराहा या प्रमुख स्थान","住所、交差点、目印","도로명 주소, 교차로 또는 랜드마크","نشانی خیابان، تقاطع یا نشانه","Endereço, cruzamento ou ponto de referência","Адрес, перекресток или ориентир","Dirección, intersección o punto de referencia","Địa chỉ, giao lộ hoặc địa danh"],
  locationHint: ["A nearby address helps the City route your report.","يساعد العنوان القريب المدينة على توجيه بلاغك.","附近地址有助于市政府转交您的报告。","附近地址有助於市府轉交您的回報。","Makakatulong ang malapit na address sa pagpapadala ng ulat.","पास का पता रिपोर्ट को सही विभाग तक पहुँचाने में मदद करता है।","近くの住所があると担当部署に届けやすくなります。","근처 주소는 담당 부서로 신고를 전달하는 데 도움이 됩니다.","نشانی نزدیک به ارجاع گزارش کمک می‌کند.","Um endereço próximo ajuda a encaminhar o relato.","Ближайший адрес поможет направить обращение.","Una dirección cercana ayuda a dirigir el reporte.","Địa chỉ gần đó giúp chuyển báo cáo đúng bộ phận."],
  step2Title: ["What happened?","ماذا حدث؟","发生了什么？","發生了什麼？","Ano ang nangyari?","क्या हुआ?","何が起きましたか？","무슨 일이 있었나요?","چه اتفاقی افتاد؟","O que aconteceu?","Что произошло?","¿Qué ocurrió?","Điều gì đã xảy ra?"],
  step2Desc: ["A little context helps staff understand the situation and what to check.","بعض التفاصيل تساعد الموظفين على فهم الوضع وما يجب التحقق منه.","一些背景信息可帮助工作人员了解情况。","一些背景資訊可協助人員了解情況。","Makakatulong ang kaunting detalye upang maunawaan ang sitwasyon.","कुछ जानकारी कर्मचारियों को स्थिति समझने में मदद करेगी।","状況がわかる情報をご記入ください。","상황을 이해할 수 있도록 자세히 알려주세요.","کمی توضیح به کارکنان در درک وضعیت کمک می‌کند.","Alguns detalhes ajudam a equipe a entender a situação.","Детали помогут сотрудникам понять ситуацию.","Algunos detalles ayudan al personal a entender la situación.","Một ít thông tin giúp nhân viên hiểu tình hình."],
  dateLabel: ["Date noticed","تاريخ الملاحظة","发现日期","發現日期","Petsa ng pagkakita","देखने की तारीख","気づいた日","발견 날짜","تاریخ مشاهده","Data em que percebeu","Дата обнаружения","Fecha en que lo notaste","Ngày phát hiện"],
  timeLabel: ["Approximate time","الوقت التقريبي","大概时间","大約時間","Tinatayang oras","अनुमानित समय","おおよその時間","대략적인 시간","زمان تقریبی","Horário aproximado","Примерное время","Hora aproximada","Thời gian ước tính"],
  timePlaceholder: ["For example, around 8:30 am","مثلاً، حوالي 8:30 صباحًا","例如，上午 8:30 左右","例如，上午 8:30 左右","Halimbawa, bandang 8:30 am","उदाहरण: सुबह लगभग 8:30 बजे","例：午前8時30分ごろ","예: 오전 8시 30분경","مثلاً حدود ساعت ۸:۳۰ صبح","Por exemplo, por volta de 8h30","Например, около 8:30","Por ejemplo, alrededor de las 8:30 a. m.","Ví dụ, khoảng 8:30 sáng"],
  descriptionLabel: ["In your own words, what did you see?","بكلماتك، ماذا رأيت؟","请用自己的话描述您看到的情况","請用自己的話描述您看到的情況","Sa sarili mong salita, ano ang nakita mo?","अपने शब्दों में बताएं कि आपने क्या देखा।","見たことをあなたの言葉で教えてください","직접 본 내용을 작성해주세요","با زبان خودتان بگویید چه دیدید؟","Com suas palavras, o que você viu?","Опишите своими словами, что вы увидели","Con tus propias palabras, ¿qué viste?","Theo lời của bạn, bạn đã thấy gì?"],
  descriptionPlaceholder: ["Share useful details about what happened or what feels unsafe.","اذكر تفاصيل مفيدة عما حدث أو ما يبدو غير آمن.","请提供发生情况或不安全因素的有用细节。","請提供發生情況或不安全因素的有用細節。","Ibahagi ang mahahalagang detalye tungkol sa nangyari.","जो हुआ या जो असुरक्षित लगा उसका विवरण दें।","何が起きたか、危険だと感じた点をご記入ください。","무슨 일이 있었고 무엇이 위험했는지 작성해주세요.","جزئیات مفید درباره اتفاق یا خطر را بنویسید.","Compartilhe detalhes úteis sobre o que aconteceu.","Сообщите полезные детали о случившемся.","Comparte detalles útiles sobre lo ocurrido.","Chia sẻ chi tiết hữu ích về sự việc."],
  privacyHint: ["Please avoid including private information about other people.","يرجى تجنب إدراج معلومات خاصة عن أشخاص آخرين.","请勿包含他人的隐私信息。","請勿包含他人的私人資訊。","Iwasang maglagay ng pribadong impormasyon ng ibang tao.","दूसरों की निजी जानकारी शामिल न करें।","他の方の個人情報は記載しないでください。","다른 사람의 개인정보는 포함하지 마세요.","اطلاعات خصوصی دیگران را وارد نکنید.","Evite incluir informações privadas de outras pessoas.","Не указывайте личные данные других людей.","Evita incluir información privada de otras personas.","Không đưa thông tin riêng tư của người khác."],
  frequencyLabel: ["How often does this happen?","كم مرة تحدث هذه المشكلة؟","这种情况多久发生一次？","這種情況多久發生一次？","Gaano kadalas ito nangyayari?","यह कितनी बार होता है?","どのくらいの頻度ですか？","얼마나 자주 발생하나요?","چند وقت یک‌بار رخ می‌دهد؟","Com que frequência isso acontece?","Как часто это происходит?","¿Con qué frecuencia ocurre?","Việc này xảy ra bao lâu một lần?"],
  freqOnce: ["One time","مرة واحدة","一次","一次","Isang beses","एक बार","1回","한 번","یک بار","Uma vez","Один раз","Una vez","Một lần"],
  freqFew: ["A few times","بضع مرات","几次","幾次","Ilang beses","कुछ बार","数回","몇 번","چند بار","Algumas vezes","Несколько раз","Algunas veces","Vài lần"],
  freqOften: ["Happens often","تحدث كثيرًا","经常发生","經常發生","Madalas mangyari","अक्सर होता है","よく起きる","자주 발생","اغلب رخ می‌دهد","Acontece com frequência","Происходит часто","Ocurre con frecuencia","Xảy ra thường xuyên"],
  freqDaily: ["Happens every day","تحدث يوميًا","每天发生","每天發生","Araw-araw","हर दिन होता है","毎日起きる","매일 발생","هر روز رخ می‌دهد","Acontece todos os dias","Происходит каждый день","Ocurre todos los días","Xảy ra mỗi ngày"],
  step3Title: ["One last thing","شيء أخير","最后一步","最後一步","Huling bagay","एक आखिरी बात","最後に","마지막 단계","یک مورد دیگر","Só mais uma coisa","И последнее","Una última cosa","Một điều cuối"],
  step3Desc: ["Add a photo or contact details if helpful. Both are optional.","أضف صورة أو معلومات اتصال إذا كانت مفيدة. كلاهما اختياري.","可选择添加照片或联系信息。","可選擇新增照片或聯絡資訊。","Magdagdag ng larawan o contact kung makakatulong. Parehong opsyonal.","ज़रूरत हो तो फ़ोटो या संपर्क विवरण जोड़ें। दोनों वैकल्पिक हैं।","必要に応じて写真や連絡先を追加できます。どちらも任意です。","필요하면 사진이나 연락처를 추가하세요. 둘 다 선택 사항입니다.","در صورت نیاز عکس یا اطلاعات تماس اضافه کنید. هر دو اختیاری هستند.","Adicione uma foto ou contato se ajudar. Ambos são opcionais.","При желании добавьте фото или контакты. Это необязательно.","Agrega una foto o datos de contacto si ayudan. Ambos son opcionales.","Thêm ảnh hoặc thông tin liên hệ nếu hữu ích. Cả hai đều không bắt buộc."],
  photoLabel: ["Photo evidence","صورة دليل","照片证据","照片證據","Larawang ebidensya","फ़ोटो साक्ष्य","写真資料","사진 증거","مدرک تصویری","Foto como evidência","Фотография","Evidencia fotográfica","Ảnh minh chứng"],
  photoHint: ["JPG, PNG, WebP, or GIF up to 3 MB.","JPG أو PNG أو WebP أو GIF حتى 3 ميغابايت.","JPG、PNG、WebP 或 GIF，最大 3 MB。","JPG、PNG、WebP 或 GIF，最大 3 MB。","JPG, PNG, WebP, o GIF hanggang 3 MB.","JPG, PNG, WebP या GIF, अधिकतम 3 MB।","JPG、PNG、WebP、GIF（3MBまで）。","JPG, PNG, WebP 또는 GIF, 최대 3MB.","JPG، PNG، WebP یا GIF تا ۳ مگابایت.","JPG, PNG, WebP ou GIF de até 3 MB.","JPG, PNG, WebP или GIF до 3 МБ.","JPG, PNG, WebP o GIF de hasta 3 MB.","JPG, PNG, WebP hoặc GIF tối đa 3 MB."],
  choosePhoto: ["Choose a photo","اختر صورة","选择照片","選擇照片","Pumili ng larawan","फ़ोटो चुनें","写真を選ぶ","사진 선택","انتخاب عکس","Escolher foto","Выбрать фото","Elegir foto","Chọn ảnh"],
  replacePhoto: ["Replace photo","استبدل الصورة","更换照片","更換照片","Palitan ang larawan","फ़ोटो बदलें","写真を変更","사진 교체","جایگزینی عکس","Substituir foto","Заменить фото","Reemplazar foto","Thay ảnh"],
  uploadingPhoto: ["Uploading photo…","جارٍ رفع الصورة…","正在上传照片…","正在上傳照片…","Ina-upload ang larawan…","फ़ोटो अपलोड हो रही है…","写真をアップロード中…","사진 업로드 중…","در حال بارگذاری عکس…","Enviando foto…","Загрузка фото…","Subiendo foto…","Đang tải ảnh lên…"],
  selectedPhoto: ["Selected photo","الصورة المختارة","已选照片","已選照片","Napiling larawan","चुनी गई फ़ोटो","選択した写真","선택한 사진","عکس انتخاب‌شده","Foto selecionada","Выбранное фото","Foto seleccionada","Ảnh đã chọn"],
  uploadingSecurely: ["Uploading securely…","جارٍ الرفع بأمان…","正在安全上传…","正在安全上傳…","Ligtas na ina-upload…","सुरक्षित रूप से अपलोड हो रहा है…","安全にアップロード中…","안전하게 업로드 중…","بارگذاری امن…","Enviando com segurança…","Безопасная загрузка…","Subiendo de forma segura…","Đang tải lên an toàn…"],
  attached: ["Attached to this report","مرفقة بهذا البلاغ","已附加到此报告","已附加到此回報","Nakalakip sa ulat","इस रिपोर्ट से जुड़ा है","この報告に添付済み","이 신고에 첨부됨","به این گزارش پیوست شد","Anexada a este relato","Прикреплено к обращению","Adjunta a este reporte","Đã đính kèm vào báo cáo"],
  nameLabel: ["Your name","اسمك","您的姓名","您的姓名","Iyong pangalan","आपका नाम","お名前","이름","نام شما","Seu nome","Ваше имя","Tu nombre","Tên của bạn"],
  namePlaceholder: ["How should we address you?","كيف نُخاطبك؟","我们该如何称呼您？","我們該如何稱呼您？","Ano ang itatawag namin sa iyo?","हम आपको किस नाम से बुलाएं?","お呼びするお名前","어떻게 불러드릴까요?","چگونه شما را خطاب کنیم؟","Como devemos chamar você?","Как к вам обращаться?","¿Cómo debemos llamarte?","Chúng tôi nên gọi bạn thế nào?"],
  emailLabel: ["Email address","البريد الإلكتروني","电子邮箱","電子郵件","Email address","ईमेल पता","メールアドレス","이메일 주소","نشانی ایمیل","E-mail","Электронная почта","Correo electrónico","Địa chỉ email"],
  phoneLabel: ["Phone number","رقم الهاتف","电话号码","電話號碼","Numero ng telepono","फ़ोन नंबर","電話番号","전화번호","شماره تلفن","Telefone","Номер телефона","Número de teléfono","Số điện thoại"],
  phoneHint: ["We will only use contact information for this report.","سنستخدم معلومات الاتصال لهذا البلاغ فقط.","联系信息仅用于此报告。","聯絡資訊僅用於此回報。","Gagamitin lamang ang contact para sa ulat na ito.","संपर्क जानकारी केवल इस रिपोर्ट के लिए उपयोग होगी।","連絡先はこの報告のみに使用します。","연락처는 이 신고에만 사용됩니다.","اطلاعات تماس فقط برای این گزارش استفاده می‌شود.","Usaremos seus dados apenas para este relato.","Контакты будут использованы только для этого обращения.","Usaremos tus datos solo para este reporte.","Thông tin liên hệ chỉ dùng cho báo cáo này."],
  reviewIssue: ["Issue","المشكلة","问题","問題","Isyu","समस्या","問題","문제","مشکل","Problema","Проблема","Problema","Vấn đề"],
  reviewLocation: ["Location","الموقع","地点","地點","Lokasyon","स्थान","場所","위치","مکان","Local","Место","Ubicación","Địa điểm"],
  reviewWhen: ["When","الوقت","时间","時間","Kailan","कब","日時","시점","زمان","Quando","Когда","Cuándo","Thời gian"],
  reviewDetails: ["Details","التفاصيل","详情","詳情","Detalye","विवरण","詳細","세부정보","جزئیات","Detalhes","Подробности","Detalles","Chi tiết"],
  reviewPhoto: ["Photo","الصورة","照片","照片","Larawan","फ़ोटो","写真","사진","عکس","Foto","Фото","Foto","Ảnh"],
  edit: ["Edit","تعديل","编辑","編輯","I-edit","संपादित करें","編集","수정","ویرایش","Editar","Изменить","Editar","Chỉnh sửa"],
  optional: ["optional","اختياري","选填","選填","opsyonal","वैकल्पिक","任意","선택","اختیاری","opcional","необязательно","opcional","không bắt buộc"],
  savedDevice: ["Your progress is saved on this device.","يتم حفظ تقدمك على هذا الجهاز.","您的进度已保存在此设备。","您的進度已儲存在此裝置。","Naka-save ang progreso sa device na ito.","आपकी प्रगति इस डिवाइस पर सहेजी गई है।","入力内容はこの端末に保存されます。","진행 상황이 이 기기에 저장됩니다.","پیشرفت شما در این دستگاه ذخیره می‌شود.","Seu progresso está salvo neste dispositivo.","Данные сохранены на этом устройстве.","Tu progreso está guardado en este dispositivo.","Tiến trình được lưu trên thiết bị này."],
  savedNow: ["Saved on this device.","تم الحفظ على هذا الجهاز.","已保存在此设备。","已儲存在此裝置。","Naka-save sa device na ito.","इस डिवाइस पर सहेजा गया।","この端末に保存しました。","이 기기에 저장됨.","در این دستگاه ذخیره شد.","Salvo neste dispositivo.","Сохранено на устройстве.","Guardado en este dispositivo.","Đã lưu trên thiết bị này."],
  startOver: ["Start over","ابدأ من جديد","重新开始","重新開始","Magsimula muli","फिर से शुरू करें","最初から","다시 시작","شروع دوباره","Recomeçar","Начать заново","Empezar de nuevo","Bắt đầu lại"],
  back: ["Back","رجوع","返回","返回","Bumalik","वापस","戻る","뒤로","بازگشت","Voltar","Назад","Atrás","Quay lại"],
  continue: ["Continue","متابعة","继续","繼續","Magpatuloy","जारी रखें","次へ","계속","ادامه","Continuar","Продолжить","Continuar","Tiếp tục"],
  saveLater: ["Save for later","احفظ لوقت لاحق","稍后继续","稍後繼續","I-save para mamaya","बाद के लिए सहेजें","後で続ける","나중에 계속","ذخیره برای بعد","Salvar para depois","Сохранить на потом","Guardar para después","Lưu để làm sau"],
  submitReport: ["Submit Report","إرسال البلاغ","提交报告","送出回報","Isumite ang Ulat","रिपोर्ट जमा करें","報告を送信","신고 제출","ارسال گزارش","Enviar Relato","Отправить обращение","Enviar Reporte","Gửi Báo cáo"],
  translating: ["Preparing English translation…","جارٍ إعداد الترجمة الإنجليزية…","正在准备英文翻译…","正在準備英文翻譯…","Inihahanda ang salin sa Ingles…","अंग्रेज़ी अनुवाद तैयार हो रहा है…","英訳を作成中…","영어 번역 준비 중…","در حال آماده‌سازی ترجمه انگلیسی…","Preparando tradução em inglês…","Подготовка английского перевода…","Preparando traducción al inglés…","Đang chuẩn bị bản dịch tiếng Anh…"],
  errorRequired: ["This field is required.","هذا الحقل مطلوب.","此项为必填项。","此欄為必填。","Kailangang sagutan ito.","यह फ़ील्ड आवश्यक है।","必須項目です。","필수 항목입니다.","این فیلد ضروری است.","Este campo é obrigatório.","Это обязательное поле.","Este campo es obligatorio.","Trường này là bắt buộc."],
  errorIssue: ["Choose the issue that best fits.","اختر نوع المشكلة الأنسب.","请选择最符合的问题类型。","請選擇最符合的問題類型。","Piliin ang pinakaangkop na isyu.","सबसे उपयुक्त समस्या चुनें।","最も近い問題を選んでください。","가장 알맞은 문제를 선택하세요.","مناسب‌ترین نوع مشکل را انتخاب کنید.","Escolha o tipo de problema mais adequado.","Выберите подходящий тип проблемы.","Elige el tipo de problema más adecuado.","Chọn loại vấn đề phù hợp nhất."],
  errorDescriptionShort: ["Please add a little more detail (15 characters minimum).","يرجى إضافة مزيد من التفاصيل (15 حرفًا على الأقل).","请再多提供一些细节（至少 15 个字符）。","請再多提供一些細節（至少 15 個字元）。","Magdagdag pa ng detalye (hindi bababa sa 15 character).","कुछ और विवरण दें (कम से कम 15 अक्षर)।","もう少し詳しく入力してください（15文字以上）。","조금 더 자세히 작성해주세요(15자 이상).","جزئیات بیشتری بنویسید (حداقل ۱۵ نویسه).","Adicione mais detalhes (mínimo de 15 caracteres).","Добавьте подробности (не менее 15 символов).","Agrega más detalles (mínimo 15 caracteres).","Vui lòng thêm chi tiết (ít nhất 15 ký tự)."],
  errorUploadWait: ["Wait for the photo to finish uploading.","انتظر حتى يكتمل رفع الصورة.","请等待照片上传完成。","請等待照片上傳完成。","Hintaying matapos ang pag-upload.","फ़ोटो अपलोड होने तक प्रतीक्षा करें।","写真のアップロード完了をお待ちください。","사진 업로드가 끝날 때까지 기다려주세요.","تا پایان بارگذاری عکس صبر کنید.","Aguarde o envio da foto.","Дождитесь загрузки фото.","Espera a que termine de subir la foto.","Chờ tải ảnh lên hoàn tất."],
  errorImageType: ["Choose a supported JPG, PNG, WebP, or GIF image.","اختر صورة JPG أو PNG أو WebP أو GIF مدعومة.","请选择支持的 JPG、PNG、WebP 或 GIF 图片。","請選擇支援的 JPG、PNG、WebP 或 GIF 圖片。","Pumili ng JPG, PNG, WebP, o GIF.","JPG, PNG, WebP या GIF चुनें।","JPG、PNG、WebP、GIFを選択してください。","JPG, PNG, WebP 또는 GIF를 선택하세요.","یک تصویر JPG، PNG، WebP یا GIF انتخاب کنید.","Escolha JPG, PNG, WebP ou GIF.","Выберите JPG, PNG, WebP или GIF.","Elige una imagen JPG, PNG, WebP o GIF.","Chọn ảnh JPG, PNG, WebP hoặc GIF."],
  errorImageSize: ["Choose an image smaller than 3 MB.","اختر صورة أصغر من 3 ميغابايت.","请选择小于 3 MB 的图片。","請選擇小於 3 MB 的圖片。","Pumili ng larawang mas maliit sa 3 MB.","3 MB से छोटी छवि चुनें।","3MB未満の画像を選択してください。","3MB보다 작은 이미지를 선택하세요.","عکسی کوچک‌تر از ۳ مگابایت انتخاب کنید.","Escolha uma imagem menor que 3 MB.","Выберите изображение меньше 3 МБ.","Elige una imagen de menos de 3 MB.","Chọn ảnh nhỏ hơn 3 MB."],
  errorUpload: ["This image could not be uploaded. Try another file.","تعذر رفع الصورة. جرّب ملفًا آخر.","无法上传此图片，请尝试其他文件。","無法上傳此圖片，請嘗試其他檔案。","Hindi ma-upload ang larawan. Subukan ang iba.","छवि अपलोड नहीं हुई। दूसरी फ़ाइल आज़माएं।","画像をアップロードできませんでした。別のファイルをお試しください。","이미지를 업로드할 수 없습니다. 다른 파일을 시도하세요.","بارگذاری عکس ممکن نشد. فایل دیگری امتحان کنید.","Não foi possível enviar a imagem. Tente outro arquivo.","Не удалось загрузить фото. Попробуйте другой файл.","No se pudo subir la imagen. Prueba otro archivo.","Không thể tải ảnh lên. Hãy thử tệp khác."],
  clearConfirm: ["Clear this report and start over?","هل تريد مسح هذا البلاغ والبدء من جديد؟","清除此报告并重新开始？","清除此回報並重新開始？","Burahin ang ulat at magsimula muli?","रिपोर्ट साफ़ करके फिर से शुरू करें?","この報告を消して最初からやり直しますか？","신고 내용을 지우고 다시 시작할까요?","این گزارش پاک و دوباره شروع شود؟","Limpar este relato e recomeçar?","Очистить обращение и начать заново?","¿Borrar este reporte y empezar de nuevo?","Xóa báo cáo và bắt đầu lại?"],
  nothingTitle: ["Nothing submitted yet.","لم يتم إرسال أي بلاغ بعد.","尚未提交报告。","尚未送出回報。","Wala pang naisumiteng ulat.","अभी कोई रिपोर्ट जमा नहीं हुई।","まだ報告は送信されていません。","아직 제출된 신고가 없습니다.","هنوز گزارشی ارسال نشده است.","Nenhum relato enviado ainda.","Обращение еще не отправлено.","Aún no se ha enviado ningún reporte.","Chưa có báo cáo nào được gửi."],
  nothingText: ["Start a report and your confirmation will appear here.","ابدأ بلاغًا وستظهر صفحة التأكيد هنا.","开始填写报告，确认信息将显示在这里。","開始填寫回報，確認資訊將顯示在這裡。","Magsimula ng ulat at lalabas dito ang kumpirmasyon.","रिपोर्ट शुरू करें; पुष्टि यहाँ दिखाई देगी।","報告を開始すると確認がここに表示されます。","신고를 시작하면 확인 내용이 여기에 표시됩니다.","گزارش را شروع کنید تا تأییدیه اینجا نمایش داده شود.","Inicie um relato e a confirmação aparecerá aqui.","Начните обращение, и подтверждение появится здесь.","Inicia un reporte y la confirmación aparecerá aquí.","Bắt đầu báo cáo và xác nhận sẽ hiện ở đây."],
  startReport: ["Start a report","ابدأ بلاغًا","开始报告","開始回報","Magsimula ng ulat","रिपोर्ट शुरू करें","報告を開始","신고 시작","شروع گزارش","Iniciar relato","Начать обращение","Iniciar reporte","Bắt đầu báo cáo"],
  successTitle: ["We received your report.","استلمنا بلاغك.","我们已收到您的报告。","我們已收到您的回報。","Natanggap namin ang iyong ulat.","हमें आपकी रिपोर्ट मिल गई है।","報告を受け付けました。","신고가 접수되었습니다.","گزارش شما دریافت شد.","Recebemos seu relato.","Мы получили ваше обращение.","Recibimos tu reporte.","Chúng tôi đã nhận báo cáo."],
  successText: ["Thank you. Your report is recorded and ready for review.","شكرًا لك. تم تسجيل بلاغك وهو جاهز للمراجعة.","谢谢。您的报告已记录并等待审核。","謝謝。您的回報已記錄並等待審查。","Salamat. Naitala na ang ulat at handa nang suriin.","धन्यवाद। आपकी रिपोर्ट दर्ज हो गई है और समीक्षा के लिए तैयार है।","ありがとうございます。報告は記録され、確認の準備ができました。","감사합니다. 신고가 기록되어 검토 준비가 되었습니다.","سپاسگزاریم. گزارش ثبت و آماده بررسی است.","Obrigado. Seu relato foi registrado e está pronto para análise.","Спасибо. Обращение зарегистрировано и готово к рассмотрению.","Gracias. Tu reporte fue registrado y está listo para revisión.","Cảm ơn. Báo cáo đã được ghi nhận và sẵn sàng xem xét."],
  copied: ["Copied to your clipboard.","تم النسخ إلى الحافظة.","已复制到剪贴板。","已複製到剪貼簿。","Nakopya sa clipboard.","क्लिपबोर्ड पर कॉपी किया गया।","クリップボードにコピーしました。","클립보드에 복사됨.","در کلیپ‌بورد کپی شد.","Copiado para a área de transferência.","Скопировано в буфер обмена.","Copiado al portapapeles.","Đã sao chép vào bộ nhớ tạm."],
  saveNumber: ["Save this number if you want to check back later.","احتفظ بهذا الرقم للمتابعة لاحقًا.","请保存此编号，以便稍后查询。","請保存此編號，以便稍後查詢。","Itago ang numerong ito para makapag-follow up.","बाद में जानकारी के लिए यह नंबर सहेजें।","後で確認できるよう番号を保存してください。","나중에 확인할 수 있도록 번호를 저장하세요.","برای پیگیری بعدی این شماره را نگه دارید.","Guarde este número para consultar depois.","Сохраните номер для дальнейшей проверки.","Guarda este número para consultar después.","Lưu mã này để kiểm tra sau."],
  summaryTitle: ["Your report summary","ملخص بلاغك","您的报告摘要","您的回報摘要","Buod ng ulat","आपकी रिपोर्ट का सारांश","報告内容","신고 요약","خلاصه گزارش شما","Resumo do relato","Сводка обращения","Resumen de tu reporte","Tóm tắt báo cáo"],
  dateNoticed: ["Date noticed","تاريخ الملاحظة","发现日期","發現日期","Petsa ng pagkakita","देखने की तारीख","気づいた日","발견 날짜","تاریخ مشاهده","Data percebida","Дата обнаружения","Fecha observada","Ngày phát hiện"],
  howOften: ["How often","معدل التكرار","发生频率","發生頻率","Dalas","कितनी बार","頻度","발생 빈도","دفعات وقوع","Frequência","Частота","Frecuencia","Tần suất"],
  whatYouSaid: ["What you told us","ما أخبرتنا به","您告诉我们的内容","您告訴我們的內容","Ang sinabi mo","आपने हमें क्या बताया","お知らせいただいた内容","알려주신 내용","آنچه به ما گفتید","O que você informou","Что вы сообщили","Lo que nos contaste","Nội dung bạn cung cấp"],
  contactDetails: ["Contact details","معلومات الاتصال","联系信息","聯絡資訊","Contact details","संपर्क विवरण","連絡先","연락처","اطلاعات تماس","Dados de contato","Контактные данные","Datos de contacto","Thông tin liên hệ"],
  imageEvidence: ["Image evidence","الصورة المرفقة","照片证据","照片證據","Larawang ebidensya","फ़ोटो साक्ष्य","写真資料","사진 증거","مدرک تصویری","Evidência fotográfica","Фотография","Evidencia fotográfica","Ảnh minh chứng"],
  nextHeading: ["What happens next","ماذا سيحدث بعد ذلك","接下来会发生什么","接下來會發生什麼","Ano ang susunod","आगे क्या होगा","今後の流れ","다음 단계","بعد چه می‌شود","O que acontece depois","Что будет дальше","Qué sucede después","Điều gì xảy ra tiếp theo"],
  nextReviewTitle: ["Review","المراجعة","审核","審查","Pagsusuri","समीक्षा","確認","검토","بررسی","Análise","Проверка","Revisión","Xem xét"],
  nextReviewText: ["City staff will review the details.","سيراجع موظفو المدينة التفاصيل.","市政府工作人员将审核详细信息。","市府人員將審查詳細資訊。","Susuriin ng kawani ang mga detalye.","शहर के कर्मचारी विवरण की समीक्षा करेंगे।","市の職員が内容を確認します。","시 담당자가 내용을 검토합니다.","کارکنان شهرداری جزئیات را بررسی می‌کنند.","A equipe da Prefeitura analisará os detalhes.","Сотрудники города проверят данные.","El personal de la Ciudad revisará los detalles.","Nhân viên Thành phố sẽ xem xét chi tiết."],
  nextRouteTitle: ["Route","الإحالة","转交","轉交","Pagpapadala","भेजना","担当部署へ","전달","ارجاع","Encaminhamento","Направление","Canalización","Chuyển bộ phận"],
  nextRouteText: ["It will be sent to the department best equipped to look into it.","سيُرسل إلى الإدارة الأنسب للنظر فيه.","报告将转交给最适合处理的部门。","回報將轉交給最適合處理的單位。","Ipapadala ito sa tamang tanggapan.","इसे उपयुक्त विभाग को भेजा जाएगा।","最も適切な部署に送られます。","적합한 담당 부서로 전달됩니다.","به مناسب‌ترین بخش فرستاده می‌شود.","Será enviado ao setor mais adequado.","Его направят в подходящий отдел.","Se enviará al departamento adecuado.","Báo cáo sẽ được chuyển đến bộ phận phù hợp."],
  nextKeepTitle: ["Keep your number","احتفظ برقمك","保存编号","保存編號","Itago ang numero","अपना नंबर रखें","番号を保管","번호 보관","شماره را نگه دارید","Guarde seu número","Сохраните номер","Guarda tu número","Lưu mã báo cáo"],
  nextKeepText: ["Use {number} if you need to ask about this report later.","استخدم {number} للاستفسار عن البلاغ لاحقًا.","稍后查询时请使用 {number}。","稍後查詢時請使用 {number}。","Gamitin ang {number} kung magtatanong ka tungkol sa ulat.","बाद में जानकारी के लिए {number} का उपयोग करें।","お問い合わせの際は {number} をお使いください。","나중에 문의할 때 {number}를 사용하세요.","برای پیگیری از {number} استفاده کنید.","Use {number} para consultar depois.","Для справки используйте {number}.","Usa {number} para consultar después.","Dùng {number} khi cần hỏi về báo cáo."],
  submitAnother: ["Submit another report","إرسال بلاغ آخر","提交另一份报告","送出另一份回報","Magsumite ng isa pang ulat","एक और रिपोर्ट जमा करें","別の報告を送る","다른 신고 제출","ارسال گزارش دیگر","Enviar outro relato","Отправить еще одно обращение","Enviar otro reporte","Gửi báo cáo khác"],
  backStart: ["Back to start","العودة للبداية","返回开始","回到開始","Bumalik sa simula","शुरुआत पर वापस","最初に戻る","처음으로","بازگشت به شروع","Voltar ao início","Вернуться в начало","Volver al inicio","Quay lại đầu"],
  staffEnglishTitle: ["English translation for City staff","الترجمة الإنجليزية لموظفي المدينة","供市政府工作人员查看的英文翻译","供市府人員查看的英文翻譯","Salin sa Ingles para sa kawani ng Lungsod","शहर के कर्मचारियों के लिए अंग्रेज़ी अनुवाद","市職員向け英訳","시 담당자를 위한 영어 번역","ترجمه انگلیسی برای کارکنان شهرداری","Tradução em inglês para a equipe","Английский перевод для сотрудников","Traducción al inglés para el personal","Bản dịch tiếng Anh cho nhân viên Thành phố"],
  translationPending: ["English translation is pending; the original text was preserved.","الترجمة الإنجليزية قيد الانتظار، وتم الاحتفاظ بالنص الأصلي.","英文翻译待处理；原文已保留。","英文翻譯待處理；原文已保留。","Nakabinbin ang salin sa Ingles; napanatili ang orihinal.","अंग्रेज़ी अनुवाद लंबित है; मूल पाठ सुरक्षित है।","英訳は保留中です。原文は保存されています。","영어 번역이 대기 중이며 원문은 보존되었습니다.","ترجمه انگلیسی در انتظار است؛ متن اصلی حفظ شد.","A tradução em inglês está pendente; o texto original foi preservado.","Английский перевод ожидается; оригинал сохранен.","La traducción al inglés está pendiente; se conservó el texto original.","Bản dịch tiếng Anh đang chờ; văn bản gốc đã được giữ lại."],
} as const;

export type TranslationKey = keyof typeof rows;

type LanguageContextValue = {
  language: LanguageCode;
  direction: Direction;
  setLanguage: (language: LanguageCode) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

const languageStorageKey = 'city-issue-reporter-language';
const LanguageContext = createContext<LanguageContextValue | null>(null);

function isLanguageCode(value: string | null): value is LanguageCode {
  return languages.some((language) => language.code === value);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>(() => {
    const saved = window.localStorage.getItem(languageStorageKey);
    return isLanguageCode(saved) ? saved : 'en';
  });

  const languageIndex = languages.findIndex((item) => item.code === language);
  const direction = languages[languageIndex]?.dir ?? 'ltr';

  useEffect(() => {
    window.localStorage.setItem(languageStorageKey, language);
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [direction, language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    direction,
    setLanguage,
    t(key, values) {
      let message: string = rows[key][languageIndex] ?? rows[key][0];
      for (const [name, replacement] of Object.entries(values ?? {})) {
        message = message.replaceAll(`{${name}}`, String(replacement));
      }
      return message;
    },
  }), [direction, language, languageIndex]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
}

export const issueTranslationKeys = {
  'Unsafe driving': 'issueUnsafe',
  Speeding: 'issueSpeeding',
  Potholes: 'issuePotholes',
  'Illegal dumping': 'issueDumping',
  'Streetlight problems': 'issueStreetlight',
  Other: 'issueOther',
} as const satisfies Record<string, TranslationKey>;

export const frequencyTranslationKeys = {
  'One time': 'freqOnce',
  'A few times': 'freqFew',
  'Happens often': 'freqOften',
  'Happens every day': 'freqDaily',
} as const satisfies Record<string, TranslationKey>;