type DatabaseFileInput =
	| File
	| Blob
	| ArrayBuffer
	| Uint8Array<ArrayBuffer>
	| ReadableStream<Uint8Array<ArrayBuffer>>;

export function normalizeDatabaseFile(
	dbFile: DatabaseFileInput,
	convertStreamTo: 'callback'
): Promise<
	| ArrayBuffer
	| Uint8Array<ArrayBuffer>
	| (() => Promise<Uint8Array<ArrayBuffer> | undefined>)
>;
export function normalizeDatabaseFile(
	dbFile: DatabaseFileInput,
	convertStreamTo: 'buffer'
): Promise<ArrayBuffer | Uint8Array<ArrayBuffer>>;
export function normalizeDatabaseFile(
	dbFile: DatabaseFileInput,
	convertStreamTo?: undefined
): Promise<
	| ArrayBuffer
	| Uint8Array<ArrayBuffer>
	| ReadableStream<Uint8Array<ArrayBuffer>>
>;
export async function normalizeDatabaseFile(
	dbFile: DatabaseFileInput,
	convertStreamTo?: 'callback' | 'buffer'
): Promise<
	| ArrayBuffer
	| Uint8Array<ArrayBuffer>
	| ReadableStream<Uint8Array<ArrayBuffer>>
	| (() => Promise<Uint8Array<ArrayBuffer> | undefined>)
> {
	let bufferOrStream:
		| ArrayBuffer
		| Uint8Array<ArrayBuffer>
		| ReadableStream<Uint8Array<ArrayBuffer>>;

	if (dbFile instanceof Blob) {
		bufferOrStream = dbFile.stream();
	} else {
		bufferOrStream = dbFile;
	}

	if (bufferOrStream instanceof ReadableStream && convertStreamTo) {
		const stream = bufferOrStream;
		const reader = stream.getReader();

		switch (convertStreamTo) {
			case 'callback':
				return async () => {
					const chunk = await reader.read();
					if (chunk.done) reader.releaseLock();
					return chunk.value;
				};

			case 'buffer':
				const chunks: Uint8Array<ArrayBuffer>[] = [];
				let streamDone = false;

				while (!streamDone) {
					const chunk = await reader.read();
					if (chunk.value) chunks.push(chunk.value);
					streamDone = chunk.done;
				}
				reader.releaseLock();

				const arrayLength = chunks.reduce((length, chunk) => {
					return length + chunk.length;
				}, 0);
				const buffer = new Uint8Array(arrayLength);
				let offset = 0;

				chunks.forEach((chunk) => {
					buffer.set(chunk, offset);
					offset += chunk.length;
				});

				return buffer.buffer;
		}
	} else {
		return bufferOrStream;
	}
}
