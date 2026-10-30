import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Complaint, ComplaintPriority, ComplaintStatus, Department, GeographicHotspot,
  AIFullAnalysis, AIAnalysisState, ComplaintCategory,
} from '../types';
import {
  complaintsApi, platformApi, uploadImage,
  type CreateComplaintPayload, type PlatformStats,
} from '../services/api';
import { useAuth } from './AuthContext';

export interface NewComplaintInput {
  title: string;
  description: string;
  category: ComplaintCategory;
  location: { lat: number; lng: number; address: string; ward?: string; zone?: string; landmark?: string };
  imageUrl?: string;
  isAnonymous?: boolean;
}

interface ComplaintContextType {
  complaints: Complaint[];
  departments: Department[];
  hotspots: GeographicHotspot[];
  stats: PlatformStats | null;
  loading: boolean;
  error: string | null;
  isDemoData: boolean;
  refresh: () => Promise<void>;
  refreshHotspots: (epsMeters?: number, minPts?: number) => Promise<GeographicHotspot[]>;
  addComplaint: (data: NewComplaintInput, imageFile?: File | null) => Promise<Complaint>;
  updateStatus: (id: string, newStatus: ComplaintStatus, note?: string, actor?: string, extra?: { resolutionImageUrl?: string; resolutionNotes?: string }) => Promise<void>;
  updatePriority: (id: string, newPriority: ComplaintPriority) => Promise<void>;
  assignDepartment: (id: string, departmentId: string, officerName?: string) => Promise<void>;
  updateComplaint: (id: string, payload: Parameters<typeof complaintsApi.update>[1]) => Promise<Complaint>;
  upvoteComplaint: (id: string) => Promise<void>;
  addTimelineNote: (id: string, note: string, author?: string) => Promise<void>;
  mergeDuplicateComplaint: (duplicateId: string, masterId: string) => Promise<void>;
  analyzeComplaintById: (id: string) => Promise<AIFullAnalysis>;
  reviewAiDecision: (id: string, decision: {
    categoryOverride?: ComplaintCategory;
    priorityOverride?: ComplaintPriority;
    duplicateRejected?: boolean;
    duplicateConfirmed?: boolean;
    matchedTicketId?: string;
    merge?: boolean;
    note?: string;
  }) => Promise<void>;
  updateDepartment: (id: string, payload: Partial<Department>) => Promise<void>;
  getComplaintById: (idOrTicket: string) => Complaint | undefined;
  getDepartmentById: (deptId: string) => Department | undefined;
}

const ComplaintContext = createContext<ComplaintContextType | undefined>(undefined);

function replaceComplaint(list: Complaint[], updated: Complaint): Complaint[] {
  return list.map(c => (c.id === updated.id ? updated : c));
}

