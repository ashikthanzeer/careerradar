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

export function formatCleanText(raw: string | null | undefined): string {
  if (!raw) return '';
  let text = String(raw);
  const namedEntities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };
  for (let pass = 0; pass < 3; pass += 1) {
    const prev = text;
    text = text
      .replace(/&(amp|lt|gt|quot|apos|nbsp);|&#39;/gi, (m) => namedEntities[m.toLowerCase()] ?? m)
      .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
      .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
    if (text === prev) break;
  }
  text = text
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6]|tr)\s*>/gi, ' ')
    .replace(/<(?:br|p|div|li|h[1-6]|tr)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

export function formatLocationWithMode(location: string, workMode: WorkMode): string {
  const cleanLoc = formatCleanText(location) || 'Remote';
  const modeLabel = WORK_MODE_LABELS[workMode];
  if (
    workMode === 'unknown' ||
    cleanLoc.toLowerCase().includes(modeLabel.toLowerCase()) ||
    (workMode === 'remote' && cleanLoc.toLowerCase().includes('remote'))
  ) {
    return cleanLoc;
  }
  return `${cleanLoc} (${modeLabel})`;
}

export function getDaysUntil(isoDate: string | null, referenceDate = new Date()): number | null {
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

export const NATIVE_COUNTRY_OPTIONS = [
  'India',
  'United States',
  'United Kingdom',
  'Canada',
  'Germany',
  'Singapore',
  'Australia',
  'Netherlands',
  'France',
  'Japan',
] as const;

export const COUNTRY_CITY_SUGGESTIONS: Record<string, string[]> = {
  India: ['Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Chennai', 'Delhi NCR', 'Kochi', 'Remote'],
  'United States': ['San Francisco', 'New York', 'Seattle', 'Austin', 'Boston', 'Remote'],
  'United Kingdom': ['London', 'Cambridge', 'Manchester', 'Edinburgh', 'Remote'],
  Canada: ['Toronto', 'Vancouver', 'Waterloo', 'Montreal', 'Remote'],
  Germany: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Remote'],
  Singapore: ['Singapore', 'Remote'],
  Australia: ['Sydney', 'Melbourne', 'Brisbane', 'Remote'],
  Netherlands: ['Amsterdam', 'Rotterdam', 'Remote'],
  France: ['Paris', 'Lyon', 'Remote'],
  Japan: ['Tokyo', 'Osaka', 'Remote'],
};

