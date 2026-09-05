import { supabase } from './supabase';

/** 파일을 가운데 정사각으로 잘라 size×size PNG 로 줄인다(학원 로고는 정사각으로 통일). */
export function shrinkSquarePng(file: File, size = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('이 기기에서는 이미지를 줄일 수 없어요')); return; }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('이미지를 만들지 못했어요')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 열지 못했어요. 다른 사진으로 시도해 주세요')); };
    img.src = url;
  });
}

/** 학원 로고를 정사각으로 줄여 logos 버킷 `<academyId>/logo.png` 에 올린다(같은 이름을 덮어쓴다). 반환값은 저장 경로. */
export async function uploadLogo(academyId: string, file: File): Promise<string> {
  const blob = await shrinkSquarePng(file, 512);
  const path = `${academyId}/logo.png`;
  const { error } = await supabase.storage.from('logos').upload(path, blob, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

/** 가로 로고(워드마크)를 비율 그대로 maxW×maxH 안에 들어가게 줄인 PNG. 투명 배경은 남기고, 작은 그림은 키우지 않는다. */
export function shrinkWordmarkPng(file: File, maxH = 120, maxW = 640): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, maxW / img.width, maxH / img.height);   // 1 을 넘기지 않아 절대 키우지 않는다
      const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('이 기기에서는 이미지를 줄일 수 없어요')); return; }
      ctx.drawImage(img, 0, 0, w, h);   // 빈 캔버스에 그리므로 PNG 의 투명 부분은 그대로 투명
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('이미지를 만들지 못했어요')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 열지 못했어요. 다른 사진으로 시도해 주세요')); };
    img.src = url;
  });
}

/** 가로 로고를 logos 버킷 `<academyId>/wordmark.png`(dark 면 `wordmark-dark.png`) 에 올린다(덮어쓴다). 반환값은 저장 경로. 지우기는 removeLogo 그대로. */
export async function uploadWordmark(academyId: string, file: File, dark: boolean): Promise<string> {
  const blob = await shrinkWordmarkPng(file);
  const path = `${academyId}/${dark ? 'wordmark-dark' : 'wordmark'}.png`;
  const { error } = await supabase.storage.from('logos').upload(path, blob, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

/** 저장 경로 → 공개 URL. v 를 주면 `?v=` 를 붙여 캐시를 깬다(같은 경로에 새 파일을 올렸을 때). path 가 없으면 null. */
export function logoUrl(path: string | null, v?: string | number): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from('logos').getPublicUrl(path);
  return v === undefined ? data.publicUrl : `${data.publicUrl}?v=${v}`;
}

export async function removeLogo(path: string) {
  const { error } = await supabase.storage.from('logos').remove([path]);
  if (error) throw new Error(error.message);
}
