import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import { canUploadPhotos } from '../lib/permissions';
import { Upload as UploadIcon, X, Image as ImageIcon, MapPin, CheckCircle2, Plus, Lock, ArrowUpRight, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { uploadPhoto } from '../lib/api/photos';
import { updateTaskProgress as apiUpdateTaskProgress } from '../lib/api/tasks';
import { supabaseConfigured } from '../lib/supabase';

// Reads natural width/height of an image OR video File without uploading
// it. Used so the photos table records actual dimensions instead of a
// hard-coded placeholder. Anything we can't parse falls back to 0×0,
// which the schema accepts (width/height default to 0).
async function readMediaDimensions(file: File): Promise<{ width: number; height: number }> {
  if (file.type.startsWith('video/')) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        const w = v.videoWidth  || 0;
        const h = v.videoHeight || 0;
        URL.revokeObjectURL(url);
        resolve({ width: w, height: h });
      };
      v.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ width: 0, height: 0 });
      };
      v.src = url;
    });
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth  || 0;
      const h = img.naturalHeight || 0;
      URL.revokeObjectURL(url);
      resolve({ width: w, height: h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

export default function Upload() {
  const navigate = useNavigate();
  const {
    zones, tasks, currentUser, project,
    addPhoto, isUploading, uploadProgress,
  } = useAppStore();
  // updateTaskProgress goes straight to the source-of-truth feature store so
  // a manual % bump after upload lands without a round-trip through legacy.
  const updateTaskProgress = useFeatureStore((s) => s.updateTaskProgress);

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [selectedZone, setSelectedZone] = useState('');
  const [selectedTask, setSelectedTask] = useState('');
  const [notes, setNotes] = useState('');
  const [uploadComplete, setUploadComplete] = useState(false);
  const [progressDraft, setProgressDraft] = useState(0);

  const canUpload = canUploadPhotos(currentUser);

  // Scope zone/task pickers to the active project so a user can't accidentally
  // attach photos to another project's work.
  const projectZones = useMemo(
    () => zones.filter((z) => z.projectId === project.id),
    [zones, project.id]
  );
  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === project.id),
    [tasks, project.id]
  );
  const taskRecord = useMemo(
    () => projectTasks.find((t) => t.id === selectedTask) ?? null,
    [projectTasks, selectedTask]
  );

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = [...files, ...acceptedFiles].slice(0, 20);
    setFiles(newFiles);
    
    const newPreviews = newFiles.map(file => URL.createObjectURL(file));
    setPreviews(newPreviews);
  }, [files]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.heic'],
      'video/mp4':       ['.mp4'],
      'video/quicktime': ['.mov'],
    },
    maxFiles: 20,
    // 50 MB ceiling so a short site walkthrough video fits. Photos are
    // typically 2-5 MB so this doesn't affect the image path. Anything
    // beyond this should go through Files (project documents) once that
    // page is wired to Storage.
    maxSize: 50 * 1024 * 1024,
  });

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    setPreviews(newFiles.map(file => URL.createObjectURL(file)));
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;

    for (const file of files) {
      const dims = await readMediaDimensions(file);

      // Default to a local-only photo record. When Supabase is configured we
      // upload to Storage first and prefer the returned id + storage path so
      // the photo is durable across reloads.
      let photo = {
        id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        projectId: project.id,
        zoneId: selectedZone || undefined,
        taskId: selectedTask || undefined,
        uploadedBy: currentUser!.id,
        filename: file.name,
        storageUrl: URL.createObjectURL(file),
        thumbnailUrl: URL.createObjectURL(file),
        fileSizeKb: Math.round(file.size / 1024),
        width: dims.width,
        height: dims.height,
        takenAt: new Date().toISOString(),
        uploadedAt: new Date().toISOString(),
        notes: notes || undefined,
        aiAnalyzed: false,
      };

      if (supabaseConfigured()) {
        try {
          const row = await uploadPhoto({
            file,
            projectId: project.id,
            taskId: selectedTask || undefined,
            zoneId: selectedZone || undefined,
            notes: notes || undefined,
          });
          photo = {
            ...photo,
            id: row.id,
            // Display URL stays as the local blob (private bucket needs a
            // signed URL to render — gallery resolves that on read).
            uploadedAt: row.uploaded_at,
            fileSizeKb: row.file_size_kb,
          };
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[upload] photo upload failed:', e);
          // Surface the error in the toast slot but keep the local row so
          // the user doesn't lose their work.
          useAppStore.setState({
            notification: {
              type: 'error',
              message: e instanceof Error ? e.message : 'Photo upload failed.',
            },
          });
        }
      }

      await addPhoto(photo);
    }

    setProgressDraft(taskRecord ? taskRecord.percentComplete : 0);
    setUploadComplete(true);
  };

  const resetForm = () => {
    setUploadComplete(false);
    setFiles([]);
    setPreviews([]);
    setNotes('');
    setSelectedTask('');
    setSelectedZone('');
    setProgressDraft(0);
  };

  const handleApplyProgress = async () => {
    if (selectedTask) {
      // Persist remotely first (realtime echoes back into local state); fall
      // back to the local mutator so the bar still moves when offline.
      if (supabaseConfigured()) {
        try {
          await apiUpdateTaskProgress(selectedTask, progressDraft);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[upload] task progress update failed:', e);
        }
      }
      updateTaskProgress(selectedTask, progressDraft, 'manual');
    }
    resetForm();
  };

  const filteredTasks = selectedZone
    ? projectTasks.filter((t) => t.zoneId === selectedZone)
    : projectTasks;

  if (!canUpload) {
    return (
      <div className="min-h-full bg-[#FAFAF7] p-6">
        <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center">
          <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-slate-100/70 blur-3xl" />
            <div className="relative">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <Lock className="h-6 w-6" />
              </div>
              <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
                Read-only access
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: '-0.02em' }}>
                Uploading is restricted to your project team.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-500">
                Your account has visitor-level access. You can browse the gallery, walk through the
                Gantt, and leave notes on charts — but adding new photos, videos, or documents is
                reserved for the internal team.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => navigate('/gallery')}
                  className="group flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-700/20"
                >
                  Browse the gallery
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </button>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:border-slate-300 hover:text-slate-900"
                >
                  Back to dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Upload Photos</h1>
          <p className="text-slate-500">Add site progress photos for AI analysis</p>
        </div>

        {/* Post-upload progress step — manual until the AI pipeline lands.
            Asks the user to confirm where the task now stands so the Gantt
            visibly advances after every site walk. */}
        {uploadComplete && taskRecord && (
          <Card className="mb-6 border-emerald-200 bg-emerald-50">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-emerald-100 p-3">
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-emerald-900">
                    Update Gantt progress
                  </h3>
                  <p className="mt-1 text-sm text-emerald-800">
                    {files.length} photo{files.length === 1 ? '' : 's'} uploaded for{' '}
                    <span className="font-medium">{taskRecord.name}</span>. Set the new
                    completion % so the schedule reflects what's on the ground.
                  </p>

                  <div className="mt-5 rounded-lg bg-white/70 p-4">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-emerald-800">
                        Was: <span className="font-medium">{taskRecord.percentComplete}%</span>
                      </span>
                      <span className="text-emerald-900">
                        Now: <span className="text-2xl font-semibold tabular-nums">{progressDraft}%</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={progressDraft}
                      onChange={(e) => setProgressDraft(Number(e.target.value))}
                      className="w-full accent-emerald-600"
                    />
                  </div>

                  <div className="mt-4 flex gap-3">
                    <Button onClick={handleApplyProgress}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Apply &amp; update Gantt
                    </Button>
                    <Button variant="outline" onClick={resetForm}>
                      Skip for now
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!uploadComplete && (
          <>
            {/* Upload Zone */}
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Upload Photos</CardTitle>
                    <CardDescription>Drag and drop photos or click to browse</CardDescription>
                  </div>
                  <Button onClick={() => (document.querySelector('input[type="file"]') as HTMLInputElement)?.click()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Files
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div
                  {...getRootProps()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
                    isDragActive
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <input {...getInputProps()} />
                  <div className="mb-4 rounded-full bg-slate-100 p-4">
                    <UploadIcon className="h-8 w-8 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900">
                    {isDragActive ? 'Drop files here' : 'Drag & drop photos or video here'}
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    or click to browse (max 20 files, 50MB each)
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Badge variant="secondary">JPG</Badge>
                    <Badge variant="secondary">PNG</Badge>
                    <Badge variant="secondary">WebP</Badge>
                    <Badge variant="secondary">HEIC</Badge>
                    <Badge variant="secondary">MP4</Badge>
                    <Badge variant="secondary">MOV</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* File Previews */}
            {files.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Selected Files ({files.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {previews.map((preview, index) => {
                      const isVideo = files[index]?.type.startsWith('video/');
                      return (
                        <div key={index} className="group relative overflow-hidden rounded-lg border border-slate-200">
                          {isVideo ? (
                            <video
                              src={preview}
                              className="h-32 w-full bg-slate-900 object-cover"
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : (
                            <img
                              src={preview}
                              alt={`Preview ${index + 1}`}
                              className="h-32 w-full object-cover"
                            />
                          )}
                          <button
                            onClick={() => removeFile(index)}
                            className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          {isVideo && (
                            <span className="absolute bottom-12 left-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
                              Video
                            </span>
                          )}
                          <div className="p-2">
                            <p className="truncate text-xs text-slate-600">{files[index].name}</p>
                            <p className="text-xs text-slate-400">
                              {(files[index].size / 1024 / 1024).toFixed(1)} MB
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Form Fields */}
            {files.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Photo Details</CardTitle>
                  <CardDescription>Add zone, task, and notes for your photos</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Zone / Area
                      </label>
                      <select
                        value={selectedZone}
                        onChange={(e) => {
                          setSelectedZone(e.target.value);
                          setSelectedTask('');
                        }}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="">Select zone</option>
                        {projectZones.map((zone) => (
                          <option key={zone.id} value={zone.id}>
                            {zone.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Related Task
                      </label>
                      <select
                        value={selectedTask}
                        onChange={(e) => setSelectedTask(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="">Select task</option>
                        {filteredTasks.map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.name}
                          </option>
                        ))}
                      </select>
                      {projectTasks.length === 0 && (
                        <p className="mt-1.5 text-xs text-amber-600">
                          No tasks yet for this project. Create one on the Gantt page first.
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Notes (optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="Add any additional notes about these photos..."
                    />
                  </div>
                  
                  <div className="mt-4 rounded-lg bg-slate-50 p-4">
                    <h4 className="mb-2 text-sm font-medium text-slate-700">Auto-Captured Information</h4>
                    <div className="grid gap-2 text-sm sm:grid-cols-3">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-slate-400" />
                        <span className="text-slate-600">{files.length} photos</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-slate-400" />
                        <span className="text-slate-600">GPS: Will be captured</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-slate-400" />
                        <span className="text-slate-600">{format(new Date(), 'MMM d, h:mm a')}</span>
                      </div>
                    </div>
                  </div>
                  
                  {isUploading && (
                    <div className="mt-4">
                      <div className="mb-2 flex justify-between text-sm">
                        <span className="text-slate-600">Processing with AI...</span>
                        <span className="text-slate-600">{uploadProgress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200">
                        <div
                          className="h-2 rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-6 flex justify-end gap-3">
                    <Button variant="outline" onClick={() => navigate('/dashboard')}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={isUploading || files.length === 0}
                    >
                      {isUploading ? 'Processing...' : 'Upload & Analyze'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Upload Complete — only when there's no task to bump (taskless upload). */}
        {uploadComplete && !taskRecord && (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="p-12 text-center">
              <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
              <h3 className="mt-4 text-xl font-semibold text-emerald-900">Upload complete.</h3>
              <p className="mt-2 text-emerald-700">
                Photos are filed under this project. Attach them to a task next time
                to advance the Gantt automatically.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Button onClick={() => navigate('/gantt')}>
                  View Gantt
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Upload more
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
