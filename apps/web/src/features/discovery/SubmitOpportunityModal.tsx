import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link2, Loader2 } from 'lucide-react';
import { useExtractJobUrl } from '@/hooks/useOpportunities';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import type { CreateOpportunityInput } from '@/types/domain';

const createOpportunitySchema = z.object({
  title: z.string().min(4, 'Job title must be at least 4 characters'),
  organizationName: z.string().min(2, 'Company name is required'),
  officialWebsite: z
    .string()
    .trim()
    .refine(
      (val) => val === '' || /^https?:\/\/.+/i.test(val),
      'Must be a valid http:// or https:// URL if provided'
    ),
  recruiterContactEmail: z
    .string()
    .trim()
    .refine(
      (val) => val === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      'Must be a valid email address if provided'
    ),
  opportunityType: z.enum([
    'internship',
    'research',
    'fellowship',
    'open_source',
    'hackathon',
    'graduate',
  ]),
  roleCategory: z.enum([
    'software_engineering',
    'machine_learning',
    'data_science',
    'systems_infrastructure',
    'security',
    'research',
  ]),
  domain: z.enum([
    'Developer Tools & Cloud',
    'AI & Machine Learning',
    'Distributed Systems',
    'Fintech & Payments',
    'Cybersecurity',
    'Scientific Computing',
    'Open Source Ecosystem',
    'Data Engineering',
  ]),
  location: z.string().min(2, 'Location is required'),
  workMode: z.enum(['remote', 'hybrid', 'onsite', 'unknown']),
  compensationMin: z.string().optional(),
  compensationCurrency: z.enum(['INR', 'USD', 'EUR']),
  compensationPeriod: z.enum(['monthly', 'total_stipend', 'hourly', 'unpaid', 'unknown']),
  duration: z.string().min(2, 'Duration is required (e.g., 3 months or Full-time)'),
  deadline: z.string().optional(),
  applicationUrl: z
    .string()
    .trim()
    .refine(
      (val) => /^https?:\/\/.+/i.test(val),
      'Application link must start with http:// or https://'
    ),
  sourceName: z.string().min(2, 'Where did you find this job? (e.g. LinkedIn)'),
  description: z
    .string()
    .min(20, 'Please paste at least 20 characters of the job description'),
});

type FormValues = z.infer<typeof createOpportunitySchema>;

export interface JobPrefillData {
  title?: string;
  organizationName?: string;
  officialWebsite?: string | null;
  opportunityType?: CreateOpportunityInput['opportunityType'];
  roleCategory?: CreateOpportunityInput['roleCategory'];
  domain?: CreateOpportunityInput['domain'];
  location?: string;
  workMode?: CreateOpportunityInput['workMode'];
  compensationMin?: number | null;
  compensationCurrency?: 'INR' | 'USD' | 'EUR' | null;
  compensationPeriod?: CreateOpportunityInput['compensationPeriod'];
  duration?: string;
  deadline?: string | null;
  applicationUrl?: string;
  sourceName?: string;
  description?: string;
  extractionNotice?: string;
  partialExtraction?: boolean;
}

interface SubmitOpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitOpportunity: (input: CreateOpportunityInput) => Promise<void>;
  isSubmitting: boolean;
  initialPrefill?: JobPrefillData | null;
}

