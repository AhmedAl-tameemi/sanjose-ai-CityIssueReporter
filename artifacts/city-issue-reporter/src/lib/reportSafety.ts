export type ReportSafetyConsequence =
  | 'injury'
  | 'accident'
  | 'propertyDamage'
  | 'blockedAccess'
  | 'otherSafetyHazard';

export type ReportSafetyAssessment =
  | { level: 'immediate' }
  | { level: 'serious'; consequence: ReportSafetyConsequence }
  | { level: 'routine' };

function normalizeLatinText(description: string): string {
  return description
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\bthere s\b/gu, 'there is')
    .replace(/\bcan t\b/gu, 'cannot')
    .replace(/\bwon t\b/gu, 'will not')
    .replace(/\bde+a+d\b/gu, 'dead')
    .replace(/\b(?:deaad|ded)\b/gu, 'dead')
    .replace(/\b(?:kiled|killd)\b/gu, 'killed')
    .replace(/\b(?:unconsious|unconcious)\b/gu, 'unconscious')
    .replace(/\b(?:unresposive|unresponcive)\b/gu, 'unresponsive')
    .replace(/\bbleed+ing+\b/gu, 'bleeding')
    .replace(/\b(?:stabb+ed|stabed)\b/gu, 'stabbed')
    .replace(/\b(?:assulted|asaulted)\b/gu, 'assaulted')
    .replace(/\btraped\b/gu, 'trapped')
    .replace(/\brobberry\b/gu, 'robbery')
    .replace(/\bexplotion\b/gu, 'explosion')
    .replace(/\bshott\b/gu, 'shot')
    .replace(/\b(?:gun ?shots?|gun ?fire)\b/gu, 'gunshots')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isImmediateDangerDescription(description: string): boolean {
  const text = normalizeLatinText(description);
  if (!text) return false;

  const person = '(?:someone|somebody|a person|a man|a woman|a child|a kid|a pedestrian|this guy|this man|this woman|the victim|a victim|they|he|she|i|we)';
  const nearPerson = (signal: string, distance = 70) =>
    new RegExp(`\\b${person}\\b.{0,${distance}}\\b${signal}\\b`, 'u').test(text);

  const explicitEmergency = /\b(immediate danger|active emergency|emergency right now|ongoing emergency|in danger right now|currently in danger|life threatening|life threatening emergency|medical emergency|call 911|call an ambulance)\b/u.test(text);
  const deathOrUnresponsive = nearPerson('(?:dead|killed|dying|unconscious|unresponsive|not responding|not breathing|passed away|passed out|will not wake up)') ||
    /\b(?:dead body|body is unresponsive|body not breathing|will not wake up)\b/u.test(text);
  const severeBleeding = nearPerson('(?:bleeding out|bleeding heavily|bleeding (?:really |very )?bad|bleeding profusely|losing (?:a lot of )?blood)') ||
    /\b(?:blood is pouring|blood pouring|blood everywhere|heavy bleeding)\b/u.test(text);
  const shooting = /\b(?:gunshots|gunfire|shots fired|active shooter|shooting in progress|there (?:is|was) a shooting|gunshot wound|i (?:just )?heard (?:gunshots|shots|shooting))\b/u.test(text) ||
    nearPerson('(?:got|was|is|has been|is being) shot', 45);
  const stabbing = /\b(?:there (?:is|was) a stabbing|stabbing in progress|knife attack|someone is being stabbed|someone got stabbed)\b/u.test(text) ||
    nearPerson('(?:got|was|is|has been|is being) stabbed', 45);
  const vehicleImpact = /\b(?:about to (?:get|be) hit|about to hit (?:someone|a person|people|pedestrians|us)|speeding toward (?:someone|a person|people|pedestrians|us)|driving toward (?:someone|a person|people|pedestrians|us)|swerving toward (?:someone|a person|people|pedestrians|us))\b/u.test(text) ||
    nearPerson('(?:got|was|were|is|are|being) (?:run over|hit by (?:a|the) (?:car|vehicle|truck)|struck by (?:a|the) (?:car|vehicle|truck))', 45) ||
    /\b(?:car|vehicle|truck) (?:just )?(?:hit|struck|ran over) (?:someone|somebody|a person|a pedestrian|people)\b/u.test(text);
  const crashMentionsInjury = /\b(?:crash|collision|accident)\b/u.test(text) &&
    /\b(?:hurt|injured|bleeding|unconscious|trapped|victim|badly hurt|seriously injured)\b/u.test(text) &&
    !/\b(?:no one|nobody|none|no person) (?:was |is |got )?(?:hurt|injured|trapped)\b|\bno injuries\b|\bwithout injuries\b/u.test(text);
  const seriousCrash = /\b(?:bad|serious|major|severe|terrible|horrific|fatal) (?:car )?(?:crash|collision|accident)\b/u.test(text) || crashMentionsInjury;
  const violentAttack = nearPerson('(?:attacked|assaulted|beaten|beat up|getting attacked|under attack|getting jumped|got jumped|seriously injured|badly injured|severely injured)') ||
    /\b(?:someone is attacking|someone is being assaulted|someone is being beaten)\b/u.test(text);
  const activeCrime = nearPerson('(?:got|was|is being) (?:robbed|mugged)', 45) ||
    /\b(?:there (?:is|was) (?:an? )?(?:armed )?robbery|armed robbery|carjacking|car jacking|burglary (?:happening|in progress|just happened|right now|now)|break in in progress|home invasion)\b/u.test(text);
  const weaponThreat = nearPerson('(?:(?:has|has got|is holding|is carrying|is pointing|is waving|pulled) (?:a )?(?:gun|weapon|knife))', 45) ||
    /\b(?:person with a gun|man with a gun|woman with a gun|pointing a gun|gun pointed at|waving a gun|pulled a gun|knife to (?:his|her|my|their) throat|threatened with (?:a )?(?:gun|weapon|knife)|weapon threat)\b/u.test(text);
  const fireOrExplosion = /\b(?:there is a fire|fire broke out|(?:house|building|home|apartment|car|vehicle|room|garage) is on fire|on fire|flames|explosion|exploded|blast|gas leak|smell gas|heavy smoke|thick smoke|smoke (?:is )?(?:coming|pouring) (?:from|out of)|smoke everywhere)\b/u.test(text);
  const trapped = nearPerson('(?:trapped|unable to escape|cannot get out|can not get out|cannot leave|stuck inside|locked inside|held hostage)') ||
    /\b(?:someone is trapped|people are trapped|trapped inside|unable to escape|cannot escape|can not escape|held hostage)\b/u.test(text);
  const urgentMedical = /\b(?:not breathing|cannot breathe|can not breathe|cant breathe|having a heart attack|overdose|overdosed|choking|having a seizure|needs an ambulance|send an ambulance|send help now)\b/u.test(text);

  return explicitEmergency ||
    deathOrUnresponsive ||
    severeBleeding ||
    shooting ||
    stabbing ||
    vehicleImpact ||
    seriousCrash ||
    violentAttack ||
    activeCrime ||
    weaponThreat ||
    fireOrExplosion ||
    trapped ||
    urgentMedical;
}

