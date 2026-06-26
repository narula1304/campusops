// client/src/utils/uploadToCloudinary.js
//
// Uploads a single File object directly to Cloudinary using their
// unsigned upload API. No backend involvement — file goes straight
// from the browser to Cloudinary.
//
// Returns the secure_url string of the uploaded asset.

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

if (!CLOUD_NAME || !UPLOAD_PRESET) {
    console.error(
        '[Cloudinary] Missing VITE_CLOUDINARY_CLOUD_NAME or ' +
        'VITE_CLOUDINARY_UPLOAD_PRESET in client/.env'
    )
}

/**
 * Upload a single File to Cloudinary.
 *
 * @param {File}     file       — the File object from an <input type="file">
 * @param {Function} onProgress — optional callback(percent: number)
 * @returns {Promise<string>}   — resolves to the secure_url of the uploaded asset
 */
export async function uploadToCloudinary(file, onProgress) {
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`

    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', UPLOAD_PRESET)
    formData.append('folder', 'campusops')

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        // Progress tracking — useful for large images
        if (onProgress) {
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    onProgress(Math.round((e.loaded / e.total) * 100))
                }
            })
        }

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const data = JSON.parse(xhr.responseText)
                resolve(data.secure_url)
            } else {
                try {
                    const err = JSON.parse(xhr.responseText)
                    reject(new Error(err?.error?.message ?? `Upload failed (${xhr.status})`))
                } catch {
                    reject(new Error(`Upload failed (${xhr.status})`))
                }
            }
        })

        xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))

        xhr.open('POST', url)
        xhr.send(formData)
    })
}