import type { LanguageCode } from '../i18n';

export const issueTypes = [
  'Unsafe driving',
  'Speeding',
  'Potholes',
  'Illegal dumping',
  'Streetlight problems',
  'Other',
] as const;

export const frequencies = [
  'One time',
  'A few times',
  'Happens often',
  'Happens every day',
] as const;

export type IssueType = (typeof issueTypes)[number];
export type Frequency = (typeof frequencies)[number];

export type EvidenceImage = {
  name: string;
  type: string;
  size: number;
  objectPath: string;
};

export type StaffEnglishTranslation = {
  location: string;
  approximateTime: string;
  description: string;
};

export type Report = {
  reportNumber: string;
  issueType: IssueType;
  location: string;
  date: string;
  approximateTime: string;
  description: string;
  frequency: Frequency;
  evidence?: EvidenceImage;
  name?: string;
  email?: string;
  phone?: string;
  submittedAt: string;
  language?: LanguageCode;
  englishTranslation?: StaffEnglishTranslation;
  translationStatus?: 'complete' | 'pending' | 'not-needed';
};

export type ReportDraft = Omit<
  Report,
  'reportNumber' | 'submittedAt' | 'language' | 'englishTranslation' | 'translationStatus'
>;

export const blankDraft: ReportDraft = {
  issueType: '' as IssueType,
  location: '',
  date: '',
  approximateTime: '',
  description: '',
  frequency: '' as Frequency,
  evidence: undefined,
  name: '',
  email: '',
  phone: '',
};

export function isEvidenceObjectPath(value: unknown): value is string {
  return typeof value === 'string' && /^\/objects\/evidence\/[a-f0-9-]{36}$/i.test(value);
}