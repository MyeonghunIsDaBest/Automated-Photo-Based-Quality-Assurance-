import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { Search, Filter, MapPin, Eye, X, Grid, List, Upload as UploadIcon, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { Photo, SafetyFlag, SafetySeverity, AnalysisStatus } from '../types';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import NotAuthorized from '../components/NotAuthorized';
import { canViewGallery } from '../lib/permissions';

// Mirror of supabase/functions/_shared/safetyTaxonomy.ts. Duplicated rather
// than imported because that file lives under Deno-only paths; the Phase C
// contract parity script ensures the shapes stay aligned.
const SAFETY_SEVERITY: Record<SafetyFlag, SafetySeverity> = {
  exposed_wiring:  'critical',
  fall_hazard:     'critical',
  no_hard_hat:     'high',
  unsecured_load:  'high',
  housekeeping:    'medium',
  signage_missing: 'low',
};

const SEVERITY_TONE: Record<SafetySeverity, string> = {
  critical: 'border-red-200 bg-red-50 text-red-700',
  high:     'border-orange-200 bg-orange-50 text-orange-700',
  medium:   'border-amber-200 bg-amber-50 text-amber-700',
  low:      'border-slate-200 bg-slate-50 text-slate-700',
};

const STATUS_LABEL: Record<AnalysisStatus, string> = {
  queued:    'Queued for AI',
  analysing: 'Analysing…',
  analysed:  'Analysed',
  failed:    'AI failed',
  confirmed: 'Confirmed',
  rejected:  'Rejected',
};

const STATUS_TONE: Record<AnalysisStatus, string> = {
  queued:    'border-slate-200 bg-slate-100 text-slate-600',
  analysing: 'border-blue-200 bg-blue-50 text-blue-700',
  analysed:  'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed:    'border-red-200 bg-red-50 text-red-700',
  confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected:  'border-slate-200 bg-slate-100 text-slate-600',
};

export default function Gallery() {
  const navigate = useNavigate();
  const { photos, zones, users, currentProfile } = useAppStore();

  if (!canViewGallery(currentProfile)) {
    return <NotAuthorized surface="the photo gallery" />;
  }
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [filterZone, setFilterZone] = useState('');
  const [filterPhase, setFilterPhase] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [pendingOnly, setPendingOnly] = useState(false);

  const filteredPhotos = photos.filter(photo => {
    if (filterZone && photo.zoneId !== filterZone) return false;
    if (filterPhase && photo.aiAnalysis?.phaseDetected !== filterPhase) return false;
    if (searchQuery && !photo.filename.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (pendingOnly) {
      // Pending review = analysed by AI but supervisor hasn't confirmed/rejected.
      const a = photo.aiAnalysis;
      if (!a) return false;
      if (a.actionTaken !== 'pending') return false;
      if (a.analysisStatus === 'confirmed' || a.analysisStatus === 'rejected') return false;
    }
    return true;
  });

  const getZoneName = (zoneId?: string) => {
    return zones.find(z => z.id === zoneId)?.name || 'Unknown';
  };

  const getUserName = (userId: string) => {
    return users.find(u => u.id === userId)?.fullName || 'Unknown';
  };

  const phases = [
    ...new Set(
      photos
        .map((p) => p.aiAnalysis?.phaseDetected)
        .filter((p): p is NonNullable<typeof p> => p != null),
    ),
  ];

  return (
    <div className="p-4 sm:p-6">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-900">Photo Gallery</h1>
            <p className="text-slate-500">Browse and filter all project photos</p>
          </div>
          <Button onClick={() => navigate('/upload')}>
            <UploadIcon className="mr-2 h-4 w-4" />
            Upload
          </Button>
        </div>
      </div>

      {/* Tabs and Filters — Phase B mobile rework: vertical stack <sm so each
          control gets a full-width row; revert to inline layout on tablet+. */}
      <Card className="mb-6">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <Tabs defaultValue="photos" className="w-full sm:w-auto">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="photos" className="flex-1 sm:flex-none">Photos</TabsTrigger>
                <TabsTrigger value="documents" className="flex-1 sm:flex-none">Documents</TabsTrigger>
                <TabsTrigger value="videos" className="flex-1 sm:flex-none">Videos</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search photos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 sm:w-64"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 flex-shrink-0 text-slate-400" />
                <select
                  value={filterZone}
                  onChange={(e) => setFilterZone(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none sm:flex-none"
                >
                  <option value="">All Zones</option>
                  {zones.map(zone => (
                    <option key={zone.id} value={zone.id}>{zone.name}</option>
                  ))}
                </select>

                <select
                  value={filterPhase}
                  onChange={(e) => setFilterPhase(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm capitalize focus:border-emerald-500 focus:outline-none sm:flex-none"
                >
                  <option value="">All Phases</option>
                  {phases.map(phase => (
                    <option key={phase} value={phase} className="capitalize">{phase}</option>
                  ))}
                </select>

                {/* Pending-AI toggle. When on, only photos whose AI analysis
                    is awaiting supervisor confirm/reject are shown — useful
                    for the manager triaging the review queue from the gallery. */}
                <button
                  type="button"
                  onClick={() => setPendingOnly((v) => !v)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    pendingOnly
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                  aria-pressed={pendingOnly}
                >
                  Pending AI only
                </button>

                {/* View-mode toggle. Same row as filters so it doesn't take a
                    third stacked row on phones. */}
                <div className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-slate-200 p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-label="Grid view"
                    className={`rounded p-1.5 ${viewMode === 'grid' ? 'bg-slate-100' : 'text-slate-500'}`}
                  >
                    <Grid className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                    className={`rounded p-1.5 ${viewMode === 'list' ? 'bg-slate-100' : 'text-slate-500'}`}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Photo Count */}
      <p className="mb-4 text-sm text-slate-500">
        Showing {filteredPhotos.length} of {photos.length} photos
      </p>

      {/* Photo Grid/List */}
      {viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredPhotos.map((photo) => (
            <Card
              key={photo.id}
              className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
              onClick={() => setSelectedPhoto(photo)}
            >
              <div className="relative aspect-video overflow-hidden">
                <img
                  src={photo.storageUrl}
                  alt={photo.filename}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between opacity-0 transition-opacity group-hover:opacity-100">
                  <Badge variant="default">
                    {photo.aiAnalysis?.phaseDetected || 'Unknown'}
                  </Badge>
                  <Eye className="h-5 w-5 text-white" />
                </div>
              </div>
              
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{getZoneName(photo.zoneId)}</p>
                    <p className="text-sm text-slate-500">{format(new Date(photo.uploadedAt), 'MMM d, h:mm a')}</p>
                  </div>
                  {photo.aiAnalysis && photo.aiAnalysis.analysisStatus === 'analysed' && (
                    <Badge variant="default">
                      {Math.round(photo.aiAnalysis.confidence * 100)}%
                    </Badge>
                  )}
                </div>

                {/* AI status pill + safety/quality flag chips. Cards become
                    glanceable: a manager scanning the gallery can spot
                    "Pending review" or a critical safety chip without opening
                    each photo. */}
                {photo.aiAnalysis && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_TONE[photo.aiAnalysis.analysisStatus]}`}>
                      {STATUS_LABEL[photo.aiAnalysis.analysisStatus]}
                    </span>
                    {photo.aiAnalysis.safetyFlags.map((flag) => (
                      <span
                        key={flag}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${SEVERITY_TONE[SAFETY_SEVERITY[flag]]}`}
                      >
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        {flag.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}

                {photo.notes && (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{photo.notes}</p>
                )}
                
                <div className="mt-3 flex items-center gap-2">
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={users.find(u => u.id === photo.uploadedBy)?.avatar} />
                    <AvatarFallback className="text-xs">
                      {getUserName(photo.uploadedBy).split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-slate-500">{getUserName(photo.uploadedBy)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <div className="divide-y divide-slate-100">
            {filteredPhotos.map((photo) => (
              <div
                key={photo.id}
                className="flex items-center gap-4 p-4 hover:bg-slate-50 cursor-pointer"
                onClick={() => setSelectedPhoto(photo)}
              >
                <img
                  src={photo.thumbnailUrl || photo.storageUrl}
                  alt={photo.filename}
                  className="h-16 w-24 rounded-lg object-cover"
                />
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{photo.filename}</p>
                  <p className="text-sm text-slate-500">{getZoneName(photo.zoneId)} • {format(new Date(photo.uploadedAt), 'MMM d, yyyy')}</p>
                </div>
                <div className="flex items-center gap-2">
                  {photo.aiAnalysis && (
                    <Badge variant="default">{photo.aiAnalysis.phaseDetected}</Badge>
                  )}
                  <Badge variant="secondary">{(photo.fileSizeKb / 1024).toFixed(1)} MB</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {filteredPhotos.length === 0 && (
        <Card className="py-12">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <Search className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900">No photos found</h3>
            <p className="text-slate-500">Try adjusting your filters or search query</p>
          </div>
        </Card>
      )}

      {/* Photo Lightbox */}
      {selectedPhoto && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div 
            className="relative max-h-full max-w-6xl overflow-auto rounded-xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 z-10"
            >
              <X className="h-6 w-6" />
            </button>
            
            <div className="grid lg:grid-cols-3">
              <div className="lg:col-span-2 bg-black">
                <img
                  src={selectedPhoto.storageUrl}
                  alt={selectedPhoto.filename}
                  className="h-full w-full object-contain"
                />
              </div>
              
              <div className="border-l border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900">Photo Details</h3>
                
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-sm text-slate-500">Zone</p>
                    <p className="font-medium text-slate-900">{getZoneName(selectedPhoto.zoneId)}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-slate-500">Uploaded</p>
                    <p className="font-medium text-slate-900">
                      {format(new Date(selectedPhoto.uploadedAt), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-slate-500">Uploaded By</p>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={users.find(u => u.id === selectedPhoto.uploadedBy)?.avatar} />
                        <AvatarFallback className="text-xs">
                          {getUserName(selectedPhoto.uploadedBy).split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-slate-900">{getUserName(selectedPhoto.uploadedBy)}</span>
                    </div>
                  </div>
                  
                  {selectedPhoto.gpsLat && selectedPhoto.gpsLng && (
                    <div>
                      <p className="text-sm text-slate-500">GPS Location</p>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-slate-400" />
                        <p className="font-medium text-slate-900">
                          {selectedPhoto.gpsLat.toFixed(4)}, {selectedPhoto.gpsLng.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {selectedPhoto.notes && (
                    <div>
                      <p className="text-sm text-slate-500">Notes</p>
                      <p className="font-medium text-slate-900">{selectedPhoto.notes}</p>
                    </div>
                  )}
                  
                  {selectedPhoto.aiAnalysis && (
                    <div className="rounded-lg bg-slate-50 p-4">
                      <h4 className="font-medium text-slate-900">AI Analysis</h4>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Phase</span>
                          <Badge variant="default" className="capitalize">{selectedPhoto.aiAnalysis.phaseDetected}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Completion</span>
                          <span className="font-medium">{selectedPhoto.aiAnalysis.completionPct}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Confidence</span>
                          <span className="font-medium">{Math.round(selectedPhoto.aiAnalysis.confidence * 100)}%</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Materials</span>
                          <p className="font-medium">{selectedPhoto.aiAnalysis.materials.join(', ')}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