const localizedImmediateSignals = [
  /(?:emergencia|peligro inmediato|no respira|inconsciente|atrapad[oa].{0,20}(?:ahora|dentro)|peligro ahora)/u,
  /(?:emergência|perigo imediato|não respira|inconsciente|pres[oa].{0,20}(?:agora|dentro))/u,
  /(?:紧急情况|立即危险|无法呼吸|昏迷|被困|正在燃烧|緊急情況|立即危險|無法呼吸|受困|火災)/u,
  /(?:緊急事態|今すぐ危険|呼吸できない|意識がない|閉じ込め|火事)/u,
  /(?:응급상황|즉시 위험|숨을 못 쉬|의식이 없|갇혀|화재 발생)/u,
  /(?:حالة طوارئ|خطر فوري|لا يتنفس|فاقد الوعي|محاصر|حريق الآن)/u,
  /(?:وضعیت اضطراری|خطر فوری|نفس نمی کشد|بیهوش|محبوس|آتش سوزی)/u,
  /(?:आपातस्थिति|तत्काल खतरा|सांस नहीं ले|बेहोश|फंसा हुआ|आग लगी है)/u,
  /(?:чрезвычайная ситуация|непосредственная опасность|не дышит|без сознания|заперт|горит сейчас)/u,
  /(?:tình huống khẩn cấp|nguy hiểm ngay|không thở|bất tỉnh|mắc kẹt|đang cháy)/u,
  /(?:agarang emerhensiya|agarang panganib|hindi makahinga|walang malay|nakulong|may sunog ngayon)/u,
];

