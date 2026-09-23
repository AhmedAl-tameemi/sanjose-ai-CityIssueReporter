import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CarFront,
  Check,
  ChevronDown,
  CircleHelp,
  Globe,
  ImagePlus,
  KeyRound,
  Lightbulb,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { translateReport } from '@workspace/api-client-react';
import AddressMap from '../components/AddressMap';
import {
  blankDraft,
  frequencies,
  isEvidenceObjectPath,
  issueTypes,
  type IssueType,
  type Report,
  type ReportDraft,
} from '../types/report';
import {
  frequencyTranslationKeys,
  issueTranslationKeys,
  languages,
  useLanguage,
  type LanguageCode,
} from '../i18n';

type FieldErrors = Partial<Record<keyof ReportDraft, string>>;

const draftStorageKey = 'city-issue-reporter-draft-v2';
const reportStorageKey = 'city-issue-reporter-last-report';
const maxEvidenceSize = 3 * 1024 * 1024;

const issueIcons: Record<IssueType, typeof CarFront> = {
  'Unsafe driving': CarFront,
  Speeding: CarFront,
  Potholes: MapPin,
  'Illegal dumping': Trash2,
  'Streetlight problems': Lightbulb,
  Other: CircleHelp,
};

function readDraft(): ReportDraft {
  try {
    const saved = window.localStorage.getItem(draftStorageKey);
    if (!saved) return blankDraft;
    const parsed = JSON.parse(saved) as Partial<ReportDraft> & {
      evidence?: { name?: unknown; type?: unknown; size?: unknown; objectPath?: unknown };
    };
    const storedEvidence = parsed.evidence;
    const evidence =
      storedEvidence &&
      typeof storedEvidence.name === 'string' &&
      typeof storedEvidence.type === 'string' &&
      typeof storedEvidence.size === 'number' &&
      isEvidenceObjectPath(storedEvidence.objectPath)
        ? {
            name: storedEvidence.name,
            type: storedEvidence.type,
            size: storedEvidence.size,
            objectPath: storedEvidence.objectPath,
          }
        : undefined;
    const hasCoordinates =
      typeof parsed.pinLatitude === 'number' &&
      Number.isFinite(parsed.pinLatitude) &&
      Math.abs(parsed.pinLatitude) <= 90 &&
      typeof parsed.pinLongitude === 'number' &&
      Number.isFinite(parsed.pinLongitude) &&
      Math.abs(parsed.pinLongitude) <= 180;
    return {
      ...blankDraft,
      ...parsed,
      evidence,
      searchedAddress: hasCoordinates && typeof parsed.searchedAddress === 'string' ? parsed.searchedAddress : '',
      pinLatitude: hasCoordinates ? parsed.pinLatitude : undefined,
      pinLongitude: hasCoordinates ? parsed.pinLongitude : undefined,
    };
  } catch {
    return blankDraft;
  }
}

function FieldLabel({ children, optional }: { children: string; optional?: boolean }) {
  const { t } = useLanguage();
  return (
    <label>
      {children}
      {optional ? <span className="optional">({t('optional')})</span> : <span className="required">*</span>}
    </label>
  );
}

function isImmediateDangerDescription(description: string): boolean {
  const text = description
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (!text) return false;

  const explicitEmergency = /\b(immediate danger|active emergency|emergency right now|ongoing emergency|in danger right now|currently in danger)\b/u;
  const activeThreat = /\b(about to (?:get|be) hit|about to hit (?:someone|a person|people|pedestrians|us)|speeding toward (?:someone|a person|people|pedestrians|us)|driving toward (?:someone|a person|people|pedestrians|us)|swerving toward (?:someone|a person|people|pedestrians|us))\b/u;
  const activeVehicleImpact = /\b(?:i|someone|somebody|a person|a pedestrian|they)\b.{0,25}\b(?:was|were|got|is|are)\b.{0,20}\b(?:run over|hit by (?:a|the) (?:car|vehicle|truck)|struck by (?:a|the) (?:car|vehicle|truck))\b/u;
  const activeCrash = /\b(?:there (?:is|s)|just|currently|right now|happening now|ongoing)\b.{0,70}\b(?:crash|collision|accident)\b.{0,70}\b(?:hurt|injured|bleeding|unconscious|trapped|victim)\b/u;
  const activeCriticalInjury = /\b(?:someone|somebody|a person|people)\b.{0,45}\b(?:is|are)\b.{0,20}\b(?:bleeding|unconscious|trapped)\b/u;
  const injuryRightNow = /\b(?:someone|somebody|a person|people)\b.{0,45}\b(?:is|are)\b.{0,20}\b(?:hurt|injured)\b.{0,35}\b(?:now|currently|right now|immediately)\b/u;

  return explicitEmergency.test(text) ||
    activeThreat.test(text) ||
    activeVehicleImpact.test(text) ||
    activeCrash.test(text) ||
    activeCriticalInjury.test(text) ||
    injuryRightNow.test(text);
}

