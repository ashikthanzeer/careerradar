import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { APPLICATION_STATUS_META } from '@/lib/utils';
import type { ApplicationRecord, ApplicationStatus } from '@/types/domain';

const editApplicationSchema = z.object({
  status: z.enum([
    'interested',
    'saved',
    'applied',
    'assessment',
    'interview',
    'offer',
    'rejected',
    'withdrawn',
    'closed',
  ]),
  appliedAt: z.string().optional(),
  deadline: z.string().optional(),
  nextAction: z
    .string()
    .min(3, 'Provide a concise next action (at least 3 characters)')
    .max(240, 'Keep next action under 240 characters'),
  privateNotes: z.string().max(2000, 'Notes must be under 2000 characters'),
});

type FormValues = z.infer<typeof editApplicationSchema>;

interface ApplicationEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  application: ApplicationRecord | null;
  opportunityTitle: string;
  onSave: (
    applicationId: string,
    patch: {
      status: ApplicationStatus;
      appliedAt: string | null;
      deadline: string | null;
      nextAction: string;
      privateNotes: string;
    }
  ) => Promise<void>;
  isSaving: boolean;
}

export function ApplicationEditModal({
  isOpen,
  onClose,
  application,
  opportunityTitle,
  onSave,
  isSaving,
}: ApplicationEditModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(editApplicationSchema),
    defaultValues: {
      status: 'interested',
      appliedAt: '',
      deadline: '',
      nextAction: '',
      privateNotes: '',
    },
  });

  useEffect(() => {
    if (application) {
      reset({
        status: application.status,
        appliedAt: application.appliedAt ? application.appliedAt.slice(0, 10) : '',
        deadline: application.deadline ? application.deadline.slice(0, 10) : '',
        nextAction: application.nextAction,
        privateNotes: application.privateNotes,
      });
    }
  }, [application, reset]);

  if (!application) return null;

  const onSubmit = async (values: FormValues) => {
    await onSave(application.id, {
      status: values.status,
      appliedAt: values.appliedAt ? new Date(values.appliedAt).toISOString() : null,
      deadline: values.deadline ? new Date(values.deadline).toISOString() : null,
      nextAction: values.nextAction.trim(),
      privateNotes: values.privateNotes.trim(),
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Tracked Application"
      subtitle={opportunityTitle}
      maxWidthClass="max-w-xl"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Select
          label="Application Stage *"
          error={errors.status?.message}
          {...register('status')}
        >
          {Object.entries(APPLICATION_STATUS_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Application Submitted Date"
            type="date"
            error={errors.appliedAt?.message}
            {...register('appliedAt')}
          />
          <Input
            label="Target / Closing Deadline"
            type="date"
            error={errors.deadline?.message}
            {...register('deadline')}
          />
        </div>

        <Input
          label="Next Action *"
          placeholder="e.g. Complete HackerRank OA before Sunday"
          error={errors.nextAction?.message}
          {...register('nextAction')}
        />

        <div>
          <label
            htmlFor="edit-app-notes"
            className="block text-xs font-semibold text-slate-700 mb-1.5"
          >
            Private Notes (Protected)
          </label>
          <textarea
            id="edit-app-notes"
            rows={4}
            placeholder="Record interview questions, referral contacts, or compensation details..."
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
            {...register('privateNotes')}
          />
          {errors.privateNotes && (
            <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
              {errors.privateNotes.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Application Record'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

