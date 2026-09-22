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

export type Report = {
  reportNumber: string;
  issueType: IssueType;
  location: string;
  date: string;
  approximateTime: string;
  description: string;
  frequency: Frequency;
  name?: string;
  email?: string;
  phone?: string;
  submittedAt: string;
};

export type ReportDraft = Omit<Report, 'reportNumber' | 'submittedAt'>;

export const blankDraft: ReportDraft = {
  issueType: '' as IssueType,
  location: '',
  date: '',
  approximateTime: '',
  description: '',
  frequency: '' as Frequency,
  name: '',
  email: '',
  phone: '',
};