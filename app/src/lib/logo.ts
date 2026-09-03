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
