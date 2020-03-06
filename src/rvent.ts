import { map, delay, hasKey, using } from "./utils"
import type { Awaitable, VNU } from './utils'
export { delay, Void, using } from './utils'
export type { VNU, Awaitable } from './utils'

export type SubscriptionStatus = 'normal' | 'stop'
export type SubscriberFn<A> = (a: A) => Awaitable<void>
export type SubscriberStopFn<A> = (a: A, s: SubscriptionStatus) => Awaitable<void>

const _oninit = Symbol('init')

export class Rvent<A = any> {
    subscribers = new Set<SubscriberStopFn<A>>()
    
    private last: A = void 0 as any
    async emit(a: A) {
        this.last = a
        await Promise.all(map(this.subscribers, s => s(a, 'normal')))
    }

    stop(): void {
        this.subscribers.forEach(s => s(this.last, 'stop'))
        this.subscribers.clear()
    }

    unGet(fn: SubscriberFn<A>): this
    unGet(fn: SubscriberStopFn<A>): this
    unGet(fn: SubscriberFn<A> | SubscriberStopFn<A>): this {
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
            this.subscribers.add((v, s) => s === 'stop' ? void 0 : fn(v))
            return this
        }
    }
    getStop(): AsyncIterable<A>
    getStop(fn: SubscriberStopFn<A>): this
    getStop(fn?: SubscriberStopFn<A>): this | AsyncIterable<A> {
        const self = this
        if (fn == null) {
            return (async function* () {
                while (true) {
                    const r = await self.getStopOnce()
                    if (r.done) return
                    yield r.value
                }
            })()
        } else {
            this.subscribers.add(fn)
            return this
        }
    }
    getOnce(): Promise<A>
    getOnce(fn: SubscriberFn<A>): this
    getOnce(fn?: SubscriberFn<A>): this | Promise<A>
    getOnce(fn?: SubscriberFn<A>): this | Promise<A> {
        if (fn == null) {
            return new Promise(res => {
                const f: SubscriberFn<A> = ((a: A) => {
                    this.unGet(f)
                    res(a)
                })
                this.get(f)
            })
        } else {
            const f: SubscriberFn<A> = (a) => {
                this.unGet(f)
                return fn(a)
            }
            this.get(f)
            return this
        }
    }
    getStopOnce(): Promise<{ done: boolean, value: A }>
    getStopOnce(fn: SubscriberStopFn<A>): this
    getStopOnce(fn?: SubscriberStopFn<A>): this | Promise<{ done: boolean, value: A }>
    getStopOnce(fn?: SubscriberStopFn<A>): this | Promise<{ done: boolean, value: A }> {
        if (fn == null) {
            return new Promise(res => {
                const f: SubscriberStopFn<A> = ((a: A, s) => {
                    this.unGet(f)
                    res({
                        done: s === 'stop',
                        value: a
                    })
                })
                this.getStop(f)
            })
        } else {
            const f: SubscriberStopFn<A> = (a, s) => {
                this.unGet(f)
                return fn(a, s)
            }
            this.getStop(f)
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
        let self: Rvent = this
        const reg = async (v: A, s: SubscriptionStatus) => {
            const flow = await fn(v, s)

            if (flow == null || flow.type === 'skip') {
                if (s == 'stop') nr.stop()
                return
            } else if (flow.type === 'pass') {
                nr.emit(v)
            } else if (flow.type === 'stop') {
                nr.stop()
                self.unGet(reg)
            } else if (flow.type === 'next') {
                nr.emit(flow.val)
            } else if (flow.type === 'move') {
                self.unGet(reg)
                self = flow.target
                const nreg = (v: A, s: SubscriptionStatus) => {
                    nr.emit(v)
                    if (s == 'stop') {
                        nr.stop()
                        return
                    }
                }
                self.unGet(nreg)
                flow.target.getStop(nreg)
            } else {
                throw 'Unknown value'
            }
            if (s == 'stop') {
                nr.stop()
                return
            }
        }
        this.getStop(reg)
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

    gate(signal: Rvent, not?: boolean): Rvent<A>
    gate(signal: Promise<void>, not?: boolean): Rvent<A>
    gate(signal: Rvent | Promise<void>, not?: boolean): Rvent<A> {
        if (signal instanceof Rvent) return this.effect(() => {
            let wait = !not
            const set = () => {
                wait = false
            }
            signal.get(set)
            return (_, s) => {
                if (s === 'stop') {
                    signal.unGet(set)
                }
                if (wait) {
                    return not ? pass : skip
                } else {
                    wait = true
                    return not ? skip: pass
                }
            }
        })
        return this.effect(() => {
            let wait = !not
            signal.then(() => wait = false)
            return () => {
                return wait ? not ? pass : skip : not ? skip : pass
            }
        })
    }

    buffer(count: number): Rvent<A[]> {
        if (count < 1) throw new RangeError('count must be >= 1')
        return this.effect<A[]>(() => {
            let buffer: A[] = []
            return (v) => {
                buffer.push(v)
                if (buffer.length >= count) {
                    let ob = buffer
                    buffer = []
                    return next(ob)
                }
                return skip
            }
        })
    }

    /** default is `true`, R to set `false`, S to set `true`  */
    latch(R: Rvent, S: Rvent, not?: boolean) {
        return this.effect(() => {
            let wait = !not
            const setF = () => {
                wait = false
            }
            const setT = () => {
                wait = true
            }
            R.get(setF)
            S.get(setT)
            return (_, s) => {
                if (s === 'stop') {
                    R.unGet(setF)
                    S.unGet(setT)
                }
                if (wait) {
                    return not ? pass : skip
                } else {
                    return not ? skip : pass
                }
            }
        })
    }

    DFlipFlop(D: Rvent<boolean>, not?: boolean): Rvent<A>
    DFlipFlop(D: Rvent<boolean>, C: Rvent, not?: boolean): Rvent<A>
    DFlipFlop(D: Rvent<boolean>, C?: Rvent | boolean, not?: boolean) {
        if (typeof C === 'boolean' || C == null) {
            not = C ?? not
            return this.effect(() => {
                let wait = !not
                const set = (v: boolean) => {
                    wait = v
                }
                D.get(set)
                return (_, s) => {
                    if (s === 'stop') {
                        D.unGet(set)
                    }
                    if (wait) {
                        return not ? pass : skip
                    } else {
                        return not ? skip : pass
                    }
                }
            })
        }
        return this.effect(() => {
            let wait = !not
            let canSet = false
            const set = (v: boolean) => {
                if (!canSet) return
                wait = v
                canSet = false
            }
            const setC = () => {
                canSet = true
            }
            D.get(set)
            C.get(setC)
            return (_, s) => {
                if (s === 'stop') {
                    D.unGet(set)
                    C.unGet(setC)
                }
                if (wait) {
                    return not ? pass : skip
                } else {
                    return not ? skip : pass
                }
            }
        })
    }
}

export type NoPassFlow = typeof skip | typeof stop 
export type BaseFlow = typeof pass | NoPassFlow
export type Flow = BaseFlow | Next<any> | Move<any>

export function next<R>(val: R): Next<R> {
    return { type: 'next', val } as const
}
export function move<R>(target: Rvent<R>): Move<R> {
    return { type: 'move', target } as const
}
export type Next<R> = { type: 'next', val: R }
export type Move<R> = { type: 'move', target: Rvent<R> }
export type NextFlow<R> = Next<R> | Move<R> | NoPassFlow

export const pass = { type: 'pass'} as const
export function skip(count: number) {
    return use<any, number>()({
        init: 0,
        state: (s: number) => using(s + 1, (ns) => s >= count ? [s, pass] as const : [ns, skip] as const)
    })
}
export namespace skip {
    export const type = 'skip'
}
export const stop = { type: 'stop' } as const

export function use<A, S, R>(): <O extends { init: S, state: (state: S, v: A, s: SubscriptionStatus) => Awaitable<readonly [S, VNU | NextFlow<R>] | readonly [S]> }>(o: O) => O
export function use<A, R>(): <O extends
    { do: (v: A, s: SubscriptionStatus) => Awaitable<VNU | NextFlow<R>> }
    | (() => (v: A, s: SubscriptionStatus) => Awaitable<VNU | NextFlow<R>>)
    | { effect: () => (v: A, s: SubscriptionStatus) => Awaitable<VNU | NextFlow<R>> }
    | { init: R, state: (state: R, v: A, s: SubscriptionStatus) => Awaitable<readonly [R, VNU | BaseFlow] | readonly [R]> }
    >(o: O) => O
export function use<A>(): <O extends
    { effect: () => (v: A, s: SubscriptionStatus) => Awaitable<VNU | BaseFlow> }
    | { do: (v: A, s: SubscriptionStatus) => Awaitable<VNU | BaseFlow> }
    | (() => (v: A, s: SubscriptionStatus) => Awaitable<VNU | BaseFlow>)
    >(o: O) => O
export function use(): any {
    return (v: any) => v
}

export function wait(time: number) {
    return use<any>()({ do: () => delay(time) })
}

export function fold<A, R>(init: R, fn: (acc: R, v: A) => R) {
    return use<A, R, R>()({
        init,
        state: (state: R, v: A, s: SubscriptionStatus) => {
            const nv = fn(state, v)
            if (s === 'stop') {
                return [nv, next(nv)] as const
            } else {
                return [nv, skip] as const
            }
        }
    })
}