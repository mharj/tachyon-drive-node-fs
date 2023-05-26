# tachyon-drive-node-fs

[![TypeScript](https://badges.frapsoft.com/typescript/code/typescript.svg?v=101)](https://github.com/ellerbrock/typescript-badges/)
[![npm version](https://badge.fury.io/js/tachyon-drive-node-fs.svg)](https://badge.fury.io/js/tachyon-drive-node-fs)
[![Maintainability](https://api.codeclimate.com/v1/badges/9ac69c287aa3f5ce94a4/maintainability)](https://codeclimate.com/github/mharj/tachyon-drive-node-fs/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/9ac69c287aa3f5ce94a4/test_coverage)](https://codeclimate.com/github/mharj/tachyon-drive-node-fs/test_coverage)
![github action](https://github.com/mharj/tachyon-drive-node-fs/actions/workflows/main.yml/badge.svg?branch=main)

## NodeFS File Storage Driver for Tachyon Drive and Tachyon Drive Crypto processor

### Initialize simple JSON file storage driver

```typescript
const driver = new FileStorageDriver('FileStorageDriver', './store.json', bufferSerializer);
```

### Initialize crypt processor with JSON file storage driver

```typescript
const processor = new CryptoBufferProcessor(Buffer.from('some-secret-key'));
const driver = new FileStorageDriver('FileStorageDriver', './store.json.aes', bufferSerializer, processor);
```

```typescript
//  includes common strToBufferSerializer
const jsonSerialization: IPersistSerializer<Data, string> = {
	deserialize: (buffer: string) => JSON.parse(buffer.toString()),
	serialize: (data: Data) => JSON.stringify(data),
	validator: (data: Data) => dataSchema.safeParse(data).success,
};

const bufferSerializer: IPersistSerializer<Data, Buffer> = nextSerializer<Data, string, Buffer>(jsonSerialization, strToBufferSerializer);
```

### see more on NPMJS [tachyon-drive](https://www.npmjs.com/package/tachyon-drive)