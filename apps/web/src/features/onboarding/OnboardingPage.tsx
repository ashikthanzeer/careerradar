import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  FileText,
  Globe,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  useCareerProfile,
  useExtractResume,
  useExtractSources,
  useUpdateCareerProfile,
} from '@/hooks/useProfile';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/StateFeedback';
import {
  COUNTRY_CITY_SUGGESTIONS,
  NATIVE_COUNTRY_OPTIONS,
  ROLE_CATEGORY_LABELS,
} from '@/lib/utils';
import type {
  CareerProfile,
  DomainCategory,
  ProfileExtractionResult,
  RoleCategory,
  UserSkill,
} from '@/types/domain';

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.split(',').pop() || '');
    };
    reader.onerror = () => reject(new Error('Unable to read selected file.'));
    reader.readAsDataURL(file);
  });
}

export function OnboardingPage() {
  const { data: profile, isLoading } = useCareerProfile();
  const updateProfileMutation = useUpdateCareerProfile();
  const extractResumeMutation = useExtractResume();
  const extractSourcesMutation = useExtractSources();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'resume' | 'links'>('resume');

  // Resume state
  const [resumeText, setResumeText] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  // LinkedIn & Portfolio state
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [pastedBio, setPastedBio] = useState('');

  // Extracted / Editable Profile fields
  const [displayName, setDisplayName] = useState('');
  const [educationLevel, setEducationLevel] =
    useState<CareerProfile['educationLevel']>('undergraduate');
  const [fieldOfStudy, setFieldOfStudy] = useState('Computer Science');
  const [institution, setInstitution] = useState('University');
  const [graduationYear, setGraduationYear] = useState(2027);
  const [nativeCountry, setNativeCountry] = useState('India');
  const [preferredLocationsCsv, setPreferredLocationsCsv] = useState('Remote, Bengaluru');
  const [preferredRoles, setPreferredRoles] = useState<RoleCategory[]>([
    'software_engineering',
  ]);
  const [preferredDomains, setPreferredDomains] = useState<DomainCategory[]>([
    'Developer Tools & Cloud',
  ]);
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [projects, setProjects] = useState<CareerProfile['projects']>([]);
  const [careerInterestsSummary, setCareerInterestsSummary] = useState('');
  const [newSkill, setNewSkill] = useState('');
  const [extractStatus, setExtractStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName((prev) => prev || profile.displayName);
      setEducationLevel(profile.educationLevel);
      setFieldOfStudy(profile.fieldOfStudy);
      setInstitution(profile.institution);
      setGraduationYear(profile.graduationYear);
      if (profile.nativeCountry) setNativeCountry(profile.nativeCountry);
      if (profile.preferredLocations.length > 0) {
        setPreferredLocationsCsv(profile.preferredLocations.join(', '));
      }
      if (profile.preferredRoles.length > 0) setPreferredRoles(profile.preferredRoles);
      if (profile.preferredDomains.length > 0) {
        setPreferredDomains(profile.preferredDomains);
      }
      if (profile.skills.length > 0) setSkills(profile.skills);
      if (profile.projects.length > 0) setProjects(profile.projects);
      if (profile.linkedinUrl) setLinkedinUrl((prev) => prev || profile.linkedinUrl || '');
      if (profile.portfolioUrl) setPortfolioUrl((prev) => prev || profile.portfolioUrl || '');
      if (profile.careerInterestsSummary) {
        setCareerInterestsSummary((prev) => prev || profile.careerInterestsSummary);
      }
    }
  }, [profile]);

  if (isLoading || !profile) {
    return <LoadingState message="Preparing your onboarding workspace..." />;
  }

  const mergeExtractedResult = (res: ProfileExtractionResult) => {
    if (res.displayName) setDisplayName(res.displayName);
    if (res.educationLevel) setEducationLevel(res.educationLevel);
    if (res.fieldOfStudy) setFieldOfStudy(res.fieldOfStudy);
    if (res.institution) setInstitution(res.institution);
    if (res.graduationYear) setGraduationYear(res.graduationYear);
    if (res.preferredRoles.length > 0) setPreferredRoles(res.preferredRoles);
    if (res.preferredDomains.length > 0) setPreferredDomains(res.preferredDomains);
    if (res.linkedinUrl) setLinkedinUrl(res.linkedinUrl);
    if (res.portfolioUrl) setPortfolioUrl(res.portfolioUrl);
    if (res.careerInterestsSummary) setCareerInterestsSummary(res.careerInterestsSummary);

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

    if (res.projects.length > 0) {
      setProjects((prev) => {
        const seen = new Set(prev.map((p) => p.title.toLowerCase()));
        return [
          ...prev,
          ...res.projects.filter((p) => !seen.has(p.title.toLowerCase())),
        ];
      });
    }
    setExtractStatus(res.extractionNotice);
    setErrorMsg(null);
  };

  const handleExtractResume = async () => {
    setErrorMsg(null);
    if (!resumeFile && resumeText.trim().length < 15) {
      setErrorMsg('Upload a .pdf, .docx, or .txt resume or paste your resume text first.');
      return;
    }

    try {
      const fileBase64 = resumeFile ? await fileToBase64(resumeFile) : undefined;
      const result = await extractResumeMutation.mutateAsync({
        text: resumeText.trim() || undefined,
        filename: resumeFile?.name,
        fileBase64,
      });
      mergeExtractedResult(result);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to parse resume.');
    }
  };

  const handleExtractSources = async () => {
    setErrorMsg(null);
    if (!linkedinUrl.trim() && !portfolioUrl.trim() && pastedBio.trim().length < 15) {
      setErrorMsg('Enter your LinkedIn URL, Portfolio Website URL, or bio summary first.');
      return;
    }

    try {
      const result = await extractSourcesMutation.mutateAsync({
        linkedinUrl: linkedinUrl.trim() || undefined,
        portfolioUrl: portfolioUrl.trim() || undefined,
        pastedText: pastedBio.trim() || undefined,
      });
      mergeExtractedResult(result);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to extract profile from links.'
      );
    }
  };

  const handleAddSkill = () => {
    const clean = newSkill.trim();
    if (!clean) return;
    if (skills.some((s) => s.canonicalName.toLowerCase() === clean.toLowerCase())) {
      setNewSkill('');
      return;
    }
    setSkills((prev) => [
      ...prev,
      {
        id: `sk_manual_${Date.now()}`,
        canonicalName: clean,
        category: 'language',
        proficiency: 'intermediate',
        yearsExperience: 1,
        sourceType: 'explicit',
      },
    ]);
    setNewSkill('');
  };

  const toggleDomain = (domain: DomainCategory) => {
    setPreferredDomains((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  };

  const toggleRole = (role: RoleCategory) => {
    setPreferredRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const toggleCityPill = (city: string) => {
    const items = preferredLocationsCsv
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const exists = items.some((c) => c.toLowerCase() === city.toLowerCase());
    const next = exists
      ? items.filter((c) => c.toLowerCase() !== city.toLowerCase())
      : [...items, city];
    setPreferredLocationsCsv(next.join(', '));
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const parsedLocations = preferredLocationsCsv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const updated: CareerProfile = {
      ...profile,
      displayName: displayName.trim() || profile.displayName,
      educationLevel,
      fieldOfStudy: fieldOfStudy.trim() || 'Computer Science',
      institution: institution.trim() || 'University',
      graduationYear: Number(graduationYear) || 2027,
      nativeCountry: nativeCountry || 'India',
      preferredLocations:
        parsedLocations.length > 0 ? parsedLocations : ['Remote'],
      preferredRoles:
        preferredRoles.length > 0 ? preferredRoles : ['software_engineering'],
      preferredDomains:
        preferredDomains.length > 0 ? preferredDomains : ['Developer Tools & Cloud'],
      careerInterestsSummary:
        careerInterestsSummary.trim() ||
        `Seeking roles in ${(preferredDomains[0] || 'Developer Tools & Cloud')}.`,
      skills,
      projects,
      onboardingCompleted: true,
      linkedinUrl: linkedinUrl.trim() || null,
      portfolioUrl: portfolioUrl.trim() || null,
    };

    try {
      await updateProfileMutation.mutateAsync(updated);
      navigate('/discover', { replace: true });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to save your onboarding profile.'
      );
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            <Sparkles className="h-3.5 w-3.5" />
            Step 1 of 2 · Personalize Your Career Field
          </span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Import Your Resume, LinkedIn, or Portfolio
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Tell CareerRadar what field and stack you work in. When you save, we automatically fetch live roles from Tier-1 company career boards in your domain and store them in the shared catalog for everyone.
          </p>
        </div>
        <Link
          to="/discover"
          className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 shrink-0"
        >
          Skip to Jobs &rarr;
        </Link>
      </div>

      {/* Extraction Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('resume')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold border transition-colors ${
                activeTab === 'resume'
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Upload / Paste Resume (.pdf, .docx, .txt)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('links')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold border transition-colors ${
                activeTab === 'links'
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>LinkedIn &amp; Portfolio Website</span>
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeTab === 'resume' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Upload Resume File (.pdf, .docx, .txt)
                </label>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  aria-label="Upload resume file"
                  onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-md file:border file:border-slate-300 dark:file:border-slate-700 file:bg-white dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold"
                />
              </div>
              <div>
                <label
                  htmlFor="onboarding-resume-text"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Or Paste Resume Text
                </label>
                <textarea
                  id="onboarding-resume-text"
                  rows={4}
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste your education, projects, and skills (e.g., B.Tech Computer Science, built REST APIs in Python, FastAPI, React, Docker, PostgreSQL)..."
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={extractResumeMutation.isPending}
                onClick={handleExtractResume}
              >
                {extractResumeMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Extracting Resume...</span>
                  </>
                ) : (
                  <span>Extract Skills &amp; Field from Resume</span>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="LinkedIn Profile URL"
                  placeholder="https://www.linkedin.com/in/your-handle"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                />
                <Input
                  label="Portfolio Website (or GitHub URL)"
                  placeholder="https://your-portfolio.dev"
                  value={portfolioUrl}
                  onChange={(e) => setPortfolioUrl(e.target.value)}
                />
              </div>
              <div>
                <label
                  htmlFor="onboarding-bio-text"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  About / Headline Summary (Helpful if LinkedIn is private)
                </label>
                <textarea
                  id="onboarding-bio-text"
                  rows={3}
                  value={pastedBio}
                  onChange={(e) => setPastedBio(e.target.value)}
                  placeholder="e.g., Full-stack & distributed systems developer experienced in TypeScript, Go, Docker, Kubernetes..."
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={extractSourcesMutation.isPending}
                onClick={handleExtractSources}
              >
                {extractSourcesMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Importing Links...</span>
                  </>
                ) : (
                  <span>Extract from LinkedIn &amp; Portfolio</span>
                )}
              </Button>
            </div>
          )}

          {extractStatus && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-900 px-3 py-2 text-xs font-medium text-emerald-900 dark:text-emerald-200"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{extractStatus}</span>
            </div>
          )}

          {errorMsg && (
            <p role="alert" className="text-xs font-medium text-rose-600">
              {errorMsg}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Review & Save Profile Form */}
      <form onSubmit={handleCompleteOnboarding} className="space-y-5">
        <Card>
          <CardHeader>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Review Your Field, Domains &amp; Skills
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tier-1 companies within your selected domains are prioritized first when fetching matching roles.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Full Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
              <Select
                label="Education Level"
                value={educationLevel}
                onChange={(e) =>
                  setEducationLevel(e.target.value as CareerProfile['educationLevel'])
                }
              >
                <option value="undergraduate">Undergraduate</option>
                <option value="masters">Master&apos;s</option>
                <option value="phd">PhD</option>
                <option value="recent_graduate">Recent Graduate</option>
              </Select>
              <Input
                label="Field of Study"
                value={fieldOfStudy}
                onChange={(e) => setFieldOfStudy(e.target.value)}
                required
              />
              <Input
                label="University / Institution"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="onboarding-native-country"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5"
                >
                  Native Country * (Min 30 local jobs/fetch)
                </label>
                <select
                  id="onboarding-native-country"
                  value={nativeCountry}
                  onChange={(e) => setNativeCountry(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-600 focus:outline-none"
                >
                  {NATIVE_COUNTRY_OPTIONS.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Preferred Cities / Places *"
                value={preferredLocationsCsv}
                onChange={(e) => setPreferredLocationsCsv(e.target.value)}
                placeholder="e.g., Bengaluru, Hyderabad, Remote"
                required
              />
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Quick-pick places in {nativeCountry}:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(COUNTRY_CITY_SUGGESTIONS[nativeCountry] ?? ['Remote']).map((city) => {
                  const selected = preferredLocationsCsv
                    .split(',')
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean)
                    .includes(city.toLowerCase());
                  return (
                    <button
                      key={city}
                      type="button"
                      onClick={() => toggleCityPill(city)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        selected
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

            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Target Role Tracks
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_ROLES.map((role) => {
                  const active = preferredRoles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        active
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {ROLE_CATEGORY_LABELS[role]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Preferred Domains (Tier-1 Companies Prioritized per Domain)
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_DOMAINS.map((domain) => {
                  const active = preferredDomains.includes(domain);
                  return (
                    <button
                      key={domain}
                      type="button"
                      onClick={() => toggleDomain(domain)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        active
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {domain}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Add a technical skill (e.g. Python, React, SQL)..."
                  aria-label="Add onboarding skill"
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSkill();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleAddSkill}
                >
                  <Plus className="h-4 w-4" />
                  <span>Add</span>
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((sk) => (
                  <Badge key={sk.id} variant="indigo" className="gap-1.5 py-1">
                    <span className="font-mono">{sk.canonicalName}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSkills((prev) => prev.filter((item) => item.id !== sk.id))
                      }
                      aria-label={`Remove ${sk.canonicalName}`}
                      className="hover:text-rose-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Daily smart fetch allowance: {profile.triggersRemainingToday ?? 2} of{' '}
            {profile.maxTriggersPerDay ?? 2} triggers remaining today.
          </span>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={updateProfileMutation.isPending}
          >
            {updateProfileMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving &amp; Fetching Jobs...</span>
              </>
            ) : (
              <span>Complete Setup &amp; Fetch Matching Jobs</span>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