const consequencePatterns: Record<ReportSafetyConsequence, RegExp[]> = {
  injury: [
    /\b(?:risk of injury|injury risk|could|may|might|can)\s+(?:cause\s+)?(?:an?\s+)?(?:injur(?:y|ies)|harm|hurt|injure)|\b(?:injur(?:y|ies|ed)|hurt|fall hazard|trip hazard)\b/u,
    /(?:受伤|受傷|傷害|跌倒.{0,8}(?:受伤|受傷|危險)|けが|怪我|負傷|부상|다쳤|चोट|घायल|फिसल.{0,8}(?:चोट|गिर)|إصابة|مصاب|جرح|مجروح|آسیب|lesion|herid|ferid|nasaktan|sugat|bị thương|chấn thương|травм|ранен|пострадал)/u,
  ],
  accident: [
    /\b(?:risk of (?:an? )?(?:accident|crash|collision)|accident|collision|crash|near miss|close call|cars? swerv(?:e|ing) into traffic)\b/u,
    /(?:事故|車禍|交通事故|事故が起き|衝突|사고|충돌|दुर्घटना|हादसा|حادث|تصادف|acidente|accidente|aksidente|tai nạn|авари|дтп)/u,
  ],
  propertyDamage: [
    /\b(?:property damage|damage to\b.{0,40}\b(?:properties|property|homes?|houses?|buildings?|cars?|vehicles?)|(?:could|may|might) damage\b.{0,40}\b(?:properties|property|homes?|houses?|buildings?|cars?|vehicles?)|(?:properties|property|homes?|houses?|buildings?|cars?|vehicles?)\b.{0,25}\b(?:damaged|damage)\b)\b/u,
    /(?:财产损坏|財產損壞|房屋受损|房屋受損|建物損傷|物件損壊|재산 피해|재산 손상|संपत्ति.{0,6}(?:नुकसान|क्षति)|ضرر بالممتلكات|خسارت مالی|danos? materiales|daño a la propiedad|dano à propriedade|dano material|pinsala sa ari-arian|thiệt hại tài sản|поврежден.{0,12}(?:дом|здан)|ущерб имуществу)/u,
  ],
  blockedAccess: [
    /\b(?:blocked|blocking|obstructed|obstructing|impassable|closed off)\b.{0,50}\b(?:access|entrance|exit|sidewalk|walkway|driveway|crosswalk|lane|road|street|door|ramp|route)\b|\b(?:access|entrance|exit|sidewalk|walkway|driveway|crosswalk|lane|road|street|door|ramp|route)\b.{0,50}\b(?:blocked|obstructed|impassable|unusable)\b|\b(?:wheelchair|ambulance|pedestrians?)\b.{0,35}\b(?:cannot|can't|unable to|no way to)\b.{0,30}\b(?:pass|get through|access|enter|leave)\b/u,
    /(?:无法通行|無法通行|无法通过|無法通過|道路封闭|道路封閉|通行止め|通れない|通行できない|막혀|통행 불가|출입 불가|अवरुद्ध|रास्ता बंद|गुजर नहीं|مسدود|بسته است|bloquead|obstruid|no se puede pasar|não pode passar|bloqueado|nakaharang|hindi makadaan|chặn lối|không thể đi qua|заблокир|перекрыт|не пройти)/u,
  ],
  otherSafetyHazard: [
    /\b(?:serious (?:safety )?hazard|major safety risk|poses? (?:a )?(?:serious )?safety risk|creates? (?:a )?(?:serious )?hazard|dangerous condition|unsafe condition|exposed wires?|live electrical wire|downed power lines?|open manhole|sinkhole|gas leak|sewage leak|falling tree|(?:could|may|might) cause (?:a )?(?:fire|electrocution|electric shock))\b/u,
    /(?:安全隐患|安全風險|危険な状態|危険性|안전 위험|위험한 상태|गंभीर खतरा|सुरक्षा जोखिम|خطر على السلامة|خطر ایمنی|riesgo de seguridad|peligro grave|risco à segurança|perigo grave|malubhang panganib|hazard sa kaligtasan|nguy cơ an toàn|mối nguy nghiêm trọng|опасность для безопасности|серьезная опасность)/u,
  ],
};

export function assessReportSafety(
  description: string,
  englishTranslation?: string,
): ReportSafetyAssessment {
  const descriptions = [description, englishTranslation].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  if (!descriptions.length) return { level: 'routine' };

  if (descriptions.some(isImmediateDangerDescription)) {
    return { level: 'immediate' };
  }

  const originalLanguageDescriptions = descriptions.map((value) =>
    value.normalize('NFKC').toLocaleLowerCase(),
  );
  if (originalLanguageDescriptions.some((text) =>
    localizedImmediateSignals.some((pattern) => pattern.test(text)),
  )) {
    return { level: 'immediate' };
  }

  const normalizedDescriptions = descriptions.map(normalizeLatinText);
  const consequenceOrder: ReportSafetyConsequence[] = [
    'injury',
    'accident',
    'propertyDamage',
    'blockedAccess',
    'otherSafetyHazard',
  ];
  const consequence = consequenceOrder.find((key) =>
    descriptions.some((raw, index) =>
      consequencePatterns[key].some((pattern) => {
        const normalized = normalizedDescriptions[index];
        const original = raw.normalize('NFKC').toLocaleLowerCase();
        return [normalized, original].some((text) => {
          const match = text.match(pattern);
          if (!match || match.index === undefined) return false;

          const prefix = text.slice(Math.max(0, match.index - 45), match.index);
          const surrounding = text.slice(
            Math.max(0, match.index - 45),
            Math.min(text.length, match.index + match[0].length + 20),
          );
          if (/\b(?:no|not|without|never)\s+(?:any\s+)?(?:risk|danger|threat|chance|possibility)\s+of\b/u.test(surrounding)) {
            return false;
          }
          if (
            key === 'injury' &&
            /\b(?:no one|nobody|no person|none|no)\s+(?:was\s+|were\s+|is\s+|are\s+|got\s+|any\s+)?$/u.test(prefix)
          ) {
            return false;
          }
          return true;
        });
      }),
    ),
  );

  return consequence ? { level: 'serious', consequence } : { level: 'routine' };
}