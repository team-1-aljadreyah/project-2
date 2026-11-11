// Make a picture smaller ON THE DEVICE before it is sent: a camera photo is several MB, which is slow on a
// weak connection. The longest side becomes `max` pixels and it is saved as JPEG.
// Used by the delivery photo and the product photos.
export async function shrinkImage(file: File, max = 900, quality = 0.72): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d")!;
  // White under see-through PNGs (JPEG has no transparency, it would turn black).
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL("image/jpeg", quality);
}