export function SubmitOpportunityModal({
  isOpen,
  onClose,
  onSubmitOpportunity,
  isSubmitting,
  initialPrefill,
}: SubmitOpportunityModalProps) {
  const extractUrlMutation = useExtractJobUrl();
  const [extractNotice, setExtractNotice] = useState<string | null>(null);
  const [extractPartial, setExtractPartial] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createOpportunitySchema),
    defaultValues: {
      title: '',
      organizationName: '',
      officialWebsite: '',
      recruiterContactEmail: '',
      opportunityType: 'internship',
      roleCategory: 'software_engineering',
      domain: 'Developer Tools & Cloud',
      location: 'Not available',
      workMode: 'unknown',
      compensationMin: '',
      compensationCurrency: 'INR',
      compensationPeriod: 'unknown',
      duration: 'Not available',
      deadline: '',
      applicationUrl: 'https://',
      sourceName: 'LinkedIn',
      description: '',
    },
  });

  useEffect(() => {
    if (isOpen && initialPrefill) {
      reset({
        title: initialPrefill.title ?? '',
        organizationName: initialPrefill.organizationName ?? '',
        officialWebsite: initialPrefill.officialWebsite ?? '',
        recruiterContactEmail: '',
        opportunityType: initialPrefill.opportunityType ?? 'internship',
        roleCategory: initialPrefill.roleCategory ?? 'software_engineering',
        domain: initialPrefill.domain ?? 'Developer Tools & Cloud',
        location: initialPrefill.location ?? 'Not available',
        workMode: initialPrefill.workMode ?? 'unknown',
        compensationMin:
          initialPrefill.compensationMin !== null &&
          initialPrefill.compensationMin !== undefined
            ? String(initialPrefill.compensationMin)
            : '',
        compensationCurrency: initialPrefill.compensationCurrency ?? 'INR',
        compensationPeriod: initialPrefill.compensationPeriod ?? 'unknown',
        duration: initialPrefill.duration ?? 'Not available',
        deadline: initialPrefill.deadline ?? '',
        applicationUrl: initialPrefill.applicationUrl ?? 'https://',
        sourceName: initialPrefill.sourceName ?? 'LinkedIn',
        description: initialPrefill.description ?? '',
      });
      setExtractNotice(initialPrefill.extractionNotice ?? null);
      setExtractPartial(Boolean(initialPrefill.partialExtraction));
    } else if (!isOpen) {
      setExtractNotice(null);
      setExtractPartial(false);
    }
  }, [isOpen, initialPrefill, reset]);

  const currentUrl = watch('applicationUrl');

  const handleFetchFromUrl = async () => {
    const trimmed = (currentUrl || '').trim();
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      setExtractNotice('Enter a valid http:// or https:// job link first.');
      setExtractPartial(true);
      return;
    }

    try {
      const extracted = await extractUrlMutation.mutateAsync(trimmed);
      if (extracted.title) setValue('title', extracted.title);
      if (extracted.organizationName) setValue('organizationName', extracted.organizationName);
      if (extracted.officialWebsite) setValue('officialWebsite', extracted.officialWebsite);
      if (extracted.location) setValue('location', extracted.location);
      if (extracted.workMode) setValue('workMode', extracted.workMode);
      if (extracted.opportunityType) setValue('opportunityType', extracted.opportunityType);
      if (extracted.roleCategory) setValue('roleCategory', extracted.roleCategory);
      if (extracted.domain) setValue('domain', extracted.domain);
      if (extracted.sourceName) setValue('sourceName', extracted.sourceName);
      if (extracted.duration) setValue('duration', extracted.duration);
      if (extracted.compensationPeriod) {
        setValue('compensationPeriod', extracted.compensationPeriod);
      }
      if (extracted.compensationCurrency) {
        setValue('compensationCurrency', extracted.compensationCurrency);
      }
      if (extracted.compensationMin !== null && extracted.compensationMin !== undefined) {
        setValue('compensationMin', String(extracted.compensationMin));
      }
      if (extracted.description) setValue('description', extracted.description);
      setExtractNotice(extracted.extractionNotice);
      setExtractPartial(extracted.partialExtraction);
    } catch (err) {
      setExtractNotice(
        err instanceof Error ? err.message : 'Unable to fetch details from that URL.'
      );
      setExtractPartial(true);
    }
  };

  const onFormSubmit = async (values: FormValues) => {
    const parsedComp =
      values.compensationMin && values.compensationMin.trim() !== ''
        ? Number(values.compensationMin)
        : null;
    const validComp = parsedComp !== null && !Number.isNaN(parsedComp) ? parsedComp : null;

    await onSubmitOpportunity({
      title: values.title,
      organizationName: values.organizationName,
      officialWebsite: values.officialWebsite || undefined,
      recruiterContactEmail: values.recruiterContactEmail || undefined,
      opportunityType: values.opportunityType,
      roleCategory: values.roleCategory,
      domain: values.domain,
      location: values.location,
      workMode: values.workMode,
      compensationMin: validComp,
      compensationMax: validComp,
      compensationCurrency: validComp !== null ? values.compensationCurrency : null,
      compensationPeriod: validComp !== null && values.compensationPeriod === 'unknown' ? 'monthly' : values.compensationPeriod,
      duration: values.duration,
      deadline: values.deadline || undefined,
      applicationUrl: values.applicationUrl,
      sourceName: values.sourceName,
      description: values.description,
    });
    reset();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Check & Add a Job Listing"
      subtitle="Paste a job URL from LinkedIn, Internshala, Indeed, or a company page to auto-fetch details, check for scams, and see your skill match."
      maxWidthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4" noValidate>
        {/* Job Link + Auto-Fetch Row */}
        <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3.5 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
            <div className="flex-1">
              <Input
                label="Job Link (URL from LinkedIn, Internshala, Indeed, or Company Site) *"
                placeholder="https://www.linkedin.com/jobs/view/..."
                error={errors.applicationUrl?.message}
                {...register('applicationUrl')}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={extractUrlMutation.isPending}
              onClick={handleFetchFromUrl}
              className="shrink-0"
            >
              {extractUrlMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Fetching...</span>
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4" />
                  <span>Fetch Details from Link</span>
                </>
              )}
            </Button>
          </div>

          {extractNotice && (
            <p
              className={`text-xs rounded px-2.5 py-1.5 border ${
                extractPartial
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}
            >
              {extractNotice}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Job Title *"
            placeholder="e.g. Software Engineering Intern"
            error={errors.title?.message}
            {...register('title')}
          />
          <Input
            label="Company Name *"
            placeholder="e.g. Stripe"
            error={errors.organizationName?.message}
            {...register('organizationName')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="Where did you find it? *"
            placeholder="e.g. LinkedIn, Internshala"
            error={errors.sourceName?.message}
            {...register('sourceName')}
          />
          <Input
            label="Company Website (Optional)"
            placeholder="https://company.com"
            error={errors.officialWebsite?.message}
            {...register('officialWebsite')}
          />
          <Input
            label="Recruiter Email (Optional)"
            placeholder="hr@company.com"
            error={errors.recruiterContactEmail?.message}
            {...register('recruiterContactEmail')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            label="Job Type"
            error={errors.opportunityType?.message}
            {...register('opportunityType')}
          >
            <option value="internship">Internship</option>
            <option value="graduate">Full-Time / New Grad</option>
            <option value="fellowship">Fellowship</option>
            <option value="open_source">Open-Source Programme</option>
            <option value="research">Research Role</option>
          </Select>

          <Select
            label="Role Area"
            error={errors.roleCategory?.message}
            {...register('roleCategory')}
          >
            <option value="software_engineering">Software Engineering</option>
            <option value="machine_learning">AI &amp; Machine Learning</option>
            <option value="data_science">Data Science &amp; Analytics</option>
            <option value="systems_infrastructure">Cloud &amp; DevOps</option>
            <option value="security">Cybersecurity</option>
            <option value="research">Research</option>
          </Select>

          <Select
            label="Work Mode"
            error={errors.workMode?.message}
            {...register('workMode')}
          >
            <option value="unknown">Not available</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">In-Office / On-site</option>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="City / Location *"
            placeholder="e.g. Bengaluru or Remote"
            error={errors.location?.message}
            {...register('location')}
          />
          <Input
            label="Duration *"
            placeholder="e.g. 6 months"
            error={errors.duration?.message}
            {...register('duration')}
          />
          <Input
            label="Monthly Pay / Stipend (Optional)"
            type="number"
            placeholder="e.g. 50000"
            error={errors.compensationMin?.message}
            {...register('compensationMin')}
          />
        </div>

        <div>
          <label
            htmlFor="opp-description"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Job Description *
          </label>
          <textarea
            id="opp-description"
            rows={4}
            placeholder="Paste the job responsibilities, required skills, and application instructions here..."
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            {...register('description')}
          />
          {errors.description && (
            <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
              {errors.description.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Checking Job...' : 'Check Safety & Skill Match'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
