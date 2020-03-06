import { map, delay, hasKey } from "./utils"
import type { Awaitable, VNU } from './utils'
export { delay, Void } from './utils'
export type { VNU, Awaitable } from './utils'

export type SubscriptionStatus = 'normal' | 'stop'
export type SubscriberFn<A> = (a: A, s: SubscriptionStatus) => Awaitable<void>

const _oninit = Symbol('init')

export class Rvent<A = any> {
    subscribers = new Set<SubscriberFn<A>>()
    
    private last: A = void 0 as any
    async emit(a: A) {
        this.last = a
        await Promise.all(map(this.subscribers, s => s(a, 'normal')))
    }

    stop(): void {
        this.subscribers.forEach(s => s(this.last, 'stop'))
        this.subscribers.clear()
    }

    unGet(fn: SubscriberFn<A>): this {
        this.subscribers.delete(fn)
        return this
    }

    get(): AsyncIterable<A>
    get(fn: SubscriberFn<A>): this
    get(fn?: SubscriberFn<A>): this | AsyncIterable<A> {
        const self = this
        if (fn == null) {
            return (async function* () {
                while (true) {
                    yield await self.getOnce()
                }
            })()
        } else {
            this.subscribers.add(fn)
            return this
        }
    }
    getOnce(): Promise<A>
    getOnce(fn: (a: A, s: SubscriptionStatus) => Promise<void>): this
    getOnce(fn: (a: A, s: SubscriptionStatus) => void): this
    getOnce(fn?: SubscriberFn<A>): this | Promise<A>
    getOnce(fn?: SubscriberFn<A>): this | Promise<A> {
        if (fn == null) {
            return new Promise(res => {
                const f: SubscriberFn<A> = ((a: A) => {
                    this.subscribers.delete(f)
                    res(a)
                })
                this.subscribers.add(f)
            })
        } else {
            const f: SubscriberFn<A> = (a, s) => {
                this.subscribers.delete(f)
                return fn(a, s)
            }
            this.subscribers.add(f)
            return this
        }
    }

    use<S>(o: { init: S, state: (state: S, v: A, s: SubscriptionStatus) => Awaitable<readonly [S, VNU | BaseFlow] | readonly [S]> }): Rvent<A>
    use(o: { effect: () => (v: A, s: SubscriptionStatus) => Awaitable<VNU | BaseFlow> }): Rvent<A>
    use(o: { do: (v: A, s: SubscriptionStatus) => Awaitable<VNU | BaseFlow> }): Rvent<A>
    use(fn: () => (v: A, s: SubscriptionStatus) => Awaitable<VNU | BaseFlow>): Rvent<A>

    use<S, R>(o: { init: S, state: (state: S, v: A, s: SubscriptionStatus) => Awaitable<readonly [S, VNU | NextFlow<R>] | readonly [S]> }): Rvent<R>
    use<R>(o: { do: (v: A, s: SubscriptionStatus) => Awaitable<VNU | NextFlow<R>> }): Rvent<R>
    use<R>(fn: () => (v: A, s: SubscriptionStatus) => Awaitable<VNU | NextFlow<R>>): Rvent<R>
    use<R>(o: { effect: () => (v: A, s: SubscriptionStatus) => Awaitable<VNU | NextFlow<R>> }): Rvent<R>

    use<S>(o: { init: S, state: (state: S, v: A, s: SubscriptionStatus) => Awaitable<readonly [S, VNU | Flow] | readonly [S]> }): Rvent<unknown>
    use(o: { effect: () => (v: A, s: SubscriptionStatus) => Awaitable<VNU | Flow> }): Rvent<unknown>
    use(o: { do: (v: A, s: SubscriptionStatus) => Awaitable<VNU | Flow> }): Rvent<unknown>
    use(fn: () => (v: A, s: SubscriptionStatus) => Awaitable<VNU | Flow>): Rvent<unknown>

    use(a: any): Rvent {
        if (typeof a === 'function') {
            return this.effect(a)
        } else {
            if (typeof a !== 'object') throw new TypeError('Illegal type') 
            if (hasKey(a, 'effect')) {
                return this.effect(a.effect)
            } else if (hasKey(a, 'do')) {
                return this.do(a.do)
            } else if (hasKey(a, 'map')) {
                return this.map(a.map)
            } else {
                throw new TypeError('Illegal type')
            }
        }
    }