export const ComplaintProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [hotspots, setHotspots] = useState<GeographicHotspot[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGeography = useCallback(async () => {
    const [{ departments: deptRows }, hotspotResponse] = await Promise.all([
      platformApi.departments(),
      platformApi.hotspots(),
    ]);
    setDepartments(deptRows);
    setHotspots(hotspotResponse.hotspots);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [{ complaints: rows }, statsPayload] = await Promise.all([
        complaintsApi.list('all'),
        platformApi.stats(),
      ]);
      setComplaints(rows);
      setStats(statsPayload);
      await loadGeography();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load complaints.');
    } finally {
      setLoading(false);
    }
  }, [loadGeography]);

  useEffect(() => {
    refresh();
  }, [refresh, user?.id]);

  const refreshHotspots = async (epsMeters = 400, minPts = 3) => {
    const response = await platformApi.hotspots(epsMeters, minPts);
    setHotspots(response.hotspots);
    return response.hotspots;
  };

  const addComplaint = async (data: NewComplaintInput, imageFile?: File | null) => {
    let imageUrl = data.imageUrl;
    if (imageFile) imageUrl = await uploadImage(imageFile);
    const payload: CreateComplaintPayload = {
      title: data.title,
      description: data.description,
      category: data.category,
      lat: data.location.lat,
      lng: data.location.lng,
      address: data.location.address,
      ward: data.location.ward,
      zone: data.location.zone,
      landmark: data.location.landmark,
      imageUrl: imageUrl || null,
      isAnonymous: data.isAnonymous,
    };
    const { complaint } = await complaintsApi.create(payload);
    setComplaints(prev => [complaint, ...prev]);
    await Promise.all([platformApi.stats().then(setStats), loadGeography()]);
    return complaint;
  };

  const applyUpdated = async (updated: Complaint) => {
    setComplaints(prev => replaceComplaint(prev, updated));
    const [nextStats, hotspotResponse] = await Promise.all([platformApi.stats(), platformApi.hotspots()]);
    setStats(nextStats);
    setHotspots(hotspotResponse.hotspots);
  };

  const updateStatus: ComplaintContextType['updateStatus'] = async (id, newStatus, note, _actor, extra) => {
    const { complaint } = await complaintsApi.update(id, {
      status: newStatus,
      note,
      resolutionImageUrl: extra?.resolutionImageUrl,
      resolutionNotes: extra?.resolutionNotes,
    });
    await applyUpdated(complaint);
  };

  const updatePriority = async (id: string, newPriority: ComplaintPriority) => {
    const { complaint } = await complaintsApi.update(id, { priority: newPriority });
    await applyUpdated(complaint);
  };

  const assignDepartment = async (id: string, departmentId: string, officerName?: string) => {
    const { complaint } = await complaintsApi.update(id, {
      departmentId,
      assignedOfficer: officerName,
    });
    await applyUpdated(complaint);
  };

  const updateComplaint = async (id: string, payload: Parameters<typeof complaintsApi.update>[1]) => {
    const { complaint } = await complaintsApi.update(id, payload);
    await applyUpdated(complaint);
    return complaint;
  };

  const upvoteComplaint = async (id: string) => {
    await complaintsApi.vote(id);
    const { complaint } = await complaintsApi.get(id);
    setComplaints(prev => replaceComplaint(prev, complaint));
  };

  const addTimelineNote = async (id: string, note: string, _author?: string) => {
    const { complaint } = await complaintsApi.note(id, note);
    setComplaints(prev => replaceComplaint(prev, complaint));
  };

  const mergeDuplicateComplaint = async (duplicateId: string, masterId: string) => {
    const { complaint } = await complaintsApi.update(duplicateId, {
      duplicateOf: masterId,
      status: 'rejected',
      note: `Confirmed as duplicate of ${masterId}.`,
    });
    await applyUpdated(complaint);
  };

  const analyzeComplaintById = async (id: string) => {
    const { complaint, analysis } = await complaintsApi.analyze(id);
    setComplaints(prev => replaceComplaint(prev, complaint));
    return analysis;
  };

  const reviewAiDecision: ComplaintContextType['reviewAiDecision'] = async (id, decision) => {
    const { complaint } = await complaintsApi.reviewAi(id, decision);
    await applyUpdated(complaint);
  };

  const updateDepartment = async (id: string, payload: Partial<Department>) => {
    const { department } = await platformApi.updateDepartment(id, payload);
    setDepartments(prev => prev.map(d => (d.id === id ? department : d)));
  };

  const getComplaintById = (idOrTicket: string) => {
    const clean = idOrTicket.trim().toLowerCase();
    return complaints.find(c => c.id.toLowerCase() === clean || c.ticketNumber.toLowerCase() === clean);
  };

  const getDepartmentById = (deptId: string) => departments.find(d => d.id === deptId);

  const isDemoData = useMemo(() => Boolean(stats?.demoData), [stats]);

  return (
    <ComplaintContext.Provider value={{
      complaints, departments, hotspots, stats, loading, error, isDemoData,
      refresh, refreshHotspots, addComplaint, updateStatus, updatePriority,
      assignDepartment, updateComplaint, upvoteComplaint, addTimelineNote,
      mergeDuplicateComplaint, analyzeComplaintById, reviewAiDecision, updateDepartment,
      getComplaintById, getDepartmentById,
    }}>
      {children}
    </ComplaintContext.Provider>
  );
};

export const useComplaints = () => {
  const context = useContext(ComplaintContext);
  if (!context) throw new Error('useComplaints must be used within a ComplaintProvider');
  return context;
};
