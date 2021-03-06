const crypto = require('crypto');
const stream = require('stream');
const fileType = require('file-type');
const parallel = require('run-parallel');

function staticValue (value) {
  return function (req, file, cb) {
    cb(null, value);
  };
}

var defaultAcl = staticValue('private');
var defaultContentType = staticValue('application/octet-stream');

var defaultMetadata = staticValue(null);
var defaultCacheControl = staticValue(null);
var defaultContentDisposition = staticValue(null);
var defaultStorageClass = staticValue('STANDARD');
var defaultSSE = staticValue(null);
var defaultSSEKMS = staticValue(null);

function defaultKey (req, file, cb) {
  crypto.randomBytes(16, function (err, raw) {
    cb(err, err? undefined : raw.toString('hex'));
  });
}

function collect (storage, req, file, cb) {
  parallel([
    storage.getBucket.bind(storage, req, file),
    storage.getKey.bind(storage, req, file),
    storage.getAcl.bind(storage, req, file),
    storage.getMetadata.bind(storage, req, file),
    storage.getCacheControl.bind(storage, req, file),
    storage.getContentDisposition.bind(storage, req, file),
    storage.getStorageClass.bind(storage, req, file),
    storage.getSSE.bind(storage, req, file),
    storage.getSSEKMS.bind(storage, req, file)
  ], function (err, values) {
    if (err) return cb(err);

    storage.getContentType(req, file, function (err, contentType, replacementStream) {
      if (err) return cb(err);

      cb.call(storage, null, {
        bucket: values[0],
        key: values[1],
        acl: values[2],
        metadata: values[3],
        cacheControl: values[4],
        contentDisposition: values[5],
        storageClass: values[6],
        contentType: contentType,
        replacementStream: replacementStream,
        serverSideEncryption: values[7],
        sseKmsKeyId: values[8]
      });
    });
  });
}

class S3Storage {
  constructor (opts) {
    switch (typeof opts.s3) {
      case 'object': this.s3 = opts.s3; break;
      default: throw new TypeError('Expected opts.s3 to be object');
    }

    switch (typeof opts.bucket) {
      case 'function': this.getBucket = opts.bucket; break;
      case 'string': this.getBucket = staticValue(opts.bucket); break;
      case 'undefined': throw new Error('bucket is required');
      default: throw new TypeError('Expected opts.bucket to be undefined, string or function');
    }

    switch (typeof opts.key) {
      case 'function': this.getKey = opts.key; break;
      case 'undefined': this.getKey = defaultKey; break;
      default: throw new TypeError('Expected opts.key to be undefined or function');
    }

    switch (typeof opts.acl) {
      case 'function': this.getAcl = opts.acl; break;
      case 'string': this.getAcl = staticValue(opts.acl); break;
      case 'undefined': this.getAcl = defaultAcl; break;
      default: throw new TypeError('Expected opts.acl to be undefined, string or function');
    }

    switch (typeof opts.contentType) {
      case 'function': this.getContentType = opts.contentType; break;
      case 'undefined': this.getContentType = defaultContentType; break;
      default: throw new TypeError('Expected opts.contentType to be undefined or function');
    }

    switch (typeof opts.metadata) {
      case 'function': this.getMetadata = opts.metadata; break;
      case 'undefined': this.getMetadata = defaultMetadata; break;
      default: throw new TypeError('Expected opts.metadata to be undefined or function');
    }

    switch (typeof opts.cacheControl) {
      case 'function': this.getCacheControl = opts.cacheControl; break;
      case 'string': this.getCacheControl = staticValue(opts.cacheControl); break;
      case 'undefined': this.getCacheControl = defaultCacheControl; break;
      default: throw new TypeError('Expected opts.cacheControl to be undefined, string or function');
    }

    switch (typeof opts.contentDisposition) {
      case 'function': this.getContentDisposition = opts.contentDisposition; break;
      case 'string': this.getContentDisposition = staticValue(opts.contentDisposition); break;
      case 'undefined': this.getContentDisposition = defaultContentDisposition; break;
      default: throw new TypeError('Expected opts.contentDisposition to be undefined, string or function');
    }

    switch (typeof opts.storageClass) {
      case 'function': this.getStorageClass = opts.storageClass; break;
      case 'string': this.getStorageClass = staticValue(opts.storageClass); break;
      case 'undefined': this.getStorageClass = defaultStorageClass; break;
      default: throw new TypeError('Expected opts.storageClass to be undefined, string or function');
    }

    switch (typeof opts.serverSideEncryption) {
      case 'function': this.getSSE = opts.serverSideEncryption; break;
      case 'string': this.getSSE = staticValue(opts.serverSideEncryption); break;
      case 'undefined': this.getSSE = defaultSSE; break;
      default: throw new TypeError('Expected opts.serverSideEncryption to be undefined, string or function');
    }

    switch (typeof opts.sseKmsKeyId) {
      case 'function': this.getSSEKMS = opts.sseKmsKeyId; break;
      case 'string': this.getSSEKMS = staticValue(opts.sseKmsKeyId); break;
      case 'undefined': this.getSSEKMS = defaultSSEKMS; break;
      default: throw new TypeError('Expected opts.sseKmsKeyId to be undefined, string, or function');
    }
  }

  _handleFile (req, file, cb) {
    collect(this, req, file, function (err, opts) {
      if (err) return cb(err);

      var currentSize = 0;

      var params = {
        Bucket: opts.bucket,
        Key: opts.key,
        ACL: opts.acl,
        CacheControl: opts.cacheControl,
        ContentType: opts.contentType,
        Metadata: opts.metadata,
        StorageClass: opts.storageClass,
        ServerSideEncryption: opts.serverSideEncryption,
        SSEKMSKeyId: opts.sseKmsKeyId,
        Body: (opts.replacementStream || file.stream)
      };

      if (opts.contentDisposition) {
        params.ContentDisposition = opts.contentDisposition;
      }

      var upload = this.s3.upload(params);

      upload.on('httpUploadProgress', function (ev) {
        if (ev.total) currentSize = ev.total;
      });

      upload.send(function (err, result) {
        if (err) return cb(err);

        cb(null, {
          size: currentSize,
          bucket: opts.bucket,
          key: opts.key,
          acl: opts.acl,
          contentType: opts.contentType,
          contentDisposition: opts.contentDisposition,
          storageClass: opts.storageClass,
          serverSideEncryption: opts.serverSideEncryption,
          metadata: opts.metadata,
          location: result.Location,
          etag: result.ETag
        });
      });
    });
  }

  _removeFile (req, file, cb) {
    this.s3.deleteObject({ Bucket: file.bucket, Key: file.key }, cb);
  }
}

module.exports = function (opts) {
  return new S3Storage(opts);
};
module.exports.S3Storage = S3Storage;