    effect(fn: () => (v: A, s: SubscriptionStatus) => Awaitable<VNU | BaseFlow>): Rvent<A>
    effect<R>(fn: () => (v: A, s: SubscriptionStatus) => Awaitable<VNU | NextFlow<R>>): Rvent<R>
    effect(fn: () => (v: A, s: SubscriptionStatus) => Awaitable<VNU | Flow>): Rvent<unknown>
    effect(fn: () => (v: A, s: SubscriptionStatus) => Awaitable<VNU | Flow>): Rvent { 
        return this.do(fn())
    }

    
    do(fn: (v: A, s: SubscriptionStatus) => Awaitable<VNU | BaseFlow>): Rvent<A>
    do<R>(fn: (v: A, s: SubscriptionStatus) => Awaitable<VNU | NextFlow<R>>): Rvent<R>
    do(fn: (v: A, s: SubscriptionStatus) => Awaitable<VNU | Flow>): Rvent<unknown>
    do(fn: (v: A, s: SubscriptionStatus) => Awaitable<VNU | Flow>): Rvent {
        const nr = new Rvent
        const reg = async (v: A, s: SubscriptionStatus) => {
            const flow = await fn(v, s)

            if (flow == null || flow.type === 'pass') {
                nr.emit(v)
            } else if (flow.type === 'skip') {
                if (s == 'stop') nr.stop()
                return
            } else if (flow.type === 'stop') {
                nr.stop()
                this.unGet(reg)
            } else if (flow.type === 'next') {
                nr.emit(flow.val)
            } else {
                throw 'Unknown value'
            }
            if (s == 'stop') {
                nr.stop()
                return
            }
        }
        this.get(reg)
        return nr
    }

    
    state<S>(state: S, fn: (state: S, v: A, s: SubscriptionStatus) => Awaitable<readonly [S, VNU | BaseFlow] | readonly [S]>): Rvent<A>
    state<S, R>(state: S, fn: (state: S, v: A, s: SubscriptionStatus) => Awaitable<readonly [S, VNU | NextFlow<R>]>): Rvent<R>
    state<S>(state: S, fn: (state: S, v: A, s: SubscriptionStatus) => Awaitable<readonly [S, VNU | Flow]>): Rvent<unknown>
    state<S>(state: S, fn: (state: S, v: A, s: SubscriptionStatus) => Awaitable<readonly [S, VNU | Flow] | readonly [S]>): Rvent {
        return this.effect(() => {
            let s = state
            return async (v, su) => {
                const [ns, flow] = await fn(s, v, su)
                s = ns
                return flow
            }
        })
    }

    skip(count: number): Rvent<A> {
        return this.state(0, (s) => using(s + 1, (ns) => s >= count ? [s, pass] as const : [ns, skip] as const))
    }

    wait(time: number): Rvent<A> {
        return this.do(() => delay(time))
    }

    map<R>(fn: (v: A, s: SubscriptionStatus) => Awaitable<R>): Rvent<R> {
        return this.do(async (v, s) => next(await fn(v, s)))
    }

    reduce(fn: (acc: A, v: A) => Awaitable<A>): Rvent<A> {
        return this.effect(() => {
            let acc: A | typeof _oninit = _oninit
            return async (v, s) => {
                if (acc === _oninit) acc = v
                const nv = await fn(acc, v)
                if (s === 'stop') {
                    return next(nv)
                } else {
                    acc = nv
                    return skip
                }
            }
        })
    }

    fold<R>(init: R, fn: (acc: R, v: A) => Awaitable<R>): Rvent<R> {
        return this.state<R, R>(init, async (a, v, s) => {
            const nv = await fn(a, v)
            if (s === 'stop') {
                return [nv, next(nv)] as const
            } else {
                return [nv, skip] as const
            }
        })
    }

    scan<R>(init: R, fn: (acc: R, v: A) => Awaitable<R>): Rvent<R> {
        return this.state<R, R>(init, async (a, v, s) => {
            const nv = await fn(a, v)
            if (s === 'stop') {
                return [nv, next(nv)] as const
            } else {
                return [nv, next(nv)] as const
            }
        })
    }
}

export type BaseFlow = typeof pass | typeof skip | typeof stop 
export type Flow = BaseFlow | { type: 'next', val: any[] }

export const pass = { type: 'pass'} as const
export function skip(count: number) {
    return {
        init: 0,
        state: (s: number) => using(s + 1, (ns) => s >= count ? [s, pass] as const : [ns, skip] as const)
    }
}
export namespace skip {
    export const type = 'skip'
}
export const stop = { type: 'stop' } as const
export function next<R>(val: R): Next<R> {
    return { type: 'next', val } as const
}
export type Next<R> = { type: 'next', val: R }
export type NextFlow<R> = Next<R> | BaseFlow


export function wait(time: number) {
    return { do: () => delay(time)}
}

export function using<S, R>(s: S, fn: (s: S) => R) {
    return fn(s)
}

export function fold<A, R>(init: R, fn: (acc: R, v: A) => R) {
    return {
        init,
        state: (state: R, v: A, s: SubscriptionStatus) => {
            const nv = fn(state, v)
            if (s === 'stop') {
                return [nv, next(nv)] as const
            } else {
                return [nv, skip] as const
            }
        }
    }
}