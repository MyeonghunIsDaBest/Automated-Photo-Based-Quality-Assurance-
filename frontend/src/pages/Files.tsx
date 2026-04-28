import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useFeatureStore } from '../store/features';
import type { ProjectDocument as Document } from '../store/features';
import { Upload, File, Image, Video, Trash2, Download, Filter, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';

export default function Files() {
  const { documents, uploadDocument, deleteDocument } = useFeatureStore();
  const [activeTab, setActiveTab] = useState<'all' | 'document' | 'photo' | 'video'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    name: '',
    category: 'other' as Document['category'],
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      uploadDocument({
        projectId: 'project_1',
        name: file.name,
        type: file.type.startsWith('image/') ? 'photo' : file.type.startsWith('video/') ? 'video' : 'document',
        category: uploadForm.category,
        size: file.size,
        uploadedBy: 'user_1',
        url: URL.createObjectURL(file),
      });
    });
    setUploadOpen(false);
  }, [uploadDocument, uploadForm]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg'],
      'video/*': ['.mp4'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
  });

  const filteredDocuments = documents.filter((doc) => {
    if (activeTab !== 'all' && doc.type !== activeTab) return false;
    if (filterCategory && doc.category !== filterCategory) return false;
    if (searchQuery && !doc.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'document': return File;
      case 'photo': return Image;
      case 'video': return Video;
      default: return File;
    }
  };

  const getFileColor = (type: string) => {
    switch (type) {
      case 'document': return 'bg-red-100 text-red-600';
      case 'photo': return 'bg-blue-100 text-blue-600';
      case 'video': return 'bg-purple-100 text-purple-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const categories = [
    { value: 'contract', label: 'Contracts' },
    { value: 'permit', label: 'Permits' },
    { value: 'blueprint', label: 'Blueprints' },
    { value: 'invoice', label: 'Invoices' },
    { value: 'report', label: 'Reports' },
    { value: 'other', label: 'Other' },
  ];

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Files & Documents</h1>
            <p className="text-slate-500">Manage project files, photos, and videos</p>
          </div>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Upload
          </Button>
        </div>
      </div>

      {/* Upload Modal */}
      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Upload Files</h3>
              <button onClick={() => setUploadOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              {...getRootProps()}
              className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center ${
                isDragActive ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="mb-4 h-12 w-12 text-slate-400" />
              <p className="text-lg font-medium text-slate-900">
                {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
              </p>
              <p className="mt-2 text-sm text-slate-500">or click to select files</p>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Category</label>
              <select
                value={uploadForm.category}
                onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value as any })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 focus:border-emerald-500 focus:outline-none"
              >
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs and Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList>
                <TabsTrigger value="all">All Files</TabsTrigger>
                <TabsTrigger value="document">Documents</TabsTrigger>
                <TabsTrigger value="photo">Photos</TabsTrigger>
                <TabsTrigger value="video">Videos</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 pl-10"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-400" />
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File Count */}
      <p className="mb-4 text-sm text-slate-500">
        Showing {filteredDocuments.length} of {documents.length} files
      </p>

      {/* File Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredDocuments.map((doc) => {
          const Icon = getFileIcon(doc.type);
          const colorClass = getFileColor(doc.type);

          return (
            <Card key={doc.id} className="group overflow-hidden">
              <CardContent className="p-4">
                <div className="mb-3 flex items-start justify-between">
                  <div className={`rounded-lg p-3 ${colorClass}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteDocument(doc.id)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <h4 className="font-medium text-slate-900">{doc.name}</h4>
                <p className="mt-1 text-sm text-slate-500">{formatFileSize(doc.size)}</p>
                
                <div className="mt-3 flex items-center justify-between">
                  <Badge variant="secondary">{doc.category}</Badge>
                  <span className="text-xs text-slate-400">
                    {format(new Date(doc.uploadedAt), 'MMM d')}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredDocuments.length === 0 && (
        <Card className="py-12">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <File className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900">No files found</h3>
            <p className="text-slate-500">Upload your first file to get started</p>
          </div>
        </Card>
      )}
    </div>
  );
}
