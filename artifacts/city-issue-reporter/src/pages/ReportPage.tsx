import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CarFront,
  Check,
  CircleHelp,
  ImagePlus,
  KeyRound,
  Lightbulb,
  MapPin,
  Trash2,
  X,
} from 'lucide-react';
import { Link, useLocation, useSearch } from 'wouter';
import { translateReport, getListTrafficReportsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import AddressMap from '../components/AddressMap';
import AppNavigation from '../components/AppNavigation';
import ResidentHome from '../components/ResidentHome';
import {
  blankDraft,
  frequencies,
  isEvidenceObjectPath,
  isEvidencePreviewToken,
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
import LanguageControl from '../components/LanguageControl';
import { useResidentEvidencePreview } from '../lib/evidencePreview';
import { assessReportSafety } from '../lib/reportSafety';
import { clearPendingSubmission, submitPersistentReport } from '../lib/reportSubmission';

type FieldErrors = Partial<Record<keyof ReportDraft, string>>;

const maxEvidenceSize = 3 * 1024 * 1024;

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

function FieldLabel({ children, optional }: { children: string; optional?: boolean }) {
  const { t } = useLanguage();
  return (
    <label>
      {children}
      {optional ? <span className="optional">({t('optional')})</span> : <span className="required">*</span>}
    </label>
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
  const [isEvidenceDragActive, setIsEvidenceDragActive] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const submissionInFlight = useRef(false);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [locationMapVersion, setLocationMapVersion] = useState(0);
  const [safetyEscalationAcknowledged, setSafetyEscalationAcknowledged] = useState(false);
  const [localEvidencePreviewUrl, setLocalEvidencePreviewUrl] = useState<string>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const maxReportDate = localDateValue(new Date());
  const immediateDangerDescribed = assessReportSafety(draft.description).level === 'immediate';

  useEffect(() => {
    return () => {
      if (localEvidencePreviewUrl) URL.revokeObjectURL(localEvidencePreviewUrl);
    };
  }, [localEvidencePreviewUrl]);

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

  const clearEvidenceInput = () => {
    if (evidenceInputRef.current) evidenceInputRef.current.value = '';
  };

  const handleEvidenceFile = async (file: File | undefined) => {
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setErrors((current) => ({ ...current, evidence: t('errorImageType') }));
      clearEvidenceInput();
      return;
    }

    if (file.size > maxEvidenceSize) {
      setErrors((current) => ({ ...current, evidence: t('errorImageSize') }));
      clearEvidenceInput();
      return;
    }

    setIsEvidenceDragActive(false);
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
        | {
            objectPath?: unknown;
            contentType?: unknown;
            size?: unknown;
            previewToken?: unknown;
            error?: string;
          }
        | null;

      if (!response.ok) {
        throw new Error(t('errorUpload'));
      }
      if (
        !result ||
        !isEvidenceObjectPath(result.objectPath) ||
        typeof result.contentType !== 'string' ||
        typeof result.size !== 'number' ||
        !isEvidencePreviewToken(result.previewToken)
      ) {
        throw new Error(t('errorUpload'));
      }

      update('evidence', {
        name: file.name,
        type: result.contentType,
        size: result.size,
        objectPath: result.objectPath,
        previewToken: result.previewToken,
      });
      setLocalEvidencePreviewUrl(undefined);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        evidence: error instanceof Error ? error.message : t('errorUpload'),
      }));
    } finally {
      setIsEvidenceUploading(false);
      clearEvidenceInput();
    }
  };

  const handleEvidenceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void handleEvidenceFile(event.currentTarget.files?.[0]);
  };

  const handleEvidenceDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (isEvidenceUploading || !Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    setIsEvidenceDragActive(true);
  };

  const handleEvidenceDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (isEvidenceUploading || !Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsEvidenceDragActive(true);
  };

  const handleEvidenceDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsEvidenceDragActive(false);
  };

  const handleEvidenceDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsEvidenceDragActive(false);
    if (isEvidenceUploading) return;
    void handleEvidenceFile(event.dataTransfer.files?.[0]);
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
    if (submissionInFlight.current) return;
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
      setErrors((current) => ({ ...current, evidence: t('errorUploadWait') }));
      return;
    }
    saveDraft(draft);
    setIsSaved(true);
  };

  const securedEvidencePreviewUrl = useResidentEvidencePreview(
    draft.evidence?.objectPath,
    draft.evidence?.previewToken,
  );
  const evidencePreviewUrl = localEvidencePreviewUrl ?? securedEvidencePreviewUrl;

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
                        <input type="date" max={maxReportDate} value={draft.date} onChange={(event) => update('date', event.target.value)} aria-invalid={Boolean(errors.date)} aria-describedby={errors.date ? 'date-error' : undefined} data-testid="input-date" />
                        {errors.date && <span id="date-error" className="error-text" role="alert">{errors.date}</span>}
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
                      <FieldLabel>{t('frequencyLabel')}</FieldLabel>
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
                  <p className="step-description">{t('step3Desc')}</p>
                  <div className="field-grid">
                    <div
                      className={`field photo-evidence-field ${errors.evidence ? 'has-error' : ''} ${isEvidenceDragActive ? 'is-dragging' : ''}`}
                      onDragEnter={handleEvidenceDragEnter}
                      onDragOver={handleEvidenceDragOver}
                      onDragLeave={handleEvidenceDragLeave}
                      onDrop={handleEvidenceDrop}
                      role="group"
                      aria-label={t('photoLabel')}
                      data-testid="photo-dropzone"
                    >
                      <FieldLabel optional>{t('photoLabel')}</FieldLabel>
                      <span className="hint">{t('photoHint')}</span>
                      <span className="hint">{t('photoDropHint')}</span>
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

            {submissionError && <p className="submit-error" role="alert" data-testid="error-report-submission">{submissionError}</p>}
            <div className="form-footer">
              <div className="footer-note">
                {isSaved ? <Check size={14} /> : <KeyRound size={14} />}
                <span>{isSaved ? t('savedNow') : t('savedDevice')}</span>
              </div>
              <div className="button-row">
                {step === 1 && <button type="button" className="button button-link" onClick={startOver} data-testid="button-start-over">{t('startOver')}</button>}
                {step > 1 && <button type="button" className="button button-secondary" disabled={isSubmitting} onClick={() => setStep((current) => current - 1)} data-testid="button-back"><ArrowLeft size={15} /> {t('back')}</button>}
                {step < 3 && <button type="button" className="button button-primary" onClick={goNext} data-testid="button-continue">{t('continue')} <ArrowRight size={15} /></button>}
                {step === 3 && <button type="button" className="button button-secondary" onClick={saveForLater} disabled={isSubmitting} data-testid="button-save-later">{t('saveLater')}</button>}
                {step === 3 && <button type="submit" className="button button-primary" disabled={isSubmitting} aria-busy={isSubmitting} data-testid="button-submit-report">{isTranslating ? t('translating') : isSubmitting ? t('submittingReport') : t('submitReport')} <ArrowRight size={15} /></button>}
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