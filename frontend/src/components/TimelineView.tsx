import { Photo } from '../types';
import { TimelineFeed } from './TimelineFeed';
import { Camera, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Skeleton } from './ui/skeleton';
import { Separator } from './ui/separator';

interface TimelineViewProps {
  photos: Photo[];
  isLoading?: boolean;
}

export function TimelineView({ photos, isLoading = false }: TimelineViewProps) {
  const sortedPhotos = [...photos].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const stats = {
    totalPhotos: photos.length,
    uniqueTasks: new Set(photos.map((p) => p.taskId)).size,
    mostRecent: sortedPhotos[0],
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Photo Timeline</h2>
        <p className="text-muted-foreground">Visual proof of daily progress work</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Photos</CardTitle>
            <Camera className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-7 w-16" /> : <div className="text-2xl font-bold">{stats.totalPhotos}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasks Tracked</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-7 w-16" /> : <div className="text-2xl font-bold">{stats.uniqueTasks}</div>}
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Latest Upload</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-semibold tracking-wide uppercase mb-1">
                  Latest Activity
                </p>
                {isLoading ? (
                  <Skeleton className="h-5 w-40" />
                ) : (
                  stats.mostRecent && <p className="text-base font-semibold">{stats.mostRecent.taskName}</p>
                )}
              </div>
              {!isLoading && stats.mostRecent && (
                <Avatar className="h-12 w-12 border">
                  <AvatarImage src={stats.mostRecent.imageUrl} alt="" />
                  <AvatarFallback>
                    <Camera className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div>
        <h3 className="text-xl font-semibold mb-4">Chronological Feed</h3>
        <TimelineFeed photos={photos} isLoading={isLoading} />
      </div>
    </div>
  );
}
