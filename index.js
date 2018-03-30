require = require("esm")(module/*, options*/);
module.exports.localStorage = require('./src/multer/local_storage').default;
module.exports.localBlobStore = require('./src/local_blob_store').default;

module.exports.minioStorage = require('./src/multer/minio_storage').default;
module.exports.minioBlobStore = require('./src/minio_blob_store').default;
module.exports.serveMinio = require('./src/express/serve_minio').default;

module.exports.s3Storage = require('./src/multer/s3_storage').default;
module.exports.s3BlobStore = require('./src/s3_blob_store').default;
