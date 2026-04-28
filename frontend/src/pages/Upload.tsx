import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { useAppStore } from '../store';
import { Upload as UploadIcon, X, Image as ImageIcon, MapPin, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

export default function Upload() {
  const navigate = useNavigate();
  const { 
    zones, tasks, currentUser, project, 
    addPhoto, aiAnalysisResult, setAiAnalysisResult,
    updateTaskProgress, isUploading, uploadProgress 
  } = useAppStore();
  
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [selectedZone, setSelectedZone] = useState('');
  const [selectedTask, setSelectedTask] = useState('');
  const [notes, setNotes] = useState('');
  const [uploadComplete, setUploadComplete] = useState(false);

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
    },
    maxFiles: 20,
    maxSize: 10 * 1024 * 1024,
  });

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    setPreviews(newFiles.map(file => URL.createObjectURL(file)));
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    
    for (const file of files) {
      const photo = {
        id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        projectId: project.id,
        zoneId: selectedZone || undefined,
        taskId: selectedTask || undefined,
        uploadedBy: currentUser!.id,
        filename: file.name,
        storageUrl: URL.createObjectURL(file),
        thumbnailUrl: URL.createObjectURL(file),
        fileSizeKb: Math.round(file.size / 1024),
        width: 1920,
        height: 1080,
        takenAt: new Date().toISOString(),
        uploadedAt: new Date().toISOString(),
        notes: notes || undefined,
        aiAnalyzed: false,
      };
      
      await addPhoto(photo);
    }
    
    setUploadComplete(true);
  };

  const handleConfirmAI = () => {
    if (aiAnalysisResult && selectedTask) {
      updateTaskProgress(selectedTask, aiAnalysisResult.completionPct, 'ai_auto');
      setAiAnalysisResult(null);
      setUploadComplete(false);
      setFiles([]);
      setPreviews([]);
      setNotes('');
    }
  };

  const handleSkipAI = () => {
    setAiAnalysisResult(null);
    setUploadComplete(false);
    setFiles([]);
    setPreviews([]);
    setNotes('');
  };

  const filteredTasks = selectedZone 
    ? tasks.filter(t => t.zoneId === selectedZone)
    : tasks;

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Files & Documents</h1>
          <p className="text-slate-500">Manage project files, photos, and videos</p>
        </div>

        {/* AI Analysis Result */}
        {aiAnalysisResult && uploadComplete && (
          <Card className="mb-6 border-emerald-200 bg-emerald-50">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-emerald-100 p-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-emerald-900">AI Analysis Complete</h3>
                  <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-sm text-emerald-700">Detected Phase</p>
                      <p className="text-lg font-medium text-emerald-900 capitalize">{aiAnalysisResult.phaseDetected}</p>
                    </div>
                    <div>
                      <p className="text-sm text-emerald-700">Completion</p>
                      <p className="text-lg font-medium text-emerald-900">{aiAnalysisResult.completionPct}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-emerald-700">Confidence</p>
                      <p className="text-lg font-medium text-emerald-900">{(aiAnalysisResult.confidence * 100).toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-emerald-700">Materials</p>
                      <p className="text-sm font-medium text-emerald-900">{aiAnalysisResult.materials.slice(0, 2).join(', ')}</p>
                    </div>
                  </div>
                  
                  {aiAnalysisResult.safetyFlags.length > 0 && (
                    <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-100 p-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
                      <div>
                        <p className="font-medium text-amber-900">Safety Flags</p>
                        <ul className="list-disc pl-5 text-sm text-amber-800">
                          {aiAnalysisResult.safetyFlags.map((flag, i) => (
                            <li key={i}>{flag}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-4 flex gap-3">
                    <Button onClick={handleConfirmAI}>
                      Confirm & Update Gantt
                    </Button>
                    <Button variant="outline" onClick={handleSkipAI}>
                      Skip for Now
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
                    {isDragActive ? 'Drop photos here' : 'Drag & drop photos here'}
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    or click to browse (max 20 photos, 10MB each)
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Badge variant="secondary">JPG</Badge>
                    <Badge variant="secondary">PNG</Badge>
                    <Badge variant="secondary">WebP</Badge>
                    <Badge variant="secondary">HEIC</Badge>
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
                    {previews.map((preview, index) => (
                      <div key={index} className="group relative overflow-hidden rounded-lg border border-slate-200">
                        <img
                          src={preview}
                          alt={`Preview ${index + 1}`}
                          className="h-32 w-full object-cover"
                        />
                        <button
                          onClick={() => removeFile(index)}
                          className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <div className="p-2">
                          <p className="truncate text-xs text-slate-600">{files[index].name}</p>
                          <p className="text-xs text-slate-400">
                            {(files[index].size / 1024).toFixed(0)} KB
                          </p>
                        </div>
                      </div>
                    ))}
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
                        {zones.map((zone) => (
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
                        disabled={!selectedZone}
                      >
                        <option value="">Select task</option>
                        {filteredTasks.map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.name}
                          </option>
                        ))}
                      </select>
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

        {/* Upload Complete */}
        {uploadComplete && !aiAnalysisResult && (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="p-12 text-center">
              <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
              <h3 className="mt-4 text-xl font-semibold text-emerald-900">Upload Complete!</h3>
              <p className="mt-2 text-emerald-700">
                Your photos have been uploaded and analyzed.
              </p>
              <Button className="mt-6" onClick={() => navigate('/dashboard')}>
                Return to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
