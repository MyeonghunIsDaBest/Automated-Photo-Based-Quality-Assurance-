import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { Search, Filter, MapPin, Eye, X, Grid, List, Upload as UploadIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Photo } from '../types';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import NotAuthorized from '../components/NotAuthorized';
import { canViewGallery } from '../lib/permissions';

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

  const filteredPhotos = photos.filter(photo => {
    if (filterZone && photo.zoneId !== filterZone) return false;
    if (filterPhase && photo.aiAnalysis?.phaseDetected !== filterPhase) return false;
    if (searchQuery && !photo.filename.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getZoneName = (zoneId?: string) => {
    return zones.find(z => z.id === zoneId)?.name || 'Unknown';
  };

  const getUserName = (userId: string) => {
    return users.find(u => u.id === userId)?.fullName || 'Unknown';
  };

  const phases = [...new Set(photos.map(p => p.aiAnalysis?.phaseDetected).filter(Boolean))];

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

      {/* Tabs and Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Tabs defaultValue="photos" className="w-auto">
              <TabsList>
                <TabsTrigger value="photos">Photos</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="videos">Videos</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="relative w-full sm:w-auto">
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
                <Filter className="h-4 w-4 text-slate-400" />
                <select
                  value={filterZone}
                  onChange={(e) => setFilterZone(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">All Zones</option>
                  {zones.map(zone => (
                    <option key={zone.id} value={zone.id}>{zone.name}</option>
                  ))}
                </select>
                
                <select
                  value={filterPhase}
                  onChange={(e) => setFilterPhase(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">All Phases</option>
                  {phases.map(phase => (
                    <option key={phase} value={phase} className="capitalize">{phase}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`rounded p-1.5 ${viewMode === 'grid' ? 'bg-slate-100' : 'text-slate-500'}`}
                >
                  <Grid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`rounded p-1.5 ${viewMode === 'list' ? 'bg-slate-100' : 'text-slate-500'}`}
                >
                  <List className="h-4 w-4" />
                </button>
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
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{getZoneName(photo.zoneId)}</p>
                    <p className="text-sm text-slate-500">{format(new Date(photo.uploadedAt), 'MMM d, h:mm a')}</p>
                  </div>
                  {photo.aiAnalysis && (
                    <Badge variant="default">
                      {Math.round(photo.aiAnalysis.confidence * 100)}%
                    </Badge>
                  )}
                </div>
                
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
