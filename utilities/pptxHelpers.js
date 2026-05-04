import JSZip from 'jszip'

export async function sanitizePptxMediaForOCR(pptxBuffer) {
  if (!Buffer.isBuffer(pptxBuffer) || pptxBuffer.length === 0) {
    return pptxBuffer
  }
  try {
    const zip = await JSZip.loadAsync(pptxBuffer)
    const mediaFiles = Object.keys(zip.files).filter((fileName) =>
      fileName.startsWith('ppt/media/'),
    )
    if (mediaFiles.length === 0) {
      return pptxBuffer
    }
    for (const mediaFile of mediaFiles) {
      zip.remove(mediaFile)
    }
    return zip.generateAsync({ type: 'nodebuffer' })
  } catch (e) {
    return pptxBuffer
  }
}
