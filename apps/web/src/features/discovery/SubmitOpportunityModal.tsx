import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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

interface SubmitOpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitOpportunity: (input: CreateOpportunityInput) => Promise<void>;
  isSubmitting: boolean;
}

export function SubmitOpportunityModal({
  isOpen,
  onClose,
  onSubmitOpportunity,
  isSubmitting,
}: SubmitOpportunityModalProps) {
  const {
    register,
    handleSubmit,
    reset,
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
      location: 'Remote',
      workMode: 'remote',
      compensationMin: '',
      compensationCurrency: 'INR',
      compensationPeriod: 'monthly',
      duration: '6 months',
      deadline: '',
      applicationUrl: 'https://',
      sourceName: 'LinkedIn',
      description: '',
    },
  });

  const onFormSubmit = async (values: FormValues) => {
    const parsedComp =
      values.compensationMin && values.compensationMin.trim() !== ''
        ? Number(values.compensationMin)
        : null;

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
      compensationMin: Number.isNaN(parsedComp) ? null : parsedComp,
      compensationMax: Number.isNaN(parsedComp) ? null : parsedComp,
      compensationCurrency: values.compensationCurrency,
      compensationPeriod: values.compensationPeriod,
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
      subtitle="Paste a job listing from LinkedIn, Internshala, Wellfound, or a company website to check for scam red flags and see how your skills match."
      maxWidthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4" noValidate>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Application Link (URL) *"
            placeholder="https://..."
            error={errors.applicationUrl?.message}
            {...register('applicationUrl')}
          />
          <Input
            label="Where did you find it? *"
            placeholder="e.g. LinkedIn, Company Website"
            error={errors.sourceName?.message}
            {...register('sourceName')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Company Website (Optional — helps verify safety)"
            placeholder="https://company.com"
            error={errors.officialWebsite?.message}
            {...register('officialWebsite')}
          />
          <Input
            label="Recruiter Email (Optional — checks for fake domains)"
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