export default function ReportPage() {
  const { language, direction, setLanguage, t } = useLanguage();
  const [, setLocation] = useLocation();
  const [draft, setDraft] = useState<ReportDraft>(() => readDraft());
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaved, setIsSaved] = useState(false);
  const [isEvidenceUploading, setIsEvidenceUploading] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [locationMapVersion, setLocationMapVersion] = useState(0);
  const [safetyEscalationAcknowledged, setSafetyEscalationAcknowledged] = useState(false);
  const [localEvidencePreviewUrl, setLocalEvidencePreviewUrl] = useState<string>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const evidenceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (localEvidencePreviewUrl) URL.revokeObjectURL(localEvidencePreviewUrl);
    };
  }, [localEvidencePreviewUrl]);

  useEffect(() => {
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const progress = useMemo(() => `${(step / 3) * 100}%`, [step]);

  const update = <K extends keyof ReportDraft>(field: K, value: ReportDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setIsSaved(false);
    if (field === 'description') setSafetyEscalationAcknowledged(false);
  };

  const patchLocation = (patch: Partial<ReportDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors((current) => ({ ...current, location: undefined }));
    setIsSaved(false);
  };

  const validateStep = (currentStep: number) => {
    const nextErrors: FieldErrors = {};
    if (currentStep === 1) {
      if (!draft.issueType) nextErrors.issueType = t('errorIssue');
      if (!draft.location.trim()) nextErrors.location = t('errorRequired');
      else if (
        isSearchingLocation ||
        !draft.searchedAddress ||
        draft.location !== draft.searchedAddress ||
        !Number.isFinite(draft.pinLatitude) ||
        !Number.isFinite(draft.pinLongitude)
      ) nextErrors.location = t('addressSearchRequired');
    }
    if (currentStep === 2) {
      if (!draft.date) nextErrors.date = t('errorRequired');
      if (!draft.approximateTime.trim()) nextErrors.approximateTime = t('errorRequired');
      if (!draft.description.trim()) nextErrors.description = t('errorRequired');
      else if (draft.description.trim().length < 15) nextErrors.description = t('errorDescriptionShort');
      if (!draft.frequency) nextErrors.frequency = t('errorRequired');
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    if (
      step === 2 &&
      isImmediateDangerDescription(draft.description) &&
      !safetyEscalationAcknowledged
    ) return;
    setStep((current) => Math.min(3, current + 1));
  };

  const continueWithReport = () => {
    setSafetyEscalationAcknowledged(true);
  };

  const handleEvidenceChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setErrors((current) => ({ ...current, evidence: t('errorImageType') }));
      event.target.value = '';
      return;
    }

    if (file.size > maxEvidenceSize) {
      setErrors((current) => ({ ...current, evidence: t('errorImageSize') }));
      event.target.value = '';
      return;
    }

    if (localEvidencePreviewUrl) URL.revokeObjectURL(localEvidencePreviewUrl);
    setLocalEvidencePreviewUrl(URL.createObjectURL(file));
    update('evidence', undefined);
    setIsEvidenceUploading(true);
    setErrors((current) => ({ ...current, evidence: undefined }));

    try {
      const response = await fetch('/api/storage/evidence', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const result = (await response.json().catch(() => null)) as
        | { objectPath?: unknown; contentType?: unknown; size?: unknown; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(t('errorUpload'));
      }
      if (
        !result ||
        !isEvidenceObjectPath(result.objectPath) ||
        typeof result.contentType !== 'string' ||
        typeof result.size !== 'number'
      ) {
        throw new Error(t('errorUpload'));
      }

      update('evidence', {
        name: file.name,
        type: result.contentType,
        size: result.size,
        objectPath: result.objectPath,
      });
      setLocalEvidencePreviewUrl(undefined);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        evidence: error instanceof Error ? error.message : t('errorUpload'),
      }));
    } finally {
      setIsEvidenceUploading(false);
      event.target.value = '';
    }
  };

  const removeEvidence = () => {
    update('evidence', undefined);
    if (localEvidencePreviewUrl) {
      URL.revokeObjectURL(localEvidencePreviewUrl);
      setLocalEvidencePreviewUrl(undefined);
    }
    if (evidenceInputRef.current) evidenceInputRef.current.value = '';
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateStep(1)) {
      setStep(1);
      return;
    }
    if (isEvidenceUploading) {
      setErrors((current) => ({ ...current, evidence: t('errorUploadWait') }));
      return;
    }
    if (!validateStep(2)) {
      setStep(2);
      return;
    }
    const uniquePart = crypto.randomUUID().split('-')[0].toUpperCase();
    const reportNumber = `CIR-${new Date().getFullYear()}-${uniquePart}`;
    let englishTranslation: Report['englishTranslation'];
    let translationStatus: Report['translationStatus'] = 'not-needed';

    if (language === 'en') {
      englishTranslation = {
        location: draft.location,
        approximateTime: draft.approximateTime,
        description: draft.description,
      };
    } else {
      setIsTranslating(true);
      try {
        englishTranslation = await translateReport({
          sourceLanguage: language,
          location: draft.location,
          approximateTime: draft.approximateTime,
          description: draft.description,
        });
        translationStatus = 'complete';
      } catch {
        translationStatus = 'pending';
      } finally {
        setIsTranslating(false);
      }
    }

    const report: Report = {
      ...draft,
      reportNumber,
      submittedAt: new Date().toISOString(),
      language,
      englishTranslation,
      translationStatus,
    };
    window.localStorage.setItem(reportStorageKey, JSON.stringify(report));
    window.localStorage.removeItem(draftStorageKey);
    setLocation('/confirmation');
  };

  const startOver = () => {
    if (window.confirm(t('clearConfirm'))) {
      setDraft(blankDraft);
      setErrors({});
      setStep(1);
      setIsSearchingLocation(false);
      setLocationMapVersion((version) => version + 1);
      setSafetyEscalationAcknowledged(false);
      window.localStorage.removeItem(draftStorageKey);
    }
  };

  const saveForLater = () => {
    if (isEvidenceUploading) {
      setErrors((current) => ({ ...current, evidence: t('errorUploadWait') }));
      return;
    }
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    setIsSaved(true);
  };

  const evidencePreviewUrl = localEvidencePreviewUrl
    ?? (draft.evidence ? `/api/storage${draft.evidence.objectPath}` : undefined);

  return (
    <div className="app-shell" dir={direction}>
      <header className="site-header">
        <Link className="brand" href="/" data-testid="link-brand">
          <span className="brand-mark" aria-hidden="true"><MapPin /></span>
          <span className="brand-name">{t('brandName')}</span>
        </Link>
        <div className="header-actions">
          <span className="header-note">{t('headerNote')}</span>
          <label className="language-selector">
            <Globe size={16} aria-hidden="true" />
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as LanguageCode)}
              aria-label={t('languageLabel')}
              data-testid="select-language"
            >
              {languages.map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
        </div>
      </header>

      <main className="page-wrap home-grid">
        <section className="intro" aria-labelledby="intro-heading">
          <span className="eyebrow">{t('eyebrow')}</span>
          <h1 id="intro-heading">{t('heroLead')}<br /><em>{t('heroAction')}</em></h1>
          <p className="intro-copy">
            {t('intro')}
          </p>
          <ul className="trust-list" aria-label={t('trustNextTitle')}>
            <li>
              <ShieldCheck className="trust-icon" size={18} />
              <div><strong>{t('trustBuiltTitle')}</strong><span>{t('trustBuiltText')}</span></div>
            </li>
            <li>
              <MessageSquareText className="trust-icon" size={18} />
              <div><strong>{t('trustTimeTitle')}</strong><span>{t('trustTimeText')}</span></div>
            </li>
            <li>
              <Sparkles className="trust-icon" size={18} />
              <div><strong>{t('trustNextTitle')}</strong><span>{t('trustNextText')}</span></div>
            </li>
          </ul>
        </section>

        <section className="form-panel" aria-labelledby="form-heading">
          <div className="form-header">
            <div className="form-header-row">
              <div>
                <h2 id="form-heading">{t('formTitle')}</h2>
                <p>{t('requiredNote')}</p>
              </div>
              <span className="step-count" aria-label={t('stepOf', { step })}>0{step} / 03</span>
            </div>
            <div className="progress-track" aria-hidden="true"><div className="progress-value" style={{ width: progress }} /></div>
          </div>

          <form onSubmit={submit} noValidate>
            <div className="form-body">
              {step === 1 && (
                <div className="step-content">
                  <h3 className="step-heading" ref={headingRef} tabIndex={-1}>{t('step1Title')}</h3>
                  <p className="step-description">{t('step1Desc')}</p>
                  <div className="field-grid">
                    <div className={`field ${errors.issueType ? 'has-error' : ''}`}>
                      <FieldLabel>{t('issueType')}</FieldLabel>
                      <div className="choice-grid" role="radiogroup" aria-label={t('issueType')}>
                        {issueTypes.map((type) => {
                          const Icon = issueIcons[type];
                          const selected = draft.issueType === type;
                          return (
                            <button
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              className={`choice ${selected ? 'selected' : ''}`}
                              key={type}
                              onClick={() => update('issueType', type)}
                              data-testid={`button-issue-${type.toLowerCase().replaceAll(' ', '-')}`}
                            >
                              <span className="choice-icon"><Icon size={16} /></span>
                              <span className="choice-label">{t(issueTranslationKeys[type])}</span>
                              {selected && <Check className="choice-check" size={15} />}
                            </button>
                          );
                        })}
                      </div>
                      {errors.issueType && <span className="error-text" role="alert">{errors.issueType}</span>}
                    </div>
                    <AddressMap
                      key={locationMapVersion}
                      draft={draft}
                      error={errors.location}
                      onPatch={patchLocation}
                      onError={(message) => setErrors((current) => ({ ...current, location: message }))}
                      onSearching={setIsSearchingLocation}
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="step-content">
                  <h3 className="step-heading" ref={headingRef} tabIndex={-1}>{t('step2Title')}</h3>
                  <p className="step-description">{t('step2Desc')}</p>
                  <div className="field-grid">
                    <div className="field-grid two">
                      <div className={`field ${errors.date ? 'has-error' : ''}`}>
                        <FieldLabel>{t('dateLabel')}</FieldLabel>
                        <input type="date" value={draft.date} onChange={(event) => update('date', event.target.value)} aria-invalid={Boolean(errors.date)} data-testid="input-date" />
                        {errors.date && <span className="error-text" role="alert">{errors.date}</span>}
                      </div>
                      <div className={`field ${errors.approximateTime ? 'has-error' : ''}`}>
                        <FieldLabel>{t('timeLabel')}</FieldLabel>
                        <input type="text" value={draft.approximateTime} onChange={(event) => update('approximateTime', event.target.value)} placeholder={t('timePlaceholder')} dir="auto" aria-invalid={Boolean(errors.approximateTime)} data-testid="input-approximate-time" />
                        {errors.approximateTime && <span className="error-text" role="alert">{errors.approximateTime}</span>}
                      </div>
                    </div>
                    <div className={`field ${errors.description ? 'has-error' : ''}`}>
                      <FieldLabel>{t('descriptionLabel')}</FieldLabel>
                      <textarea value={draft.description} onChange={(event) => update('description', event.target.value)} maxLength={500} placeholder={t('descriptionPlaceholder')} dir="auto" aria-invalid={Boolean(errors.description)} data-testid="input-description" />
                      <div className="char-count">
                        {errors.description ? <span className="error-text" role="alert">{errors.description}</span> : <span className="hint">{t('privacyHint')}</span>}
                        <span className="hint">{draft.description.length}/500</span>
                      </div>
                      {isImmediateDangerDescription(draft.description) && !safetyEscalationAcknowledged && (
                        <div className="safety-escalation" role="alert" aria-live="assertive" data-testid="safety-escalation">
                          <div className="safety-escalation-heading">
                            <AlertTriangle size={20} aria-hidden="true" />
                            <strong>{t('safetyEscalationTitle')}</strong>
                          </div>
                          <p>{t('safetyEscalationText')}</p>
                          <div className="safety-escalation-actions">
                            <a className="button safety-call" href="tel:911" data-testid="link-call-911">{t('call911')}</a>
                            <button type="button" className="button safety-continue" onClick={continueWithReport} data-testid="button-continue-with-report">{t('continueWithReport')}</button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className={`field ${errors.frequency ? 'has-error' : ''}`}>
                      <FieldLabel>{t('frequencyLabel')}</FieldLabel>
                      <select value={draft.frequency} onChange={(event) => update('frequency', event.target.value as ReportDraft['frequency'])} aria-invalid={Boolean(errors.frequency)} data-testid="select-frequency">
                        {frequencies.map((frequency) => <option key={frequency} value={frequency}>{t(frequencyTranslationKeys[frequency])}</option>)}
                      </select>
                      {errors.frequency && <span className="error-text" role="alert">{errors.frequency}</span>}
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="step-content">
                  <h3 className="step-heading" ref={headingRef} tabIndex={-1}>{t('step3Title')}</h3>
                  <p className="step-description">{t('step3Desc')}</p>
                  <div className="field-grid">
                    <div className={`field ${errors.evidence ? 'has-error' : ''}`}>
                      <FieldLabel optional>{t('photoLabel')}</FieldLabel>
                       <span className="hint">{t('photoHint')}</span>
                      <button
                        type="button"
                        className="evidence-picker"
                        onClick={() => evidenceInputRef.current?.click()}
                         disabled={isEvidenceUploading}
                         aria-busy={isEvidenceUploading}
                        data-testid="button-add-evidence"
                      >
                        <ImagePlus size={18} />
                         <span>{isEvidenceUploading ? t('uploadingPhoto') : draft.evidence ? t('replacePhoto') : t('choosePhoto')}</span>
                      </button>
                      <input
                        ref={evidenceInputRef}
                        className="file-input"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleEvidenceChange}
                        aria-label={t('choosePhoto')}
                        data-testid="input-evidence"
                      />
                      {(draft.evidence || localEvidencePreviewUrl) && (
                        <div className="evidence-preview">
                          {evidencePreviewUrl && <img src={evidencePreviewUrl} alt={draft.evidence?.name || t('selectedPhoto')} />}
                          <div className="evidence-preview-copy">
                            <strong>{draft.evidence?.name || t('selectedPhoto')}</strong>
                            <span>{isEvidenceUploading ? t('uploadingSecurely') : t('attached')}</span>
                          </div>
                          <button
                            type="button"
                            className="evidence-remove"
                            onClick={removeEvidence}
                            aria-label={t('reviewPhoto')}
                            title={t('reviewPhoto')}
                            data-testid="button-remove-evidence"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
                      {errors.evidence && <span className="error-text" role="alert">{errors.evidence}</span>}
                    </div>
                    <div className="field-grid two">
                      <div className="field">
                        <FieldLabel optional>{t('nameLabel')}</FieldLabel>
                        <input type="text" value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder={t('namePlaceholder')} dir="auto" data-testid="input-name" />
                      </div>
                      <div className="field">
                        <FieldLabel optional>{t('emailLabel')}</FieldLabel>
                        <input type="email" value={draft.email} onChange={(event) => update('email', event.target.value)} placeholder="you@example.com" data-testid="input-email" />
                      </div>
                    </div>
                    <div className="field">
                      <FieldLabel optional>{t('phoneLabel')}</FieldLabel>
                      <input type="tel" value={draft.phone} onChange={(event) => update('phone', event.target.value)} placeholder="(555) 000-0000" dir="ltr" data-testid="input-phone" />
                      <span className="hint">{t('phoneHint')}</span>
                    </div>
                    <div className="review-box" aria-label={t('summaryTitle')}>
                      <div className="review-row"><span className="review-key">{t('reviewIssue')}</span><span className="review-value">{draft.issueType ? t(issueTranslationKeys[draft.issueType]) : ''} <button className="edit-link" type="button" onClick={() => setStep(1)} data-testid="button-edit-place">{t('edit')}</button></span></div>
                      <div className="review-row"><span className="review-key">{t('reviewLocation')}</span><span className="review-value" dir="auto">{draft.location}</span></div>
                      <div className="review-row"><span className="review-key">{t('reviewWhen')}</span><span className="review-value" dir="auto">{draft.date} · {draft.approximateTime}</span></div>
                      <div className="review-row"><span className="review-key">{t('reviewDetails')}</span><span className="review-value" dir="auto">{draft.description}</span></div>
                      {draft.evidence && <div className="review-row"><span className="review-key">{t('reviewPhoto')}</span><span className="review-value">{draft.evidence.name}</span></div>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="form-footer">
              <div className="footer-note">
                {isSaved ? <Check size={14} /> : <KeyRound size={14} />}
                <span>{isSaved ? t('savedNow') : t('savedDevice')}</span>
              </div>
              <div className="button-row">
                {step === 1 && <button type="button" className="button button-link" onClick={startOver} data-testid="button-start-over">{t('startOver')}</button>}
                {step > 1 && <button type="button" className="button button-secondary" onClick={() => setStep((current) => current - 1)} data-testid="button-back"><ArrowLeft size={15} /> {t('back')}</button>}
                {step < 3 && <button type="button" className="button button-primary" onClick={goNext} data-testid="button-continue">{t('continue')} <ArrowRight size={15} /></button>}
                {step === 3 && <button type="button" className="button button-secondary" onClick={saveForLater} disabled={isTranslating} data-testid="button-save-later">{t('saveLater')}</button>}
                {step === 3 && <button type="submit" className="button button-primary" disabled={isTranslating} aria-busy={isTranslating} data-testid="button-submit-report">{isTranslating ? t('translating') : t('submitReport')} <ArrowRight size={15} /></button>}
              </div>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

export { reportStorageKey };