import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CheckCircle2,
  Code2,
  Download,
  FileUp,
  Globe,
  Loader2,
  Plus,
  Trash2,
  UserCheck,
} from 'lucide-react';
import {
  useCareerProfile,
  useExtractResume,
  useExtractSources,
  useUpdateCareerProfile,
} from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { authService } from '@/services/auth.service';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, LoadingState } from '@/components/ui/StateFeedback';
import {
  COUNTRY_CITY_SUGGESTIONS,
  NATIVE_COUNTRY_OPTIONS,
  ROLE_CATEGORY_LABELS,
  WORK_MODE_LABELS,
} from '@/lib/utils';
import type {
  CareerProfile,
  DomainCategory,
  ProfileExtractionResult,
  RoleCategory,
  SkillProficiency,
  UserSkill,
  WorkMode,
} from '@/types/domain';

const profileFormSchema = z.object({
  displayName: z.string().min(2, 'Display name must be at least 2 characters'),
  educationLevel: z.enum(['undergraduate', 'masters', 'phd', 'recent_graduate']),
  fieldOfStudy: z.string().min(2, 'Field of study is required'),
  institution: z.string().min(2, 'Institution name is required'),
  graduationYear: z.coerce
    .number()
    .int()
    .min(2020, 'Enter a valid graduation year')
    .max(2035, 'Enter a valid graduation year'),
  preferredDuration: z.string().min(2, 'Preferred duration is required'),
  minimumMonthlyStipendINR: z.coerce
    .number()
    .min(0, 'Minimum stipend cannot be negative'),
  nativeCountry: z.string().min(2, 'Select your native country'),
  preferredLocationsCsv: z.string().min(2, 'Specify at least one preferred location'),
  careerInterestsSummary: z
    .string()
    .min(10, 'Provide a brief summary of your career interests'),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

const ALL_ROLES: RoleCategory[] = [
  'software_engineering',
  'machine_learning',
  'systems_infrastructure',
  'data_science',
  'security',
  'research',
];

const ALL_DOMAINS: DomainCategory[] = [
  'Developer Tools & Cloud',
  'AI & Machine Learning',
  'Distributed Systems',
  'Fintech & Payments',
  'Cybersecurity',
  'Open Source Ecosystem',
  'Data Engineering',
  'Scientific Computing',
];

const ALL_WORK_MODES: WorkMode[] = ['remote', 'hybrid', 'onsite'];

export function ProfilePage() {
  const { data: profile, isLoading, error, refetch } = useCareerProfile();
  const updateProfileMutation = useUpdateCareerProfile();
  const extractResumeMutation = useExtractResume();
  const extractSourcesMutation = useExtractSources();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [preferredRoles, setPreferredRoles] = useState<RoleCategory[]>([]);
  const [preferredDomains, setPreferredDomains] = useState<DomainCategory[]>([]);
  const [workModes, setWorkModes] = useState<WorkMode[]>([]);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] =
    useState<UserSkill['category']>('language');
  const [newSkillProficiency, setNewSkillProficiency] =
    useState<SkillProficiency>('intermediate');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResumeText, setImportResumeText] = useState('');
  const [importLinkedinUrl, setImportLinkedinUrl] = useState('');
  const [importPortfolioUrl, setImportPortfolioUrl] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
  });

  const watchedNativeCountry = watch('nativeCountry') || profile?.nativeCountry || 'India';
  const watchedLocationsCsv = watch('preferredLocationsCsv') || '';

  const togglePreferredCity = (city: string) => {
    const existing = watchedLocationsCsv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const exists = existing.some((c) => c.toLowerCase() === city.toLowerCase());
    const next = exists
      ? existing.filter((c) => c.toLowerCase() !== city.toLowerCase())
      : [...existing, city];
    setValue('preferredLocationsCsv', next.join(', '), { shouldDirty: true, shouldValidate: true });
  };

  useEffect(() => {
    if (profile) {
      reset({
        displayName: profile.displayName,
        educationLevel: profile.educationLevel,
        fieldOfStudy: profile.fieldOfStudy,
        institution: profile.institution,
        graduationYear: profile.graduationYear,
        preferredDuration: profile.preferredDuration,
        minimumMonthlyStipendINR: profile.minimumMonthlyStipendINR,
        nativeCountry: profile.nativeCountry || 'India',
        preferredLocationsCsv: profile.preferredLocations.join(', '),
        careerInterestsSummary: profile.careerInterestsSummary,
      });
      setSkills(profile.skills);
      setPreferredRoles(profile.preferredRoles);
      setPreferredDomains(profile.preferredDomains);
      setWorkModes(profile.workModes);
      setImportLinkedinUrl(profile.linkedinUrl || '');
      setImportPortfolioUrl(profile.portfolioUrl || '');
    }
  }, [profile, reset]);

  if (isLoading) {
    return <LoadingState message="Loading your Career Profile..." />;
  }

  if (error || !profile) {
    return (
      <ErrorState
        message="Unable to load Career Profile."
        onRetry={() => refetch()}
      />
    );
  }

  const handleAddSkill = () => {
    const trimmed = newSkillName.trim();
    if (!trimmed) return;
    if (
      skills.some((s) => s.canonicalName.toLowerCase() === trimmed.toLowerCase())
    ) {
      setNewSkillName('');
      return;
    }

    const created: UserSkill = {
      id: `uskill_${Date.now().toString(36)}`,
      canonicalName: trimmed,
      category: newSkillCategory,
      proficiency: newSkillProficiency,
      yearsExperience: 1,
      sourceType: 'explicit',
    };

    setSkills((prev) => [...prev, created]);
    setNewSkillName('');
  };

  const handleRemoveSkill = (id: string) => {
    setSkills((prev) => prev.filter((s) => s.id !== id));
  };

  const toggleRole = (role: RoleCategory) => {
    setPreferredRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const toggleDomain = (domain: DomainCategory) => {
    setPreferredDomains((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  };

  const toggleWorkMode = (mode: WorkMode) => {
    setWorkModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );
  };

  const applyExtractedData = (res: ProfileExtractionResult) => {
    if (res.displayName) setValue('displayName', res.displayName);
    if (res.educationLevel) setValue('educationLevel', res.educationLevel);
    if (res.fieldOfStudy) setValue('fieldOfStudy', res.fieldOfStudy);
    if (res.institution) setValue('institution', res.institution);
    if (res.graduationYear) setValue('graduationYear', res.graduationYear);
    if (res.careerInterestsSummary) {
      setValue('careerInterestsSummary', res.careerInterestsSummary);
    }
    if (res.linkedinUrl) setImportLinkedinUrl(res.linkedinUrl);
    if (res.portfolioUrl) setImportPortfolioUrl(res.portfolioUrl);
    if (res.preferredRoles.length > 0) setPreferredRoles(res.preferredRoles);
    if (res.preferredDomains.length > 0) setPreferredDomains(res.preferredDomains);
    if (res.skills.length > 0) {
      setSkills((prev) => {
        const merged = [...prev];
        const existing = new Set(prev.map((s) => s.canonicalName.toLowerCase()));
        for (const sk of res.skills) {
          if (!existing.has(sk.canonicalName.toLowerCase())) {
            merged.push(sk);
            existing.add(sk.canonicalName.toLowerCase());
          }
        }
        return merged;
      });
    }
    setImportStatus(res.extractionNotice);
  };

  const handleQuickResumeImport = async () => {
    if (!importFile && importResumeText.trim().length < 15) {
      setImportStatus('Upload a .pdf/.docx/.txt file or paste resume text to extract.');
      return;
    }
    let fileBase64: string | undefined;
    if (importFile) {
      fileBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(
            (typeof reader.result === 'string' ? reader.result : '').split(',').pop() || ''
          );
        reader.readAsDataURL(importFile);
      });
    }
    const res = await extractResumeMutation.mutateAsync({
      text: importResumeText.trim() || undefined,
      filename: importFile?.name,
      fileBase64,
    });
    applyExtractedData(res);
  };

  const handleQuickSourcesImport = async () => {
    if (!importLinkedinUrl.trim() && !importPortfolioUrl.trim()) {
      setImportStatus('Enter a LinkedIn profile URL or Portfolio Website URL first.');
      return;
    }
    const res = await extractSourcesMutation.mutateAsync({
      linkedinUrl: importLinkedinUrl.trim() || undefined,
      portfolioUrl: importPortfolioUrl.trim() || undefined,
    });
    applyExtractedData(res);
  };

  const onSubmit = async (values: ProfileFormValues) => {
    const updatedProfile: CareerProfile = {
      ...profile,
      displayName: values.displayName.trim(),
      educationLevel: values.educationLevel,
      fieldOfStudy: values.fieldOfStudy.trim(),
      institution: values.institution.trim(),
      graduationYear: values.graduationYear,
      preferredDuration: values.preferredDuration.trim(),
      minimumMonthlyStipendINR: values.minimumMonthlyStipendINR,
      nativeCountry: values.nativeCountry.trim() || 'India',
      preferredLocations: values.preferredLocationsCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      careerInterestsSummary: values.careerInterestsSummary.trim(),
      preferredRoles:
        preferredRoles.length > 0 ? preferredRoles : ['software_engineering'],
      preferredDomains:
        preferredDomains.length > 0 ? preferredDomains : ['Developer Tools & Cloud'],
      workModes: workModes.length > 0 ? workModes : ['remote', 'hybrid'],
      skills,
      onboardingCompleted: true,
      linkedinUrl: importLinkedinUrl.trim() || null,
      portfolioUrl: importPortfolioUrl.trim() || null,
    };

    const saved = await updateProfileMutation.mutateAsync(updatedProfile);
    setSaveMessage(
      `Career profile saved! Synced ${saved.nativeCountry || 'India'} + worldwide job alerts (${saved.triggersRemainingToday ?? 0} of ${saved.maxTriggersPerDay ?? 2} daily job fetches remaining).`
    );
    setTimeout(() => setSaveMessage(null), 5000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Career Profile &amp; Skill Matrix
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure your academic background, target roles, explicit technical skills, and project portfolio to power explainable opportunity matching.
          </p>
        </div>
        <span className="text-xs font-medium text-slate-500">
          Daily auto-fetch quota: {profile.triggersRemainingToday ?? 2}/
          {profile.maxTriggersPerDay ?? 2} remaining
        </span>
      </div>

      {/* Quick Import from Resume, LinkedIn & Portfolio */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileUp className="h-4 w-4 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">
              Auto-Fill from Resume (.pdf, .docx, .txt), LinkedIn &amp; Portfolio Website
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Saving after extraction updates your skill match and automatically fetches latest roles for your field into the shared database.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Resume Upload (.pdf, .docx, .txt) or Text
              </label>
                <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-md file:border file:border-slate-300 dark:file:border-slate-700 file:bg-white dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-100 file:px-2.5 file:py-1 file:text-xs file:font-semibold"
              />
              <textarea
                rows={2}
                value={importResumeText}
                onChange={(e) => setImportResumeText(e.target.value)}
                placeholder="Or paste resume highlights..."
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={extractResumeMutation.isPending}
                onClick={handleQuickResumeImport}
              >
                {extractResumeMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileUp className="h-3.5 w-3.5" />
                )}
                <span>Extract from Resume</span>
              </Button>
            </div>

            <div className="space-y-2">
              <Input
                label="LinkedIn URL"
                placeholder="https://www.linkedin.com/in/..."
                value={importLinkedinUrl}
                onChange={(e) => setImportLinkedinUrl(e.target.value)}
              />
              <Input
                label="Portfolio Website URL"
                placeholder="https://your-site.dev"
                value={importPortfolioUrl}
                onChange={(e) => setImportPortfolioUrl(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={extractSourcesMutation.isPending}
                onClick={handleQuickSourcesImport}
              >
                {extractSourcesMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Globe className="h-3.5 w-3.5" />
                )}
                <span>Extract from LinkedIn / Portfolio</span>
              </Button>
            </div>
          </div>

          {importStatus && (
            <p role="status" className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
              {importStatus}
            </p>
          )}
        </CardContent>
      </Card>

      {saveMessage && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs sm:text-sm font-medium text-emerald-900"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{saveMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 Cols: Education, Preferences & Interests */}
          <div className="lg:col-span-7 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-indigo-600" />
                  <h2 className="text-base font-bold text-slate-900">
                    Academic &amp; Career Identity
                  </h2>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Full / Display Name *"
                    error={errors.displayName?.message}
                    {...register('displayName')}
                  />
                  <Select
                    label="Current Education Level"
                    error={errors.educationLevel?.message}
                    {...register('educationLevel')}
                  >
                    <option value="undergraduate">Undergraduate Student</option>
                    <option value="masters">Master’s Student</option>
                    <option value="phd">Doctoral / PhD Researcher</option>
                    <option value="recent_graduate">Recent Graduate</option>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <Input
                      label="Institution / University *"
                      error={errors.institution?.message}
                      {...register('institution')}
                    />
                  </div>
                  <Input
                    label="Graduation Year *"
                    type="number"
                    error={errors.graduationYear?.message}
                    {...register('graduationYear')}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Field of Study / Major *"
                    error={errors.fieldOfStudy?.message}
                    {...register('fieldOfStudy')}
                  />
                  <Select
                    label="Native Country (min 30 local jobs/fetch) *"
                    error={errors.nativeCountry?.message}
                    {...register('nativeCountry')}
                  >
                    {NATIVE_COUNTRY_OPTIONS.map((country) => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-2">
                  <Input
                    label="Preferred Places / Cities (comma-separated) *"
                    error={errors.preferredLocationsCsv?.message}
                    {...register('preferredLocationsCsv')}
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
                      Quick-pick ({watchedNativeCountry}):
                    </span>
                    {(COUNTRY_CITY_SUGGESTIONS[watchedNativeCountry] ?? ['Remote']).map((city) => {
                      const active = watchedLocationsCsv
                        .split(',')
                        .map((s) => s.trim().toLowerCase())
                        .filter(Boolean)
                        .includes(city.toLowerCase());
                      return (
                        <button
                          key={city}
                          type="button"
                          onClick={() => togglePreferredCity(city)}
                          className={`rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${
                            active
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                          }`}
                        >
                          {city}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Preferred Duration *"
                    error={errors.preferredDuration?.message}
                    {...register('preferredDuration')}
                  />
                  <Input
                    label="Target Minimum Monthly Stipend (INR)"
                    type="number"
                    error={errors.minimumMonthlyStipendINR?.message}
                    {...register('minimumMonthlyStipendINR')}
                  />
                </div>

                <div>
                  <label
                    htmlFor="profile-interests"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5"
                  >
                    Career Interests &amp; Engineering Focus *
                  </label>
                  <textarea
                    id="profile-interests"
                    rows={3}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
                    {...register('careerInterestsSummary')}
                  />
                  {errors.careerInterestsSummary && (
                    <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
                      {errors.careerInterestsSummary.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Target Role Tracks, Domains, & Work Modes */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-bold text-slate-900">
                  Target Role Tracks &amp; Domains
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Contributes 35% of the explainable compatibility score (20% Role + 15% Domain)
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-2">
                    Preferred Role Categories
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {ALL_ROLES.map((role) => {
                      const active = preferredRoles.includes(role);
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => toggleRole(role)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${active
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                            }`}
                        >
                          {ROLE_CATEGORY_LABELS[role]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-2">
                    Preferred Technical Domains
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {ALL_DOMAINS.map((domain) => {
                      const active = preferredDomains.includes(domain);
                      return (
                        <button
                          key={domain}
                          type="button"
                          onClick={() => toggleDomain(domain)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${active
                            ? 'border-slate-900 dark:border-indigo-500 bg-slate-900 dark:bg-indigo-600 text-white'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                            }`}
                        >
                          {domain}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-2">
                    Accepted Work Modes
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {ALL_WORK_MODES.map((mode) => {
                      const active = workModes.includes(mode);
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => toggleWorkMode(mode)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${active
                            ? 'border-emerald-700 bg-emerald-700 text-white'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                            }`}
                        >
                          {WORK_MODE_LABELS[mode]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right 5 Cols: Explicit Skills Matrix & Project-Inferred Skills */}
          <div className="lg:col-span-5 space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-base font-bold text-slate-900">
                  Explicitly Declared Skills ({skills.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add or remove skills (e.g., PyTorch, Go, Kubernetes, Rust, PostgreSQL) and save to immediately recompute skill gaps.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add New Skill Row */}
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <Input
                      label="Skill / Technology Name"
                      value={newSkillName}
                      onChange={(e) => setNewSkillName(e.target.value)}
                      placeholder="e.g. PyTorch, Go, Docker"
                    />
                    <Select
                      label="Proficiency"
                      value={newSkillProficiency}
                      onChange={(e) =>
                        setNewSkillProficiency(e.target.value as SkillProficiency)
                      }
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Select
                      value={newSkillCategory}
                      onChange={(e) =>
                        setNewSkillCategory(
                          e.target.value as UserSkill['category']
                        )
                      }
                      aria-label="Skill category"
                    >
                      <option value="language">Language</option>
                      <option value="framework">Framework</option>
                      <option value="systems">Systems / DB / Cloud</option>
                      <option value="data_ml">Data &amp; ML</option>
                      <option value="tooling">Tooling</option>
                    </Select>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleAddSkill}
                      className="shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Skill</span>
                    </Button>
                  </div>
                </div>

                {/* Declared Skills List */}
                <div className="divide-y divide-slate-200 rounded-md border border-slate-200">
                  {skills.map((s) => (
                    <div
                      key={s.id}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-900">
                          {s.canonicalName}
                        </span>
                        <span className="ml-2 text-slate-500 capitalize">
                          ({s.proficiency} · {s.category.replace('_', '/')})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSkill(s.id)}
                        aria-label={`Remove skill ${s.canonicalName}`}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Project Portfolio (Powers Inferred Skill Matching) */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-indigo-600" />
                  <h2 className="text-base font-bold text-slate-900">
                    Project Portfolio (Inferred Skills Source)
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Technologies used in your projects are credited as &ldquo;Inferred Skills&rdquo; during skill-gap analysis even if omitted from your explicit list above.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {profile.projects.map((proj) => (
                  <div
                    key={proj.id}
                    className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-2"
                  >
                    <h3 className="font-semibold text-slate-900">{proj.title}</h3>
                    <p className="text-slate-600 leading-relaxed">{proj.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {proj.technologiesUsed.map((tech) => (
                        <Badge key={tech} variant="indigo" className="font-mono">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={updateProfileMutation.isPending}
                className="w-full sm:w-auto"
              >
                {updateProfileMutation.isPending
                  ? 'Saving...'
                  : 'Save Profile & Update Job Matches'}
              </Button>
            </div>

            {/* Account Privacy, Data Export & Deletion (PRD §15) */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-bold text-slate-900">
                  Privacy &amp; Account Data
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Export a copy of all your profile and application records or permanently delete your account.
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const exported = await authService.exportAccountData();
                    const blob = new Blob([JSON.stringify(exported, null, 2)], {
                      type: 'application/json',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'careerradar-account-export.json';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export My Data (JSON)</span>
                </Button>

                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    await authService.deleteAccount();
                    signOut();
                    navigate('/login');
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Account</span>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

