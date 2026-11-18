const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;

// Proofs are stored as "authenticated" assets: nobody can open the URL without a signed,
// short-lived link. Screenshots can show personal details, so they are not public.
// Reads CLOUDINARY_URL from the environment.
const FOLDER = "digital-heroes/proofs";
const LINK_LIFETIME_SECONDS = 300;

function uploadProof(buffer, winnerId) {
  const publicId = `${winnerId}-${crypto.randomBytes(6).toString("hex")}`;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: FOLDER, public_id: publicId, type: "authenticated", resource_type: "image", overwrite: false },
      (err, result) => (err ? reject(err) : resolve({ publicId: result.public_id }))
    );
    stream.end(buffer);
  });
}

function signedProofUrl(publicId) {
  return cloudinary.url(publicId, {
    type: "authenticated",
    resource_type: "image",
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + LINK_LIFETIME_SECONDS,
  });
}

module.exports = { uploadProof, signedProofUrl };
