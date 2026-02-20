/**
 * Convert screen (drop/touch) coordinates into PDF-local coordinates.
 *
 * @param {number} screenX - Absolute X position on screen (e.g. dropX)
 * @param {number} screenY - Absolute Y position on screen (e.g. dropY)
 * @param {{ x: number, y: number }} pdfLayout - On-screen position of the PDF container
 * @param {number} translateX - Current horizontal pan (shared value)
 * @param {number} translateY - Current vertical pan (shared value)
 * @param {number} scale - Current zoom scale (shared value)
 * @returns {{ x: number, y: number }} - Pin's internal coordinates relative to untransformed PDF
 */
export function screenToPdfCoords(screenX, screenY, pdfLayout, translateX, translateY, scale) {
  const localX = (screenX - pdfLayout.x - translateX) / scale;
  const localY = (screenY - pdfLayout.y - translateY) / scale;
  return { x: localX, y: localY };
}

/**
 * Convert PDF-local coordinates back into on-screen coordinates.
 * Useful for rendering pins after panning and zooming.
 *
 * @param {number} pdfX - X position in PDF coordinate space
 * @param {number} pdfY - Y position in PDF coordinate space
 * @param {{ x: number, y: number }} pdfLayout - On-screen position of the PDF container
 * @param {number} translateX - Current horizontal pan (shared value)
 * @param {number} translateY - Current vertical pan (shared value)
 * @param {number} scale - Current zoom scale (shared value)
 * @returns {{ x: number, y: number }} - Screen X and Y for display
 */
export function pdfToScreenCoords(x, y, pdfLayout, translateX, translateY, scale) {
  

  const centeredX = x * scale + translateX + pdfLayout.x;
  const centeredY = y * scale + translateY + pdfLayout.y;

  return { x: centeredX, y: centeredY };
}
