import { supabase } from './supabase';

/* 공지 사진 — 브라우저에서 줄여 올린다.
   canvas 로 다시 그리는 순간 EXIF(찍은 위치·기기)가 사라진다. 원본 파일명도 안 남는다(경로를 우리가 정한다).
   iOS 의 HEIC 는 canvas 가 못 읽어서 고르는 곳에서 accept 로 막았다. */

const BUCKET = 'notices';
export const MAX_PHOTOS = 3;

/** 긴 변이 maxSide 를 넘지 않게 줄여 JPEG 로 다시 그린다. */
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const src = await loadImage(file);
  const w0 = src.width, h0 = src.height;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('사진을 줄이지 못했어요.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);   // 투명 PNG 가 JPEG 에서 까맣게 되지 않게
  ctx.drawImage(src, 0, 0, w, h);
  if ('close' in src) src.close();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('사진을 줄이지 못했어요.')), 'image/jpeg', quality);
  });
}

/** createImageBitmap 이 먼저(EXIF 회전 반영), 안 되면 <img> 로 */
async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* 사파리 등 */ }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('사진을 읽지 못했어요.'));
      img.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

/** 최대 3장을 줄여 올리고 성공한 경로만 돌려준다. 한 장이 실패해도 나머지는 올라간다. */
export async function uploadNoticePhotos(academyId: string, noticeId: string, files: File[]): Promise<string[]> {
  const out: string[] = [];
  const list = files.slice(0, MAX_PHOTOS);
  for (let i = 0; i < list.length; i++) {
    const path = `${academyId}/${noticeId}/${i + 1}.jpg`;
    try {
      const blob = await shrinkImage(list[i]);
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (error) continue;
      out.push(path);
    } catch { /* 이 장만 건너뛴다 */ }
  }
  return out;
}

/** 비공개 버킷이라 볼 때마다 1시간짜리 서명 URL 을 받는다. 실패한 자리는 빈 문자열. */
export async function signedUrls(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error || !data) return paths.map(() => '');
  return paths.map((p, i) => data.find(d => d.path === p)?.signedUrl ?? data[i]?.signedUrl ?? '');
}

/** 공지를 지울 때 사진도 같이 지운다. */
export async function removeNoticePhotos(paths: string[]): Promise<void> {
  if (!paths.length) return;
  await supabase.storage.from(BUCKET).remove(paths);
}
