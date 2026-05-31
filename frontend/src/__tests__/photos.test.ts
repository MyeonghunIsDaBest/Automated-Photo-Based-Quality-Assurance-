import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks --------------------------------------------------------------
//
// uploadPhoto (in ../lib/api/photos) does, in order:
//   1. supabaseConfigured()           -> must be true
//   2. isUuid(projectId)              -> projectId must look like a UUID
//   3. supabase.storage.from().upload()
//   4. supabase.from('photos').insert().select('*').single()
//   5. void requestAnalysis(photo.id)  <-- the wiring under test
//   6. (optional) supabase.rpc('increment_photo_count', …) when taskId set
//
// We stub the Supabase client so the insert path is reached and returns a
// row with a known id, then assert requestAnalysis was fired with that id.

const insertedRow = {
  id: 'photo-xyz',
  project_id: '11111111-1111-4111-8111-111111111111',
  task_id: null,
  zone_id: null,
  uploaded_by: null,
  filename: 'site.jpg',
  storage_path: '11111111-1111-4111-8111-111111111111/photo-xyz.jpg',
  thumbnail_path: null,
  file_size_kb: 1,
  width: 0,
  height: 0,
  taken_at: null,
  uploaded_at: '2026-06-01T00:00:00Z',
  gps_lat: null,
  gps_lng: null,
  notes: null,
  ai_analyzed: false,
};

const singleMock = vi.fn(async () => ({ data: insertedRow, error: null }));
const selectMock = vi.fn(() => ({ single: singleMock }));
const insertMock = vi.fn(() => ({ select: selectMock }));
const fromMock = vi.fn(() => ({ insert: insertMock }));
const uploadMock = vi.fn(async () => ({ data: { path: 'x' }, error: null }));
const storageFromMock = vi.fn(() => ({ upload: uploadMock }));
const rpcMock = vi.fn(() => ({ then: (onOk: () => void) => { onOk(); } }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => fromMock(),
    storage: { from: () => storageFromMock() },
    rpc: () => rpcMock(),
  },
  supabaseConfigured: () => true,
}));

// Spy on the auto-analyse trigger. Partial mock keeps the rest of the
// module intact (matches the pattern in photoReviewDrawer.test.tsx).
const requestAnalysisSpy = vi.fn(async (_photoId: string) => undefined);
vi.mock('../lib/api/aiAnalyses', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/aiAnalyses')>();
  return {
    ...actual,
    requestAnalysis: (photoId: string) => requestAnalysisSpy(photoId),
  };
});

import { uploadPhoto } from '../lib/api/photos';

function makeFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'site.jpg', { type: 'image/jpeg' });
}

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

describe('uploadPhoto auto-analyse wiring', () => {
  beforeEach(() => {
    requestAnalysisSpy.mockClear();
    singleMock.mockClear();
    insertMock.mockClear();
    uploadMock.mockClear();
  });

  it('fires requestAnalysis once with the new photo id after a successful insert', async () => {
    const row = await uploadPhoto({ file: makeFile(), projectId: PROJECT_ID });

    // The insert path was actually reached and returned our stub row.
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(row.id).toBe('photo-xyz');

    // The fix: the auto-analyse trigger fired with the inserted row's id.
    expect(requestAnalysisSpy).toHaveBeenCalledTimes(1);
    expect(requestAnalysisSpy).toHaveBeenCalledWith('photo-xyz');
  });

  it('does not let the photo id come from crypto.randomUUID — it uses the returned row id', async () => {
    await uploadPhoto({ file: makeFile(), projectId: PROJECT_ID });
    // Whatever crypto generated for the storage path, the analyse call must
    // use the id on the persisted row (photo.id), not a re-derived value.
    expect(requestAnalysisSpy).toHaveBeenCalledWith(insertedRow.id);
  });

  it('still returns the uploaded row even if requestAnalysis rejects (fire-and-forget)', async () => {
    requestAnalysisSpy.mockRejectedValueOnce(new Error('analyze-photo down'));
    const row = await uploadPhoto({ file: makeFile(), projectId: PROJECT_ID });
    expect(row.id).toBe('photo-xyz');
    // The rejection is swallowed by the .catch in uploadPhoto, so the await
    // above resolves normally.
  });
});
