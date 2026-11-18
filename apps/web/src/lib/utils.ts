import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type {
  ApplicationStatus,
  OpportunityType,
  RoleCategory,
  TrustLabel,
  WorkMode,
} from '@/types/domain';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCompensation(
  min: number | null,
  max: number | null,
  currency: 'INR' | 'USD' | 'EUR' | null,
  period: 'monthly' | 'total_stipend' | 'hourly' | 'unpaid' | 'unknown'
): string {
  if (period === 'unpaid') return 'Unpaid';
  if (min === null && max === null) return 'Not disclosed';

  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '';
  const fmt = (val: number) =>
    currency === 'INR' ? val.toLocaleString('en-IN') : val.toLocaleString('en-US');

  const suffix =
    period === 'monthly'
      ? '/mo'
      : period === 'total_stipend'
        ? ' total stipend'
        : period === 'hourly'
          ? '/hr'
          : '';

  if (min !== null && max !== null && min !== max) {
    return `${symbol}${fmt(min)}–${symbol}${fmt(max)}${suffix}`;
  }
  const single = min ?? max ?? 0;
  return `${symbol}${fmt(single)}${suffix}`;
}

export function formatDateShort(isoDate: string | null): string {
  if (!isoDate) return 'No deadline specified';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getDaysUntil(isoDate: string | null, referenceDate = new Date('2026-11-17T12:00:00Z')): number | null {
  if (!isoDate) return null;
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return null;
  const diffMs = target.getTime() - referenceDate.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export const ROLE_CATEGORY_LABELS: Record<RoleCategory, string> = {
  software_engineering: 'Software Engineering',
  machine_learning: 'Machine Learning & AI',
  data_science: 'Data Science & Analytics',
  systems_infrastructure: 'Systems & Cloud Infrastructure',
  security: 'Security Engineering',
  research: 'Computer Science Research',
};

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  internship: 'Internship',
  research: 'Research Position',
  fellowship: 'Fellowship',
  open_source: 'Open-Source Programme',
  hackathon: 'Technical Competition',
  graduate: 'Early-Career / New Grad',
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
  unknown: 'Unspecified',
};

export const TRUST_LABEL_META: Record<
  TrustLabel,
  {
    label: string;
    shortLabel: string;
    badgeClass: string;
    dotClass: string;
    description: string;
  }
> = {
  no_major_warnings: {
    label: 'Looks Safe — No Warning Signs',
    shortLabel: 'Looks Safe',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dotClass: 'bg-emerald-600',
    description:
      'No scam indicators were found. Company website and application link look standard, though you should always stay cautious.',
  },
  verification_required: {
    label: 'Double-Check Details',
    shortLabel: 'Double-Check',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
    dotClass: 'bg-amber-500',
    description:
      'Some details (like a personal Gmail address or Google Form link) should be verified before sharing personal documents.',
  },
  elevated_risk: {
    label: 'Warning: High Scam Risk',
    shortLabel: 'High Scam Risk',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    dotClass: 'bg-rose-600',
    description:
      'Red flags detected (such as asking you to pay a registration/training fee or impersonating a brand). Do not pay money or share sensitive IDs.',
  },
  insufficient_information: {
    label: 'Limited Company Info',
    shortLabel: 'Limited Info',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    dotClass: 'bg-slate-500',
    description:
      'Not enough public company information was provided in this listing to verify the employer.',
  },
};

export const APPLICATION_STATUS_META: Record<
  ApplicationStatus,
  { label: string; badgeClass: string; order: number }
> = {
  interested: {
    label: 'Interested',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    order: 1,
  },
  saved: {
    label: 'Saved',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    order: 2,
  },
  applied: {
    label: 'Applied',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
    order: 3,
  },
  assessment: {
    label: 'Assessment / OA',
    badgeClass: 'bg-violet-50 text-violet-800 border-violet-200',
    order: 4,
  },
  interview: {
    label: 'Interview',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
    order: 5,
  },
  offer: {
    label: 'Offer Received',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    order: 6,
  },
  rejected: {
    label: 'Rejected',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    order: 7,
  },
  withdrawn: {
    label: 'Withdrawn',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    order: 8,
  },
  closed: {
    label: 'Position Closed',
    badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
    order: 9,
  },
};

