import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  MapPin, 
  Crosshair, 
  UploadCloud, 
  X, 
  Camera, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  ArrowRight, 
  Loader2, 
  Compass, 
  Sparkles,
  Info,
  Check,
  BrainCircuit
} from 'lucide-react';
import { useComplaints } from '../context/ComplaintContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ComplaintCategory, AIAnalysisState } from '../types';
import AIAnalysisPanel from '../components/ai/AIAnalysisPanel';
import { analyzeComplaintPreview } from '../services/aiService';

export const SubmitComplaintPage: React.FC = () => {
  const navigate = useNavigate();
  const { addComplaint } = useComplaints();
  const { user } = useAuth();
  const { showToast } = useToast();

  // 1. Complaint Title
  const [title, setTitle] = useState('');
  // 2. Description
  const [description, setDescription] = useState('');
  // 3. Category
  const [category, setCategory] = useState<ComplaintCategory>('road_damage');
  // 4. Upload Photograph (file & preview)
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('');
  // 5. Location (human-readable address)
  const [location, setLocation] = useState('');
  // 6. Latitude & 7. Longitude (NOT hardcoded, initial null)
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // Additional citizen meta — the backend uses the signed-in account for ownership.
  const [isAnonymous, setIsAnonymous] = useState(false);

  // GPS State Management
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'success' | 'error'>('idle');
  const [locationError, setLocationError] = useState<string>('');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  // Leaflet Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Validation Errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // AI Analysis State
  const [aiState, setAiState] = useState<AIAnalysisState>({
    status: 'idle',
    result: null,
    error: null,
    overrides: {},
  });

  // Categories list per user specification
  const categoriesList: { value: ComplaintCategory; label: string; icon: string; deptId: string }[] = [
    { value: 'road_damage', label: 'Road Damage', icon: '🕳️', deptId: 'dept-roads' },
    { value: 'drainage_blockage', label: 'Drainage Blockage', icon: '🔧', deptId: 'dept-water' },
    { value: 'waterlogging', label: 'Waterlogging', icon: '🌊', deptId: 'dept-water' },
    { value: 'garbage_overflow', label: 'Garbage Overflow', icon: '🗑️', deptId: 'dept-sanitation' },
    { value: 'broken_streetlight', label: 'Broken Streetlight', icon: '💡', deptId: 'dept-electrical' },
    { value: 'electrical_hazard', label: 'Electrical Hazard', icon: '⚡', deptId: 'dept-safety' },
    { value: 'other', label: 'Other', icon: '⚠️', deptId: 'dept-roads' }
  ];

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Center map on default city view initially (Pune / Smart city center 18.5204, 73.8567)
    // but coordinates inputs remain null until GPS or user clicks!
    const defaultCenter: [number, number] = [18.5204, 73.8567];
    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 13,
      zoomControl: true,
    });

    // OpenStreetMap standard tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Map Click Listener: Allows manual placement/moving of marker
    map.on('click', (e: L.LeafletMouseEvent) => {
      const clickedLat = Number(e.latlng.lat.toFixed(6));
      const clickedLng = Number(e.latlng.lng.toFixed(6));
      updatePosition(clickedLat, clickedLng, 'manual_click');
    });

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Custom marker pin creator
  const createCustomPinIcon = () => {
    return L.divIcon({
      className: 'custom-gps-pin',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="w-10 h-10 rounded-full bg-blue-600 border-2 border-white shadow-xl flex items-center justify-center text-white text-base font-bold animate-bounce">
            📍
          </div>
          <div class="absolute -bottom-1 w-2 h-2 bg-slate-900 rotate-45"></div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40],
    });
  };

  // Helper to update coordinates and reverse-geocode address
  const updatePosition = async (lat: number, lng: number, source: 'gps' | 'manual_drag' | 'manual_click') => {
    setLatitude(lat);
    setLongitude(lng);

    // Clear coordinate validation error if present
    setErrors(prev => {
      const updated = { ...prev };
      delete updated.latitude;
      delete updated.longitude;
      delete updated.location;
      return updated;
    });

    const map = mapInstanceRef.current;
    if (!map) return;

    // Pan map to new position
    map.panTo([lat, lng]);

    // Create or move marker
    if (!markerRef.current) {
      const marker = L.marker([lat, lng], {
        draggable: true,
        icon: createCustomPinIcon(),
      }).addTo(map);

      // On Marker Drag End
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        const draggedLat = Number(pos.lat.toFixed(6));
        const draggedLng = Number(pos.lng.toFixed(6));
        updatePosition(draggedLat, draggedLng, 'manual_drag');
      });

      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }

    markerRef.current
      .bindPopup(`
        <div class="p-1 text-xs">
          <strong>Defect Location</strong><br/>
          Lat: ${lat}<br/>Lng: ${lng}<br/>
          <span class="text-[10px] text-slate-500">Drag to adjust if inaccurate</span>
        </div>
      `)
      .openPopup();

    // Reverse Geocoding via OpenStreetMap Nominatim
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (response.ok) {
        const data = await response.json();
        if (data && data.display_name) {
          setLocation(data.display_name);
          return;
        }
      }
    } catch (e) {
      console.warn('Reverse geocoding unavailable, fallback to coordinate label', e);
    }

    // Fallback location text if reverse geocode is offline or returns empty
    if (!location) {
      setLocation(`Pinned Coordinate (${lat}, ${lng})`);
    }
  };

  // Browser Geolocation API: "Use My Current Location"
  const handleUseCurrentLocation = () => {
    // 1. Check if Geolocation is supported
    if (!navigator.geolocation) {
      setLocationStatus('error');
      const err = 'Geolocation is not supported by your browser.';
      setLocationError(err);
      showToast(err, 'error', 'GPS Unavailable');
      return;
    }

    setIsLocating(true);
    setLocationStatus('requesting');
    setLocationError('');

    // 2. Request real location permission & retrieve coordinates
    navigator.geolocation.getCurrentPosition(
      (position: GeolocationPosition) => {
        setIsLocating(false);
        const detectedLat = Number(position.coords.latitude.toFixed(6));
        const detectedLng = Number(position.coords.longitude.toFixed(6));
        const accuracy = position.coords.accuracy ? Math.round(position.coords.accuracy) : null;

        setLatitude(detectedLat);
        setLongitude(detectedLng);
        setGpsAccuracy(accuracy);
        setLocationStatus('success');

        // Update map & marker
        updatePosition(detectedLat, detectedLng, 'gps');

        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([detectedLat, detectedLng], 16, { duration: 1.2 });
        }

        showToast(
          accuracy
            ? `GPS location detected with ±${accuracy}m accuracy.`
            : 'GPS location detected.',
          'success',
          'Location detected'
        );
      },
      (error: GeolocationPositionError) => {
        setIsLocating(false);
        setLocationStatus('error');
        let errorMsg = 'Failed to retrieve location.';

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Location permission was denied. Please grant location access in your browser or click directly on the map to set the coordinates manually.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location information is unavailable on your device or network. Please click directly on the map to place the marker manually.';
            break;
          case error.TIMEOUT:
            errorMsg = 'The request to get user location timed out. Please try again or click directly on the map.';
            break;
          default:
            errorMsg = error.message || 'An unknown error occurred while retrieving your location.';
            break;
        }

        setLocationError(errorMsg);
        showToast(errorMsg, 'error', 'GPS Error');
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  };

  // Image Upload and Preview
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file (PNG, JPG, JPEG, WEBP)', 'error');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      showToast('Image file size must be 6 MB or smaller', 'error');
      return;
    }

    setImageFile(file);
    const objectUrl = URL.createObjectURL(file);
    setImagePreviewUrl(objectUrl);

    // Clear photo error if any
    setErrors(prev => {
      const updated = { ...prev };
      delete updated.photo;
      return updated;
    });

    showToast(`Photograph "${file.name}" selected for upload`, 'success', 'Image Ready');
  };

  const handleDropImage = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreviewUrl('');
  };

  // Form Validation
  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!title.trim()) {
      newErrors.title = 'Complaint Title is required';
    } else if (title.trim().length < 5) {
      newErrors.title = 'Complaint Title must be at least 5 characters long';
    }

    if (!description.trim()) {
      newErrors.description = 'Description is required';
    } else if (description.trim().length < 10) {
      newErrors.description = 'Please provide at least 10 characters detailing the defect';
    }

    if (!category) {
      newErrors.category = 'Please select a Category';
    }

    if (!imagePreviewUrl) {
      newErrors.photo = 'Please upload a photograph of the civic defect';
    }

    if (!location.trim()) {
      newErrors.location = 'Location description / address is required';
    }

    if (latitude === null || isNaN(latitude)) {
      newErrors.latitude = 'Latitude coordinate is required. Click "Use My Current Location" or click on the map';
    } else if (latitude < -90 || latitude > 90) {
      newErrors.latitude = 'Latitude must be between -90 and 90';
    }

    if (longitude === null || isNaN(longitude)) {
      newErrors.longitude = 'Longitude coordinate is required. Click "Use My Current Location" or click on the map';
    } else if (longitude < -180 || longitude > 180) {
      newErrors.longitude = 'Longitude must be between -180 and 180';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // AI: Analyze with Gemini
  const handleAnalyzeWithAI = async () => {
    if (!title.trim() || !description.trim()) {
      showToast('Please fill in the Complaint Title and Description before running AI analysis.', 'error');
      return;
    }

    setAiState({ status: 'loading', result: null, error: null, overrides: {} });

    try {
      const partialComplaint = {
        title: title.trim(),
        description: description.trim(),
        category,
        location: latitude !== null && longitude !== null
          ? { lat: latitude, lng: longitude, address: location, ward: '', zone: '' }
          : undefined,
      };

      const result = await analyzeComplaintPreview(partialComplaint);
      setAiState({ status: 'success', result, error: null, overrides: {} });

      // Suggest the AI category when it is reasonably confident.
      if (result.classification.confidence >= 70) {
        setCategory(result.classification.category);
        showToast(
          `AI classified this as "${result.classification.category}" with ${result.classification.confidence}% confidence. Review it before submitting.`,
          'success',
          'AI analysis complete'
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI analysis failed';
      setAiState({ status: 'error', result: null, error: message, overrides: {} });
      showToast(message, 'error', 'AI Analysis Error');
    }
  };

  // Form submission — persists through the backend and returns the generated ticket.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      showToast('Please fix the highlighted errors before submitting', 'error', 'Validation incomplete');
      return;
    }

    if (latitude === null || longitude === null) return;

    setIsSubmitting(true);

    try {
      const complaint = await addComplaint(
        {
          title: title.trim(),
          description: description.trim(),
          category,
          location: {
            lat: latitude,
            lng: longitude,
            address: location.trim(),
            ward: user?.ward || undefined,
          },
          isAnonymous,
        },
        imageFile,
      );

      showToast(
        `Complaint #${complaint.ticketNumber} was saved with its GPS coordinates.`,
        'success',
        'Complaint submitted'
      );

      navigate(`/track?id=${encodeURIComponent(complaint.ticketNumber)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The complaint could not be saved.';
      showToast(message, 'error', 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen py-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Module Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold uppercase tracking-wider">
            <Compass className="w-3.5 h-3.5 text-blue-600" />
            GPS-BASED CIVIC COMPLAINT SUBMISSION
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Report a Civic Defect with GPS Coordinates
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto">
            Provide the defect details, attach photo proof, and lock in exact GPS coordinates using your device or by pinpointing on the interactive map.
          </p>
        </div>

        {/* Submission Form */}
        <form onSubmit={handleSubmit} className="space-y-8" noValidate>
          {/* SECTION 1: COMPLAINT DETAILS */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-card space-y-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
              Issue Details & Classification
            </h2>

            {/* Field 1: Complaint Title */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                1. Complaint Title <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Deep Pothole near Bus Terminal Gate 2"
                className={`w-full text-sm rounded-xl border p-3 focus:outline-none focus:ring-2 transition-all ${
                  errors.title ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/20' : 'border-slate-300 focus:ring-blue-500'
                }`}
              />
              {errors.title && (
                <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {errors.title}
                </p>
              )}
            </div>

            {/* Field 2: Description */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                2. Description <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the defect in detail: dimensions, how long it has existed, whether water has collected, and any danger to pedestrians or two-wheelers..."
                className={`w-full text-sm rounded-xl border p-3 focus:outline-none focus:ring-2 transition-all ${
                  errors.description ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/20' : 'border-slate-300 focus:ring-blue-500'
                }`}
              />
              {errors.description && (
                <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {errors.description}
                </p>
              )}
            </div>

            {/* Field 3: Category */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                3. Category <span className="text-rose-600">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {categoriesList.map((cat) => {
                  const isSelected = category === cat.value;
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(cat.value)}
                      className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-blue-50 border-blue-600 text-blue-900 shadow-sm ring-2 ring-blue-500/20'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="text-xl mb-1">{cat.icon}</div>
                      <span className="text-xs font-bold leading-tight">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
              {errors.category && (
                <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {errors.category}
                </p>
              )}
            </div>
          </div>

          {/* SECTION 2: UPLOAD PHOTOGRAPH */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-card space-y-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">2</span>
              4. Upload Photograph <span className="text-rose-600">*</span>
            </h2>

            {/* Upload Zone / Dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDropImage}
              className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center transition-all ${
                isDragOver ? 'border-blue-500 bg-blue-50/50 scale-[1.01]' :
                errors.photo ? 'border-rose-400 bg-rose-50/20' :
                'border-slate-300 hover:border-blue-400 bg-slate-50/50'
              }`}
            >
              {imagePreviewUrl ? (
                <div className="space-y-4 max-w-md mx-auto">
                  <div className="relative rounded-2xl overflow-hidden shadow-lg border border-slate-200 max-h-72">
                    <img
                      src={imagePreviewUrl}
                      alt="Defect preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white flex items-center justify-center transition-colors shadow-md"
                      title="Remove image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 p-2.5 rounded-xl bg-white border border-slate-200">
                    <span className="truncate max-w-[200px] font-semibold">{imageFile?.name || 'Uploaded defect image'}</span>
                    <label className="text-blue-600 font-bold hover:underline cursor-pointer">
                      Replace Photo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-sm">
                    <UploadCloud className="w-7 h-7" />
                  </div>

                  <div>
                    <label className="cursor-pointer">
                      <span className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-md transition-colors">
                        <Camera className="w-3.5 h-3.5" />
                        Select Photograph
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                    </label>
                    <p className="text-xs text-slate-500 mt-2">
                      or drag and drop your image file here (PNG, JPG, WEBP up to 6 MB)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {errors.photo && (
              <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {errors.photo}
              </p>
            )}
          </div>

          {/* SECTION 3: GPS LOCATION & INTERACTIVE MAP */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-card space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                GPS Geolocation & Interactive Map Pin
              </h2>

              {/* Exact user requested button */}
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={isLocating}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 self-start sm:self-auto disabled:opacity-50"
              >
                {isLocating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Requesting GPS Position...</span>
                  </>
                ) : (
                  <>
                    <Crosshair className="w-4 h-4" />
                    <span>Use My Current Location</span>
                  </>
                )}
              </button>
            </div>

            {/* GPS Status / Error Feedback Message */}
            {locationStatus === 'error' && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-3 animate-in fade-in">
                <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="block font-bold">GPS Location Retrieval Failed</strong>
                  <p className="leading-relaxed">{locationError}</p>
                  <p className="text-[11px] text-rose-700 font-semibold mt-1">
                    👉 Tip: You can click directly anywhere on the map below or enter the coordinates manually.
                  </p>
                </div>
              </div>
            )}

            {locationStatus === 'success' && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>
                    GPS position detected{gpsAccuracy ? ` (±${gpsAccuracy}m)` : ''}. Marker placed at the detected coordinates.
                  </span>
                </div>
                <span className="font-mono font-bold text-emerald-800 text-[11px]">
                  {latitude}, {longitude}
                </span>
              </div>
            )}

            {/* Leaflet Map with OpenStreetMap */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  Click on map or drag the pin to manually adjust position
                </span>
                <span className="text-[11px]">OpenStreetMap & Leaflet</span>
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-slate-300 shadow-inner h-80 bg-slate-100">
                <div ref={mapContainerRef} className="w-full h-full" />

                {latitude === null && (
                  <div className="absolute top-3 left-3 right-3 z-[400] bg-white/95 backdrop-blur-md p-3 rounded-xl border border-blue-200 shadow-md text-xs text-slate-700 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      Click "Use My Current Location" or click anywhere on this map to place your pin.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Coordinate Display Inputs (Latitude, Longitude, Location) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Field 6: Latitude */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  6. Latitude <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={latitude !== null ? latitude : ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseFloat(e.target.value);
                    setLatitude(val);
                    if (val !== null && longitude !== null) updatePosition(val, longitude, 'manual_click');
                  }}
                  placeholder="e.g. 18.520430"
                  className={`w-full text-sm font-mono rounded-xl border p-3 focus:outline-none focus:ring-2 transition-all ${
                    errors.latitude ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/20' : 'border-slate-300 focus:ring-blue-500'
                  }`}
                />
                {errors.latitude && (
                  <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {errors.latitude}
                  </p>
                )}
              </div>

              {/* Field 7: Longitude */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  7. Longitude <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={longitude !== null ? longitude : ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseFloat(e.target.value);
                    setLongitude(val);
                    if (latitude !== null && val !== null) updatePosition(latitude, val, 'manual_click');
                  }}
                  placeholder="e.g. 73.856740"
                  className={`w-full text-sm font-mono rounded-xl border p-3 focus:outline-none focus:ring-2 transition-all ${
                    errors.longitude ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/20' : 'border-slate-300 focus:ring-blue-500'
                  }`}
                />
                {errors.longitude && (
                  <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {errors.longitude}
                  </p>
                )}
              </div>
            </div>

            {/* Field 5: Location (Address / Landmark) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                5. Location (Street Address / Landmark) <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Opposite Saraswat Co-op Bank, 5th Cross Road, Model Colony"
                className={`w-full text-sm rounded-xl border p-3 focus:outline-none focus:ring-2 transition-all ${
                  errors.location ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/20' : 'border-slate-300 focus:ring-blue-500'
                }`}
              />
              {errors.location && (
                <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {errors.location}
                </p>
              )}
            </div>
          </div>

          {/* SECTION 4: ACCOUNT & PRIVACY */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-card space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
              Reporting Account & Privacy
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Citizen name</span>
                <strong className="text-slate-900">{user?.name || 'Signed-in citizen'}</strong>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Email</span>
                <strong className="text-slate-900 break-all">{user?.email || '—'}</strong>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Primary ward</span>
                <strong className="text-slate-900">{user?.ward || 'Not set in profile'}</strong>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              These details come from your signed-in account. Update them from your citizen dashboard profile.
              The municipality uses them to contact you about this complaint.
            </p>

            <div className="pt-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="anonCheckbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <label htmlFor="anonCheckbox" className="text-xs text-slate-700 font-medium cursor-pointer">
                Submit anonymously (your name and contact details will be hidden from public map and tracking views)
              </label>
            </div>
          </div>

          {/* SECTION 5: AI ANALYSIS */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-blue-100 shadow-card space-y-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 text-blue-600" />
                  AI-Powered Pre-Analysis
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Let Gemini AI classify, summarize, detect duplicates, and score the priority of your complaint before submitting.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAnalyzeWithAI}
                disabled={aiState.status === 'loading'}
                className="flex-shrink-0 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {aiState.status === 'loading' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Analyze with AI</span>
                  </>
                )}
              </button>
            </div>

            {aiState.status !== 'idle' && (
              <AIAnalysisPanel
                analysisState={aiState}
                isAdmin={false}
                onOverride={(overrides) => setAiState(prev => ({ ...prev, overrides }))}
              />
            )}

            {aiState.status === 'idle' && (
              <div className="border border-dashed border-slate-200 rounded-xl p-5 text-center">
                <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">
                  Fill in the title and description above, then click{' '}
                  <strong className="text-blue-600">Analyze with AI</strong> to get an AI analysis before submitting.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  This step is optional — you can submit the complaint directly.
                </p>
              </div>
            )}
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-4 pt-2">
            <button
              type="button"
              onClick={() => navigate('/citizen-dashboard')}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-xl shadow-blue-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting Complaint...</span>
                </>
              ) : (
                <>
                  <span>Submit & Save Complaint</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
