export type ComplaintCategory =
  | 'pothole'
  | 'road_damage'
  | 'drainage'
  | 'drainage_blockage'
  | 'waterlogging'
  | 'garbage'
  | 'garbage_overflow'
  | 'streetlight'
  | 'broken_streetlight'
  | 'electrical_hazard'
  | 'other';

export type ComplaintPriority = 'low' | 'medium' | 'high' | 'critical';

export type ComplaintStatus =
  | 'submitted'
  | 'under_review'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'rejected';

export interface LocationCoordinates {
  lat: number;
  lng: number;
  address: string;
  ward: string;
  zone: string;
  landmark?: string;
}

export interface TimelineEvent {
  id: string;
  status: ComplaintStatus;
  title: string;
  description: string;
  timestamp: string;
  actor: string;
  actorRole: 'Citizen' | 'AI System' | 'Field Officer' | 'Department Head' | 'Executive Authority';
  note?: string;
  evidencePhotoUrl?: string;
}

export interface AIAnalysis {
  categoryIdentified: ComplaintCategory;
  confidenceScore: number; // 0 - 100%
  severityScore: number; // 1 - 10
  urgencyLevel: ComplaintPriority;
  duplicateDetected: boolean;
  duplicateConfidence?: number;
  duplicateParentId?: string;
  extractedKeywords: string[];
  estimatedResolutionHours: number;
  recommendedDepartmentId: string;
  hazardRiskAssessment: string;
  weatherCorrelation?: string;
}

export interface Complaint {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  location: LocationCoordinates;
  imageUrl?: string;
  resolutionImageUrl?: string;
  resolutionNotes?: string;
  citizenId?: string;
  citizenName: string;
  citizenPhone?: string;
  citizenEmail?: string;
  isAnonymous?: boolean;
  isDemo?: boolean;
  departmentId: string;
  assignedOfficer?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  targetResolutionDate: string;
  upvotes: number;
  aiAnalysis: AIFullAnalysis | null;
  aiStatus: 'not_analyzed' | 'completed' | 'failed';
  aiOverrides: AIAnalysisState['overrides'];
  duplicateOf?: string;
  timeline: TimelineEvent[];
  publicCommentsCount?: number;
}

export interface Department {
  id: string;
  name: string;
  categoryCode: ComplaintCategory | 'all';
  headName: string;
  headEmail: string;
  phone: string;
  totalOfficers: number;
  activeFieldTeams: number;
  activeComplaints: number;
  resolvedThisMonth: number;
  avgResolutionHours: number | null;
  slaComplianceRate: number | null;
  operatingZones: string[];
  color: string;
}

export interface GeographicHotspot {
  id: string;
  name: string;
  zone: string;
  ward: string;
  center: [number, number];
  radiusMeters: number;
  activeComplaintCount: number;
  dominantCategory: ComplaintCategory;
  dominantCategoryCount?: number;
  dominantCategories?: Array<{ category: ComplaintCategory; label: string; count: number; percentage?: number }>;
  categories?: Array<{ category: ComplaintCategory; label: string; count: number; percentage?: number }>;
  severityRisk: 'high' | 'critical' | 'moderate';
  avgPriority: ComplaintPriority;
  avgPriorityRank?: number;
  avgPriorityScore?: number;
  recentComplaintCount?: number;
  previousComplaintCount?: number;
  firstReportedAt?: string | null;
  lastReportedAt?: string | null;
  avgAgeDays?: number | null;
  aiAlertReason: string;
  insight?: string;
  suggestedInspectionAction?: string;
  trend: 'increasing' | 'stable' | 'decreasing';
  complaintIds?: string[];
  complaintTickets?: string[];
  generatedBy?: string;
  params?: { epsMeters: number; minPts: number };
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'citizen' | 'authority' | 'admin';
  phone?: string;
  ward?: string;
  badge?: string;
  karmaPoints?: number;
  departmentId?: string;
  avatarUrl?: string;
}

// ─── AI Engine Types ──────────────────────────────────────────────────────────

export interface AIClassificationResult {
  category: ComplaintCategory;
  confidence: number; // 0-100
  reasoning: string;
  alternativeCategory?: ComplaintCategory | null;
  keywords: string[];
}

export interface AIDuplicateResult {
  isDuplicate: boolean;
  confidence: number; // 0-100
  matchedTicketId: string | null;
  reasoning: string;
  requiresAdminVerification: boolean;
}

export interface AIPriorityScoreResult {
  score: number; // 0-100
  urgencyLevel: ComplaintPriority;
  safetyFactor: number; // 0-25
  peopleFactor: number; // 0-25
  urgencyFactor: number; // 0-25
  durationFactor: number; // 0-25
  reasons: string[]; // 4 reasons, one per factor
  estimatedResolutionHours: number;
  recommendedAction: string;
}

export interface AIActionBrief {
  problem: string;
  location: string;
  severity: string;
  publicImpact: string;
  recommendedDepartment: string;
  recommendedAction: string;
  targetResolutionHours: number;
  aiExplanation: string;
}

export interface AIFullAnalysis {
  classification: AIClassificationResult;
  summary: string;
  duplicate: AIDuplicateResult;
  priority: AIPriorityScoreResult;
  actionBrief: AIActionBrief;
  source?: 'gemini';
  model?: string;
  analysedAt?: string;
}

export type AIAnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AIAnalysisState {
  status: AIAnalysisStatus;
  result: AIFullAnalysis | null;
  error: string | null;
  /** Admin overrides — stored alongside AI result */
  overrides: {
    categoryOverride?: ComplaintCategory;
    priorityOverride?: ComplaintPriority;
    duplicateRejected?: boolean;
    duplicateConfirmed?: boolean;
    overriddenBy?: string;
    overriddenAt?: string;
  };
}

// ─── Filter State ─────────────────────────────────────────────────────────────

export interface FilterState {
  search: string;
  category: string;
  status: string;
  priority: string;
  ward: string;
  dateRange: string;
}

