import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CarFront,
  Check,
  CircleHelp,
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
import {
  blankDraft,
  frequencies,
  issueTypes,
  type IssueType,
  type ReportDraft,
} from '../types/report';

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
    return saved ? { ...blankDraft, ...JSON.parse(saved) } : blankDraft;
  } catch {
    return blankDraft;
  }
}

function FieldLabel({ children, optional }: { children: string; optional?: boolean }) {
  return (
    <label>
      {children}
      {optional ? <span className="optional">(optional)</span> : <span className="required">*</span>}
    </label>
  );
}

export default function ReportPage() {
  const [, setLocation] = useLocation();
  const [draft, setDraft] = useState<ReportDraft>(() => readDraft());
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaved, setIsSaved] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const evidenceInputRef = useRef<HTMLInputElement>(null);

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
  };

  const validateStep = (currentStep: number) => {
    const nextErrors: FieldErrors = {};
    if (currentStep === 1) {
      if (!draft.issueType) nextErrors.issueType = 'Choose the issue that best fits.';
      if (!draft.location.trim()) nextErrors.location = 'Add a nearby street address or landmark.';
    }
    if (currentStep === 2) {
      if (!draft.date) nextErrors.date = 'Add the date you noticed the issue.';
      if (!draft.approximateTime.trim()) nextErrors.approximateTime = 'Add an approximate time.';
      if (!draft.description.trim()) nextErrors.description = 'Tell us briefly what happened.';
      else if (draft.description.trim().length < 15) nextErrors.description = 'Please add a little more detail (15 characters minimum).';
      if (!draft.frequency) nextErrors.frequency = 'Choose how often this happens.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const goNext = () => {
    if (validateStep(step)) setStep((current) => Math.min(3, current + 1));
  };

  const handleEvidenceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrors((current) => ({ ...current, evidence: 'Choose an image file.' }));
      event.target.value = '';
      return;
    }

    if (file.size > maxEvidenceSize) {
      setErrors((current) => ({ ...current, evidence: 'Choose an image smaller than 3 MB.' }));
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setErrors((current) => ({ ...current, evidence: 'This image could not be added. Try another file.' }));
        return;
      }
      update('evidence', { name: file.name, type: file.type, dataUrl: reader.result });
    };
    reader.onerror = () => {
      setErrors((current) => ({ ...current, evidence: 'This image could not be added. Try another file.' }));
    };
    reader.readAsDataURL(file);
  };

  const removeEvidence = () => {
    update('evidence', undefined);
    if (evidenceInputRef.current) evidenceInputRef.current.value = '';
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateStep(2)) {
      setStep(2);
      return;
    }
    const uniquePart = crypto.randomUUID().split('-')[0].toUpperCase();
    const reportNumber = `CIR-${new Date().getFullYear()}-${uniquePart}`;
    const report = { ...draft, reportNumber, submittedAt: new Date().toISOString() };
    window.localStorage.setItem(reportStorageKey, JSON.stringify(report));
    window.localStorage.removeItem(draftStorageKey);
    setLocation('/confirmation');
  };

  const startOver = () => {
    if (window.confirm('Clear this report and start over?')) {
      setDraft(blankDraft);
      setErrors({});
      setStep(1);
      window.localStorage.removeItem(draftStorageKey);
    }
  };

  const saveForLater = () => {
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    setIsSaved(true);
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href="/" data-testid="link-brand">
          <span className="brand-mark" aria-hidden="true"><MapPin /></span>
          <span className="brand-name">City Issue Reporter</span>
        </Link>
        <span className="header-note">A clearer way to care for our streets</span>
      </header>

      <main className="page-wrap home-grid">
        <section className="intro" aria-labelledby="intro-heading">
          <span className="eyebrow">Your neighborhood, heard</span>
          <h1 id="intro-heading">Notice it.<br /><em>Tell us.</em></h1>
          <p className="intro-copy">
            Help the City understand what is happening on your street. A few thoughtful details help us send your report to the right people.
          </p>
          <ul className="trust-list" aria-label="What to expect">
            <li>
              <ShieldCheck className="trust-icon" size={18} />
              <div><strong>Built for neighbors</strong><span>Plain language, no account required.</span></div>
            </li>
            <li>
              <MessageSquareText className="trust-icon" size={18} />
              <div><strong>About five minutes</strong><span>Save your progress and return if needed.</span></div>
            </li>
            <li>
              <Sparkles className="trust-icon" size={18} />
              <div><strong>Know what happens next</strong><span>Leave with a report number to keep.</span></div>
            </li>
          </ul>
        </section>

        <section className="form-panel" aria-labelledby="form-heading">
          <div className="form-header">
            <div className="form-header-row">
              <div>
                <h2 id="form-heading">Tell us what you noticed</h2>
                <p>Required fields are marked with an asterisk.</p>
              </div>
              <span className="step-count" aria-label={`Step ${step} of 3`}>0{step} / 03</span>
            </div>
            <div className="progress-track" aria-hidden="true"><div className="progress-value" style={{ width: progress }} /></div>
          </div>

          <form onSubmit={submit} noValidate>
            <div className="form-body">
              {step === 1 && (
                <div className="step-content">
                  <h3 className="step-heading" ref={headingRef} tabIndex={-1}>Where should we look?</h3>
                  <p className="step-description">Start with the kind of issue and the place where it is happening.</p>
                  <div className="field-grid">
                    <div className={`field ${errors.issueType ? 'has-error' : ''}`}>
                      <FieldLabel>Issue type</FieldLabel>
                      <div className="choice-grid" role="radiogroup" aria-label="Issue type">
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
                              <span className="choice-label">{type}</span>
                              {selected && <Check className="choice-check" size={15} />}
                            </button>
                          );
                        })}
                      </div>
                      {errors.issueType && <span className="error-text" role="alert">{errors.issueType}</span>}
                    </div>
                    <div className={`field ${errors.location ? 'has-error' : ''}`}>
                      <FieldLabel>Where is it?</FieldLabel>
                      <input
                        type="text"
                        value={draft.location}
                        onChange={(event) => update('location', event.target.value)}
                        placeholder="Street address, intersection, or landmark"
                        aria-invalid={Boolean(errors.location)}
                        data-testid="input-location"
                      />
                      {errors.location ? <span className="error-text" role="alert">{errors.location}</span> : <span className="hint">A nearby address helps the City route your report.</span>}
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="step-content">
                  <h3 className="step-heading" ref={headingRef} tabIndex={-1}>What happened?</h3>
                  <p className="step-description">A little context helps staff understand the situation and what to check.</p>
                  <div className="field-grid">
                    <div className="field-grid two">
                      <div className={`field ${errors.date ? 'has-error' : ''}`}>
                        <FieldLabel>Date noticed</FieldLabel>
                        <input type="date" value={draft.date} onChange={(event) => update('date', event.target.value)} aria-invalid={Boolean(errors.date)} data-testid="input-date" />
                        {errors.date && <span className="error-text" role="alert">{errors.date}</span>}
                      </div>
                      <div className={`field ${errors.approximateTime ? 'has-error' : ''}`}>
                        <FieldLabel>Approximate time</FieldLabel>
                        <input type="text" value={draft.approximateTime} onChange={(event) => update('approximateTime', event.target.value)} placeholder="For example, around 8:30 am" aria-invalid={Boolean(errors.approximateTime)} data-testid="input-approximate-time" />
                        {errors.approximateTime && <span className="error-text" role="alert">{errors.approximateTime}</span>}
                      </div>
                    </div>
                    <div className={`field ${errors.description ? 'has-error' : ''}`}>
                      <FieldLabel>In your own words, what did you see?</FieldLabel>
                      <textarea value={draft.description} onChange={(event) => update('description', event.target.value)} maxLength={500} placeholder="Share the useful details: what happened, what you noticed, or what makes this feel unsafe." aria-invalid={Boolean(errors.description)} data-testid="input-description" />
                      <div className="char-count">
                        {errors.description ? <span className="error-text" role="alert">{errors.description}</span> : <span className="hint">Please avoid including private information about other people.</span>}
                        <span className="hint">{draft.description.length}/500</span>
                      </div>
                    </div>
                    <div className={`field ${errors.frequency ? 'has-error' : ''}`}>
                      <FieldLabel>How often does this happen?</FieldLabel>
                      <select value={draft.frequency} onChange={(event) => update('frequency', event.target.value as ReportDraft['frequency'])} aria-invalid={Boolean(errors.frequency)} data-testid="select-frequency">
                        {frequencies.map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}
                      </select>
                      {errors.frequency && <span className="error-text" role="alert">{errors.frequency}</span>}
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="step-content">
                  <h3 className="step-heading" ref={headingRef} tabIndex={-1}>One last thing</h3>
                  <p className="step-description">Add a photo or contact details if either would help with this report. Both are optional.</p>
                  <div className="field-grid">
                    <div className={`field ${errors.evidence ? 'has-error' : ''}`}>
                      <FieldLabel optional>Photo evidence</FieldLabel>
                      <span className="hint">A photo can help the City understand the issue. JPG, PNG, or other image files up to 3 MB.</span>
                      <button
                        type="button"
                        className="evidence-picker"
                        onClick={() => evidenceInputRef.current?.click()}
                        data-testid="button-add-evidence"
                      >
                        <ImagePlus size={18} />
                        <span>{draft.evidence ? 'Replace photo' : 'Choose a photo'}</span>
                      </button>
                      <input
                        ref={evidenceInputRef}
                        className="file-input"
                        type="file"
                        accept="image/*"
                        onChange={handleEvidenceChange}
                        aria-label="Choose photo evidence"
                        data-testid="input-evidence"
                      />
                      {draft.evidence && (
                        <div className="evidence-preview">
                          <img src={draft.evidence.dataUrl} alt={`Preview of ${draft.evidence.name}`} />
                          <div className="evidence-preview-copy">
                            <strong>{draft.evidence.name}</strong>
                            <span>Attached to this report</span>
                          </div>
                          <button
                            type="button"
                            className="evidence-remove"
                            onClick={removeEvidence}
                            aria-label="Remove photo evidence"
                            title="Remove photo evidence"
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
                        <FieldLabel optional>Your name</FieldLabel>
                        <input type="text" value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="How should we address you?" data-testid="input-name" />
                      </div>
                      <div className="field">
                        <FieldLabel optional>Email address</FieldLabel>
                        <input type="email" value={draft.email} onChange={(event) => update('email', event.target.value)} placeholder="you@example.com" data-testid="input-email" />
                      </div>
                    </div>
                    <div className="field">
                      <FieldLabel optional>Phone number</FieldLabel>
                      <input type="tel" value={draft.phone} onChange={(event) => update('phone', event.target.value)} placeholder="(555) 000-0000" data-testid="input-phone" />
                      <span className="hint">We will only use contact information for this report.</span>
                    </div>
                    <div className="review-box" aria-label="Report summary">
                      <div className="review-row"><span className="review-key">Issue</span><span className="review-value">{draft.issueType} <button className="edit-link" type="button" onClick={() => setStep(1)} data-testid="button-edit-place">Edit</button></span></div>
                      <div className="review-row"><span className="review-key">Location</span><span className="review-value">{draft.location}</span></div>
                      <div className="review-row"><span className="review-key">When</span><span className="review-value">{draft.date} · {draft.approximateTime}</span></div>
                      <div className="review-row"><span className="review-key">Details</span><span className="review-value">{draft.description}</span></div>
                      {draft.evidence && <div className="review-row"><span className="review-key">Photo</span><span className="review-value">{draft.evidence.name}</span></div>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="form-footer">
              <div className="footer-note">
                {isSaved ? <Check size={14} /> : <KeyRound size={14} />}
                <span>{isSaved ? 'Saved on this device.' : 'Your progress is saved on this device.'}</span>
              </div>
              <div className="button-row">
                {step === 1 && <button type="button" className="button button-link" onClick={startOver} data-testid="button-start-over">Start over</button>}
                {step > 1 && <button type="button" className="button button-secondary" onClick={() => setStep((current) => current - 1)} data-testid="button-back"><ArrowLeft size={15} /> Back</button>}
                {step < 3 && <button type="button" className="button button-primary" onClick={goNext} data-testid="button-continue">Continue <ArrowRight size={15} /></button>}
                {step === 3 && <button type="button" className="button button-secondary" onClick={saveForLater} data-testid="button-save-later">Save for later</button>}
                {step === 3 && <button type="submit" className="button button-primary" data-testid="button-submit-report">Submit Report <ArrowRight size={15} /></button>}
              </div>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

export { reportStorageKey };