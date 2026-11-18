const multer = require("multer");
const { AppError } = require("@dh/shared");
const { PROOF_MAX_BYTES } = require("../constants");

// The screenshot is held in memory, then checked and sent to private storage.
// Nothing is written to the local disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROOF_MAX_BYTES, files: 1 },
});

function singleProof(req, res, next) {
  upload.single("proof")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return next(new AppError("The screenshot must be 5 MB or smaller", 400));
    }
    return next(new AppError("Send one screenshot in the 'proof' field", 400));
  });
}

module.exports = { singleProof };
