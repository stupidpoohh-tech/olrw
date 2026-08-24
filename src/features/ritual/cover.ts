/**
 * 사진을 표지 비율로 다듬는다.
 *
 * 5:7 로 가운데 잘라 320×448 JPEG 로 줄인다. **base64 를 행에 넣지 않는다** —
 * Storage 에 올리고 경로만 저장한다. (docs/PORTING-SPEC.md §7-3)
 */

const TARGET_W = 320;
const TARGET_H = 448;   // 5:7
const QUALITY = 0.82;
const MAX_BYTES = 8 * 1024 * 1024;

export async function toCoverJpeg(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있습니다.');
  if (file.size > MAX_BYTES) throw new Error('사진이 너무 큽니다. 8MB 이하로 올려 주세요.');

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('사진을 불러오지 못했습니다.');
  });

  try {
    const canvas = document.createElement('canvas');
    canvas.width = TARGET_W;
    canvas.height = TARGET_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('사진을 다듬지 못했습니다.');

    // cover 크롭: 짧은 쪽을 채우고 넘치는 쪽을 자른다
    const scale = Math.max(TARGET_W / bitmap.width, TARGET_H / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (TARGET_W - w) / 2, (TARGET_H - h) / 2, w, h);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('사진을 다듬지 못했습니다.'))),
        'image/jpeg',
        QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}
