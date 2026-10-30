import React from 'react';
import { ComplaintCategory, ComplaintPriority, ComplaintStatus } from '../../types';
import { 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  Construction, 
  Zap, 
  Droplet, 
  Trash2, 
  Lightbulb, 
  Waves,
  ShieldAlert,
  XCircle
} from 'lucide-react';

interface CategoryBadgeProps {
  category: ComplaintCategory;
  showIcon?: boolean;
  className?: string;
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({ category, showIcon = true, className = '' }) => {
  const config: Record<ComplaintCategory, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
    pothole: {
      label: 'Pothole & Surface',
      bg: 'bg-blue-50 border-blue-200 text-blue-700',
      text: 'text-blue-700',
      icon: <Construction className="w-3.5 h-3.5" />
    },
    road_damage: {
      label: 'Road Damage',
      bg: 'bg-blue-50 border-blue-200 text-blue-700',
      text: 'text-blue-700',
      icon: <Construction className="w-3.5 h-3.5" />
    },
    drainage: {
      label: 'Drainage Blockage',
      bg: 'bg-purple-50 border-purple-200 text-purple-700',
      text: 'text-purple-700',
      icon: <Droplet className="w-3.5 h-3.5" />
    },
    drainage_blockage: {
      label: 'Drainage Blockage',
      bg: 'bg-purple-50 border-purple-200 text-purple-700',
      text: 'text-purple-700',
      icon: <Droplet className="w-3.5 h-3.5" />
    },
    waterlogging: {
      label: 'Waterlogging',
      bg: 'bg-sky-50 border-sky-200 text-sky-700',
      text: 'text-sky-700',
      icon: <Waves className="w-3.5 h-3.5" />
    },
    garbage: {
      label: 'Garbage & Sanitation',
      bg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      text: 'text-emerald-700',
      icon: <Trash2 className="w-3.5 h-3.5" />
    },
    garbage_overflow: {
      label: 'Garbage Overflow',
      bg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      text: 'text-emerald-700',
      icon: <Trash2 className="w-3.5 h-3.5" />
    },
    streetlight: {
      label: 'Streetlight Failure',
      bg: 'bg-amber-50 border-amber-200 text-amber-700',
      text: 'text-amber-700',
      icon: <Lightbulb className="w-3.5 h-3.5" />
    },
    broken_streetlight: {
      label: 'Broken Streetlight',
      bg: 'bg-amber-50 border-amber-200 text-amber-700',
      text: 'text-amber-700',
      icon: <Lightbulb className="w-3.5 h-3.5" />
    },
    electrical_hazard: {
      label: 'Electrical Hazard',
      bg: 'bg-rose-50 border-rose-200 text-rose-700 animate-pulse',
      text: 'text-rose-700',
      icon: <Zap className="w-3.5 h-3.5" />
    },
    other: {
      label: 'Other Civic Defect',
      bg: 'bg-slate-100 border-slate-200 text-slate-700',
      text: 'text-slate-700',
      icon: <AlertCircle className="w-3.5 h-3.5" />
    }
  };

  const item = config[category] || config.pothole;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${item.bg} ${className}`}>
      {showIcon && item.icon}
      {item.label}
    </span>
  );
};

interface PriorityBadgeProps {
  priority: ComplaintPriority;
  className?: string;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, className = '' }) => {
  const config: Record<ComplaintPriority, { label: string; bg: string; text: string; dot: string }> = {
    low: {
      label: 'Low Priority',
      bg: 'bg-slate-100 text-slate-700 border-slate-200',
      text: 'text-slate-700',
      dot: 'bg-slate-400'
    },
    medium: {
      label: 'Medium Priority',
      bg: 'bg-blue-50 text-blue-700 border-blue-200',
      text: 'text-blue-700',
      dot: 'bg-blue-500'
    },
    high: {
      label: 'High Priority',
      bg: 'bg-amber-50 text-amber-700 border-amber-200',
      text: 'text-amber-700',
      dot: 'bg-amber-500'
    },
    critical: {
      label: 'Critical Hazard',
      bg: 'bg-rose-100 text-rose-800 border-rose-300 font-semibold',
      text: 'text-rose-800',
      dot: 'bg-rose-600 animate-ping'
    }
  };

  const item = config[priority] || config.medium;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${item.bg} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${item.dot}`}></span>
      {item.label}
    </span>
  );
};

interface StatusBadgeProps {
  status: ComplaintStatus;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const config: Record<ComplaintStatus, { label: string; bg: string; icon: React.ReactNode }> = {
    submitted: {
      label: 'Submitted',
      bg: 'bg-slate-100 text-slate-700 border-slate-200',
      icon: <Clock className="w-3 h-3 text-slate-500" />
    },
    under_review: {
      label: 'Under Review',
      bg: 'bg-purple-50 text-purple-700 border-purple-200',
      icon: <AlertCircle className="w-3 h-3 text-purple-500" />
    },
    assigned: {
      label: 'Assigned',
      bg: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: <Clock className="w-3 h-3 text-blue-500" />
    },
    in_progress: {
      label: 'In Progress',
      bg: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: <Construction className="w-3 h-3 text-amber-500 animate-spin" />
    },
    resolved: {
      label: 'Resolved',
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: <CheckCircle2 className="w-3 h-3 text-emerald-600" />
    },
    closed: {
      label: 'Closed',
      bg: 'bg-slate-100 text-slate-600 border-slate-300',
      icon: <CheckCircle2 className="w-3 h-3 text-slate-500" />
    },
    rejected: {
      label: 'Rejected',
      bg: 'bg-slate-100 text-slate-500 border-slate-200',
      icon: <XCircle className="w-3 h-3 text-slate-400" />
    }
  };

  const item = config[status] || config.submitted;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${item.bg} ${className}`}>
      {item.icon}
      {item.label}
    </span>
  );
};

