import { EffectsMessage } from '../../src/types';

export function createEffectChecker(databasePath: string) {
	const queryEffectsChannel = new BroadcastChannel(
		`_sqlocal_query_effects_(${databasePath})`
	);
	return (effectType: EffectsMessage['effectType']) => {
		return Promise.race([
			new Promise<null>((resolve) => setTimeout(() => resolve(null), 10)),
			new Promise<string[]>((resolve) => {
				queryEffectsChannel.onmessage = (
					event: MessageEvent<EffectsMessage>
				) => {
					if (event.data.effectType === effectType) {
						resolve(Array.from(event.data.tables));
					}
				};
			}),
		]);
	};
}
