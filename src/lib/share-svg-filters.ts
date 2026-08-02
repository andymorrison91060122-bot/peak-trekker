const GRAYSCALE_FILTER_ID = 'share-photo-grayscale'
const GRAYSCALE_FILTER_DEFINITION = `<defs><filter id="${GRAYSCALE_FILTER_ID}"><feColorMatrix type="saturate" values="0"/></filter></defs>`

export function applyPhotoGrayscaleSvgFilter(svg: string, photoDataUrl: string) {
  if (!photoDataUrl.startsWith('data:image/') || /["<>]/.test(photoDataUrl)) {
    throw new Error('Invalid grayscale photo data URL')
  }

  const href = `href="${photoDataUrl}"`
  const hrefIndex = svg.indexOf(href)
  const imageStart = svg.lastIndexOf('<image', hrefIndex)
  const imageEnd = svg.indexOf('>', hrefIndex)
  if (hrefIndex < 0 || imageStart < 0 || imageEnd < 0) {
    throw new Error('Grayscale photo image was not found in rendered SVG')
  }

  const rootEnd = svg.indexOf('>')
  if (!svg.startsWith('<svg') || rootEnd < 0 || rootEnd >= imageStart) {
    throw new Error('Rendered share SVG is invalid')
  }

  const imageTag = svg.slice(imageStart, imageEnd + 1)
  const filteredImageTag = imageTag.replace(
    '<image',
    `<image filter="url(#${GRAYSCALE_FILTER_ID})"`,
  )
  const withFilteredPhoto = `${svg.slice(0, imageStart)}${filteredImageTag}${svg.slice(imageEnd + 1)}`
  return `${withFilteredPhoto.slice(0, rootEnd + 1)}${GRAYSCALE_FILTER_DEFINITION}${withFilteredPhoto.slice(rootEnd + 1)}`
}
