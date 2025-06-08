type DatabaseFileInput =
	| File
	| Blob
	| ArrayBuffer
	| Uint8Array
	| ReadableStream<Uint8Array>;

export function normalizeDatabaseFile(
	dbFile: DatabaseFileInput,
	convertStreamTo: 'callback'
): Promise<ArrayBuffer | Uint8Array | (() => Promise<Uint8Array | undefined>)>;
export function normalizeDatabaseFile(
	dbFile: DatabaseFileInput,
	convertStreamTo: 'buffer'
): Promise<ArrayBuffer | Uint8Array>;
export function normalizeDatabaseFile(
	dbFile: DatabaseFileInput,
	convertStreamTo?: undefined
): Promise<ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>>;
export async function normalizeDatabaseFile(
	dbFile: DatabaseFileInput,
	convertStreamTo?: 'callback' | 'buffer'
): Promise<
	| ArrayBuffer
	| Uint8Array
	| ReadableStream<Uint8Array>
	| (() => Promise<Uint8Array | undefined>)
> {
	let bufferOrStream: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>;

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
					return chunk.value;
				};

			case 'buffer':
				const chunks: Uint8Array[] = [];
				let streamDone = false;

				while (!streamDone) {
					const chunk = await reader.read();
					if (chunk.value) chunks.push(chunk.value);
					streamDone = chunk.done;
				}

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
