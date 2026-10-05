import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CarFront,
  Check,
  CircleHelp,
  KeyRound,
  Lightbulb,
  MapPin,
  Trash2,
} from 'lucide-react';
import { Link, useLocation, useSearch } from 'wouter';
import { translateReport, getListTrafficReportsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import AddressMap from '../components/AddressMap';
import AppNavigation from '../components/AppNavigation';
import ResidentHome from '../components/ResidentHome';
import EvidenceField from '../components/EvidenceField';
import VoiceInputButton from '../components/VoiceInputButton';
import {
  blankDraft,
  frequencies,
  issueTypes,
  type IssueType,
  type Report,
  type ReportDraft,
} from '../types/report';
import { readDraft, removeDraft, saveDraft, saveReport } from '../reportStorage';
import {
  frequencyTranslationKeys,
  issueTranslationKeys,
  useLanguage,
} from '../i18n';
import { matchSpokenChoice } from '../lib/spokenChoice';
import { parseSpokenDate } from '../lib/spokenDate';
import LanguageControl from '../components/LanguageControl';
import { assessReportSafety } from '../lib/reportSafety';
import { clearPendingSubmission, submitPersistentReport } from '../lib/reportSubmission';

type FieldErrors = Partial<Record<keyof ReportDraft, string>>;

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const issueIcons: Record<IssueType, typeof CarFront> = {
  'Unsafe driving': CarFront,
  Speeding: CarFront,
  Potholes: MapPin,
  'Illegal dumping': Trash2,
  'Streetlight problems': Lightbulb,
  Other: CircleHelp,
};

function FieldLabel({ children, optional, id, onVoice, voiceDisabled = false, voiceTestId }: {
  children: string;
  optional?: boolean;
  id?: string;
  onVoice?: (transcript: string) => boolean | void;
  voiceDisabled?: boolean;
  voiceTestId?: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="field-label-row">
      <label htmlFor={id}>
        {children}
        {optional ? <span className="optional">({t('optional')})</span> : <span className="required">*</span>}
      </label>
      {onVoice && <VoiceInputButton field={children} onTranscript={onVoice} disabled={voiceDisabled} testId={voiceTestId ?? `button-voice-${id ?? 'choice'}`} />}
    </div>
  );
}

export default function ReportPage() {
  const { language, direction, t } = useLanguage();
  const search = useSearch();
  const isReportView = new URLSearchParams(search).get('view') === 'report';
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ReportDraft>(() => readDraft());
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaved, setIsSaved] = useState(false);
  const [isEvidenceUploading, setIsEvidenceUploading] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const submissionInFlight = useRef(false);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [locationMapVersion, setLocationMapVersion] = useState(0);
  const [safetyEscalationAcknowledged, setSafetyEscalationAcknowledged] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const maxReportDate = localDateValue(new Date());
  const immediateDangerDescribed = assessReportSafety(draft.description).level === 'immediate';

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  useEffect(() => {
    if (isReportView) headingRef.current?.focus();
    else setIsSearchingLocation(false);
  }, [step, isReportView]);

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
      else {
        const hasCoordinates =
          Number.isFinite(draft.pinLatitude) &&
          Number.isFinite(draft.pinLongitude) &&
          Math.abs(draft.pinLatitude!) <= 90 &&
          Math.abs(draft.pinLongitude!) <= 180;
        const hasDroppedPin = hasCoordinates && !draft.searchedAddress;
        const hasValidatedAddress =
          hasCoordinates &&
          Boolean(draft.searchedAddress) &&
          draft.location === draft.searchedAddress;
        if (isSearchingLocation || (!hasDroppedPin && !hasValidatedAddress)) {
          nextErrors.location = t('addressSearchRequired');
        }
      }
    }
    if (currentStep === 2) {
      if (!draft.date) nextErrors.date = t('errorRequired');
      else if (draft.date > localDateValue(new Date())) nextErrors.date = t('errorFutureDate');
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
      immediateDangerDescribed &&
      !safetyEscalationAcknowledged
    ) return;
    setStep((current) => Math.min(3, current + 1));
  };

  const continueWithReport = () => {
    setSafetyEscalationAcknowledged(true);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionInFlight.current) return;
    if (!validateStep(1)) {
      setStep(1);
      return;
    }
    if (isEvidenceUploading) {
      setErrors((current) => ({ ...current, evidence: t('evidenceBusy') }));
      return;
    }
    if (!validateStep(2)) {
      setStep(2);
      return;
    }
    submissionInFlight.current = true;
    setIsSubmitting(true);
    setSubmissionError('');
    try {
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

    const report = await submitPersistentReport(draft, language, englishTranslation, translationStatus);
    void queryClient.invalidateQueries({ queryKey: getListTrafficReportsQueryKey() });
    let confirmationCached = false;
    try {
      saveReport(report);
      confirmationCached = true;
      removeDraft();
    } catch {
      // Browser caching is optional: the durable report is already saved.
    }
    clearPendingSubmission();
    setLocation(confirmationCached ? '/confirmation' : '/history');
    } catch (error) {
      const detail = (error as { data?: { error?: unknown } })?.data?.error;
      setSubmissionError(typeof detail === 'string' ? detail : t('errorSubmitReport'));
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const startOver = () => {
    if (window.confirm(t('clearConfirm'))) {
      setDraft(blankDraft);
      clearPendingSubmission();
      setErrors({});
      setStep(1);
      setIsSearchingLocation(false);
      setLocationMapVersion((version) => version + 1);
      setSafetyEscalationAcknowledged(false);
      removeDraft();
    }
  };

  const saveForLater = () => {
    if (isEvidenceUploading) {
      setErrors((current) => ({ ...current, evidence: t('evidenceBusy') }));
      return;
    }
    saveDraft(draft);
    setIsSaved(true);
  };

  return (
    <div className="app-shell" dir={direction}>
      <header className="site-header">
        <Link className="brand" href="/" data-testid="link-brand">
          <span className="brand-mark" aria-hidden="true"><MapPin /></span>
          <span className="brand-name">{t('brandName')}</span>
        </Link>
        <div className="header-actions">
          <Link className="header-history-link" href="/history" data-testid="link-report-history">{t('historyNav')}</Link>
          <span className="header-note">{t('headerNote')}</span>
          <LanguageControl />
        </div>
      </header>

      <main className={`page-wrap ${isReportView ? 'report-workspace' : 'resident-home'}`}>
        {!isReportView && <ResidentHome />}
        {isReportView && (
        <section className="form-panel" aria-labelledby="form-heading">
          <div className="form-header">
            <div className="form-header-row">
              <div>
                <h1 id="form-heading">{t('formTitle')}</h1>
                <p>{t('requiredNote')}</p>
              </div>
              <span className="step-count" aria-label={t('stepOf', { step })}>0{step} / 03</span>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label={t('stepOf', { step })}
              aria-valuemin={0}
              aria-valuemax={3}
              aria-valuenow={step}
            >
              <div className="progress-value" style={{ width: progress }} />
            </div>
          </div>

          <form onSubmit={submit} noValidate>
            <div className="form-body">
              <p className="voice-form-note" data-testid="voice-form-note">{t('voiceHint')}</p>
              {step === 1 && (
                <div className="step-content">
                  <h3 className="step-heading" ref={headingRef} tabIndex={-1}>{t('step1Title')}</h3>
                  <p className="step-description">{t('step1Desc')}</p>
                  <div className="field-grid">
                    <div className={`field ${errors.issueType ? 'has-error' : ''}`}>
                      <FieldLabel
                        onVoice={(transcript) => {
                          const options = issueTypes.map((value) => ({ value, labels: [value, t(issueTranslationKeys[value])] }));
                          const selected = matchSpokenChoice(transcript, options);
                          if (!selected) return false;
                          update('issueType', selected);
                          return true;
                        }}
                        voiceDisabled={isSubmitting}
                        voiceTestId="button-voice-issue"
                      >{t('issueType')}</FieldLabel>
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
                        <FieldLabel
                          id="input-date"
                          voiceDisabled={isSubmitting}
                          voiceTestId="button-voice-date"
                          onVoice={(transcript) => {
                            const result = parseSpokenDate(transcript, language);
                            if (result.value) update('date', result.value);
                            else setErrors((current) => ({
                              ...current,
                              date: result.error === 'future' ? t('errorFutureDate') : t('voiceDateFormat'),
                            }));
                          }}
                        >{t('dateLabel')}</FieldLabel>
                        <input id="input-date" type="date" max={maxReportDate} value={draft.date} onChange={(event) => update('date', event.target.value)} aria-invalid={Boolean(errors.date)} aria-describedby={errors.date ? 'date-error voice-date-hint' : 'voice-date-hint'} data-testid="input-date" />
                        <span id="voice-date-hint" className="hint">{t('voiceDateHint')}</span>
                        {errors.date && <span id="date-error" className="error-text" role="alert">{errors.date}</span>}
                      </div>
                      <div className={`field ${errors.approximateTime ? 'has-error' : ''}`}>
                        <FieldLabel id="input-approximate-time" voiceDisabled={isSubmitting} onVoice={(text) => update('approximateTime', text)}>{t('timeLabel')}</FieldLabel>
                        <input id="input-approximate-time" type="text" value={draft.approximateTime} onChange={(event) => update('approximateTime', event.target.value)} placeholder={t('timePlaceholder')} dir="auto" aria-invalid={Boolean(errors.approximateTime)} data-testid="input-approximate-time" />
                        {errors.approximateTime && <span className="error-text" role="alert">{errors.approximateTime}</span>}
                      </div>
                    </div>
                    <div className={`field ${errors.description ? 'has-error' : ''}`}>
                      <FieldLabel id="input-description" voiceDisabled={isSubmitting} onVoice={(text) => update('description', text.slice(0, 500))}>{t('descriptionLabel')}</FieldLabel>
                      <textarea id="input-description" value={draft.description} onChange={(event) => update('description', event.target.value)} maxLength={500} placeholder={t('descriptionPlaceholder')} dir="auto" aria-invalid={Boolean(errors.description)} data-testid="input-description" />
                      <div className="char-count">
                        {errors.description ? <span className="error-text" role="alert">{errors.description}</span> : <span className="hint">{t('privacyHint')}</span>}
                        <span className="hint">{draft.description.length}/500</span>
                      </div>
                      {immediateDangerDescribed && !safetyEscalationAcknowledged && (
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
                      <FieldLabel
                        onVoice={(transcript) => {
                          const options = frequencies.map((value) => ({ value, labels: [value, t(frequencyTranslationKeys[value])] }));
                          const selected = matchSpokenChoice(transcript, options);
                          if (!selected) return false;
                          update('frequency', selected);
                          return true;
                        }}
                        voiceDisabled={isSubmitting}
                        voiceTestId="button-voice-frequency"
                      >{t('frequencyLabel')}</FieldLabel>
                      <select value={draft.frequency} onChange={(event) => update('frequency', event.target.value as ReportDraft['frequency'])} aria-invalid={Boolean(errors.frequency)} data-testid="select-frequency">
                        <option value="" disabled>{t('selectFrequency')}</option>
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
                  <p className="step-description">{t('evidenceLabel')} · {t('optional')}</p>
                  <div className="field-grid">
                    <EvidenceField value={draft.evidence} error={errors.evidence} onChange={(value) => update('evidence', value)} onBusy={setIsEvidenceUploading} />
                    <div className="field-grid two">
                      <div className="field">
                        <FieldLabel id="input-name" optional voiceDisabled={isSubmitting} onVoice={(text) => update('name', text)}>{t('nameLabel')}</FieldLabel>
                        <input id="input-name" type="text" value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder={t('namePlaceholder')} dir="auto" data-testid="input-name" />
                      </div>
                      <div className="field">
                        <FieldLabel id="input-email" optional voiceDisabled={isSubmitting} onVoice={(text) => update('email', text.trim().replace(/\s+at\s+/gi, '@').replace(/\s+dot\s+/gi, '.'))}>{t('emailLabel')}</FieldLabel>
                        <input id="input-email" type="email" value={draft.email} onChange={(event) => update('email', event.target.value)} placeholder="you@example.com" data-testid="input-email" />
                      </div>
                    </div>
                    <div className="field">
                      <FieldLabel id="input-phone" optional voiceDisabled={isSubmitting} onVoice={(text) => update('phone', text)}>{t('phoneLabel')}</FieldLabel>
                      <input id="input-phone" type="tel" value={draft.phone} onChange={(event) => update('phone', event.target.value)} placeholder="(555) 000-0000" dir="ltr" data-testid="input-phone" />
                      <span className="hint">{t('phoneHint')}</span>
                    </div>
                    <div className="review-box" aria-label={t('summaryTitle')}>
                      <div className="review-row"><span className="review-key">{t('reviewIssue')}</span><span className="review-value">{draft.issueType ? t(issueTranslationKeys[draft.issueType]) : ''} <button className="edit-link" type="button" onClick={() => setStep(1)} data-testid="button-edit-place">{t('edit')}</button></span></div>
                      <div className="review-row"><span className="review-key">{t('reviewLocation')}</span><span className="review-value" dir="auto">{draft.location}</span></div>
                      <div className="review-row"><span className="review-key">{t('reviewWhen')}</span><span className="review-value" dir="auto">{draft.date} · {draft.approximateTime}</span></div>
                      <div className="review-row"><span className="review-key">{t('reviewDetails')}</span><span className="review-value" dir="auto">{draft.description}</span></div>
                      {draft.evidence && <div className="review-row"><span className="review-key">{t('evidenceLabel')}</span><span className="review-value">{draft.evidence.name}</span></div>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {submissionError && <p className="submit-error" role="alert" data-testid="error-report-submission">{submissionError}</p>}
            <div className="form-footer">
              <div className="footer-note">
                {isSaved ? <Check size={14} /> : <KeyRound size={14} />}
                <span>{isSaved ? t('savedNow') : t('savedDevice')}</span>
              </div>
              <div className="button-row">
                {step === 1 && <button type="button" className="button button-link" onClick={startOver} data-testid="button-start-over">{t('startOver')}</button>}
                {step > 1 && <button type="button" className="button button-secondary" disabled={isSubmitting || isEvidenceUploading} onClick={() => setStep((current) => current - 1)} data-testid="button-back"><ArrowLeft size={15} /> {t('back')}</button>}
                {step < 3 && <button type="button" className="button button-primary" onClick={goNext} data-testid="button-continue">{t('continue')} <ArrowRight size={15} /></button>}
                {step === 3 && <button type="button" className="button button-secondary" onClick={saveForLater} disabled={isSubmitting || isEvidenceUploading} data-testid="button-save-later">{t('saveLater')}</button>}
                {step === 3 && <button type="submit" className="button button-primary" disabled={isSubmitting || isEvidenceUploading} aria-busy={isSubmitting} data-testid="button-submit-report">{isTranslating ? t('translating') : isSubmitting ? t('submittingReport') : t('submitReport')} <ArrowRight size={15} /></button>}
                {isEvidenceUploading && <p className="hint" role="status">{t('evidenceBusy')}</p>}
              </div>
            </div>
          </form>
        </section>
        )}
      </main>
      <AppNavigation />
    </div>
  );
}