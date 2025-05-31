/**
 * Lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="es" include="debounce" -p -o ./`
 * Copyright JS Foundation and other contributors <https://js.foundation/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

export type DebounceOptions = {
	leading?: boolean;
	maxWait?: number;
	trailing?: boolean;
};

export type DebouncedFunction<T extends (...args: any[]) => any> = {
	(...args: Parameters<T>): ReturnType<T> | undefined;
	cancel: () => void;
	flush: () => ReturnType<T> | undefined;
};

export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number,
	options?: DebounceOptions
): DebouncedFunction<T> {
	let lastArgs: Parameters<T> | undefined;
	let lastThis: any;
	let maxWait: number;
	let result: ReturnType<T> | undefined;
	let timerId: ReturnType<typeof setTimeout> | undefined;
	let lastCallTime: number | undefined;
	let lastInvokeTime = 0;

	let leading = false;
	let maxing = false;
	let trailing = true;

	if (typeof func !== 'function') {
		throw new TypeError('Expected a function');
	}

	wait = Number(wait) || 0;

	if (typeof options === 'object' && options !== null) {
		leading = !!options.leading;
		maxing = 'maxWait' in options;
		maxWait = maxing ? Math.max(Number(options.maxWait) || 0, wait) : 0;
		trailing = 'trailing' in options ? !!options.trailing : trailing;
	}

	function invokeFunc(time: number): ReturnType<T> | undefined {
		const args = lastArgs!;
		const thisArg = lastThis;

		lastArgs = lastThis = undefined;
		lastInvokeTime = time;
		result = func.apply(thisArg, args);
		return result;
	}

	function leadingEdge(time: number): ReturnType<T> | undefined {
		lastInvokeTime = time;
		timerId = setTimeout(timerExpired, wait);
		return leading ? invokeFunc(time) : result;
	}

	function remainingWait(time: number): number {
		const timeSinceLastCall = time - (lastCallTime ?? 0);
		const timeSinceLastInvoke = time - lastInvokeTime;
		const timeWaiting = wait - timeSinceLastCall;

		return maxing
			? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
			: timeWaiting;
	}

	function shouldInvoke(time: number): boolean {
		const timeSinceLastCall = time - (lastCallTime ?? 0);
		const timeSinceLastInvoke = time - lastInvokeTime;

		return (
			lastCallTime === undefined ||
			timeSinceLastCall >= wait ||
			timeSinceLastCall < 0 ||
			(maxing && timeSinceLastInvoke >= maxWait)
		);
	}

	function timerExpired() {
		const time = Date.now();
		if (shouldInvoke(time)) {
			return trailingEdge(time);
		}
		timerId = setTimeout(timerExpired, remainingWait(time));
	}

	function trailingEdge(time: number): ReturnType<T> | undefined {
		timerId = undefined;

		if (trailing && lastArgs) {
			return invokeFunc(time);
		}
		lastArgs = lastThis = undefined;
		return result;
	}

	function cancel() {
		if (timerId !== undefined) {
			clearTimeout(timerId);
		}
		lastInvokeTime = 0;
		lastArgs = lastCallTime = lastThis = timerId = undefined;
	}

	function flush(): ReturnType<T> | undefined {
		return timerId === undefined ? result : trailingEdge(Date.now());
	}

	function debounced() {
		const time = Date.now();
		const isInvoking = shouldInvoke(time);

		// @ts-ignore
		lastArgs = arguments;
		// @ts-ignore
		lastThis = this;
		lastCallTime = time;

		if (isInvoking) {
			if (timerId === undefined) {
				return leadingEdge(lastCallTime);
			}
			if (maxing) {
				timerId = setTimeout(timerExpired, wait);
				return invokeFunc(lastCallTime);
			}
		}

		if (timerId === undefined) {
			timerId = setTimeout(timerExpired, wait);
		}

		return result;
	}

	debounced.cancel = cancel;
	debounced.flush = flush;

	return debounced;
}
