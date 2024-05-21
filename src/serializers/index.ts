import {type IPersistSerializer} from 'tachyon-drive';

/**
 * Common serializer that serializes and deserializes string data to and from a Buffer. (for chain serialization)
 */
export const strToBufferSerializer: IPersistSerializer<string, Buffer> = {
	name: 'StringToBuffer',
	serialize: (data: string) => Buffer.from(data),
	deserialize: (buffer: Buffer) => buffer.toString(),
	validator: (data: string) => typeof data === 'string',
};
