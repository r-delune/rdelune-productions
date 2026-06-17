export type CongCandidateStatus = 'raw' | 'shortlisted' | 'preview' | 'approved' | 'rejected' | 'parked';
export type CongTechniqueArchiveStatus = 'candidate' | 'needs-review' | 'extracted' | 'integrated' | 'archived' | 'rejected' | 'parked';
export type CongReviewState = 'unreviewed' | 'ready-for-review' | 'confirmed' | 'revisit' | 'not-keeping';
export type CongCandidateRole = 'background' | 'accent' | 'hero';
export type CongPerfClass = 'low' | 'medium' | 'high';
export type CongDifficulty = 'low' | 'medium' | 'high';
export type CongTechniqueFamily = 'cloud' | 'rain' | 'contour' | 'flow-field' | 'center-form' | 'radial' | 'linework' | 'particle' | 'galaxy' | 'storm' | 'grid';
export type CongIntegrationStatus = 'integrated' | 'planned' | 'ignored' | 'archived';

export type CongCandidateId =
  | 'newcloudagainintro'
  | 'visitingtimerainshower'
  | 'lort'
  | 'multispiral'
  | 'landscapeparticlesflow'
  | 'landscapeparticlesspiral'
  | 'planetopener'
  | 'particlecurrent'
  | 'greemngalaxy'
  | 'chordstorm'
  | 'topbottomgreenstorm'
  | 'cloudagainrouter'
  | 'bouncingstrokes'
  | 'derkdisco'
  | 'mandala'
  | 'darkspirals'
  | 'cloudagainintro'
  | 'stacyltites';

export interface CongCandidate {
  id: CongCandidateId;
  name: string;
  sourceFile: string;
  sourceFunction: string;
  family: CongTechniqueFamily;
  role: CongCandidateRole;
  audioMapping: string;
  perfClass: CongPerfClass;
  extractionDifficulty: CongDifficulty;
  status: CongCandidateStatus;
  notes: string;
  approvedBy: string | null;
}

export interface CongLibraryEntry {
  candidateId: CongCandidateId;
  status: CongIntegrationStatus;
  integratedInto: string[];
  preserves: string[];
  integrationNotes: string;
}

export interface CongTechniqueLedgerEntry {
  candidateId: CongCandidateId;
  archiveStatus: CongTechniqueArchiveStatus;
  reviewState: CongReviewState;
  iterationOf?: string;
  aestheticTags: string[];
  extractedBehaviours: string[];
  activeRecipeIds: string[];
  activeKernelIds: string[];
  archiveNotes: string;
  dispositionNotes?: string;
  revisitWhen?: string;
  reviewer?: string;
}
